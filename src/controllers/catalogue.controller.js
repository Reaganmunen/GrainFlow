const { Grain, Grade, Unit, PriceTier, Item } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

const lookupController = (Model, label) =>
  controller({
    async list(req, res) { ok(res, await Model.list(req.query)); },
    async get(req, res) { ok(res, found(await Model.findById(req.params.id), label)); },
    async create(req, res) { created(res, await Model.create(req.body, req.ctx)); },
    async update(req, res) { ok(res, await Model.update(req.params.id, req.body, req.ctx)); },
  });

module.exports = {
  grains: lookupController(Grain, 'Grain'),
  grades: lookupController(Grade, 'Grade'),
  units: lookupController(Unit, 'Unit'),
  tiers: lookupController(PriceTier, 'Price tier'),

  items: controller({
    async list(req, res) { page(res, await Item.list(req.query)); },
    /** GET /items/kinds -> { enum, kinds[] } for the product form */
    async kinds(req, res) { ok(res, await Item.kinds()); },
    async get(req, res) { ok(res, found(await Item.findById(req.params.id), 'Item')); },
    async create(req, res) { created(res, await Item.create(req.body, req.ctx)); },
    async update(req, res) { ok(res, await Item.update(req.params.id, req.body, req.ctx)); },

    async units(req, res) { ok(res, await Item.units(req.params.id)); },
    /** PUT /items/:id/units/:unitId { kg_per_unit, is_sellable?, is_purchasable? } */
    async setUnit(req, res) { ok(res, await Item.setUnit(req.params.id, req.params.unitId, req.body, req.ctx)); },
    async removeUnit(req, res) { ok(res, { removed: await Item.removeUnit(req.params.id, req.params.unitId, req.ctx) }); },

    /** GET /items/pos?module=CEREAL&tier=RETAIL&search=maize - sellable items with prices and stock for the till */
    async pos(req, res) { ok(res, await Item.posCatalogue(req.query)); },
  }),
};
