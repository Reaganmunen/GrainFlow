/** Wraps every handler so a rejected promise goes to the error middleware (no try/catch needed in controllers). */
module.exports = (handlers) =>
  Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [name, (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)])
  );
