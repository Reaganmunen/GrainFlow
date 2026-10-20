const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, paged } = require('../utils/sql');

const REVIEW_STATUSES = ['EXPLAINED', 'CONFIRMED_LOSS', 'DISMISSED'];

/** Alerts raised when a job's flour comes out below the yield floor, plus the yield reports. */
class YieldAlert {
  /** Filters: status (OPEN default view for the owner), from, to */
  static async list(f = {}, ctx) {
    const w = new Where().eq('a.status', f.status).dateRange('fn_local_date(j.received_at)', f.from, f.to);
    return paged(
      exec(ctx),
      `SELECT a.*, j.ticket_no, j.received_at, j.weight_in_kg, j.job_type, g.name AS grain_name,
              m.full_name AS miller_name, coalesce(c.full_name, j.walkin_name) AS customer_name, r.full_name AS reviewed_by_name`,
      `FROM yield_alerts a JOIN mill_jobs j ON j.id = a.job_id JOIN items g ON g.id = j.grain_item_id
         LEFT JOIN users m ON m.id = j.miller_id LEFT JOIN customers c ON c.id = j.customer_id LEFT JOIN users r ON r.id = a.reviewed_by`,
      w, 'a.created_at DESC', f
    );
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query('SELECT * FROM yield_alerts WHERE id = $1', [id])).rows[0] || null;
  }

  /** status: EXPLAINED | CONFIRMED_LOSS | DISMISSED, review_note required. */
  static async review(id, { status, review_note }, ctx) {
    if (!REVIEW_STATUSES.includes(status)) throw new AppError(`status must be one of: ${REVIEW_STATUSES.join(', ')}`);
    if (!review_note || !String(review_note).trim()) throw new AppError('A review note is required');
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query(
        `UPDATE yield_alerts SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
          WHERE id = $1 RETURNING *`, [id, status, review_note, ctx?.userId || null]);
      if (!rows[0]) throw new AppError('Alert not found', 404);
      return rows[0];
    });
  }

  /** Every weighed job in a period. Filters: from, to, grain (name), miller, yield_status */
  static async report(f = {}, ctx) {
    const w = new Where().dateRange('day', f.from, f.to).eq('yield_status', f.yield_status).eq('miller', f.miller).eq('grain', f.grain);
    return paged(exec(ctx), 'SELECT *', 'FROM v_mill_yield_report', w, 'day DESC, job_id DESC', f);
  }

  /** Average yield per grain for a period. */
  static async byGrain(f = {}, ctx) {
    const w = new Where().dateRange('day', f.from, f.to);
    return (await exec(ctx).query(
      `SELECT grain, count(*) AS jobs, sum(weight_in_kg) AS kg_in, sum(weight_out_kg) AS kg_out,
              round(100 * sum(weight_out_kg) / nullif(sum(weight_in_kg), 0), 2) AS avg_yield_pct,
              count(*) FILTER (WHERE yield_status = 'LOW') AS low_yield_jobs
         FROM v_mill_yield_report ${w.clause} GROUP BY grain ORDER BY grain`, w.values)).rows;
  }

  /** Average yield per miller: the quickest way to spot who consistently comes out low. */
  static async byMiller(f = {}, ctx) {
    const w = new Where().dateRange('day', f.from, f.to);
    return (await exec(ctx).query(
      `SELECT coalesce(miller, 'Unassigned') AS miller, count(*) AS jobs, sum(weight_in_kg) AS kg_in, sum(weight_out_kg) AS kg_out,
              round(100 * sum(weight_out_kg) / nullif(sum(weight_in_kg), 0), 2) AS avg_yield_pct,
              count(*) FILTER (WHERE yield_status = 'LOW') AS low_yield_jobs
         FROM v_mill_yield_report ${w.clause} GROUP BY miller ORDER BY avg_yield_pct`, w.values)).rows;
  }
}

module.exports = YieldAlert;
