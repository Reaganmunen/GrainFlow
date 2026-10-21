const { pool, exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, updateRow, bool } = require('../utils/sql');

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const SELECT_USER = `
  SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role_id,
         r.code AS role_code, r.name AS role_name,
         u.allowed_modules::text[] AS allowed_modules,
         u.is_active, u.must_change_password, u.locked_until, u.last_login_at, u.created_at
  FROM users u JOIN roles r ON r.id = u.role_id`;

class User {
  static checkPassword(pw) {
    if (typeof pw !== 'string' || pw.length < 8) {
      throw new AppError('Password must be at least 8 characters');
    }
  }

  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('u.role_id', f.role_id)
      .eq('u.is_active', bool(f.active))
      .search(['u.username', 'u.full_name', 'u.email'], f.search);
    const { rows } = await exec(ctx).query(`${SELECT_USER} ${w.clause} ORDER BY u.full_name`, w.values);
    return rows;
  }

  static async findById(id, ctx) {
    const { rows } = await exec(ctx).query(`${SELECT_USER} WHERE u.id = $1`, [id]);
    return rows[0] || null;
  }

  /** Array of permission codes, e.g. ['sales.create', 'stock.view'] */
  static async permissions(userId, ctx) {
    // the OWNER role can do everything, including sales in both modules, whatever the role_permissions table says
    const owner = await exec(ctx).query(
      `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND upper(r.code) = 'OWNER'`, [userId]
    );
    if (owner.rows.length) {
      const all = (await exec(ctx).query('SELECT code FROM permissions ORDER BY code')).rows.map((r) => r.code);
      // the per-module sales checks are enforced in middlewares/saleModule.js, so make sure they are always present
      return [...new Set([...all, 'sales.mill', 'sales.cereal'])].sort();
    }
    const { rows } = await exec(ctx).query(
      `SELECT p.code FROM users u
         JOIN role_permissions rp ON rp.role_id = u.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = $1 ORDER BY p.code`,
      [userId]
    );
    return rows.map((r) => r.code);
  }

  /** Verifies the password inside Postgres (pgcrypto), handles lockout, returns the user + permissions. */
  static async authenticate(username, password) {
    if (!username || !password) throw new AppError('Username and password are required', 400);
    const { rows } = await pool.query(
      `SELECT u.id, u.is_active, u.locked_until,
              (u.password_hash = crypt($2, u.password_hash)) AS pw_ok
         FROM users u WHERE lower(u.username) = lower($1)`,
      [String(username).trim(), password]
    );
    const u = rows[0];
    if (!u) throw new AppError('Invalid username or password', 401);
    if (!u.is_active) throw new AppError('This account is disabled. Contact the owner.', 403);
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      throw new AppError('Account temporarily locked after too many failed attempts. Try again later.', 423);
    }
    if (!u.pw_ok) {
      await pool.query(
        `UPDATE users
            SET locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
                failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END
          WHERE id = $1`,
        [u.id, MAX_FAILED_LOGINS, LOCK_MINUTES]
      );
      throw new AppError('Invalid username or password', 401);
    }
    await pool.query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
      [u.id]
    );
    const user = await User.findById(u.id);
    user.permissions = await User.permissions(u.id);
    return user;
  }

  static async create(d, ctx) {
    if (!d.username || !d.full_name || !d.role_id) {
      throw new AppError('username, full_name and role_id are required');
    }
    User.checkPassword(d.password);
    const modules = Array.isArray(d.allowed_modules) && d.allowed_modules.length ? d.allowed_modules : ['MILL', 'CEREAL'];
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO users (username, full_name, email, phone, password_hash, role_id, allowed_modules, must_change_password)
         VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf', 10)), $6, $7::module_code[], $8)
         RETURNING id`,
        [
          String(d.username).trim(), String(d.full_name).trim(), d.email || null, d.phone || null,
          d.password, d.role_id, modules, d.must_change_password !== false,
        ]
      );
      return User.findById(rows[0].id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await updateRow(db, 'users', id, d,
        ['full_name', 'email', 'phone', 'role_id', 'allowed_modules', 'is_active'],
        { allowed_modules: 'module_code[]' });
      return User.findById(id, { client: db });
    });
  }

  /** User changes their own password (must know the current one). */
  static async changePassword(id, currentPw, newPw, ctx) {
    User.checkPassword(newPw);
    const { rows } = await pool.query(
      'SELECT (password_hash = crypt($2, password_hash)) AS ok FROM users WHERE id = $1', [id, currentPw]);
    if (!rows[0]) throw new AppError('User not found', 404);
    if (!rows[0].ok) throw new AppError('Current password is incorrect', 400);
    return withTransaction({ userId: id, ...ctx }, async (db) => {
      await db.query(
        `UPDATE users SET password_hash = crypt($2, gen_salt('bf', 10)),
                must_change_password = false, password_changed_at = now() WHERE id = $1`,
        [id, newPw]
      );
      return true;
    });
  }

  /** Owner/manager resets someone's password; forces a change at next login and kills their sessions. */
  static async resetPassword(id, newPw, ctx) {
    User.checkPassword(newPw);
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        `UPDATE users SET password_hash = crypt($2, gen_salt('bf', 10)), must_change_password = true,
                password_changed_at = now(), failed_login_count = 0, locked_until = NULL
          WHERE id = $1`,
        [id, newPw]
      );
      if (!r.rowCount) throw new AppError('User not found', 404);
      await db.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      return true;
    });
  }

  static async unlock(id, ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [id]);
      return User.findById(id, { client: db });
    });
  }
}

module.exports = User;