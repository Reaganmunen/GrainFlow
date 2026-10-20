const { exec, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { Where, insertRow, updateRow, paged, bool } = require('../utils/sql');

const COLS = ['full_name', 'business_name', 'customer_type', 'phone', 'alt_phone', 'email', 'address',
  'credit_allowed', 'credit_limit', 'credit_days', 'notes', 'is_active'];

class Customer {
  /** Filters: search, customer_type, active, owing, credit_allowed, page, limit. Includes balance + overdue. */
  static async list(f = {}, ctx) {
    const w = new Where()
      .eq('v.customer_type', f.customer_type)
      .eq('c.is_active', bool(f.active))
      .eq('c.credit_allowed', bool(f.credit_allowed))
      .search(['v.full_name', 'v.customer_code', 'v.phone', 'c.business_name'], f.search);
    if (bool(f.owing)) w.raw('v.balance > 0');
    return paged(
      exec(ctx),
      'SELECT v.*, c.business_name, c.is_active, c.credit_days',
      'FROM v_customer_balances v JOIN customers c ON c.id = v.customer_id',
      w, 'v.full_name', f
    );
  }

  /** Fast lookup for the till / job-ticket screens. Accepts name, code or phone (0712... works). */
  static async lookup(term, ctx) {
    const t = String(term || '').trim();
    if (!t) return [];
    const digits = t.replace(/\D/g, '').replace(/^0/, '');
    const { rows } = await exec(ctx).query(
      `SELECT c.id, c.customer_code, c.full_name, c.business_name, c.phone, c.credit_allowed, c.credit_limit,
              fn_customer_balance(c.id) AS balance
         FROM customers c
        WHERE c.is_active AND (c.full_name ILIKE $1 OR c.business_name ILIKE $1 OR c.customer_code ILIKE $1
              OR ($2 <> '' AND length($2) >= 3 AND c.phone LIKE '%' || $2 || '%'))
        ORDER BY c.full_name LIMIT 15`,
      [`%${t}%`, digits]
    );
    return rows;
  }

  static async findById(id, ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT c.*, coalesce(v.balance, 0) AS balance, coalesce(v.overdue_amount, 0) AS overdue_amount
         FROM customers c LEFT JOIN v_customer_balances v ON v.customer_id = c.id WHERE c.id = $1`, [id]);
    return rows[0] || null;
  }

  static async create(d, ctx) {
    if (!d.full_name || !String(d.full_name).trim()) throw new AppError('Customer name is required');
    return withTransaction(ctx, async (db) => {
      const row = await insertRow(db, 'customers', { ...d, created_by: ctx?.userId }, [...COLS, 'created_by']);
      return Customer.findById(row.id, { client: db });
    });
  }

  static async update(id, d, ctx) {
    return withTransaction(ctx, async (db) => {
      await updateRow(db, 'customers', id, d, COLS);
      return Customer.findById(id, { client: db });
    });
  }

  static async balance(id, ctx) {
    return (await exec(ctx).query('SELECT fn_customer_balance($1) AS balance', [id])).rows[0].balance;
  }

  /** Statement with running balance (positive = customer owes us). Filters: from, to (dates). */
  static async ledger(customerId, f = {}, ctx) {
    const w = new Where().dateRange('fn_local_date(x.entry_date)', f.from, f.to);
    const { rows } = await exec(ctx).query(
      `SELECT x.* FROM (
          SELECT l.id, l.entry_date, l.entry_type, l.debit, l.credit, l.description, l.sale_id, l.payment_id,
                 sum(l.debit - l.credit) OVER (ORDER BY l.entry_date, l.id) AS running_balance
            FROM customer_ledger l WHERE l.customer_id = $${w.values.length + 1}
       ) x ${w.clause} ORDER BY x.entry_date, x.id`,
      [...w.values, customerId]
    );
    return rows;
  }

  /** Customer's unpaid posted sales (for "pay off invoices" screens). */
  static async openSales(customerId, ctx) {
    const { rows } = await exec(ctx).query(
      `SELECT id, sale_no, module, sale_date, due_date, total_amount, amount_paid, balance_due
         FROM sales WHERE customer_id = $1 AND status = 'POSTED' AND balance_due > 0 ORDER BY sale_date, id`, [customerId]);
    return rows;
  }

  /** Grain the customer has dropped at the mill and not yet collected, per grain. */
  static async grainHeld(customerId, ctx) {
    return (await exec(ctx).query('SELECT * FROM v_customer_grain_held WHERE customer_id = $1', [customerId])).rows;
  }

  /** Go-live data load: balance the customer already owed. Can only be set once. */
  static async setOpeningBalance(customerId, amount, asOf, ctx) {
    if (!(Number(amount) > 0)) throw new AppError('Opening balance must be greater than 0');
    return withTransaction(ctx, async (db) => {
      const dup = await db.query("SELECT 1 FROM customer_ledger WHERE customer_id = $1 AND entry_type = 'OPENING_BALANCE'", [customerId]);
      if (dup.rowCount) throw new AppError('This customer already has an opening balance', 409);
      await db.query('SELECT fn_set_customer_opening_balance($1, $2, coalesce($3::date, current_date), $4)',
        [customerId, amount, asOf || null, ctx?.userId || null]);
      return Customer.findById(customerId, { client: db });
    });
  }
}

module.exports = Customer;
