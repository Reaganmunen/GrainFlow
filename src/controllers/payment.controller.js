const { Payment } = require('../models');
const daraja = require('../services/daraja');
const AppError = require('../utils/AppError');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async list(req, res) { page(res, await Payment.list(req.query)); },
  async get(req, res) { ok(res, found(await Payment.findById(req.params.id), 'Payment')); },

  /** POST /sales/:saleId/payments { method: CASH | MPESA_MANUAL | BANK | OTHER, amount, mpesa_receipt?, payer_phone?, note? } */
  async forSale(req, res) {
    if (req.body.method === 'MPESA_MANUAL' && !req.can('payments.mpesa_manual')) {
      throw new AppError('You are not allowed to enter M-Pesa codes manually', 403, { code: 'FORBIDDEN', required: ['payments.mpesa_manual'] });
    }
    created(res, await Payment.createForSale({ ...req.body, sale_id: req.params.saleId }, req.ctx));
  },

  /** POST /payments/on-account { customer_id, method, amount, mpesa_receipt?, allocate? } -> { payment, unallocated } */
  async onAccount(req, res) {
    if (req.body.method === 'MPESA_MANUAL' && !req.can('payments.mpesa_manual')) {
      throw new AppError('You are not allowed to enter M-Pesa codes manually', 403);
    }
    created(res, await Payment.createOnAccount(req.body, req.ctx));
  },

  async allocate(req, res) { ok(res, { unallocated: await Payment.allocateFifo(req.params.id, req.ctx) }); },

  // ------------------------------------------------------------ M-Pesa STK push
  /** POST /sales/:saleId/mpesa-stk { phone, amount? } -> the customer's phone shows the PIN prompt */
  async stkInitiate(req, res) {
    const { payment, stk } = await Payment.initiateStk({ sale_id: req.params.saleId, phone: req.body.phone, amount: req.body.amount }, req.ctx);
    try {
      const { request, response } = await daraja.stkPush({
        phone: stk.phone, amount: stk.amount, accountReference: stk.account_reference, transactionDesc: stk.transaction_desc,
      });
      await Payment.markStkSent(stk.id, {
        merchant_request_id: response.MerchantRequestID, checkout_request_id: response.CheckoutRequestID,
        request_payload: request, response_payload: response,
      });
      created(res, {
        payment_id: payment.id, stk_id: stk.id, status: 'SENT',
        message: response.CustomerMessage || 'Prompt sent. Ask the customer to enter their M-Pesa PIN.',
      });
    } catch (err) {
      await Payment.markStkFailed(stk.id, err).catch(() => {});
      throw new AppError(`Could not send the M-Pesa prompt: ${err.message}`, 502, { payment_id: payment.id });
    }
  },

  /** GET /payments/:id/stk-status - poll every 2-3 seconds until state is CONFIRMED / FAILED / CANCELLED */
  async stkStatus(req, res) { ok(res, found(await Payment.stkStatus(req.params.id), 'Payment')); },

  /**
   * POST /payments/:id/stk-query - asks Safaricom directly (use when the callback seems lost).
   * A finished-but-failed prompt (cancelled, wrong PIN, no funds) is recorded; a successful one can only be confirmed by
   * the callback or by entering the M-Pesa code (confirm-manually), because Safaricom's query does not return the code.
   */
  async stkQuery(req, res) {
    const status = found(await Payment.stkStatus(req.params.id), 'Payment');
    if (!status.stk_id) throw new AppError('This payment has no M-Pesa prompt');
    const full = await Payment.findById(req.params.id);
    const checkoutId = full.stk_requests.find((r) => r.id === status.stk_id)?.checkout_request_id;
    if (!checkoutId) throw new AppError('The prompt was never accepted by Safaricom', 409);

    const q = await daraja.stkQuery(checkoutId);
    const body = q.body || {};
    let note = 'Still waiting for the customer, or Safaricom has no result yet.';
    if (body.ResultCode !== undefined && body.ResultCode !== null) {
      if (String(body.ResultCode) === '0') {
        note = 'Safaricom says the payment succeeded. Wait a moment for the confirmation, or enter the M-Pesa code from the SMS (confirm manually).';
      } else {
        await Payment.handleStkCallback({
          Body: { stkCallback: { MerchantRequestID: body.MerchantRequestID, CheckoutRequestID: checkoutId, ResultCode: Number(body.ResultCode), ResultDesc: body.ResultDesc } },
        });
        note = body.ResultDesc || 'The prompt did not complete.';
      }
    }
    ok(res, { note, safaricom: body, current: await Payment.stkStatus(req.params.id) });
  },

  /** POST /payments/:id/confirm-manually { mpesa_receipt } - fallback when the callback never arrived */
  async confirmManually(req, res) { ok(res, await Payment.confirmManually(req.params.id, req.body.mpesa_receipt, req.ctx)); },
  async cancelPending(req, res) { ok(res, await Payment.cancelPending(req.params.id, req.ctx)); },
  /** POST /payments/:id/reverse { reason } (route needs requireApproval('payments.reverse')) */
  async reverse(req, res) { ok(res, await Payment.reverse(req.params.id, req.body.reason, req.ctx)); },
  /** POST /payments/expire-stale - for a timer or a "refresh" button */
  async expireStale(req, res) { ok(res, { expired: await Payment.expireStale(req.ctx) }); },

  /** PUBLIC: POST /mpesa/stk-callback/:secret (guarded by verifyMpesaCallback). Always answers Safaricom with success. */
  async stkCallback(req, res) {
    const result = await Payment.handleStkCallback(req.body);
    if (!result.ok) console.error('STK callback not processed:', result.error);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  },
});
