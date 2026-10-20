const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, paged } = require('../utils/sql');

const COLS = ['transfer_date', 'item_id', 'from_pool', 'to_pool', 'quantity_kg', 'unit_cost_per_kg', 'reason', 'created_by'];
const POOLS = ['MILL_STOCK', 'CEREAL_STOCK'];

/**
 * Moves stock between the mill and the cereal side at cost:
 *   mill takes maize        -> from_pool CEREAL_STOCK, to_pool MILL_STOCK
 *   cereal sells mill flour -> from_pool MILL_STOCK,   to_pool CEREAL_STOCK
 * Cost defaults to the source pool's average cost. Fails if the source pool lacks the stock.
 */
class Transfer {
  /** Filters: item_id, from_pool, to_pool, from, to */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('t.item_id', f.item_id)
      .eq('t.from_pool', f.from_pool)
      .eq('t.to_pool', f.to_pool)
      .dateRange('fn_local_date(t.transfer_date)', f.from, f.to);
    return paged(
      exec(ctx),
      'SELECT t.*, i.name AS item_name, u.full_name AS created_by_name',
      'FROM module_transfers t JOIN items i ON i.id = t.item_id LEFT JOIN users u ON u.id = t.created_by',
      w, 't.transfer_date DESC, t.id DESC', f
    );
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query(
      `SELECT t.*, i.name AS item_name FROM module_transfers t JOIN items i ON i.id = t.item_id WHERE t.id = $1`, [id])).rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.item_id) throw new AppError('item_id is required');
    if (!POOLS.includes(d.from_pool) || !POOLS.includes(d.to_pool)) throw new AppError('from_pool and to_pool must be MILL_STOCK or CEREAL_STOCK');
    if (d.from_pool === d.to_pool) throw new AppError('from_pool and to_pool must be different');
    if (!(Number(d.quantity_kg) > 0)) throw new AppError('quantity_kg must be greater than 0');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'module_transfers', { ...d, created_by: ctx?.userId }, COLS);
      return Transfer.findById(row.id, { client: db });
    });
  }
}

module.exports = Transfer;
