const crypto = require('crypto');

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

/**
 * Guards the public STK callback URL (Safaricom does not sign callbacks, so the URL itself carries a secret).
 * .env:  MPESA_CALLBACK_SECRET=<long random string>
 *        MPESA_ALLOWED_IPS=ip1,ip2   (optional; Safaricom's published callback IPs)
 * Register the callback as  https://yourdomain/api/mpesa/stk-callback/<secret>   and mount with
 *   router.post('/stk-callback/:secret', verifyMpesaCallback, ctrl.stkCallback)
 */
function verifyMpesaCallback(req, res, next) {
  const secret = process.env.MPESA_CALLBACK_SECRET;
  if (!secret) {
    console.error('MPESA_CALLBACK_SECRET is not set - rejecting M-Pesa callback');
    return res.status(503).json({ ResultCode: 1, ResultDesc: 'Callback not configured' });
  }
  const allowed = (process.env.MPESA_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = String(req.ip || '').replace('::ffff:', '');
  const ipOk = !allowed.length || allowed.includes(ip);
  if (!safeEqual(req.params.secret || req.query.token, secret) || !ipOk) {
    console.warn(`Rejected M-Pesa callback from ${ip}`);
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }
  next();
}

module.exports = { verifyMpesaCallback };
