const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, paged } = require('../utils/sql');

const COLS = ['supplier_id', 'purchase_id', 'module', 'paid_on', 'amount', 'method', 'mpesa_code', 'note', 'created_by'];

/** Money we pay out to suppliers. DB triggers update the supplier ledger and the purchase's amount_paid. */
class SupplierPayment {
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('sp.supplier_id', f.supplier_id)
      .eq('sp.purchase_id', f.purchase_id)
      .eq('sp.method', f.method)
      .eq('sp.module', f.module)
      .inList('sp.module', f.scope_modules)
      .dateRange('fn_local_date(sp.paid_on)', f.from, f.to);
    return paged(
      exec(ctx),
      'SELECT sp.*, s.name AS supplier_name, p.purchase_no',
      'FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id LEFT JOIN purchases p ON p.id = sp.purchase_id',
      w, 'sp.paid_on DESC, sp.id DESC', f
    );
  }

  static async findById(id, ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT sp.*, s.name AS supplier_name, p.purchase_no FROM supplier_payments sp
         JOIN suppliers s ON s.id = sp.supplier_id LEFT JOIN purchases p ON p.id = sp.purchase_id WHERE sp.id = $1`, [id]);
    return rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.supplier_id) throw new AppError('supplier_id is required');
    if (!(Number(d.amount) > 0)) throw new AppError('Amount must be greater than 0');
    return withTransaction(ctx, async (db) => {
      if (d.purchase_id) {
        const p = (await db.query('SELECT status, balance_due FROM purchases WHERE id = $1 FOR UPDATE', [d.purchase_id])).rows[0];
        if (!p) throw new AppError('Purchase not found', 404);
        if (p.status !== 'POSTED') throw new AppError('Payments can only be made against POSTED purchases', 409);
        if (Number(d.amount) > p.balance_due + 0.001) throw new AppError(`Amount is more than the purchase balance (${p.balance_due})`);
      }
      const row = await insertRow(db, 'supplier_payments', { ...d, created_by: ctx?.userId }, COLS);
      return SupplierPayment.findById(row.id, { client: db });
    });
  }
}

module.exports = SupplierPayment;
