const { Stock, StockAdjustment, StockTake, Transfer } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  // stock on hand
  async balances(req, res) { page(res, await Stock.balances(req.query)); },
  async lowStock(req, res) { ok(res, await Stock.lowStock()); },
  async valueSummary(req, res) { ok(res, await Stock.valueSummary()); },
  async movements(req, res) { page(res, await Stock.movements(req.query)); },
  async customerGrain(req, res) { ok(res, await Stock.customerGrainHeld(req.query)); },
  /** POST /stock/opening { item_id, pool, quantity_kg, cost_per_kg } */
  async openingStock(req, res) { created(res, await Stock.setOpeningStock(req.body, req.ctx)); },

  // adjustments (losses, spoilage, corrections). The user with stock.adjust is recorded as the approver.
  async adjustments(req, res) { page(res, await StockAdjustment.list(req.query)); },
  async adjustment(req, res) { ok(res, found(await StockAdjustment.findById(req.params.id), 'Adjustment')); },
  async lossSummary(req, res) { ok(res, await StockAdjustment.lossSummary(req.query)); },
  async createAdjustment(req, res) {
    created(res, await StockAdjustment.create({ ...req.body, approved_by: req.user.id }, req.ctx));
  },

  // stock takes
  async takes(req, res) { page(res, await StockTake.list(req.query)); },
  async take(req, res) { ok(res, found(await StockTake.findById(req.params.id), 'Stock take')); },
  async createTake(req, res) { created(res, await StockTake.create(req.body, req.ctx)); },
  /** PUT /stock/takes/:id/lines { lines: [{ item_id, counted_kg, note? }] } */
  async saveTakeLines(req, res) { ok(res, await StockTake.saveLines(req.params.id, req.body.lines, req.ctx)); },
  async removeTakeLine(req, res) { ok(res, { removed: await StockTake.removeLine(req.params.id, req.params.itemId, req.ctx) }); },
  async postTake(req, res) { ok(res, await StockTake.post(req.params.id, req.ctx)); },
  async removeTake(req, res) { ok(res, { removed: await StockTake.removeDraft(req.params.id, req.ctx) }); },

  // transfers between mill and cereal
  async transfers(req, res) { page(res, await Transfer.list(req.query)); },
  async transfer(req, res) { ok(res, found(await Transfer.findById(req.params.id), 'Transfer')); },
  async createTransfer(req, res) { created(res, await Transfer.create(req.body, req.ctx)); },
});
