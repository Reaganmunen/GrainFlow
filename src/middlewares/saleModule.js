/**
 * Server-side module restriction for sales.
 * A user needs the ACTION permission (sales.view / sales.create ...) AND the MODULE permission:
 *   sales.mill   -> may work on posho mill sales
 *   sales.cereal -> may work on cereal sales
 * Owner/manager roles get both; a mill cashier gets only sales.mill, and so on.
 */
const { Sale } = require('../models');
const AppError = require('../utils/AppError');

const MODULES = ['MILL', 'CEREAL'];
const LABEL = { MILL: 'posho mill', CEREAL: 'cereal' };
const permFor = (m) => `sales.${m.toLowerCase()}`;
const allowedModules = (req) => MODULES.filter((m) => req.can(permFor(m)));
const deny = (m) =>
  new AppError(`You are not allowed to work in the ${LABEL[m]} module`, 403, { code: 'FORBIDDEN', required: [permFor(m)] });

/** POST /sales: the module in the body must be one the user may use. */
const bodyModule = (req, res, next) => {
  const m = String((req.body && req.body.module) || '').toUpperCase();
  if (!MODULES.includes(m)) return next(new AppError('module must be MILL or CEREAL'));
  if (!req.can(permFor(m))) return next(deny(m));
  req.opModule = m;
  next();
};

/** Lists / catalogue: a requested module must be allowed; with no module given, a single-module user is pinned to theirs. */
const queryModule = (req, res, next) => {
  const allowed = allowedModules(req);
  if (!allowed.length) return next(deny('MILL'));
  const asked = req.query.module ? String(req.query.module).toUpperCase() : null;
  if (asked) {
    if (!MODULES.includes(asked)) return next(new AppError('module must be MILL or CEREAL'));
    if (!allowed.includes(asked)) return next(deny(asked));
  } else if (allowed.length === 1) {
    req.query.module = allowed[0];
  }
  next();
};

/** Routes on an existing sale (/:id/... or /:saleId/...): the sale's own module must be allowed. */
const saleModule = (param = 'id') => async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params[param]);
    if (sale && sale.module && !req.can(permFor(String(sale.module).toUpperCase()))) {
      return next(deny(String(sale.module).toUpperCase()));
    }
    if (sale && sale.module) req.opModule = String(sale.module).toUpperCase();
    next(); // a missing sale is left for the controller to answer with 404
  } catch (err) {
    next(err);
  }
};

module.exports = { bodyModule, queryModule, saleModule, allowedModules };