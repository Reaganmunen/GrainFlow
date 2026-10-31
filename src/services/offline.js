/**
 * Offline support, server side.
 *
 *   bootstrap(req)  everything a till needs to keep working without the internet (prices, stock, customers, jobs ...)
 *   apply(req)      applies ONE operation that was made offline (a sale with its payments, or a job ticket step)
 *
 * Each operation carries an op_id made on the till. apply() is idempotent: the same op_id twice gives the saved result back
 * and nothing is recorded twice (a lost reply after the server saved the work is the usual cause).
 * A sale and its payments are saved in ONE transaction, so a sale can never end up posted but unpaid because a later step failed.
 *
 * The same rules as the normal routes are checked here (permissions, module, discount) because this path skips the route guards.
 * Manager approval for below-minimum prices is NOT available offline (it needs the manager's password checked by the server):
 * a user with price.override can still sell below minimum, anyone else gets the database's own refusal.
 */
const { pool, exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Sale, Payment, Receipt, MillJob, MillingRate, Machine, Item, Settings } = require('../models');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULES = ['MILL', 'CEREAL'];
const BACKDATE = process.env.OFFLINE_BACKDATE !== 'false';
const MAX_AGE_DAYS = 14; // an operation older than this keeps the sync time instead of the till's clock

const forbid = (message, extra) => new AppError(message, 403, { code: 'FORBIDDEN', ...extra });
const isId = (v) => /^\d+$/.test(String(v));
const todayNairobi = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

// ------------------------------------------------------------------ the op log table
let ensured = null;
function ensureTable() {
  if (!ensured) {
    ensured = pool.query(`
      CREATE TABLE IF NOT EXISTS pmc.offline_ops (
        op_id uuid PRIMARY KEY, user_id bigint NOT NULL, device_id text, op_type text NOT NULL,
        client_time timestamptz, applied_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL)`)
      .catch((err) => { ensured = null; throw new AppError(`Offline sync is not set up on the database yet (${err.message}). Run db/offline_ops.sql.`, 500); });
  }
  return ensured;
}

// ------------------------------------------------------------------ small helpers
function clientTime(v) {
  const t = v ? new Date(v) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const now = Date.now();
  if (t.getTime() > now + 5 * 60 * 1000) return null;               // a clock set in the future
  if (t.getTime() < now - MAX_AGE_DAYS * 24 * 3600 * 1000) return null;
  return t;
}

/** Best effort: run an UPDATE that backdates a record; if the database refuses (trigger, missing column) carry on. */
async function tryUpdate(client, sql, params) {
  await client.query('SAVEPOINT offline_backdate');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT offline_backdate');
  } catch (_) {
    await client.query('ROLLBACK TO SAVEPOINT offline_backdate');
    await client.query('RELEASE SAVEPOINT offline_backdate');
  }
}

const canModule = (req, m) => !!req.access && (req.access.owner || req.access.modules.includes(m));
const needPerm = (req, ...codes) => {
  if (!codes.some((c) => req.can(c))) throw forbid('You are not allowed to do this', { required: codes });
};
const needMill = (req) => { if (!canModule(req, 'MILL')) throw forbid('You do not have access to the posho mill side', { module: 'MILL' }); };
const jobIdOf = (p) => {
  if (!isId(p && p.job_id)) throw new AppError('This job ticket is not on the server yet. It will be sent after the ticket that creates it.');
  return Number(p.job_id);
};

