const { exec } = require('../config/db');
const { Where, paged, bool } = require('../utils/sql');

/** Read-only dashboard and report queries over the reporting views. Dates are 'YYYY-MM-DD'. module: MILL | CEREAL. */
class Report {
  /** One call for the owner's phone dashboard. */
  static async ownerDashboard(ctx) {
    const db = exec(ctx);
    const today = (await db.query('SELECT * FROM v_owner_dashboard_today')).rows;
    const alerts = (await db.query('SELECT * FROM v_owner_alerts')).rows[0];
    const trend = await Report.salesTrend({ days: 14 }, ctx);
    const lowStock = (await db.query('SELECT item_name, pool, quantity_kg, reorder_level_kg FROM v_low_stock LIMIT 10')).rows;
    const stockValue = (await db.query('SELECT * FROM v_stock_value_summary ORDER BY pool')).rows;
    return { today, alerts, trend, lowStock, stockValue };
  }

  static async ownerAlerts(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_owner_alerts')).rows[0];
  }

  /** Sales per day for the last N days. Filter: module */
  static async salesTrend({ days = 14, module } = {}, ctx) {
    return (await exec(ctx).query(
      `SELECT day, sum(sales_count) AS sales_count, sum(sales_total) AS sales_total, sum(collected) AS collected
         FROM v_sales_daily WHERE day >= fn_local_date(now()) - $1::int AND ($2::module_code IS NULL OR module = $2::module_code)
        GROUP BY day ORDER BY day`, [days, module || null])).rows;
  }

  static async salesDaily(f = {}, ctx) {
    const w = new Where().eq('module', f.module).dateRange('day', f.from, f.to);
    return (await exec(ctx).query(`SELECT * FROM v_sales_daily ${w.clause} ORDER BY day DESC, module`, w.values)).rows;
  }

  /** Cash against M-Pesa per day and module. */
  static async paymentsDaily(f = {}, ctx) {
    const w = new Where().eq('module', f.module).dateRange('day', f.from, f.to);
    return (await exec(ctx).query(`SELECT * FROM v_payments_daily ${w.clause} ORDER BY day DESC, module`, w.values)).rows;
  }

  /** Revenue, cost of goods, expenses and profit per day/module, plus totals. */
  static async profit(f = {}, ctx) {
    const w = new Where().eq('module', f.module).dateRange('day', f.from, f.to);
    const db = exec(ctx);
    const rows = (await db.query(`SELECT * FROM v_profit_daily ${w.clause} ORDER BY day DESC, module`, w.values)).rows;
    const totals = (await db.query(
      `SELECT coalesce(sum(revenue), 0) AS revenue, coalesce(sum(cogs), 0) AS cogs, coalesce(sum(gross_profit), 0) AS gross_profit,
              coalesce(sum(expenses), 0) AS expenses, coalesce(sum(net_profit), 0) AS net_profit FROM v_profit_daily ${w.clause}`, w.values)).rows[0];
    return { rows, totals };
  }

  /** Profit per kg and per grain/item. from/to default to this month so far. */
  static async margin(f = {}, ctx) {
    return (await exec(ctx).query(
      `SELECT * FROM fn_margin_report(
          coalesce($1::date, date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi')::date),
          coalesce($2::date, fn_local_date(now())), $3::module_code)`,
      [f.from || null, f.to || null, f.module || null])).rows;
  }

  static async customerBalances(f = {}, ctx) {
    const w = new Where().search(['full_name', 'customer_code', 'phone'], f.search);
    if (bool(f.owing)) w.raw('balance > 0');
    return paged(exec(ctx), 'SELECT *', 'FROM v_customer_balances', w, 'balance DESC, full_name', f);
  }

  static async creditOverdue(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_credit_overdue')).rows;
  }

  static async receivablesAging(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_receivables_aging ORDER BY total_outstanding DESC')).rows;
  }

  static async supplierBalances(f = {}, ctx) {
    const w = new Where();
    if (bool(f.owed)) w.raw('amount_owed > 0');
    return (await exec(ctx).query(`SELECT * FROM v_supplier_balances ${w.clause} ORDER BY amount_owed DESC, name`, w.values)).rows;
  }

  static async stockValue(ctx) {
    return (await exec(ctx).query('SELECT * FROM v_stock_value_summary ORDER BY pool')).rows;
  }
}

module.exports = Report;
