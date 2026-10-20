const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const EXPIRES_HOURS = Number(process.env.JWT_EXPIRES_HOURS) || 12; // one working day

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set in .env (at least 32 characters)');
  return s;
}

/** Returns { token, expires_at }. Store the token (hashed) with Session.create so it can be revoked. */
function signToken(userId) {
  const token = jwt.sign({}, secret(), {
    algorithm: 'HS256',
    subject: String(userId),
    jwtid: crypto.randomUUID(), // two logins in the same second must not produce the same token
    expiresIn: `${EXPIRES_HOURS}h`,
  });
  return { token, expires_at: new Date(jwt.decode(token).exp * 1000) };
}

/** Throws a jsonwebtoken error if invalid/expired. Returns { sub: <userId as Number>, exp }. */
function verifyToken(token) {
  const p = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  return { sub: Number(p.sub), exp: p.exp };
}

module.exports = { signToken, verifyToken, EXPIRES_HOURS };
