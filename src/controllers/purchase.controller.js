const { Purchase, SupplierPayment } = require('../models');
const { withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await Purchase.list(req.query)); },
  async get(req, res) { ok(res, found(await Purchase.findById(req.params.id), 'Purchase')); },
  /** POST /purchases { supplier_id, stock_pool, transport_cost, loading_cost, lines: [{ item_id, unit_id, quantity, unit_cost }] } */
  async create(req, res) { created(res, await Purchase.create(req.body, req.ctx)); },
  async update(req, res) { ok(res, await Purchase.update(req.params.id, req.body, req.ctx)); },
  async addLine(req, res) { created(res, await Purchase.addLine(req.params.id, req.body, req.ctx)); },
  async updateLine(req, res) { ok(res, await Purchase.updateLine(req.params.lineId, req.body, req.ctx)); },
  async removeLine(req, res) { ok(res, await Purchase.removeLine(req.params.lineId, req.ctx)); },
  async removeDraft(req, res) { ok(res, { removed: await Purchase.removeDraft(req.params.id, req.ctx) }); },

  /**
   * POST /purchases/:id/post { pay?: { amount, method, mpesa_code?, note? } }
   * Posting adds the stock; an optional payment made at delivery is recorded in the same transaction.
   */
  async post(req, res) {
    const pay = req.body && req.body.pay;
    const result = await withTransaction(req.ctx, async (client) => {
      const c = { ...req.ctx, client };
      const before = found(await Purchase.findById(req.params.id, c), 'Purchase');
      const posted = await Purchase.post(req.params.id, c);
      if (pay && Number(pay.amount) > 0) {
        if (!req.can('purchases.create')) throw new AppError('You are not allowed to record payments', 403);
        await SupplierPayment.create({
          ...pay, supplier_id: before.supplier_id, purchase_id: before.id,
          module: before.stock_pool === 'MILL_STOCK' ? 'MILL' : 'CEREAL',
        }, c);
        return Purchase.findById(before.id, c);
      }
      return posted;
    });
    ok(res, result);
  },
});
