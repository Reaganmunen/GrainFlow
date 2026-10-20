const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged } = require('../utils/sql');

const CREATE_COLS = ['job_type', 'customer_id', 'walkin_name', 'walkin_phone', 'grain_item_id', 'miller_id', 'machine_id',
  'weight_in_kg', 'tins_in', 'rate_basis', 'rate_applied', 'extra_charge', 'blend_description', 'special_request', 'created_by'];
const EDIT_COLS = ['walkin_name', 'walkin_phone', 'miller_id', 'machine_id', 'tins_in', 'rate_basis', 'rate_applied',
  'extra_charge', 'blend_description', 'special_request'];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Milling jobs: WAITING -> MILLING -> READY -> COLLECTED (or CANCELLED).
 * The DB does the heavy lifting: customer grain goes in/out of its own stock pool, the rate list is applied,
 * the yield check runs and yield alerts are raised. The charge is billed through a MILLING line on a sale.
 */
class MillJob {
  /** Filters: status (one, or comma list e.g. 'WAITING,MILLING'), job_type, customer_id, grain_item_id, miller_id, search, from, to */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('j.job_type', f.job_type)
      .eq('j.customer_id', f.customer_id)
      .eq('j.grain_item_id', f.grain_item_id)
      .eq('j.miller_id', f.miller_id)
      .dateRange('fn_local_date(j.received_at)', f.from, f.to)
      .search(['j.ticket_no', 'j.walkin_name', 'j.walkin_phone', 'c.full_name'], f.search);
    if (f.status) {
      const list = String(f.status).split(',').map((s) => s.trim()).filter(Boolean);
      w.raw('j.status::text = ANY(?::text[])', list);
    }
    return paged(
      exec(ctx),
      `SELECT j.id, j.ticket_no, j.job_type, j.status, j.received_at, j.weight_in_kg, j.weight_out_kg, j.bran_kg,
              j.yield_pct, j.yield_status, j.charge_amount, j.sale_id, j.customer_id,
              coalesce(c.full_name, j.walkin_name) AS customer_name, g.name AS grain_name, m.full_name AS miller_name`,
      `FROM mill_jobs j JOIN items g ON g.id = j.grain_item_id LEFT JOIN customers c ON c.id = j.customer_id
         LEFT JOIN users m ON m.id = j.miller_id`,
      w, 'j.received_at DESC, j.id DESC', f
    );
  }

  /** Board view: jobs waiting, milling or ready, oldest first. */
  static async open(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_mill_jobs_open ORDER BY received_at')).rows;
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const job = (await db.query(
      `SELECT j.*, coalesce(c.full_name, j.walkin_name) AS customer_name, c.phone AS customer_phone,
              g.name AS grain_name, m.full_name AS miller_name, mc.name AS machine_name, s.sale_no
         FROM mill_jobs j JOIN items g ON g.id = j.grain_item_id LEFT JOIN customers c ON c.id = j.customer_id
         LEFT JOIN users m ON m.id = j.miller_id LEFT JOIN machines mc ON mc.id = j.machine_id LEFT JOIN sales s ON s.id = j.sale_id
        WHERE j.id = $1`, [id])).rows[0];
    if (!job) return null;
    job.blends = (await db.query(
      'SELECT b.*, i.name AS grain_name FROM mill_job_blends b JOIN items i ON i.id = b.grain_item_id WHERE b.job_id = $1 ORDER BY b.id', [id])).rows;
    job.outputs = (await db.query(
      'SELECT o.*, i.name AS item_name FROM mill_job_outputs o JOIN items i ON i.id = o.output_item_id WHERE o.job_id = $1 ORDER BY o.id', [id])).rows;
    job.history = (await db.query(
      'SELECT h.*, u.full_name AS changed_by_name FROM mill_job_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.job_id = $1 ORDER BY h.changed_at, h.id', [id])).rows;
    job.yield_alert = (await db.query('SELECT * FROM yield_alerts WHERE job_id = $1', [id])).rows[0] || null;
    return job;
  }

  /** Finished customer jobs not yet billed (feed these into a MILLING sale line). Filter: customer_id */
  static async billable(f = {}, ctx) {
    const w = new Where()
      .raw("j.job_type = 'CUSTOMER' AND j.status IN ('READY','COLLECTED') AND j.sale_id IS NULL AND j.charge_amount > 0")
      .eq('j.customer_id', f.customer_id);
    return (await exec(ctx).query(
      `SELECT j.id, j.ticket_no, j.status, j.received_at, j.weight_in_kg, j.charge_amount, j.customer_id,
              coalesce(c.full_name, j.walkin_name) AS customer_name, g.name AS grain_name
         FROM mill_jobs j JOIN items g ON g.id = j.grain_item_id LEFT JOIN customers c ON c.id = j.customer_id
         ${w.clause} ORDER BY j.received_at`, w.values)).rows;
  }

  /**
   * Weigh-in. d: job_type ('CUSTOMER' default | 'OWN'), customer_id or walkin_name, grain_item_id, weight_in_kg,
   * optional tins_in, rate_basis + rate_applied (omit to use the rate list), extra_charge, miller_id, machine_id,
   * blend_description, special_request, blends: [{ grain_item_id, weight_kg }].
   */
  static async create(d, ctx) {
    const type = d.job_type || 'CUSTOMER';
    if (!d.grain_item_id) throw new AppError('grain_item_id is required');
    if (!(Number(d.weight_in_kg) > 0)) throw new AppError('weight_in_kg must be greater than 0');
    if (type === 'CUSTOMER' && !d.customer_id && !(d.walkin_name && String(d.walkin_name).trim())) {
      throw new AppError('Select a customer or enter a walk-in name');
    }
    return withTransaction(ctx, async (db) => {
      const job = await insertRow(db, 'mill_jobs', { ...d, job_type: type, created_by: ctx?.userId }, CREATE_COLS);
      if (type === 'CUSTOMER' && job.rate_basis === 'PER_TIN' && !(Number(job.tins_in) > 0)) {
        throw new AppError('This grain is charged per tin - enter the number of tins');
      }
      for (const b of d.blends || []) {
        await db.query('INSERT INTO mill_job_blends (job_id, grain_item_id, weight_kg) VALUES ($1, $2, $3)', [job.id, b.grain_item_id, b.weight_kg]);
      }
      return MillJob.findById(job.id, { client: db });
    });
  }

  /**
   * Edit a WAITING/MILLING, unbilled job (rate, tins, extra charge, notes, miller...). The charge is recalculated.
   * Weight in cannot be edited (customer grain stock was booked at that weight): cancel and re-create instead.
   */
  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      const job = (await db.query('SELECT * FROM mill_jobs WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!job) throw new AppError('Job not found', 404);
      if (!['WAITING', 'MILLING'].includes(job.status)) throw new AppError(`Job ${job.ticket_no} is ${job.status} and can no longer be edited`, 409);
      if (job.sale_id) throw new AppError(`Job ${job.ticket_no} is already billed`, 409);
      const merged = { ...job };
      const patch = {};
      for (const c of EDIT_COLS) if (d[c] !== undefined) { merged[c] = d[c] === '' ? null : d[c]; patch[c] = d[c]; }
      const base = merged.rate_basis === 'PER_TIN' ? Number(merged.tins_in || 0) : Number(merged.weight_in_kg);
      patch.charge_amount = job.job_type === 'OWN' ? 0 : round2(base * Number(merged.rate_applied || 0) + Number(merged.extra_charge || 0));
      await updateRow(db, 'mill_jobs', id, patch, [...EDIT_COLS, 'charge_amount']);
      return MillJob.findById(id, { client: db });
    });
  }

  static async _stampHistory(db, jobId, userId) {
    await db.query(
      `UPDATE mill_job_status_history SET changed_by = $2
        WHERE id = (SELECT max(id) FROM mill_job_status_history WHERE job_id = $1)`, [jobId, userId || null]);
  }

  /** WAITING -> MILLING. Optional d.miller_id, d.machine_id. */
  static async start(id, d = {}, ctx) {
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        `UPDATE mill_jobs SET status = 'MILLING', miller_id = coalesce($2, miller_id), machine_id = coalesce($3, machine_id)
          WHERE id = $1 AND status = 'WAITING' RETURNING id`, [id, d.miller_id || null, d.machine_id || null]);
      if (!r.rowCount) throw new AppError('Job not found or not waiting', 409);
      await MillJob._stampHistory(db, id, ctx?.userId);
      return MillJob.findById(id, { client: db });
    });
  }

  /**
   * Weigh-out -> READY. Runs the yield check, books customer grain out and records outputs.
   * d: weight_out_kg (flour), bran_kg, optional miller_id, machine_id, flour_item_id / bran_item_id (default from the
   * yield standard), flour_destination (CUSTOMER job: RETURNED_TO_CUSTOMER, OWN job: MILL_STOCK),
   * bran_destination (default MILL_STOCK; use RETURNED_TO_CUSTOMER if the customer takes the bran),
   * or full control with outputs: [{ output_item_id, quantity_kg, destination }].
   */
  static async complete(id, d, ctx) {
    if (d.weight_out_kg === undefined || d.weight_out_kg === '' || !(Number(d.weight_out_kg) >= 0)) {
      throw new AppError('weight_out_kg (flour weighed out) is required');
    }
    const out = Number(d.weight_out_kg);
    const bran = d.bran_kg === undefined || d.bran_kg === '' || d.bran_kg === null ? null : Number(d.bran_kg);
    if (bran !== null && !(bran >= 0)) throw new AppError('bran_kg must be 0 or more');

    return withTransaction(ctx, async (db) => {
      const job = (await db.query('SELECT * FROM mill_jobs WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!job) throw new AppError('Job not found', 404);
      if (!['WAITING', 'MILLING'].includes(job.status)) throw new AppError(`Job ${job.ticket_no} is ${job.status}`, 409);
      if (out + (bran || 0) > Number(job.weight_in_kg) * 1.02) throw new AppError('Flour + bran cannot be more than the grain weighed in');

      await db.query(
        `UPDATE mill_jobs SET status = 'READY', weight_out_kg = $2, bran_kg = $3,
                miller_id = coalesce($4, miller_id, $5), machine_id = coalesce($6, machine_id) WHERE id = $1`,
        [id, out, bran, d.miller_id || null, ctx?.userId || null, d.machine_id || null]);
      await MillJob._stampHistory(db, id, ctx?.userId);

      let outputs = d.outputs;
      if (!Array.isArray(outputs)) {
        const std = (await db.query(
          `SELECT flour_item_id, bran_item_id FROM yield_standards WHERE grain_item_id = $1 AND effective_from <= current_date
            ORDER BY effective_from DESC LIMIT 1`, [job.grain_item_id])).rows[0] || {};
        const flourItem = d.flour_item_id || std.flour_item_id;
        const branItem = d.bran_item_id || std.bran_item_id;
        const flourDest = d.flour_destination || (job.job_type === 'OWN' ? 'MILL_STOCK' : 'RETURNED_TO_CUSTOMER');
        const branDest = d.bran_destination || 'MILL_STOCK';
        outputs = [];
        if (out > 0) {
          if (flourItem) outputs.push({ output_item_id: flourItem, quantity_kg: out, destination: flourDest });
          else if (flourDest !== 'RETURNED_TO_CUSTOMER') throw new AppError('No flour item is set for this grain. Add a yield standard or pass flour_item_id.');
        }
        if (bran > 0) {
          if (branItem) outputs.push({ output_item_id: branItem, quantity_kg: bran, destination: branDest });
          else if (branDest !== 'RETURNED_TO_CUSTOMER') throw new AppError('No bran item is set for this grain. Add a yield standard or pass bran_item_id.');
        }
      }
      for (const o of outputs) {
        await db.query(
          'INSERT INTO mill_job_outputs (job_id, output_item_id, quantity_kg, destination) VALUES ($1, $2, $3, $4)',
          [id, o.output_item_id, o.quantity_kg, o.destination]);
      }
      return MillJob.findById(id, { client: db });
    });
  }

  /** READY -> COLLECTED. */
  static async collect(id, ctx) {
    return withTransaction(ctx, async (db) => {
      const r = await db.query("UPDATE mill_jobs SET status = 'COLLECTED' WHERE id = $1 AND status = 'READY' RETURNING id", [id]);
      if (!r.rowCount) throw new AppError('Job not found or not ready for collection', 409);
      await MillJob._stampHistory(db, id, ctx?.userId);
      return MillJob.findById(id, { client: db });
    });
  }

  /** WAITING/MILLING -> CANCELLED. Customer grain is booked back out of the customer pool. */
  static async cancel(id, reason, ctx) {
    if (!reason || !String(reason).trim()) throw new AppError('A cancel reason is required');
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        "UPDATE mill_jobs SET status = 'CANCELLED', cancel_reason = $2 WHERE id = $1 AND status IN ('WAITING','MILLING') RETURNING id", [id, reason]);
      if (!r.rowCount) throw new AppError('Job not found or can no longer be cancelled', 409);
      await MillJob._stampHistory(db, id, ctx?.userId);
      return MillJob.findById(id, { client: db });
    });
  }
}

module.exports = MillJob;
