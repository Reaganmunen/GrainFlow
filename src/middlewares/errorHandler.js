const AppError = require('../utils/AppError');
const { toHttpError } = require('../config/db');

/** Put after all routes: app.use('/api', notFound) is handy for unknown API paths. */
function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * Single place where every error becomes JSON: { success: false, message, code?, details? }
 * Order: AppError -> body-parser errors -> Postgres errors (business rules raised by the DB) -> 500.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let code;
  let details;

  if (err instanceof AppError) {
    status = err.status;
    message = err.message;
    if (err.details) {
      const { code: c, ...rest } = err.details;
      code = c;
      if (Object.keys(rest).length) details = rest;
    }
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request is too large';
  } else {
    const pg = toHttpError(err);
    if (pg) {
      status = pg.status;
      message = pg.message;
    }
  }

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} (user ${req.user?.id ?? '-'})`, err);
    if (process.env.NODE_ENV !== 'production') details = { ...details, stack: err.stack };
  }

  res.status(status).json({ success: false, message, ...(code && { code }), ...(details && { details }) });
}

module.exports = { notFound, errorHandler };
