const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, paged } = require('../utils/sql');

/** Physical stock counts. Posting turns every variance into a COUNT_CORRECTION adjustment. */
class StockTake {
  static async list(f = {}, ctx) {
    const w = new Where().eq('t.pool', f.pool).inList('t.pool', f.scope_pools).eq('t.status', f.status).dateRange('t.take_date', f.from, f.to);
    return paged(
      exec(ctx),
      `SELECT t.*, u.full_name AS created_by_name, (SELECT count(*) FROM stock_take_lines l WHERE l.take_id = t.id) AS line_count`,
      'FROM stock_takes t LEFT JOIN users u ON u.id = t.created_by',
      w, 't.take_date DESC, t.id DESC', f
    );
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const take = (await db.query('SELECT * FROM stock_takes WHERE id = $1', [id])).rows[0];
    if (!take) return null;
    take.lines = (await db.query(
      `SELECT l.*, i.name AS item_name, i.sku FROM stock_take_lines l JOIN items i ON i.id = l.item_id
        WHERE l.take_id = $1 ORDER BY i.name`, [id])).rows;
    return take;
  }

  static async create(d, ctx) {
    if (!d.pool) throw new AppError('pool is required');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'stock_takes', { ...d, created_by: ctx?.userId }, ['pool', 'take_date', 'notes', 'created_by']);
      return StockTake.findById(row.id, { client: db });
    });
  }

  /** lines = [{ item_id, counted_kg, note }]. Re-sending an item updates its count and refreshes system_kg. */
  static async saveLines(takeId, lines, ctx) {
    if (!Array.isArray(lines) || !lines.length) throw new AppError('lines must be a non-empty array');
    return withTransaction(ctx, async (db) => {
      const t = (await db.query('SELECT status FROM stock_takes WHERE id = $1 FOR UPDATE', [takeId])).rows[0];
      if (!t) throw new AppError('Stock take not found', 404);
      if (t.status !== 'DRAFT') throw new AppError('Only a DRAFT stock take can be edited', 409);
      for (const l of lines) {
        if (!l.item_id || l.counted_kg === undefined || l.counted_kg === '' || Number(l.counted_kg) < 0) {
          throw new AppError('Every line needs item_id and a counted_kg of 0 or more');
        }
        await db.query(
          `INSERT INTO stock_take_lines (take_id, item_id, counted_kg, note) VALUES ($1, $2, $3, $4)
           ON CONFLICT (take_id, item_id) DO UPDATE
             SET counted_kg = EXCLUDED.counted_kg, note = EXCLUDED.note, system_kg = EXCLUDED.system_kg`,
          [takeId, l.item_id, l.counted_kg, l.note || null]);
      }
      return StockTake.findById(takeId, { client: db });
    });
  }

  static async removeLine(takeId, itemId, ctx) {
    return withTransaction(ctx, async (db) => {
      const t = (await db.query('SELECT status FROM stock_takes WHERE id = $1', [takeId])).rows[0];
      if (!t) throw new AppError('Stock take not found', 404);
      if (t.status !== 'DRAFT') throw new AppError('Only a DRAFT stock take can be edited', 409);
      return (await db.query('DELETE FROM stock_take_lines WHERE take_id = $1 AND item_id = $2', [takeId, itemId])).rowCount > 0;
    });
  }

  static async post(takeId, ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query('SELECT * FROM fn_post_stock_take($1, $2)', [takeId, ctx?.userId || null]);
      return StockTake.findById(takeId, { client: db });
    });
  }

  static async removeDraft(takeId, ctx) {
    return withTransaction(ctx, async (db) => {
      const r = await db.query("DELETE FROM stock_takes WHERE id = $1 AND status = 'DRAFT'", [takeId]);
      if (!r.rowCount) throw new AppError('Only DRAFT stock takes can be deleted', 409);
      return true;
    });
  }
}

module.exports = StockTake;