// ------------------------------------------------------------------ operations
const OPS = {
  /** payload: { module, channel?, customer_id?, walkin_name?, walkin_phone?, discount_amount?, on_credit?, lines[], payments[] } */
  async sale(req, op, c) {
    const d = { ...(op.payload || {}) };
    const module = String(d.module || '').toUpperCase();
    if (!MODULES.includes(module)) throw new AppError('module must be MILL or CEREAL');
    needPerm(req, 'sales.create');
    if (!req.can(`sales.${module.toLowerCase()}`)) throw forbid(`You are not allowed to work in the ${module === 'MILL' ? 'posho mill' : 'cereal'} module`);
    if (Number(d.discount_amount) > 0 && !req.can('sales.discount')) throw forbid('You are not allowed to give discounts', { required: ['sales.discount'] });
    if (!Array.isArray(d.lines) || !d.lines.length) throw new AppError('The sale has no items');

    const payments = Array.isArray(d.payments) ? d.payments : [];
    if (payments.length) needPerm(req, 'payments.create');
    for (const p of payments) {
      if (!['CASH', 'MPESA_MANUAL'].includes(p.method)) throw new AppError('Only cash and M-Pesa code payments can be saved offline');
      if (p.method === 'MPESA_MANUAL' && !req.can('payments.mpesa_manual')) throw forbid('You are not allowed to enter M-Pesa codes manually', { required: ['payments.mpesa_manual'] });
    }

    // the server decides approvals: whatever the till sent is dropped, and the user's own price.override right is applied
    const lines = d.lines.map((l) => {
      const x = { ...l };
      delete x.price_override_by;
      if (x.line_type !== 'MILLING' && req.can('price.override') && x.unit_price !== undefined) x.price_override_by = req.user.id;
      if (x.line_type === 'MILLING' && !isId(x.mill_job_id)) throw new AppError('A milling job on this sale is not on the server yet');
      return x;
    });

    const when = clientTime(op.client_time);
    const note = `Made offline${op.local_no ? ` (${op.local_no})` : ''}${when ? ` at ${when.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' })}` : ''}`;
    const body = {
      module, channel: d.channel, customer_id: d.customer_id, walkin_name: d.walkin_name, walkin_phone: d.walkin_phone,
      discount_amount: d.discount_amount, on_credit: !!d.on_credit, lines, notes: note,
    };
    const sale = await Sale.createAndPost(body, c);

    for (const p of payments) {
      await Payment.createForSale({ method: p.method, amount: p.amount, mpesa_receipt: p.mpesa_receipt, payer_phone: p.payer_phone, sale_id: sale.id }, c);
    }
    const r = await Receipt.issue(sale.id, c);

    if (when && BACKDATE) {
      await tryUpdate(c.client, 'UPDATE sales SET sale_date = $1 WHERE id = $2', [when, sale.id]);
      await tryUpdate(c.client,
        `UPDATE payments SET received_at = $1, confirmed_at = $1 WHERE id IN (SELECT payment_id FROM payment_allocations WHERE sale_id = $2)`, [when, sale.id]);
      await tryUpdate(c.client, 'UPDATE receipts SET issued_at = $1 WHERE id = $2', [when, r.id]);
    }

    const printable = await Receipt.getPrintable(r.id, c);
    const text = Receipt.toText(printable);
    return { sale_id: sale.id, sale_no: sale.sale_no, receipt_id: r.id, receipt_no: r.receipt_no, printable: { ...printable, text } };
  },

  /** payload: same fields as POST /mill/jobs. op.ref (a "tmp:..." id from the till) is answered with the real id in result.refs */
  async 'mill.create'(req, op, c) {
    needMill(req); needPerm(req, 'mill.create');
    const d = { ...(op.payload || {}) };
    delete d.job_id;
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    const job = await MillJob.create(d, c);
    const when = clientTime(op.client_time);
    if (when && BACKDATE) await tryUpdate(c.client, 'UPDATE mill_jobs SET received_at = $1 WHERE id = $2', [when, job.id]);
    const refs = op.ref ? { [op.ref]: job.id } : {};
    return { job_id: job.id, ticket_no: job.ticket_no, status: job.status, refs };
  },

  async 'mill.start'(req, op, c) {
    needMill(req); needPerm(req, 'mill.update');
    const d = { ...(op.payload || {}) };
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    const job = await MillJob.start(jobIdOf(d), d, c);
    return { job_id: job.id, ticket_no: job.ticket_no, status: job.status };
  },

  async 'mill.complete'(req, op, c) {
    needMill(req); needPerm(req, 'mill.update');
    const d = { ...(op.payload || {}) };
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    const job = await MillJob.complete(jobIdOf(d), d, c);
    return { job_id: job.id, ticket_no: job.ticket_no, status: job.status };
  },

  async 'mill.collect'(req, op, c) {
    needMill(req); needPerm(req, 'mill.collect');
    const job = await MillJob.collect(jobIdOf(op.payload), c);
    return { job_id: job.id, ticket_no: job.ticket_no, status: job.status };
  },

  async 'mill.cancel'(req, op, c) {
    needMill(req); needPerm(req, 'mill.cancel');
    const job = await MillJob.cancel(jobIdOf(op.payload), op.payload && op.payload.reason, c);
    return { job_id: job.id, ticket_no: job.ticket_no, status: job.status };
  },
};

// ------------------------------------------------------------------ apply one operation
async function apply(req) {
  const op = req.body || {};
  if (!UUID.test(String(op.op_id || ''))) throw new AppError('op_id is missing or not valid');
  const handler = OPS[op.type];
  if (!handler) throw new AppError(`Unknown offline operation: ${op.type}`);
  await ensureTable();

  return withTransaction(req.ctx, async (client) => {
    // two requests with the same op_id (a retry racing the first) wait for each other here
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [op.op_id]);
    const prev = (await client.query('SELECT user_id, result FROM pmc.offline_ops WHERE op_id = $1', [op.op_id])).rows[0];
    if (prev) {
      if (Number(prev.user_id) !== Number(req.user.id)) throw forbid('This operation belongs to another user');
      return { ...prev.result, duplicate: true };
    }
    const result = await handler(req, op, { ...req.ctx, client });
    await client.query(
      'INSERT INTO pmc.offline_ops (op_id, user_id, device_id, op_type, client_time, result) VALUES ($1, $2, $3, $4, $5, $6)',
      [op.op_id, req.user.id, String(op.device_id || '').slice(0, 40) || null, op.type, clientTime(op.client_time), result]);
    return result;
  });
}

