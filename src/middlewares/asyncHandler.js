/** Wraps an async controller so rejected promises reach the error handler: router.get('/', asyncHandler(ctrl.list)) */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
