const { Report } = require('../models');
const { ok, page } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async dashboard(req, res) { ok(res, await Report.ownerDashboard()); },
  async alerts(req, res) { ok(res, await Report.ownerAlerts()); },
  async salesTrend(req, res) { ok(res, await Report.salesTrend({ days: Number(req.query.days) || 14, module: req.query.module, scope_modules: req.query.scope_modules })); },
  async salesDaily(req, res) { ok(res, await Report.salesDaily(req.query)); },
  async paymentsDaily(req, res) { ok(res, await Report.paymentsDaily(req.query)); },
  async profit(req, res) { ok(res, await Report.profit(req.query)); },
  async margin(req, res) { ok(res, await Report.margin(req.query)); },
  async customerBalances(req, res) { page(res, await Report.customerBalances(req.query)); },
  async creditOverdue(req, res) { ok(res, await Report.creditOverdue()); },
  async receivablesAging(req, res) { ok(res, await Report.receivablesAging()); },
  async supplierBalances(req, res) { ok(res, await Report.supplierBalances(req.query)); },
  async stockValue(req, res) { ok(res, await Report.stockValue()); },
});
