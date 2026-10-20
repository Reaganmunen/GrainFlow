const { exec, withTransaction } = require('../config/db');
const { Where, insertRow, updateRow, bool } = require('../utils/sql');

const COLS = ['name', 'kind', 'power_source', 'is_active'];

/** Machines and the optional daily machine/power log (hours run, fuel, electricity). */
class Machine {
  static async list(f = {}, ctx) {
    const w = new Where().eq('is_active', bool(f.active));
    return (await exec(ctx).query(`SELECT * FROM machines ${w.clause} ORDER BY name`, w.values)).rows;
  }
  static async findById(id, ctx) {
    return (await exec(ctx).query('SELECT * FROM machines WHERE id = $1', [id])).rows[0] || null;
  }
  static async create(d, ctx) {
    return withTransaction(ctx, (db) => insertRow(db, 'machines', d, COLS));
  }
  static async update(id, d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'machines', id, d, COLS));
  }

  /** Filters: machine_id, from, to */
  static async logs(f = {}, ctx) {
    const w = new Where().eq('l.machine_id', f.machine_id).dateRange('l.log_date', f.from, f.to);
    return (await exec(ctx).query(
      `SELECT l.*, m.name AS machine_name, u.full_name AS operator_name,
              (l.fuel_cost + l.electricity_cost) AS power_cost
         FROM machine_logs l JOIN machines m ON m.id = l.machine_id LEFT JOIN users u ON u.id = l.operator_id
         ${w.clause} ORDER BY l.log_date DESC, m.name`, w.values)).rows;
  }

  /** One row per machine per day: saving again for the same day updates it. */
  static async saveLog(d, ctx) {
    return withTransaction(ctx, async (db) => (await db.query(
      `INSERT INTO machine_logs (machine_id, log_date, hours_run, fuel_litres, fuel_cost, electricity_kwh, electricity_cost, operator_id, notes)
       VALUES ($1, coalesce($2::date, current_date), coalesce($3::numeric, 0), coalesce($4::numeric, 0), coalesce($5::numeric, 0),
               coalesce($6::numeric, 0), coalesce($7::numeric, 0), $8, $9)
       ON CONFLICT (machine_id, log_date) DO UPDATE
         SET hours_run = EXCLUDED.hours_run, fuel_litres = EXCLUDED.fuel_litres, fuel_cost = EXCLUDED.fuel_cost,
             electricity_kwh = EXCLUDED.electricity_kwh, electricity_cost = EXCLUDED.electricity_cost,
             operator_id = EXCLUDED.operator_id, notes = EXCLUDED.notes
       RETURNING *`,
      [d.machine_id, d.log_date || null, d.hours_run ?? null, d.fuel_litres ?? null, d.fuel_cost ?? null,
       d.electricity_kwh ?? null, d.electricity_cost ?? null, d.operator_id || ctx?.userId || null, d.notes || null]
    )).rows[0]);
  }
}

module.exports = Machine;
