const { Supplier, SupplierPayment, Purchase } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await Supplier.list(req.query)); },
  async get(req, res) { ok(res, found(await Supplier.findById(req.params.id), 'Supplier')); },
  async create(req, res) { created(res, await Supplier.create(req.body, req.ctx)); },
  async update(req, res) { ok(res, await Supplier.update(req.params.id, req.body, req.ctx)); },

  async ledger(req, res) {
    const supplier = found(await Supplier.findById(req.params.id), 'Supplier');
    ok(res, { supplier, amount_owed: supplier.amount_owed, entries: await Supplier.ledger(req.params.id, req.query) });
  },
  async unpaidPurchases(req, res) { ok(res, await Supplier.unpaidPurchases(req.params.id)); },
  async setOpeningBalance(req, res) { ok(res, await Supplier.setOpeningBalance(req.params.id, req.body.amount, req.body.as_of, req.ctx)); },

  // payments to suppliers
  async payments(req, res) { page(res, await SupplierPayment.list(req.query)); },
  async payment(req, res) { ok(res, found(await SupplierPayment.findById(req.params.id), 'Payment')); },
  /** POST /supplier-payments { supplier_id, purchase_id?, amount, method, mpesa_code?, note? } - module follows the purchase's stock pool */
  async createPayment(req, res) {
    const d = { ...req.body };
    if (d.purchase_id && !d.module) {
      const p = found(await Purchase.findById(d.purchase_id), 'Purchase');
      d.module = p.stock_pool === 'MILL_STOCK' ? 'MILL' : 'CEREAL';
    }
    created(res, await SupplierPayment.create(d, req.ctx));
  },
});
