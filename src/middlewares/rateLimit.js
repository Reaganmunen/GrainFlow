const AppError = require('../utils/AppError');

/**
 * Small in-memory limiter (fine for a single server instance).
 * rateLimit({ windowMs, max, keyFn, message, skipSuccessful })
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, keyFn = (req) => req.ip, message = 'Too many attempts. Please try again later.', skipSuccessful = false } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(key, e);
    }
    e.count += 1;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return next(new AppError(message, 429, { code: 'RATE_LIMITED' }));
    }
    if (skipSuccessful) res.on('finish', () => { if (res.statusCode < 400) e.count = Math.max(0, e.count - 1); });
    next();
  };
}

/** 10 failed logins per IP+username per 15 minutes (successful logins do not count). */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessful: true,
  keyFn: (req) => `${req.ip}:${String(req.body?.username || '').toLowerCase()}`,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

/** Generous cap for the whole API, per IP. */
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, message: 'Too many requests. Slow down a little.' });

module.exports = { rateLimit, loginLimiter, apiLimiter };
