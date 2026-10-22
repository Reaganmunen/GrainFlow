const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/token');
const { User, Session } = require('../models');
const asyncHandler = require('./asyncHandler');
const access = require('../config/access');

function extractToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme && scheme.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Requires a valid login. Checks the JWT, that the session was not revoked (logout / password reset) and that the
 * user is still active, then loads FRESH permissions, so role changes apply on the next request.
 *
 * Sets:  req.user  (id, username, full_name, role_code, allowed_modules, permissions[], ...)
 *        req.can('sales.void', ...)  -> true only if the user has ALL the given permissions
 *        req.access = { owner, modules[], pools[] }  -> which businesses / stock pools this user may touch
 *        req.ctx  = { userId, ip }   -> pass straight to the models
 *        req.token
 */
function build({ allowPasswordChange }) {
  return asyncHandler(async (req, res, next) => {
    const token = extractToken(req);
    if (!token) throw new AppError('Please log in', 401, { code: 'NO_TOKEN' });

    let payload;
    try {
      payload = verifyToken(token);
    } catch (e) {
      const expired = e.name === 'TokenExpiredError';
      throw new AppError(expired ? 'Your session has expired. Please log in again.' : 'Invalid login token',
        401, { code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' });
    }

    const session = await Session.findActive(token);
    if (!session || session.user_id !== payload.sub) {
      throw new AppError('Your session has ended. Please log in again.', 401, { code: 'SESSION_ENDED' });
    }

    const base = await User.findById(payload.sub);
    if (!base || !base.is_active) throw new AppError('This account is disabled', 403, { code: 'ACCOUNT_DISABLED' });
    const user = await User.withAccess(base); // role policy + modules applied: this is what the user may REALLY do
    if (user.must_change_password && !allowPasswordChange) {
      throw new AppError('You must change your password before continuing', 403, { code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    const perms = new Set(user.permissions);
    req.token = token;
    req.user = user; // allowed_modules + permissions are the EFFECTIVE ones
    req.can = (...codes) => codes.every((c) => perms.has(c));
    // module scope for the rest of the request: owner = both businesses; everyone else only their own modules / stock pools
    req.access = { owner: !!user.is_owner, modules: user.allowed_modules, pools: access.poolsOf(user.allowed_modules) };
    req.ctx = { userId: user.id, ip: req.ip };
    next();
  });
}

/** Use on every protected route. */
const authenticate = build({ allowPasswordChange: false });
/** Use ONLY on /me, /logout and /change-password so a user with a temporary password can still fix it. */
const authenticateAllowPasswordChange = build({ allowPasswordChange: true });

module.exports = { authenticate, authenticateAllowPasswordChange };
