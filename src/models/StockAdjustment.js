const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, paged } = require('../utils/sql');

const COLS = ['adjustment_date', 'item_id', 'pool', 'reason', 'quantity_kg_change', 'unit_cost_per_kg', 'note', 'approved_by', 'created_by'];
const REASONS = ['WEIGHT_LOSS', 'MOISTURE', 'PESTS', 'SPOILAGE', 'DAMAGE', 'SPILLAGE', 'THEFT_SUSPECTED', 'COUNT_CORRECTION', 'OTHER'];

/** Losses and corrections. Negative quantity_kg_change = loss, positive = gain. Posts the stock movement via trigger. */
class StockAdjustment {
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('a.item_id', f.item_id)
      .eq('a.pool', f.pool)
      .eq('a.reason', f.reason)
      .dateRange('fn_local_date(a.adjustment_date)', f.from, f.to);
    return paged(
      exec(ctx),
      'SELECT a.*, i.name AS item_name, u.full_name AS created_by_name, ap.full_name AS approved_by_name',
      `FROM stock_adjustments a JOIN items i ON i.id = a.item_id
         LEFT JOIN users u ON u.id = a.created_by LEFT JOIN users ap ON ap.id = a.approved_by`,
      w, 'a.adjustment_date DESC, a.id DESC', f
    );
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query(
      `SELECT a.*, i.name AS item_name FROM stock_adjustments a JOIN items i ON i.id = a.item_id WHERE a.id = $1`, [id])).rows[0] || null;
  }

  /** Total losses by reason for a period (for the "losses and spoilage" report). */
  static async lossSummary(f = {}, ctx) {
    const w = new Where().raw('a.quantity_kg_change < 0').eq('a.pool', f.pool).dateRange('fn_local_date(a.adjustment_date)', f.from, f.to);
    return (await exec(ctx).query(
      `SELECT a.reason, count(*) AS entries, sum(-a.quantity_kg_change) AS kg_lost, sum(-a.value_change) AS value_lost
         FROM stock_adjustments a ${w.clause} GROUP BY a.reason ORDER BY value_lost DESC`, w.values)).rows;
  }

  static async create(d, ctx) {
    if (!d.item_id || !d.pool || !d.reason) throw new AppError('item_id, pool and reason are required');
    if (!REASONS.includes(d.reason)) throw new AppError(`reason must be one of: ${REASONS.join(', ')}`);
    if (!Number(d.quantity_kg_change)) throw new AppError('quantity_kg_change must be a non-zero number (negative = loss)');
    if (d.reason === 'OTHER' && !(d.note && String(d.note).trim())) throw new AppError('A note is required when the reason is OTHER');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'stock_adjustments', { ...d, created_by: ctx?.userId }, COLS);
      return StockAdjustment.findById(row.id, { client: db });
    });
  }
}

StockAdjustment.REASONS = REASONS;
module.exports = StockAdjustment;
