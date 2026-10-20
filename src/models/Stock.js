const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, paged, bool } = require('../utils/sql');

/**
 * Read side of stock (all quantities in KG) plus opening stock.
 * Stock only ever changes through the posting functions / adjustments / transfers / mill jobs.
 * Pools: MILL_STOCK, CEREAL_STOCK, CUSTOMER_GRAIN (customer grain waiting to be milled).
 */
class Stock {
  /** Filters: pool, kind, search, low (true = only low stock), page, limit */
  static async balances(f = {}, ctx) {
    const w = new Where().eq('pool', f.pool).eq('kind', f.kind).search(['item_name', 'sku', 'grain'], f.search);
    if (bool(f.low)) w.raw('is_low');
    return paged(exec(ctx), 'SELECT *', 'FROM v_stock_current', w, 'item_name, pool', { limit: 200, ...f });
  }

  static async lowStock(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_low_stock')).rows;
  }

  static async valueSummary(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_stock_value_summary ORDER BY pool')).rows;
  }

  /** Kg on hand for one item in one pool (0 if none). */
  static async available(itemId, pool, ctx) {
    const { rows } = await exec(ctx).query('SELECT quantity_kg FROM stock_balances WHERE item_id = $1 AND pool = $2', [itemId, pool]);
    return rows[0] ? rows[0].quantity_kg : 0;
  }

  /** Stock card / ledger. Filters: item_id, pool, movement_type, customer_id, from, to, page, limit */
  static async movements(f = {}, ctx) {
    const w = new Where()
      .eq('m.item_id', f.item_id)
      .eq('m.pool', f.pool)
      .eq('m.movement_type', f.movement_type)
      .eq('m.customer_id', f.customer_id)
      .dateRange('fn_local_date(m.movement_date)', f.from, f.to);
    return paged(
      exec(ctx),
      `SELECT m.*, i.name AS item_name, i.sku, c.full_name AS customer_name, u.full_name AS user_name`,
      `FROM stock_movements m JOIN items i ON i.id = m.item_id
         LEFT JOIN customers c ON c.id = m.customer_id LEFT JOIN users u ON u.id = m.created_by`,
      w, 'm.movement_date DESC, m.id DESC', f
    );
  }

  /** Customer grain currently held at the mill. Filter: customer_id */
  static async customerGrainHeld(f = {}, ctx) {
    const w = new Where().eq('customer_id', f.customer_id);
    return (await exec(ctx).query(`SELECT * FROM v_customer_grain_held ${w.clause} ORDER BY full_name, grain`, w.values)).rows;
  }

  /** Go-live data load. Can be set once per item and pool; afterwards use stock adjustments. */
  static async setOpeningStock({ item_id, pool, quantity_kg, cost_per_kg = 0 }, ctx) {
    if (!item_id || !pool) throw new AppError('item_id and pool are required');
    if (!(Number(quantity_kg) > 0)) throw new AppError('quantity_kg must be greater than 0');
    return withTransaction(ctx, async (db) => {
      const dup = await db.query(
        "SELECT 1 FROM stock_movements WHERE item_id = $1 AND pool = $2 AND movement_type = 'OPENING_BALANCE'", [item_id, pool]);
      if (dup.rowCount) throw new AppError('Opening stock is already set for this item and pool. Use a stock adjustment instead.', 409);
      await db.query('SELECT fn_set_opening_stock($1, $2, $3, $4, $5)', [item_id, pool, quantity_kg, cost_per_kg || 0, ctx?.userId || null]);
      const { rows } = await db.query('SELECT * FROM v_stock_current WHERE item_id = $1 AND pool = $2', [item_id, pool]);
      return rows[0];
    });
  }
}

module.exports = Stock;