// ------------------------------------------------------------------ bootstrap pack
async function customersFor(req) {
  if (!req.can('customers.view') && !req.can('sales.create') && !req.can('mill.create')) return [];
  const { rows } = await exec().query(
    `SELECT c.id, c.customer_code, c.full_name, c.business_name, c.phone, c.credit_allowed, c.credit_limit,
            fn_customer_balance(c.id) AS balance
       FROM customers c WHERE c.is_active ORDER BY c.full_name LIMIT 5000`);
  return rows;
}

async function bootstrap(req) {
  const out = { generated_at: new Date().toISOString(), user_id: req.user.id, business: null, catalogue: {}, customers: [], mill: null };

  const profile = await Settings.getProfile().catch(() => null);
  if (profile) out.business = { business_name: profile.business_name, receipt_header: profile.receipt_header, receipt_footer: profile.receipt_footer };

  if (req.can('sales.create')) {
    for (const m of MODULES) {
      if (!req.can(`sales.${m.toLowerCase()}`)) continue;
      out.catalogue[m] = {
        RETAIL: await Item.posCatalogue({ module: m, tier: 'RETAIL' }),
        WHOLESALE: await Item.posCatalogue({ module: m, tier: 'WHOLESALE' }),
      };
    }
  }
  out.customers = await customersFor(req);

  if (canModule(req, 'MILL') && (req.can('mill.view') || req.can('sales.create'))) {
    const day = todayNairobi();
    const grains = await Item.list({ millable: 'true', active: 'true', limit: 200, scope_pools: req.access.owner ? undefined : req.access.pools });
    const rates = {};
    for (const g of grains.rows) rates[g.id] = await MillingRate.currentFor(g.id);
    out.mill = {
      day,
      jobs_open: req.can('mill.view') ? (await MillJob.list({ status: 'WAITING,MILLING,READY', limit: 200 })).rows : [],
      jobs_done: req.can('mill.view') ? (await MillJob.list({ status: 'COLLECTED', from: day, to: day, limit: 200 })).rows : [],
      billable: await MillJob.billable({}),
      grains: grains.rows,
      machines: await Machine.list({ active: 'true' }).catch(() => []),
      rates,
    };
  }
  return out;
}

module.exports = { apply, bootstrap, ensureTable };
