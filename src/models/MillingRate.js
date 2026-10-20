const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, bool } = require('../utils/sql');

const COLS = ['grain_item_id', 'rate_type', 'name', 'rate_basis', 'rate', 'effective_from', 'effective_to', 'is_active'];

/** Mill rate list: BASE per grain (or any grain), BLEND and SPECIAL add-ons. */
class MillingRate {
  static async list(f = {}, ctx) {
    const w = new Where().eq('r.grain_item_id', f.grain_item_id).eq('r.rate_type', f.rate_type).eq('r.is_active', bool(f.active));
    return (await exec(ctx).query(
      `SELECT r.*, i.name AS grain_name FROM milling_rates r LEFT JOIN items i ON i.id = r.grain_item_id
        ${w.clause} ORDER BY r.rate_type, i.name NULLS FIRST, r.effective_from DESC`, w.values)).rows;
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query('SELECT * FROM milling_rates WHERE id = $1', [id])).rows[0] || null;
  }

  /** The base rate the DB would apply today to a new job of this grain (same rule as the job trigger). */
  static async currentFor(grainItemId, ctx) {
    return (await exec(ctx).query(
      `SELECT r.id, r.name, r.rate_basis, r.rate FROM milling_rates r
        WHERE r.rate_type = 'BASE' AND r.is_active AND (r.grain_item_id = $1 OR r.grain_item_id IS NULL)
          AND r.effective_from <= current_date AND (r.effective_to IS NULL OR r.effective_to >= current_date)
        ORDER BY (r.grain_item_id IS NULL), r.effective_from DESC LIMIT 1`, [grainItemId])).rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.name || d.rate === undefined || d.rate === '') throw new AppError('name and rate are required');
    return withTransaction(ctx, (db) => insertRow(db, 'milling_rates', { ...d, created_by: ctx?.userId }, [...COLS, 'created_by']));
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'milling_rates', id, d, COLS));
  }
}

module.exports = MillingRate;
