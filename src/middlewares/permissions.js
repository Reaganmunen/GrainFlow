const AppError = require('../utils/AppError');

const forbidden = (message, extra) => new AppError(message, 403, { code: 'FORBIDDEN', ...extra });

/** All listed permissions are required: router.post('/', requirePermission('sales.create'), ...) */
const requirePermission = (...codes) => (req, res, next) =>
  req.user && req.can(...codes) ? next() : next(forbidden('You do not have permission to do this', { required: codes }));

/** At least one of the listed permissions is enough. */
const requireAnyPermission = (...codes) => (req, res, next) =>
  req.user && codes.some((c) => req.can(c)) ? next() : next(forbidden('You do not have permission to do this', { requiredAny: codes }));

/**
 * Blocks use of a module the user is not allowed into (users.allowed_modules: MILL, CEREAL, SHARED).
 * Reads the module from req[source][field]; no module in the request = nothing to check.
 *   router.post('/', requireModuleAccess('body'), ...)      router.get('/:module/x', requireModuleAccess('params'), ...)
 */
const requireModuleAccess = (source = 'body', field = 'module') => (req, res, next) => {
  const m = req[source] && req[source][field];
  if (!m) return next();
  return req.user.allowed_modules.includes(m) ? next() : next(forbidden(`You do not have access to the ${m} module`, { module: m }));
};

/**
 * For list endpoints: a user limited to ONE module (e.g. a miller) gets req.query.module defaulted to it, and
 * asking for a module they cannot access is refused. Users with both modules are unaffected.
 */
function scopeToUserModules(req, res, next) {
  const mine = req.user.allowed_modules.filter((m) => m !== 'SHARED');
  const asked = req.query.module;
  if (!asked) {
    if (mine.length === 1) req.query.module = mine[0];
  } else if (!req.user.allowed_modules.includes(asked)) {
    return next(forbidden(`You do not have access to the ${asked} module`, { module: asked }));
  }
  next();
}

module.exports = { requirePermission, requireAnyPermission, requireModuleAccess, scopeToUserModules };
