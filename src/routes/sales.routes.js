// Also hosts the sale-nested payment, M-Pesa STK and receipt routes (the controllers read req.params.saleId there).
// Every route is module-restricted on the server: see middlewares/saleModule.js
const router = require('express').Router();
const { sales, payments, receipts } = require('../controllers');
const { permit, requireApproval, optionalApproval } = require('./guards');
const { bodyModule, queryModule, saleModule } = require('../middlewares/saleModule');

const view = permit('sales.view', 'sales.create');
const sell = permit('sales.create');
// a manager can approve a below-minimum price on the spot; without approval the DB rejects it
const priceApproval = optionalApproval('price.override');

const ofSale = saleModule('id');
const ofSaleId = saleModule('saleId');

router.get('/', view, queryModule, sales.list);
router.get('/catalogue', sell, queryModule, sales.catalogue); // before /:id
router.post('/', sell, bodyModule, priceApproval, sales.create);

router.get('/:id', view, ofSale, sales.get);
router.put('/:id', sell, ofSale, sales.updateDraft);
router.delete('/:id', sell, ofSale, sales.removeDraft);
router.post('/:id/post', sell, ofSale, sales.post);
router.post('/:id/void', view, ofSale, requireApproval('sales.void'), sales.void);

router.post('/:id/lines', sell, ofSale, priceApproval, sales.addLine);
router.put('/:id/lines/:lineId', sell, ofSale, priceApproval, sales.updateLine);
router.delete('/:id/lines/:lineId', sell, ofSale, sales.removeLine);

// payments for a sale
router.post('/:saleId/payments', permit('payments.create'), ofSaleId, payments.forSale);
router.post('/:saleId/mpesa-stk', permit('payments.create'), ofSaleId, payments.stkInitiate);

// receipts for a sale
router.post('/:saleId/receipt', sell, ofSaleId, receipts.issue);
router.get('/:saleId/receipt', view, ofSaleId, receipts.forSale);

module.exports = router;