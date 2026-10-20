const { exec } = require('../config/db');
const { Where, paged } = require('../utils/sql');

/** Read-only view of who changed what. DB triggers write most entries; use log() for app events (e.g. LOGIN). */
class ActivityLog {
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('a.user_id', f.user_id)
      .eq('a.category', f.category)
      .eq('a.entity_table', f.entity_table)
      .eq('a.entity_id', f.entity_id)
      .dateRange("(a.occurred_at AT TIME ZONE 'Africa/Nairobi')::date", f.from, f.to)
      .search(['a.note', 'a.action', 'a.entity_table'], f.search);
    return paged(
      exec(ctx),
      'SELECT a.*, u.full_name AS user_name, u.username',
      'FROM activity_log a LEFT JOIN users u ON u.id = a.user_id',
      w, 'a.occurred_at DESC, a.id DESC', f
    );
  }

  static async log({ user_id, category, action, entity_table, entity_id, note, ip_address, old_data, new_data }, ctx) {
    const { rows } = await exec(ctx).query(
      `INSERT INTO activity_log (user_id, category, action, entity_table, entity_id, old_data, new_data, ip_address, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [user_id || null, category || 'GENERAL', action, entity_table || null,
       entity_id != null ? String(entity_id) : null, old_data || null, new_data || null, ip_address || null, note || null]
    );
    return rows[0];
  }

  static async categories(ctx) {
    return (await exec(ctx).query('SELECT DISTINCT category FROM activity_log ORDER BY category')).rows.map((r) => r.category);
  }
}

module.exports = ActivityLog;
