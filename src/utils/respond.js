const AppError = require('./AppError');

/** { success: true, data } */
const ok = (res, data = null, status = 200) => res.status(status).json({ success: true, data });
const created = (res, data) => ok(res, data, 201);

/** For paged model results: { success: true, data: [...rows], pagination: { total, page, limit, pages } } */
const page = (res, r) =>
  res.json({ success: true, data: r.rows, pagination: { total: r.total, page: r.page, limit: r.limit, pages: r.pages } });

/** Throws a 404 if the value is null/undefined, otherwise returns it. */
const found = (value, label = 'Record') => {
  if (value === null || value === undefined) throw new AppError(`${label} not found`, 404);
  return value;
};

module.exports = { ok, created, page, found };
