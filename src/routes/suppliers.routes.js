// Mounted at the API root: serves /suppliers and /supplier-payments
const router = require('express').Router();
const { suppliers } = require('../controllers');
const { permit } = require('./guards');

router.get('/suppliers', permit('suppliers.view', 'purchases.create'), suppliers.list);
router.post('/suppliers', permit('suppliers.create'), suppliers.create);
router.get('/suppliers/:id', permit('suppliers.view', 'purchases.create'), suppliers.get);
router.put('/suppliers/:id', permit('suppliers.update'), suppliers.update);
router.get('/suppliers/:id/ledger', permit('suppliers.view'), suppliers.ledger);
router.get('/suppliers/:id/unpaid-purchases', permit('suppliers.view', 'purchases.create'), suppliers.unpaidPurchases);
router.post('/suppliers/:id/opening-balance', permit('suppliers.opening_balance'), suppliers.setOpeningBalance);

router.get('/supplier-payments', permit('suppliers.view'), suppliers.payments);
router.post('/supplier-payments', permit('purchases.create'), suppliers.createPayment);
router.get('/supplier-payments/:id', permit('suppliers.view'), suppliers.payment);

module.exports = router;
