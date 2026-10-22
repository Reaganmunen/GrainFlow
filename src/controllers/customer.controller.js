const { Customer } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

const CREDIT_FIELDS = ['credit_allowed', 'credit_limit', 'credit_days'];
/** Only users with credit.grant can approve credit or set limits: the fields are ignored for everyone else. */
const stripCredit = (req) => { if (!req.can('credit.grant')) CREDIT_FIELDS.forEach((f) => delete req.body[f]); };

module.exports = controller({
  async list(req, res) { page(res, await Customer.list(req.query)); },
  /** GET /customers/lookup?q=... (till / job ticket search box) */
  async lookup(req, res) { ok(res, await Customer.lookup(req.query.q)); },
  async get(req, res) { ok(res, found(await Customer.findById(req.params.id), 'Customer')); },

  async create(req, res) { stripCredit(req); created(res, await Customer.create(req.body, req.ctx)); },
  async update(req, res) { stripCredit(req); ok(res, await Customer.update(req.params.id, req.body, req.ctx)); },

  /** Statement: { customer, balance, entries } with running balance. Query: from, to */
  async ledger(req, res) {
    const customer = found(await Customer.findById(req.params.id), 'Customer');
    ok(res, { customer, balance: customer.balance, entries: await Customer.ledger(req.params.id, { ...req.query, scope_modules: req.access.owner ? undefined : req.access.modules }) });
  },
  async openSales(req, res) { ok(res, await Customer.openSales(req.params.id, req.access.owner ? null : req.access.modules)); },
  async grainHeld(req, res) { ok(res, await Customer.grainHeld(req.params.id)); },
  /** POST /customers/:id/opening-balance { amount, as_of? } */
  async setOpeningBalance(req, res) { ok(res, await Customer.setOpeningBalance(req.params.id, req.body.amount, req.body.as_of, req.ctx)); },
});
