const { exec } = require('../config/db');

class BackupLog {
  static async list(limit = 30, ctx) {
    return (await exec(ctx).query('SELECT * FROM backup_log ORDER BY started_at DESC LIMIT $1', [limit])).rows;
  }
  static async start(ctx) {
    return (await exec(ctx).query("INSERT INTO backup_log (status) VALUES ('RUNNING') RETURNING *")).rows[0];
  }
  static async finish(id, { success, file_name, location, size_bytes, error_text }, ctx) {
    return (await exec(ctx).query(
      `UPDATE backup_log SET finished_at = now(), status = $2, file_name = $3, location = $4, size_bytes = $5, error_text = $6
        WHERE id = $1 RETURNING *`,
      [id, success ? 'SUCCESS' : 'FAILED', file_name || null, location || null, size_bytes || null, error_text || null]
    )).rows[0];
  }
  static async last(ctx) {
    return (await exec(ctx).query("SELECT * FROM backup_log WHERE status = 'SUCCESS' ORDER BY finished_at DESC LIMIT 1")).rows[0] || null;
  }
}

module.exports = BackupLog;
