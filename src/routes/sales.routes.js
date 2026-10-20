// Also hosts the sale-nested payment, M-Pesa STK and receipt routes (the controllers read req.params.saleId there).
const router = require('express').Router();
const { sales, payments, receipts } = require('../controllers');
const { permit, requireApproval, optionalApproval } = require('./guards');

const view = permit('sales.view', 'sales.create');
const sell = permit('sales.create');
// a manager can approve a below-minimum price on the spot; without approval the DB rejects it
const priceApproval = optionalApproval('price.override');

router.get('/', view, sales.list);
router.get('/catalogue', sell, sales.catalogue); // before /:id
router.post('/', sell, priceApproval, sales.create);

router.get('/:id', view, sales.get);
router.put('/:id', sell, sales.updateDraft);
router.delete('/:id', sell, sales.removeDraft);
router.post('/:id/post', sell, sales.post);
router.post('/:id/void', view, requireApproval('sales.void'), sales.void);

router.post('/:id/lines', sell, priceApproval, sales.addLine);
router.put('/:id/lines/:lineId', sell, priceApproval, sales.updateLine);
router.delete('/:id/lines/:lineId', sell, sales.removeLine);

// payments for a sale
router.post('/:saleId/payments', permit('payments.create'), payments.forSale);
router.post('/:saleId/mpesa-stk', permit('payments.create'), payments.stkInitiate);

// receipts for a sale
router.post('/:saleId/receipt', sell, receipts.issue);
router.get('/:saleId/receipt', view, receipts.forSale);

module.exports = router;
