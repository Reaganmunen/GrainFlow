// Sale-nested receipt routes (POST/GET /sales/:saleId/receipt) live in sales.routes.js
const router = require('express').Router();
const { receipts } = require('../controllers');
const { permit } = require('./guards');

const view = permit('sales.view', 'sales.create');

router.get('/:id', view, receipts.get);
router.post('/:id/printed', permit('sales.create'), receipts.markPrinted);
router.post('/:id/whatsapp', permit('sales.create'), receipts.whatsapp);
router.get('/:id/deliveries', view, receipts.deliveries);

module.exports = router;
