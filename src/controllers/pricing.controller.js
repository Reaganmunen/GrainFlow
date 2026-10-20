const { Price, MillingRate, YieldStandard } = require('../models');
const { ok, created, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  // price lists
  async prices(req, res) { ok(res, await Price.current(req.query)); },
  async priceHistory(req, res) { ok(res, await Price.history(req.params.itemId, req.query)); },
  /** PUT /prices { item_id, tier_code | tier_id, unit_id, price } */
  async setPrice(req, res) { ok(res, await Price.set(req.body, req.ctx)); },
  /** PUT /prices/bulk { prices: [{ item_id, tier_code, unit_id, price }, ...] } - one transaction (market price changes) */
  async setPrices(req, res) { ok(res, await Price.setMany(req.body.prices, req.ctx)); },

  // minimum prices
  async minPrices(req, res) { ok(res, await Price.minPrices()); },
  async setMinPrice(req, res) { ok(res, await Price.setMinPrice(req.params.itemId, req.body.min_price_per_kg, req.ctx)); },
  async removeMinPrice(req, res) { ok(res, { removed: await Price.removeMinPrice(req.params.itemId, req.ctx) }); },

  // milling rates
  async millingRates(req, res) { ok(res, await MillingRate.list(req.query)); },
  async millingRate(req, res) { ok(res, found(await MillingRate.findById(req.params.id), 'Milling rate')); },
  /** GET /milling-rates/current/:grainItemId - the base rate a new job of this grain would get today */
  async currentMillingRate(req, res) { ok(res, await MillingRate.currentFor(req.params.grainItemId)); },
  async createMillingRate(req, res) { created(res, await MillingRate.create(req.body, req.ctx)); },
  async updateMillingRate(req, res) { ok(res, await MillingRate.update(req.params.id, req.body, req.ctx)); },

  // yield standards
  async yieldStandards(req, res) { ok(res, await YieldStandard.list(req.query)); },
  async createYieldStandard(req, res) { created(res, await YieldStandard.create(req.body, req.ctx)); },
  async updateYieldStandard(req, res) { ok(res, await YieldStandard.update(req.params.id, req.body, req.ctx)); },
});
