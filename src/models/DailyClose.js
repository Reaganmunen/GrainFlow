const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, paged } = require('../utils/sql');

/** End-of-day: expected cash and M-Pesa vs what was actually counted. module SHARED = whole business. */
class DailyClose {
  static async list(f = {}, ctx) {
    const w = new Where().eq('d.module', f.module).eq('d.status', f.status).dateRange('d.close_date', f.from, f.to);
    return paged(
      exec(ctx),
      'SELECT d.*, u.full_name AS closed_by_name',
      'FROM daily_closes d LEFT JOIN users u ON u.id = d.closed_by',
      w, 'd.close_date DESC, d.module', f
    );
  }

  static async find(date, module, ctx) {
    return (await exec(ctx).query('SELECT * FROM daily_closes WHERE close_date = $1 AND module = $2', [date, module])).rows[0] || null;
  }

  /** What the system expects for the day (before anyone counts): { expected_cash, expected_mpesa, existing } */
  static async preview(date, module, ctx) {
    const db = exec(ctx);
    const e = (await db.query('SELECT * FROM fn_daily_expected($1::date, $2::module_code)', [date || null, module === 'SHARED' ? null : module || null])).rows[0];
    const existing = date && module ? await DailyClose.find(date, module, ctx) : null;
    return { date, module: module || 'SHARED', ...e, existing };
  }

  /** Closes the day (re-closing an OPEN one updates it). Fails if the day is already CLOSED. */
  static async perform({ date, module = 'SHARED', opening_float = 0, counted_cash, counted_mpesa, notes }, ctx) {
    if (!date) throw new AppError('date is required');
    if (counted_cash === undefined || counted_cash === '' || counted_mpesa === undefined || counted_mpesa === '') {
      throw new AppError('counted_cash and counted_mpesa are required');
    }
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query('SELECT * FROM fn_perform_daily_close($1, $2, $3, $4, $5, $6, $7)',
        [date, module, opening_float || 0, counted_cash, counted_mpesa, ctx?.userId || null, notes || null]);
      return rows[0];
    });
  }

  /** Owner-only correction: reopen a closed day so it can be closed again. */
  static async reopen(id, ctx) {
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query("UPDATE daily_closes SET status = 'OPEN' WHERE id = $1 AND status = 'CLOSED' RETURNING *", [id]);
      if (!rows[0]) throw new AppError('Close not found or not closed', 409);
      return rows[0];
    });
  }
}

module.exports = DailyClose;
