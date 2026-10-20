const { Receipt, Sale } = require('../models');
const AppError = require('../utils/AppError');
const { ok, created, found } = require('../utils/respond');
const controller = require('../utils/controller');

const toIntl = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.startsWith('0') ? `254${d.slice(1)}` : d;
};

/** Receipt + print data + plain text + wa.me link, in one object for the frontend. */
async function printable(id, phone) {
  const p = found(await Receipt.getPrintable(id), 'Receipt');
  const text = Receipt.toText(p);
  const to = toIntl(phone || p.sale.customer_phone || p.sale.walkin_phone);
  return { ...p, text, whatsapp_url: to ? Receipt.whatsappUrl(to, text) : null };
}

module.exports = controller({
  /** POST /sales/:saleId/receipt { phone? } - issues a receipt (a repeat issue is marked DUPLICATE) */
  async issue(req, res) {
    found(await Sale.findById(req.params.saleId), 'Sale');
    const r = await Receipt.issue(req.params.saleId, req.ctx);
    created(res, await printable(r.id, req.body && req.body.phone));
  },
  async forSale(req, res) { ok(res, await Receipt.forSale(req.params.saleId)); },
  async get(req, res) { ok(res, await printable(req.params.id, req.query.phone)); },
  async markPrinted(req, res) { ok(res, await Receipt.markPrinted(req.params.id, req.ctx)); },

  /** POST /receipts/:id/whatsapp { phone? } - logs the send and returns the link to open */
  async whatsapp(req, res) {
    const p = await printable(req.params.id, req.body && req.body.phone);
    if (!p.whatsapp_url) throw new AppError('No phone number for this receipt. Enter one.');
    const to = toIntl((req.body && req.body.phone) || p.sale.customer_phone || p.sale.walkin_phone);
    const d = await Receipt.queueDelivery({ receipt_id: p.receipt.id, channel: 'WHATSAPP', recipient_phone: to }, req.ctx);
    await Receipt.updateDelivery(d.id, { status: 'SENT' }, req.ctx);
    ok(res, { whatsapp_url: p.whatsapp_url, text: p.text });
  },
  async deliveries(req, res) { ok(res, await Receipt.deliveries(req.params.id)); },
});
