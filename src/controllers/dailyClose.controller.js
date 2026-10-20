const { DailyClose } = require('../models');
const { ok, created, page } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await DailyClose.list(req.query)); },
  /** GET /daily-close/preview?date=2026-10-20&module=SHARED - expected cash / M-Pesa before counting */
  async preview(req, res) { ok(res, await DailyClose.preview(req.query.date, req.query.module)); },
  /** POST /daily-close { date, module, opening_float, counted_cash, counted_mpesa, notes } */
  async perform(req, res) { created(res, await DailyClose.perform(req.body, req.ctx)); },
  async reopen(req, res) { ok(res, await DailyClose.reopen(req.params.id, req.ctx)); },
});
