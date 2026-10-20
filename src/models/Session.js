const crypto = require('crypto');
const { exec } = require('../config/db');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Server-side record of issued login tokens, so logout and "revoke all" really work. */
class Session {
  static hashToken(token) { return hashToken(token); }

  static async create({ user_id, token, ip, user_agent, expires_at }, ctx) {
    const { rows } = await exec(ctx).query(
      `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, created_at, expires_at`,
      [user_id, hashToken(token), ip || null, user_agent || null, expires_at]
    );
    return rows[0];
  }

  /** Returns the session if the token is valid, unexpired, unrevoked and the user is still active. */
  static async findActive(token, ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT s.* FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`,
      [hashToken(token)]
    );
    return rows[0] || null;
  }

  static async revoke(token, ctx) {
    await exec(ctx).query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
  }

  static async revokeAllForUser(userId, ctx) {
    await exec(ctx).query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }

  static async purgeExpired(ctx) {
    const r = await exec(ctx).query("DELETE FROM user_sessions WHERE expires_at < now() - interval '7 days'");
    return r.rowCount;
  }
}

module.exports = Session;
