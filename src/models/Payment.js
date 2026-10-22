const { pool, exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, paged } = require('../utils/sql');

const PAYMENT_COLS = ['customer_id', 'module', 'method', 'state', 'amount', 'payer_phone', 'mpesa_receipt', 'received_by', 'note'];
const OFFLINE_METHODS = ['CASH', 'MPESA_MANUAL', 'BANK', 'OTHER'];

/**
 * Payments and M-Pesa STK push bookkeeping. This model never calls Safaricom: your Daraja service does that
 * between initiateStk() and markStkSent()/markStkFailed(), and your callback route calls handleStkCallback().
 */
class Payment {
  /** Filters: customer_id, method, state, module, from, to, search */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('p.customer_id', f.customer_id)
      .eq('p.method', f.method)
      .eq('p.state', f.state)
      .eq('p.module', f.module)
      .inList('p.module', f.scope_modules)
      .dateRange('fn_local_date(p.received_at)', f.from, f.to)
      .search(['p.payment_no', 'p.mpesa_receipt', 'p.payer_phone', 'c.full_name'], f.search);
    return paged(
      exec(ctx),
      'SELECT p.*, c.full_name AS customer_name, u.full_name AS received_by_name',
      'FROM payments p LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN users u ON u.id = p.received_by',
      w, 'p.received_at DESC, p.id DESC', f
    );
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const p = (await db.query(
      `SELECT p.*, c.full_name AS customer_name FROM payments p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = $1`, [id])).rows[0];
    if (!p) return null;
    p.allocations = (await db.query(
      'SELECT pa.*, s.sale_no FROM payment_allocations pa JOIN sales s ON s.id = pa.sale_id WHERE pa.payment_id = $1 ORDER BY pa.id', [id])).rows;
    p.stk_requests = (await db.query(
      `SELECT id, checkout_request_id, phone, amount, status, result_code, result_desc, mpesa_receipt, initiated_at, callback_at
         FROM mpesa_stk_requests WHERE payment_id = $1 ORDER BY id`, [id])).rows;
    return p;
  }

  static async _loadSale(db, saleId) {
    const s = (await db.query('SELECT id, sale_no, module, customer_id, status, balance_due FROM sales WHERE id = $1 FOR UPDATE', [saleId])).rows[0];
    if (!s) throw new AppError('Sale not found', 404);
    if (s.status !== 'POSTED') throw new AppError(`Sale ${s.sale_no} is ${s.status}. Post the sale before taking payment.`, 409);
    return s;
  }

  /** Cash / manual M-Pesa code / bank / other payment against one sale (confirmed immediately). */
  static async createForSale(d, ctx) {
    if (!OFFLINE_METHODS.includes(d.method)) throw new AppError(`method must be one of ${OFFLINE_METHODS.join(', ')}. For an M-Pesa prompt use initiateStk.`);
    const amount = Number(d.amount);
    if (!(amount > 0)) throw new AppError('Amount must be greater than 0');
    const code = d.mpesa_receipt ? String(d.mpesa_receipt).trim().toUpperCase() : null;
    if (d.method === 'MPESA_MANUAL' && !code) throw new AppError('Enter the M-Pesa transaction code');
    return withTransaction(ctx, async (db) => {
      const sale = await Payment._loadSale(db, d.sale_id);
      if (amount > sale.balance_due + 0.001) throw new AppError(`Amount is more than the balance of ${sale.balance_due} on ${sale.sale_no}`);
      const pay = await insertRow(db, 'payments', {
        customer_id: sale.customer_id, module: sale.module, method: d.method, state: 'CONFIRMED', amount,
        payer_phone: d.payer_phone, mpesa_receipt: d.method === 'MPESA_MANUAL' ? code : null, received_by: ctx?.userId, note: d.note,
      }, PAYMENT_COLS);
      await db.query('INSERT INTO payment_allocations (payment_id, sale_id, amount) VALUES ($1, $2, $3)', [pay.id, sale.id, amount]);
      return Payment.findById(pay.id, { client: db });
    });
  }

  /** Payment on account (not tied to one sale). By default it is spread over the customer's oldest unpaid sales. */
  static async createOnAccount(d, ctx) {
    if (!d.customer_id) throw new AppError('customer_id is required');
    if (!OFFLINE_METHODS.includes(d.method)) throw new AppError(`method must be one of ${OFFLINE_METHODS.join(', ')}`);
    if (!(Number(d.amount) > 0)) throw new AppError('Amount must be greater than 0');
    const code = d.mpesa_receipt ? String(d.mpesa_receipt).trim().toUpperCase() : null;
    if (d.method === 'MPESA_MANUAL' && !code) throw new AppError('Enter the M-Pesa transaction code');
    return withTransaction(ctx, async (db) => {
      const pay = await insertRow(db, 'payments', {
        customer_id: d.customer_id, module: d.module || 'SHARED', method: d.method, state: 'CONFIRMED', amount: d.amount,
        payer_phone: d.payer_phone, mpesa_receipt: d.method === 'MPESA_MANUAL' ? code : null, received_by: ctx?.userId, note: d.note,
      }, PAYMENT_COLS);
      let unallocated = pay.amount;
      if (d.allocate !== false) {
        unallocated = (await db.query('SELECT fn_allocate_payment_fifo($1) AS left', [pay.id])).rows[0].left;
      }
      return { payment: await Payment.findById(pay.id, { client: db }), unallocated };
    });
  }

  /** Spreads a confirmed customer payment over their oldest unpaid sales; returns the amount left on account. */
  static async allocateFifo(paymentId, ctx) {
    return withTransaction(ctx, async (db) => (await db.query('SELECT fn_allocate_payment_fifo($1) AS left', [paymentId])).rows[0].left);
  }

  // ------------------------------------------------------------------ M-Pesa STK push
  /**
   * Step 1: record a PENDING payment + STK request for a posted sale. Returns { payment, stk, sale_no }.
   * Then call Daraja with stk.phone and stk.amount (Daraja needs whole shillings; AccountReference is max 12 chars,
   * which is why account_reference is sale_no without dashes), then call markStkSent() or markStkFailed().
   */
  static async initiateStk(d, ctx) {
    return withTransaction(ctx, async (db) => {
      const sale = await Payment._loadSale(db, d.sale_id);
      const amount = d.amount !== undefined && d.amount !== '' ? Number(d.amount) : sale.balance_due;
      if (!(amount > 0)) throw new AppError('Nothing to pay on this sale');
      if (amount > sale.balance_due + 0.001) throw new AppError(`Amount is more than the balance of ${sale.balance_due} on ${sale.sale_no}`);
      const phone = (await db.query('SELECT fn_normalize_phone($1) AS p', [d.phone])).rows[0].p;
      if (!/^254[17][0-9]{8}$/.test(phone || '')) throw new AppError('Enter a valid Safaricom number, e.g. 0712345678');

      const payment = await insertRow(db, 'payments', {
        customer_id: sale.customer_id, module: sale.module, method: 'MPESA_STK', state: 'PENDING', amount,
        payer_phone: phone, received_by: ctx?.userId,
      }, PAYMENT_COLS);
      await db.query('INSERT INTO payment_allocations (payment_id, sale_id, amount) VALUES ($1, $2, $3)', [payment.id, sale.id, amount]);
      const stk = await insertRow(db, 'mpesa_stk_requests', {
        payment_id: payment.id, phone, amount,
        account_reference: d.account_reference || sale.sale_no.replace(/-/g, '').slice(0, 12),
        transaction_desc: d.transaction_desc || 'Payment',
        initiated_by: ctx?.userId,
      }, ['payment_id', 'phone', 'amount', 'account_reference', 'transaction_desc', 'initiated_by']);
      return { payment, stk, sale_no: sale.sale_no };
    });
  }

  /** Step 2 (Daraja accepted the request). The Password field is stripped from the stored request. */
  static async markStkSent(stkId, { merchant_request_id, checkout_request_id, request_payload, response_payload }, ctx) {
    const { Password, ...safeRequest } = request_payload || {};
    const { rows } = await exec(ctx).query(
      `UPDATE mpesa_stk_requests SET status = 'SENT', merchant_request_id = $2, checkout_request_id = $3,
              request_payload = $4, response_payload = $5 WHERE id = $1 RETURNING *`,
      [stkId, merchant_request_id || null, checkout_request_id || null, request_payload ? safeRequest : null, response_payload || null]);
    if (!rows[0]) throw new AppError('STK request not found', 404);
    return rows[0];
  }

  /** Step 2 alternative: Daraja rejected the request or could not be reached. */
  static async markStkFailed(stkId, error, ctx) {
    return withTransaction(ctx, async (db) => {
      const { rows } = await db.query(
        `UPDATE mpesa_stk_requests SET status = 'FAILED', result_desc = $2, response_payload = $3 WHERE id = $1 RETURNING *`,
        [stkId, String(error?.message || error || 'Request failed').slice(0, 500), error?.response || null]);
      if (!rows[0]) throw new AppError('STK request not found', 404);
      await db.query("UPDATE payments SET state = 'FAILED' WHERE id = $1 AND state = 'PENDING'", [rows[0].payment_id]);
      return rows[0];
    });
  }

  /**
   * Step 3: Safaricom's callback. Always logs the raw body first, then confirms/fails the payment.
   * Never throws: respond to Safaricom with { ResultCode: 0, ResultDesc: 'Accepted' } whatever this returns.
   */
  static async handleStkCallback(body) {
    let logId = null;
    try {
      logId = (await pool.query('INSERT INTO mpesa_callback_log (source, payload) VALUES ($1, $2) RETURNING id', ['STK', body])).rows[0].id;
      const cb = body?.Body?.stkCallback;
      if (!cb || !cb.CheckoutRequestID) throw new Error('Malformed STK callback');
      const items = cb.CallbackMetadata?.Item || [];
      const get = (name) => items.find((i) => i.Name === name)?.Value;
      const ts = String(get('TransactionDate') || '');
      const transDate = /^\d{14}$/.test(ts)
        ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}+03:00`
        : null;
      const phone = get('PhoneNumber');
      await withTransaction({}, (db) => db.query(
        'SELECT fn_mpesa_stk_callback($1, $2, $3, $4, $5, $6, $7, $8)',
        [cb.CheckoutRequestID, cb.ResultCode, cb.ResultDesc || null, get('MpesaReceiptNumber') ?? null,
         get('Amount') ?? null, phone != null ? String(phone) : null, transDate, body]));
      await pool.query('UPDATE mpesa_callback_log SET processed = true WHERE id = $1', [logId]);
      return { ok: true };
    } catch (err) {
      if (logId) await pool.query('UPDATE mpesa_callback_log SET error_text = $2 WHERE id = $1', [logId, err.message]).catch(() => {});
      return { ok: false, error: err.message };
    }
  }

  /** For the frontend to poll after sending a prompt: payment state plus the latest STK status. */
  static async stkStatus(paymentId, ctx) {
    return (await exec(ctx).query(
      `SELECT p.id, p.payment_no, p.state, p.amount, p.mpesa_receipt, r.id AS stk_id, r.status AS stk_status,
              r.result_code, r.result_desc, r.initiated_at
         FROM payments p LEFT JOIN LATERAL (SELECT * FROM mpesa_stk_requests WHERE payment_id = p.id ORDER BY id DESC LIMIT 1) r ON true
        WHERE p.id = $1`, [paymentId])).rows[0] || null;
  }

  /**
   * Marks prompts with no answer after the stk_timeout_seconds setting as TIMEOUT / FAILED. Run it on a timer.
   * A late "success" callback still confirms the payment. Returns the number of payments failed.
   */
  static async expireStale(ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query(
        `UPDATE mpesa_stk_requests SET status = 'TIMEOUT', result_desc = coalesce(result_desc, 'No response from customer')
          WHERE status IN ('INITIATED', 'SENT') AND initiated_at < now() - make_interval(secs => fn_setting_num('stk_timeout_seconds', 60))`);
      const r = await db.query(
        `UPDATE payments SET state = 'FAILED'
          WHERE state = 'PENDING' AND method = 'MPESA_STK'
            AND NOT EXISTS (SELECT 1 FROM mpesa_stk_requests o WHERE o.payment_id = payments.id AND o.status IN ('INITIATED', 'SENT', 'SUCCESS'))`);
      return r.rowCount;
    });
  }

  /** Fallback when the callback never arrives but the customer shows the M-Pesa SMS code. */
  static async confirmManually(paymentId, mpesaReceipt, ctx) {
    const code = String(mpesaReceipt || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(code)) throw new AppError('Enter the 10-character M-Pesa code');
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        `UPDATE payments SET state = 'CONFIRMED', mpesa_receipt = $2, confirmed_at = now(),
                note = coalesce(note || ' | ', '') || 'Confirmed manually'
          WHERE id = $1 AND method = 'MPESA_STK' AND state IN ('PENDING', 'FAILED', 'CANCELLED') RETURNING id`, [paymentId, code]);
      if (!r.rowCount) throw new AppError('Payment not found or not waiting for confirmation', 409);
      return Payment.findById(paymentId, { client: db });
    });
  }

  /** Cashier gave up on a pending prompt. */
  static async cancelPending(paymentId, ctx) {
    return withTransaction(ctx, async (db) => {
      const r = await db.query("UPDATE payments SET state = 'CANCELLED' WHERE id = $1 AND state = 'PENDING' RETURNING id", [paymentId]);
      if (!r.rowCount) throw new AppError('Only PENDING payments can be cancelled', 409);
      return Payment.findById(paymentId, { client: db });
    });
  }

  /** Reverses a CONFIRMED payment (customer ledger and the sale balance are adjusted by the DB). Reason required. */
  static async reverse(paymentId, reason, ctx) {
    if (!reason || !String(reason).trim()) throw new AppError('A reason is required to reverse a payment');
    return withTransaction(ctx, async (db) => {
      const r = await db.query(
        `UPDATE payments SET state = 'REVERSED', note = coalesce(note || ' | ', '') || $2 WHERE id = $1 AND state = 'CONFIRMED' RETURNING id`,
        [paymentId, `Reversed: ${reason}`]);
      if (!r.rowCount) throw new AppError('Only CONFIRMED payments can be reversed', 409);
      return Payment.findById(paymentId, { client: db });
    });
  }
}

module.exports = Payment;
