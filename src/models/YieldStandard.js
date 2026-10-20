const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow } = require('../utils/sql');

const COLS = ['grain_item_id', 'flour_item_id', 'bran_item_id', 'expected_flour_kg_per_100', 'expected_bran_kg_per_100',
  'alert_below_kg_per_100', 'effective_from', 'notes'];

/** Expected flour/bran per 100 kg of grain, and the floor below which a job raises a yield alert. */
class YieldStandard {
  static async list(f = {}, ctx) {
    const w = new Where().eq('y.grain_item_id', f.grain_item_id);
    return (await exec(ctx).query(
      `SELECT y.*, g.name AS grain_name, fl.name AS flour_name, br.name AS bran_name
         FROM yield_standards y JOIN items g ON g.id = y.grain_item_id
         LEFT JOIN items fl ON fl.id = y.flour_item_id LEFT JOIN items br ON br.id = y.bran_item_id
        ${w.clause} ORDER BY g.name, y.effective_from DESC`, w.values)).rows;
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query('SELECT * FROM yield_standards WHERE id = $1', [id])).rows[0] || null;
  }

  static async currentFor(grainItemId, ctx) {
    return (await exec(ctx).query(
      `SELECT * FROM yield_standards WHERE grain_item_id = $1 AND effective_from <= current_date
        ORDER BY effective_from DESC LIMIT 1`, [grainItemId])).rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.grain_item_id || d.expected_flour_kg_per_100 === undefined || d.alert_below_kg_per_100 === undefined) {
      throw new AppError('grain_item_id, expected_flour_kg_per_100 and alert_below_kg_per_100 are required');
    }
    return withTransaction(ctx, (db) => insertRow(db, 'yield_standards', { ...d, created_by: ctx?.userId }, [...COLS, 'created_by']));
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'yield_standards', id, d, COLS));
  }
}

module.exports = YieldStandard;
