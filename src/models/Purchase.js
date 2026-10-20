const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged } = require('../utils/sql');

const HEADER_COLS = ['supplier_id', 'stock_pool', 'purchase_date', 'supplier_invoice_ref', 'transport_cost', 'loading_cost', 'other_cost', 'notes'];
const LINE_COLS = ['purchase_id', 'item_id', 'unit_id', 'quantity', 'unit_cost', 'note'];

/**
 * Purchases follow DRAFT -> POSTED. Posting adds stock at the true landed cost (transport/loading
 * spread over the kg bought) and credits the supplier ledger. Pay the supplier with SupplierPayment.
 */
class Purchase {
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('p.supplier_id', f.supplier_id)
      .eq('p.status', f.status)
      .eq('p.payment_status', f.payment_status)
      .eq('p.stock_pool', f.stock_pool)
      .dateRange('p.purchase_date', f.from, f.to)
      .search(['p.purchase_no', 's.name', 'p.supplier_invoice_ref'], f.search);
    return paged(
      exec(ctx),
      'SELECT p.*, s.name AS supplier_name',
      'FROM purchases p JOIN suppliers s ON s.id = p.supplier_id',
      w, 'p.purchase_date DESC, p.id DESC', f
    );
  }

  static async findById(id, ctx) {
    const db = exec(ctx);
    const p = (await db.query(
      `SELECT p.*, s.name AS supplier_name, u.full_name AS created_by_name FROM purchases p
         JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`, [id])).rows[0];
    if (!p) return null;
    p.lines = (await db.query(
      `SELECT l.*, i.name AS item_name, i.sku, un.code AS unit_code, un.name AS unit_name
         FROM purchase_lines l JOIN items i ON i.id = l.item_id JOIN units un ON un.id = l.unit_id
        WHERE l.purchase_id = $1 ORDER BY l.id`, [id])).rows;
    return p;
  }

  /** d = header fields + optional lines: [{ item_id, unit_id, quantity, unit_cost, note }] */
  static async create(d, ctx) {
    if (!d.supplier_id) throw new AppError('supplier_id is required');
    return withTransaction(ctx, async (db) => {
      const p = await insertRow(db, 'purchases', { ...d, created_by: ctx?.userId }, [...HEADER_COLS, 'created_by']);
      for (const l of d.lines || []) await insertRow(db, 'purchase_lines', { ...l, purchase_id: p.id }, LINE_COLS);
      return Purchase.findById(p.id, { client: db });
    });
  }

  static async _requireDraft(db, id) {
    const p = (await db.query('SELECT status, purchase_no FROM purchases WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!p) throw new AppError('Purchase not found', 404);
    if (p.status !== 'DRAFT') throw new AppError(`Purchase ${p.purchase_no} is ${p.status} and can no longer be edited`, 409);
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await Purchase._requireDraft(db, id);
      await updateRow(db, 'purchases', id, d, HEADER_COLS);
      return Purchase.findById(id, { client: db });
    });
  }

  static async addLine(purchaseId, line, ctx) {
    return withTransaction(ctx, async (db) => {
      await Purchase._requireDraft(db, purchaseId);
      await insertRow(db, 'purchase_lines', { ...line, purchase_id: purchaseId }, LINE_COLS);
      return Purchase.findById(purchaseId, { client: db });
    });
  }

  static async updateLine(lineId, d, ctx) {
    return withTransaction(ctx, async (db) => {
      const l = (await db.query('SELECT purchase_id FROM purchase_lines WHERE id = $1', [lineId])).rows[0];
      if (!l) throw new AppError('Line not found', 404);
      await Purchase._requireDraft(db, l.purchase_id);
      await updateRow(db, 'purchase_lines', lineId, d, ['item_id', 'unit_id', 'quantity', 'unit_cost', 'note']);
      return Purchase.findById(l.purchase_id, { client: db });
    });
  }

  static async removeLine(lineId, ctx) {
    return withTransaction(ctx, async (db) => {
      const l = (await db.query('SELECT purchase_id FROM purchase_lines WHERE id = $1', [lineId])).rows[0];
      if (!l) throw new AppError('Line not found', 404);
      await Purchase._requireDraft(db, l.purchase_id);
      await db.query('DELETE FROM purchase_lines WHERE id = $1', [lineId]);
      return Purchase.findById(l.purchase_id, { client: db });
    });
  }

  static async post(id, ctx) {
    return withTransaction(ctx, async (db) => {
      await db.query('SELECT * FROM fn_post_purchase($1, $2)', [id, ctx?.userId || null]);
      return Purchase.findById(id, { client: db });
    });
  }

  static async removeDraft(id, ctx) {
    return withTransaction(ctx, async (db) => {
      const r = await db.query("DELETE FROM purchases WHERE id = $1 AND status = 'DRAFT'", [id]);
      if (!r.rowCount) throw new AppError('Only DRAFT purchases can be deleted', 409);
      return true;
    });
  }
}

module.exports = Purchase;
