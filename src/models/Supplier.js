const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged, bool } = require('../utils/sql');

const COLS = ['name', 'contact_person', 'phone', 'email', 'address', 'payment_terms_days', 'notes', 'is_active'];

class Supplier {
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('s.is_active', bool(f.active))
      .search(['s.name', 's.supplier_code', 's.phone', 's.contact_person'], f.search);
    if (bool(f.owed)) w.raw('v.amount_owed > 0');
    return paged(
      exec(ctx),
      'SELECT s.*, v.amount_owed',
      'FROM suppliers s JOIN v_supplier_balances v ON v.supplier_id = s.id',
      w, 's.name', f
    );
  }

  static async findById(id, ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT s.*, v.amount_owed FROM suppliers s JOIN v_supplier_balances v ON v.supplier_id = s.id WHERE s.id = $1`, [id]);
    return rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.name || !String(d.name).trim()) throw new AppError('Supplier name is required');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'suppliers', d, COLS);
      return Supplier.findById(row.id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await updateRow(db, 'suppliers', id, d, COLS);
      return Supplier.findById(id, { client: db });
    });
  }

  /** Running balance of what we owe the supplier (positive = we owe them). */
  static async ledger(supplierId, f = {}, ctx) {
    const w = new Where().dateRange('fn_local_date(x.entry_date)', f.from, f.to);
    // a user limited to one business only sees (and runs the balance over) the entries of that business
    const scoped = Array.isArray(f.scope_pools);
    const n = w.values.length;
    const { rows } = await exec(ctx).query(
      `SELECT x.* FROM (
          SELECT l.id, l.entry_date, l.entry_type, l.debit, l.credit, l.description, l.purchase_id, l.supplier_payment_id,
                 sum(l.credit - l.debit) OVER (ORDER BY l.entry_date, l.id) AS running_balance
            FROM supplier_ledger l
            ${scoped ? 'LEFT JOIN purchases lpu ON lpu.id = l.purchase_id LEFT JOIN supplier_payments lsp ON lsp.id = l.supplier_payment_id' : ''}
           WHERE l.supplier_id = $${n + 1}
             ${scoped ? `AND coalesce(lpu.stock_pool::text, CASE lsp.module::text WHEN 'MILL' THEN 'MILL_STOCK' WHEN 'CEREAL' THEN 'CEREAL_STOCK' END) = ANY($${n + 2}::text[])` : ''}
       ) x ${w.clause} ORDER BY x.entry_date, x.id`,
      scoped ? [...w.values, supplierId, f.scope_pools] : [...w.values, supplierId]
    );
    return rows;
  }

  /** Posted purchases not fully paid. */
  static async unpaidPurchases(supplierId, scopePools, ctx) {
    return (await exec(ctx).query(
      `SELECT id, purchase_no, purchase_date, total_cost, amount_paid, balance_due
         FROM purchases WHERE supplier_id = $1 AND status = 'POSTED' AND balance_due > 0
          AND ($2::text[] IS NULL OR stock_pool::text = ANY($2::text[])) ORDER BY purchase_date, id`,
      [supplierId, scopePools || null])).rows;
  }

  /** Go-live data load: what we already owed the supplier. Can only be set once. */
  static async setOpeningBalance(supplierId, amount, asOf, ctx) {
    if (!(Number(amount) > 0)) throw new AppError('Opening balance must be greater than 0');
    return withTransaction(ctx, async (db) => {
      const dup = await db.query("SELECT 1 FROM supplier_ledger WHERE supplier_id = $1 AND entry_type = 'OPENING_BALANCE'", [supplierId]);
      if (dup.rowCount) throw new AppError('This supplier already has an opening balance', 409);
      await db.query('SELECT fn_set_supplier_opening_balance($1, $2, coalesce($3::date, current_date), $4)',
        [supplierId, amount, asOf || null, ctx?.userId || null]);
      return Supplier.findById(supplierId, { client: db });
    });
  }
}

module.exports = Supplier;
