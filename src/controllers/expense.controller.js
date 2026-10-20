const { Expense } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await Expense.list(req.query)); },
  async get(req, res) { ok(res, found(await Expense.findById(req.params.id), 'Expense')); },
  async create(req, res) { created(res, await Expense.create(req.body, req.ctx)); },
  async update(req, res) { ok(res, await Expense.update(req.params.id, req.body, req.ctx)); },
  /** POST /expenses/:id/void { reason } */
  async void(req, res) { ok(res, await Expense.void(req.params.id, req.body.reason, req.ctx)); },
  async summary(req, res) { ok(res, await Expense.summary(req.query)); },

  async categories(req, res) { ok(res, await Expense.categories(req.query)); },
  async createCategory(req, res) { created(res, await Expense.createCategory(req.body, req.ctx)); },
  async updateCategory(req, res) { ok(res, await Expense.updateCategory(req.params.id, req.body, req.ctx)); },
});
