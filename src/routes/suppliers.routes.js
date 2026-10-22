// Mounted at the API root: serves /suppliers and /supplier-payments
const router = require('express').Router();
const { suppliers } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, bodyModule, guardRecord, guardBodyRecord } = require('../middlewares/moduleScope');

const PURCHASE_MODULE = "CASE WHEN t.stock_pool::text = 'MILL_STOCK' THEN 'MILL' WHEN t.stock_pool::text = 'CEREAL_STOCK' THEN 'CEREAL' END";
const ofPaymentRecord = guardRecord('supplier_payments', 't.module');
const ofPurchaseInBody = guardBodyRecord('purchases', PURCHASE_MODULE, 'purchase_id');

router.get('/suppliers', permit('suppliers.view', 'purchases.create'), suppliers.list);
router.post('/suppliers', permit('suppliers.create'), suppliers.create);
router.get('/suppliers/:id', permit('suppliers.view', 'purchases.create'), suppliers.get);
router.put('/suppliers/:id', permit('suppliers.update'), suppliers.update);
router.get('/suppliers/:id/ledger', permit('suppliers.view'), suppliers.ledger);
router.get('/suppliers/:id/unpaid-purchases', permit('suppliers.view', 'purchases.create'), suppliers.unpaidPurchases);
router.post('/suppliers/:id/opening-balance', permit('suppliers.opening_balance'), suppliers.setOpeningBalance);

router.get('/supplier-payments', permit('suppliers.view'), scopeLists, suppliers.payments);
router.post('/supplier-payments', permit('purchases.create'), bodyModule('module'), ofPurchaseInBody, suppliers.createPayment);
router.get('/supplier-payments/:id', permit('suppliers.view'), ofPaymentRecord, suppliers.payment);

module.exports = router;
