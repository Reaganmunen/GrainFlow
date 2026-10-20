const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged, bool } = require('../utils/sql');

const HEADER_COLS = ['module', 'channel', 'customer_id', 'walkin_name', 'walkin_phone', 'sale_date', 'discount_amount',
  'is_delivery', 'delivery_address', 'due_date', 'notes', 'cashier_id'];
const DRAFT_EDIT_COLS = ['channel', 'customer_id', 'walkin_name', 'walkin_phone', 'discount_amount', 'is_delivery',
  'delivery_address', 'due_date', 'notes'];
const LINE_COLS = ['sale_id', 'line_type', 'item_id', 'mill_job_id', 'description', 'unit_id', 'quantity', 'unit_price',
  'stock_pool', 'price_override_by', 'override_reason'];

const blank = (v) => v === undefined || v === null || v === '';

/**
 * Sales follow DRAFT -> POSTED -> (VOIDED). Posting takes stock out at cost, links milling tickets and debits
 * the customer's ledger. Take money with the Payment model after posting.
 *
 * Line shapes:
 *   ITEM    { item_id, unit_id, quantity, unit_price?, price_override_by?, override_reason? }
 *           unit_price defaults to the current RETAIL (or WHOLESALE for wholesale sales) price.
 *   MILLING { line_type: 'MILLING', mill_job_id }   (price = the job's charge)
 * Selling below the minimum price needs price_override_by = id of a user with the price.override permission.
 */
