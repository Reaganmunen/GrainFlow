/**
 * Single place for the middleware the routes depend on.
 * authenticate must set req.user, req.token, req.ctx and req.can(permission) (the controllers rely on these).
 */
const AppError = require('../utils/AppError');
const { authenticate } = require('../middlewares/auth');
const { verifyMpesaCallback } = require('../middlewares/mpesaCallback');
const { requireApproval, optionalApproval } = require('../middlewares/approval');

if (typeof authenticate !== 'function') {
  throw new Error("src/middlewares/auth.js does not export a function named 'authenticate'. Rename the import in src/routes/guards.js to match what it exports.");
}

/** permit('a.b', 'c.d') -> allowed when the user has ANY of the listed permissions. */
const permit = (...perms) => (req, res, next) => {
  if (perms.some((p) => req.can(p))) return next();
  return next(new AppError('You are not allowed to do this', 403, { code: 'FORBIDDEN', required: perms }));
};

module.exports = { authenticate, verifyMpesaCallback, requireApproval, optionalApproval, permit };