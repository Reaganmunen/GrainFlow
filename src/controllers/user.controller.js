const { User, Role, Session } = require('../models');
const AppError = require('../utils/AppError');
const { pool } = require('../config/db');
const { canon } = require('../config/access');
const { ok, created, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { ok(res, await User.list(req.query)); },
  async get(req, res) { ok(res, found(await User.findById(req.params.id), 'User')); },
  async create(req, res) { created(res, await User.create(req.body, req.ctx)); },

  async update(req, res) {
    if (req.body.is_active === false && Number(req.params.id) === req.user.id) {
      throw new AppError('You cannot deactivate your own account');
    }
    const target = found(await User.findById(req.params.id), 'User');
    const isOwner = canon(target.role_code) === 'OWNER';
    if (req.body.role_id !== undefined && Number(req.params.id) === req.user.id && Number(req.body.role_id) !== target.role_id) {
      throw new AppError('You cannot change your own role. Ask the other owner.');
    }
    if (isOwner) {
      let leaving = req.body.is_active === false;
      if (req.body.role_id !== undefined && Number(req.body.role_id) !== target.role_id) {
        const r = (await pool.query('SELECT code FROM roles WHERE id = $1', [req.body.role_id])).rows[0];
        if (r && canon(r.code) !== 'OWNER') leaving = true;
      }
      if (leaving && target.is_active) {
        const n = (await pool.query(`SELECT count(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_active AND upper(r.code) = 'OWNER' AND u.id <> $1`, [target.id])).rows[0].n;
        if (n < 1) throw new AppError('There must always be at least one active owner');
      }
    }
    const user = await User.update(req.params.id, req.body, req.ctx);
    if (req.body.is_active === false) await Session.revokeAllForUser(req.params.id);
    ok(res, user);
  },

  /** PUT /users/:id/password { new_password } - user must change it at next login */
  async resetPassword(req, res) {
    await User.resetPassword(req.params.id, req.body.new_password, req.ctx);
    ok(res, { reset: true });
  },

  async unlock(req, res) { ok(res, await User.unlock(req.params.id, req.ctx)); },

  // roles
  async roles(req, res) { ok(res, await Role.list()); },
  async role(req, res) { ok(res, found(await Role.findById(req.params.id), 'Role')); },
  async permissions(req, res) { ok(res, await Role.listPermissions()); },
  /** PUT /roles/:id/permissions { permissions: ['sales.create', ...] } */
  async setRolePermissions(req, res) { ok(res, await Role.setPermissions(req.params.id, req.body.permissions, req.ctx)); },
});
