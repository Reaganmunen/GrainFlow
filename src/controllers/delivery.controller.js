const { Delivery } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await Delivery.list(req.query)); },
  async get(req, res) { ok(res, found(await Delivery.findById(req.params.id), 'Delivery')); },
  /** POST /deliveries { sale_id, driver_name?, vehicle_reg?, delivery_address?, contact_phone? } */
  async create(req, res) { created(res, await Delivery.create(req.body, req.ctx)); },
  async update(req, res) { ok(res, await Delivery.update(req.params.id, req.body, req.ctx)); },
  /** PUT /deliveries/:id/status { status: DISPATCHED | DELIVERED | CANCELLED, received_by_name? } */
  async setStatus(req, res) { ok(res, await Delivery.setStatus(req.params.id, req.body.status, req.body, req.ctx)); },
  /** Printable delivery note */
  async note(req, res) { ok(res, found(await Delivery.getNote(req.params.id), 'Delivery')); },
});
