// Sale-nested receipt routes (POST/GET /sales/:saleId/receipt) live in sales.routes.js
const router = require('express').Router();
const { receipts } = require('../controllers');
const { permit } = require('./guards');
const { guardRecord } = require('../middlewares/moduleScope');

const ofReceipt = guardRecord('receipts', '(SELECT s.module FROM sales s WHERE s.id = t.sale_id)');

const view = permit('sales.view', 'sales.create');

router.get('/:id', view, ofReceipt, receipts.get);
router.post('/:id/printed', permit('sales.create'), ofReceipt, receipts.markPrinted);
router.post('/:id/whatsapp', permit('sales.create'), ofReceipt, receipts.whatsapp);
router.get('/:id/deliveries', view, ofReceipt, receipts.deliveries);

module.exports = router;