class Sale {
  /** Filters: module, channel, status, payment_status, customer_id, cashier_id, is_credit, owing, search, from, to */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('s.module', f.module)
      .eq('s.channel', f.channel)
      .eq('s.status', f.status)
      .eq('s.payment_status', f.payment_status)
      .eq('s.customer_id', f.customer_id)
      .eq('s.cashier_id', f.cashier_id)
      .eq('s.is_credit', bool(f.is_credit))
      .dateRange('fn_local_date(s.sale_date)', f.from, f.to)
      .search(['s.sale_no', 'c.full_name', 's.walkin_name', 's.walkin_phone'], f.search);
    if (bool(f.owing)) w.raw("s.status = 'POSTED' AND s.balance_due > 0");
    return paged(
      exec(ctx),
      `SELECT s.id, s.sale_no, s.module, s.channel, s.sale_date, s.status, s.total_amount, s.amount_paid, s.balance_due,
              s.payment_status, s.is_credit, s.due_date, s.is_delivery, s.customer_id,
              coalesce(c.full_name, s.walkin_name) AS customer_name, u.full_name AS cashier_name`,
      'FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.cashier_id',
      w, 's.sale_date DESC, s.id DESC', f
    );
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const sale = (await db.query(
      `SELECT s.*, c.full_name AS customer_name, c.customer_code, c.phone AS customer_phone, u.full_name AS cashier_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.cashier_id WHERE s.id = $1`, [id])).rows[0];
    if (!sale) return null;
    sale.lines = (await db.query(
      `SELECT l.*, i.name AS item_name, i.sku, un.code AS unit_code, un.name AS unit_name, j.ticket_no
         FROM sale_lines l LEFT JOIN items i ON i.id = l.item_id LEFT JOIN units un ON un.id = l.unit_id
         LEFT JOIN mill_jobs j ON j.id = l.mill_job_id WHERE l.sale_id = $1 ORDER BY l.id`, [id])).rows;
    sale.payments = (await db.query(
      `SELECT p.id, p.payment_no, p.method, p.state, pa.amount AS allocated, p.amount, p.mpesa_receipt, p.payer_phone,
              p.received_at, p.confirmed_at
         FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE pa.sale_id = $1 ORDER BY p.received_at, p.id`, [id])).rows;
    sale.receipts = (await db.query(
      'SELECT id, receipt_no, issued_at, is_duplicate, print_count FROM receipts WHERE sale_id = $1 ORDER BY id', [id])).rows;
    return sale;
  }

  static async _prepareLine(db, sale, line) {
    const l = { line_type: 'ITEM', ...line };
    if (l.line_type === 'MILLING') {
      const job = (await db.query('SELECT ticket_no, status, sale_id, charge_amount FROM mill_jobs WHERE id = $1', [l.mill_job_id])).rows[0];
      if (!job) throw new AppError('Milling job not found', 404);
      if (job.sale_id) throw new AppError(`Job ${job.ticket_no} is already billed`, 409);
      if (job.status === 'CANCELLED') throw new AppError(`Job ${job.ticket_no} was cancelled`, 409);
      l.description = l.description || `Milling - ${job.ticket_no}`;
      l.quantity = 1;
      if (blank(l.unit_price)) l.unit_price = job.charge_amount;
      l.item_id = undefined;
      l.unit_id = undefined;
    } else {
      if (!l.item_id || !l.unit_id) throw new AppError('Each item line needs item_id and unit_id');
      if (blank(l.unit_price)) {
        const tier = sale.channel === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
        const p = (await db.query(
          `SELECT ip.price FROM item_prices ip JOIN price_tiers t ON t.id = ip.tier_id
            WHERE ip.item_id = $1 AND ip.unit_id = $2 AND t.code = $3 AND ip.effective_to IS NULL`, [l.item_id, l.unit_id, tier])).rows[0];
        if (!p) throw new AppError(`No ${tier.toLowerCase()} price is set for this item and unit. Set a price or enter one.`);
        l.unit_price = p.price;
      }
    }
    return l;
  }

  static async _addLine(db, sale, line) {
    const l = await Sale._prepareLine(db, sale, line);
    return insertRow(db, 'sale_lines', { ...l, sale_id: sale.id }, LINE_COLS);
  }

  /** Creates a DRAFT sale with lines. d = header fields + lines: [...] */
  static async createDraft(d, ctx) {
    if (!['MILL', 'CEREAL'].includes(d.module)) throw new AppError("module must be 'MILL' or 'CEREAL'");
    const lines = d.lines || [];
    const channel = d.channel || (d.module === 'MILL' && lines.some((l) => l.line_type === 'MILLING') ? 'MILLING' : 'RETAIL');
    return withTransaction(ctx, async (db) => {
      const sale = await insertRow(db, 'sales', { ...d, channel, cashier_id: d.cashier_id || ctx?.userId }, HEADER_COLS);
      for (const line of lines) await Sale._addLine(db, sale, line);
      return Sale.findById(sale.id, { client: db });
    });
  }

  static async _requireDraft(db, id) {
    const s = (await db.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!s) throw new AppError('Sale not found', 404);
    if (s.status !== 'DRAFT') throw new AppError(`Sale ${s.sale_no} is ${s.status} and can no longer be edited`, 409);
    return s;
  }

  static async updateDraft(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await Sale._requireDraft(db, id);
      await updateRow(db, 'sales', id, d, DRAFT_EDIT_COLS);
      return Sale.findById(id, { client: db });
    });
  }

  static async addLine(saleId, line, ctx) {
    return withTransaction(ctx, async (db) => {
      const sale = await Sale._requireDraft(db, saleId);
      await Sale._addLine(db, sale, line);
      return Sale.findById(saleId, { client: db });
    });
  }

  static async updateLine(lineId, d, ctx) {
    return withTransaction(ctx, async (db) => {
      const l = (await db.query('SELECT sale_id FROM sale_lines WHERE id = $1', [lineId])).rows[0];
      if (!l) throw new AppError('Line not found', 404);
      await Sale._requireDraft(db, l.sale_id);
      await updateRow(db, 'sale_lines', lineId, d, ['quantity', 'unit_id', 'unit_price', 'description', 'price_override_by', 'override_reason']);
      return Sale.findById(l.sale_id, { client: db });
    });
  }

  static async removeLine(lineId, ctx) {
    return withTransaction(ctx, async (db) => {
      const l = (await db.query('SELECT sale_id FROM sale_lines WHERE id = $1', [lineId])).rows[0];
      if (!l) throw new AppError('Line not found', 404);
      await Sale._requireDraft(db, l.sale_id);
      await db.query('DELETE FROM sale_lines WHERE id = $1', [lineId]);
      return Sale.findById(l.sale_id, { client: db });
    });
  }

  /** Posts a DRAFT: stock out, cost snapshot, customer debit. onCredit = true enforces the customer's credit rules. */
  static async post(id, { on_credit = false } = {}, ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query('SELECT * FROM fn_post_sale($1, $2, $3)', [id, ctx?.userId || null, !!on_credit]);
      return Sale.findById(id, { client: db });
    });
  }

  /** Till shortcut: create the sale and post it in one transaction. */
  static async createAndPost(d, ctx) {
    return withTransaction(ctx, async (db) => {
      const c = { ...ctx, client: db };
      const draft = await Sale.createDraft(d, c);
      return Sale.post(draft.id, { on_credit: d.on_credit }, c);
    });
  }

  /**
   * Voids a POSTED sale: stock returns at its original cost and the customer ledger is reversed.
   * approver_id must have sales.void (defaults to the acting user). Payments are NOT touched - reverse or
   * refund them separately (Payment.reverse).
   */
  static async void(id, { reason, approver_id }, ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query('SELECT * FROM fn_void_sale($1, $2, $3, $4)', [id, ctx?.userId || null, approver_id || ctx?.userId || null, reason]);
      return Sale.findById(id, { client: db });
    });
  }

  static async removeDraft(id, ctx) {
    return withTransaction(ctx, async (db) => {
      await Sale._requireDraft(db, id);
      await db.query('DELETE FROM sales WHERE id = $1', [id]);
      return true;
    });
  }
}

module.exports = Sale;
