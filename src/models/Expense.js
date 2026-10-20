const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged, bool } = require('../utils/sql');

const COLS = ['category_id', 'module', 'expense_date', 'amount', 'method', 'mpesa_code', 'supplier_id', 'machine_id',
  'description', 'receipt_ref', 'created_by'];

/** Power, fuel, repairs, wages, rent... module SHARED = costs of the whole business. */
class Expense {
  /** Filters: module, category_id, method, supplier_id, machine_id, include_voided, from, to, search */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('e.module', f.module)
      .eq('e.category_id', f.category_id)
      .eq('e.method', f.method)
      .eq('e.supplier_id', f.supplier_id)
      .eq('e.machine_id', f.machine_id)
      .dateRange('e.expense_date', f.from, f.to)
      .search(['e.expense_no', 'e.description', 'e.receipt_ref', 'e.mpesa_code'], f.search);
    if (!bool(f.include_voided)) w.raw('NOT e.is_voided');
    return paged(
      exec(ctx),
      'SELECT e.*, c.name AS category_name, c.code AS category_code, s.name AS supplier_name, m.name AS machine_name',
      `FROM expenses e JOIN expense_categories c ON c.id = e.category_id
         LEFT JOIN suppliers s ON s.id = e.supplier_id LEFT JOIN machines m ON m.id = e.machine_id`,
      w, 'e.expense_date DESC, e.id DESC', f
    );
  }

  static async findById(id, ctx) {
    return (await exec(ctx).query(
      `SELECT e.*, c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = $1`, [id])).rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.category_id) throw new AppError('category_id is required');
    if (!(Number(d.amount) > 0)) throw new AppError('Amount must be greater than 0');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'expenses', { ...d, created_by: ctx?.userId }, COLS);
      return Expense.findById(row.id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      const e = (await db.query('SELECT is_voided FROM expenses WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!e) throw new AppError('Expense not found', 404);
      if (e.is_voided) throw new AppError('A voided expense cannot be edited', 409);
      await updateRow(db, 'expenses', id, d, COLS.filter((c) => c !== 'created_by'));
      return Expense.findById(id, { client: db });
    });
  }

  static async void(id, reason, ctx) {
    if (!reason || !String(reason).trim()) throw new AppError('A reason is required to void an expense');
    return withTransaction(ctx, async (db) => {
      const r = await db.query('UPDATE expenses SET is_voided = true, void_reason = $2 WHERE id = $1 AND NOT is_voided RETURNING id', [id, reason]);
      if (!r.rowCount) throw new AppError('Expense not found or already voided', 409);
      return Expense.findById(id, { client: db });
    });
  }

  /** Totals by category (and module) for a period. Filters: module, from, to */
  static async summary(f = {}, ctx) {
    const w = new Where().eq('module', f.module).dateRange('day', f.from, f.to);
    return (await exec(ctx).query(
      `SELECT category, module, sum(total) AS total FROM v_expenses_daily ${w.clause}
        GROUP BY category, module ORDER BY total DESC`, w.values)).rows;
  }

  // ---- categories ----
  static async categories(f = {}, ctx) {
    const w = new Where().eq('is_active', bool(f.active));
    return (await exec(ctx).query(`SELECT * FROM expense_categories ${w.clause} ORDER BY name`, w.values)).rows;
  }
  static async createCategory(d, ctx) {
    return withTransaction(ctx, (db) => insertRow(db, 'expense_categories', d, ['code', 'name', 'is_active']));
  }
  static async updateCategory(id, d, ctx) {
    return withTransaction(ctx, (db) => updateRow(db, 'expense_categories', id, d, ['code', 'name', 'is_active']));
  }
}

module.exports = Expense;
