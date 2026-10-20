/**
 * Single place for the middleware the routes depend on.
 * authenticate / verifyMpesaCallback are NOT in pmc-controllers.zip: adjust the require path below if yours differ.
 * It must set req.user, req.token, req.ctx and req.can(permission) (the controllers already rely on these).
 */
const AppError = require('../utils/AppError');
const { authenticate, verifyMpesaCallback } = require('../middlewares/auth');
const { requireApproval, optionalApproval } = require('../middlewares/approval');

/** permit('a.b', 'c.d') -> allowed when the user has ANY of the listed permissions. */
const permit = (...perms) => (req, res, next) => {
  if (perms.some((p) => req.can(p))) return next();
  return next(new AppError('You are not allowed to do this', 403, { code: 'FORBIDDEN', required: perms }));
};

module.exports = { authenticate, verifyMpesaCallback, requireApproval, optionalApproval, permit };
