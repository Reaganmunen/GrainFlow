const { Sale, Payment, Item } = require('../models');
const { withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

const guardDiscount = (req) => {
  if (Number(req.body.discount_amount) > 0 && !req.can('sales.discount')) {
    throw new AppError('You are not allowed to give discounts', 403, { code: 'FORBIDDEN', required: ['sales.discount'] });
  }
};

/** If a manager approved (req.approverId, from optionalApproval('price.override')), mark the item lines as overridden. */
const applyOverride = (req, lines) => {
  if (!req.approverId) return;
  for (const l of lines || []) if (l.line_type !== 'MILLING') l.price_override_by = req.approverId;
};

module.exports = controller({
  async list(req, res) { page(res, await Sale.list(req.query)); },
  async get(req, res) { ok(res, found(await Sale.findById(req.params.id), 'Sale')); },

  /** GET /sales/catalogue?module=CEREAL&tier=RETAIL&search= - items, unit prices, stock, minimum price for the till */
  async catalogue(req, res) { ok(res, await Item.posCatalogue(req.query)); },

  /**
   * POST /sales { module, channel?, customer_id?, walkin_name?, discount_amount?, lines: [...], post?: true, on_credit?: false }
   * post: true saves and posts in one go (normal till flow). Without it you get a DRAFT.
   */
  async create(req, res) {
    guardDiscount(req);
    applyOverride(req, req.body.lines);
    const sale = req.body.post
      ? await Sale.createAndPost({ ...req.body, on_credit: !!req.body.on_credit }, req.ctx)
      : await Sale.createDraft(req.body, req.ctx);
    created(res, sale);
  },

  async updateDraft(req, res) { guardDiscount(req); ok(res, await Sale.updateDraft(req.params.id, req.body, req.ctx)); },
  async addLine(req, res) { applyOverride(req, [req.body]); created(res, await Sale.addLine(req.params.id, req.body, req.ctx)); },
  async updateLine(req, res) {
    if (req.approverId && req.body.unit_price !== undefined) req.body.price_override_by = req.approverId;
    ok(res, await Sale.updateLine(req.params.lineId, req.body, req.ctx));
  },
  async removeLine(req, res) { ok(res, await Sale.removeLine(req.params.lineId, req.ctx)); },
  async removeDraft(req, res) { ok(res, { removed: await Sale.removeDraft(req.params.id, req.ctx) }); },

  /** POST /sales/:id/post { on_credit?: boolean } */
  async post(req, res) { ok(res, await Sale.post(req.params.id, { on_credit: !!req.body.on_credit }, req.ctx)); },

  /**
   * POST /sales/:id/void { reason, reverse_payments?: boolean } (route needs requireApproval('sales.void'))
   * reverse_payments also reverses confirmed payments that were made for this sale alone. Payments shared with other
   * sales are listed in needs_manual_reversal.
   */
  async void(req, res) {
    const { reason, reverse_payments } = req.body || {};
    if (reverse_payments && !req.can('payments.reverse')) throw new AppError('You are not allowed to reverse payments', 403);
    const result = await withTransaction(req.ctx, async (client) => {
      const c = { ...req.ctx, client };
      const sale = await Sale.void(req.params.id, { reason, approver_id: req.approverId }, c);
      const out = { sale, reversed_payments: [], needs_manual_reversal: [] };
      if (reverse_payments) {
        const { rows } = await client.query(
          `SELECT p.id, p.payment_no, (SELECT count(*) FROM payment_allocations a WHERE a.payment_id = p.id) AS allocations
             FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id
            WHERE pa.sale_id = $1 AND p.state = 'CONFIRMED'`, [req.params.id]);
        for (const p of rows) {
          if (p.allocations === 1) {
            await Payment.reverse(p.id, `Sale ${sale.sale_no} voided`, c);
            out.reversed_payments.push(p.payment_no);
          } else {
            out.needs_manual_reversal.push(p.payment_no);
          }
        }
      }
      return out;
    });
    ok(res, result);
  },
});
