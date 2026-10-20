const AppError = require('../utils/AppError');

/** Rejects the request if any listed body field is missing/blank: router.post('/', requireFields('name', 'phone'), ...) */
const requireFields = (...fields) => (req, res, next) => {
  const body = req.body || {};
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  return missing.length ? next(new AppError(`Missing required field(s): ${missing.join(', ')}`, 400, { fields: missing })) : next();
};

/** Validates route params as positive integers and converts them to Numbers: router.get('/:id', parseIds(), ...) */
const parseIds = (...names) => (req, res, next) => {
  for (const name of names.length ? names : ['id']) {
    const v = Number(req.params[name]);
    if (!Number.isInteger(v) || v <= 0) return next(new AppError(`Invalid ${name}`, 400));
    req.params[name] = v;
  }
  next();
};

module.exports = { requireFields, parseIds };
