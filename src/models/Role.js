const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

class Role {
  static async list(ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT r.*, (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
              (SELECT count(*) FROM users u WHERE u.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.id`
    );
    return rows;
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const role = (await db.query('SELECT * FROM roles WHERE id = $1', [id])).rows[0];
    if (!role) return null;
    role.permissions = (await db.query(
      `SELECT p.code, p.description FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 ORDER BY p.code`, [id])).rows;
    return role;
  }

  static async listPermissions(ctx) {
    return (await exec(ctx).query('SELECT * FROM permissions ORDER BY code')).rows;
  }

  /** Replaces the role's permissions with the given list of codes. */
  static async setPermissions(roleId, codes, ctx) {
    if (!Array.isArray(codes)) throw new AppError('codes must be an array of permission codes');
    return withTransaction(ctx, async (db) => {
      const role = (await db.query('SELECT code FROM roles WHERE id = $1', [roleId])).rows[0];
      if (!role) throw new AppError('Role not found', 404);
      if (role.code === 'OWNER') throw new AppError('The OWNER role always keeps every permission', 400);
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      if (codes.length) {
        await db.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, id FROM permissions WHERE code = ANY($2::text[])`, [roleId, codes]);
      }
      return Role.findById(roleId, { client: db });
    });
  }
}

module.exports = Role;
