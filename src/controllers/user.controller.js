const { User, Role, Session } = require('../models');
const AppError = require('../utils/AppError');
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
