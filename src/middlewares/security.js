/** Basic hardening headers (no extra package). If you later add `helmet`, you can drop securityHeaders. */
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  next();
}

/** Money data must never be cached by the browser or a proxy: app.use('/api', noStore) */
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { securityHeaders, noStore };
