const { User, Session, ActivityLog } = require('../models');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/token');
const { ok } = require('../utils/respond');
const controller = require('../utils/controller');

async function openSession(req, userId) {
  const { token, expires_at } = signToken(userId);
  await Session.create({ user_id: userId, token, ip: req.ip, user_agent: req.get('user-agent'), expires_at });
  return { token, expires_at };
}

module.exports = controller({
  /** POST /auth/login { username, password } */
  async login(req, res) {
    const { username, password } = req.body || {};
    let user;
    try {
      user = await User.authenticate(username, password);
    } catch (err) {
      if (err.status === 401 || err.status === 423) {
        await ActivityLog.log({ category: 'LOGIN', action: 'LOGIN_FAILED', entity_table: 'users', ip_address: req.ip,
          note: `Failed login for "${String(username || '').slice(0, 50)}"` }).catch(() => {});
      }
      throw err;
    }
    const session = await openSession(req, user.id);
    await ActivityLog.log({ user_id: user.id, category: 'LOGIN', action: 'LOGIN', entity_table: 'users', entity_id: user.id, ip_address: req.ip });
    ok(res, { ...session, user }); // user.must_change_password tells the frontend to show the change-password screen
  },

  async logout(req, res) {
    await Session.revoke(req.token);
    await ActivityLog.log({ user_id: req.user.id, category: 'LOGIN', action: 'LOGOUT', entity_table: 'users', entity_id: req.user.id, ip_address: req.ip });
    ok(res, { logged_out: true });
  },

  async me(req, res) {
    ok(res, req.user);
  },

  /** POST /auth/change-password { current_password, new_password } -> returns a fresh token (old sessions are ended) */
  async changePassword(req, res) {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) throw new AppError('current_password and new_password are required');
    if (current_password === new_password) throw new AppError('The new password must be different from the current one');
    await User.changePassword(req.user.id, current_password, new_password, req.ctx);
    await Session.revokeAllForUser(req.user.id);
    const session = await openSession(req, req.user.id);
    const user = await User.findById(req.user.id);
    user.permissions = await User.permissions(req.user.id);
    ok(res, { ...session, user });
  },
});
