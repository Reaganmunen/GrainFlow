const router = require('express').Router();
const { payments } = require('../controllers');
const { permit, requireApproval } = require('./guards');
const { scopeLists, bodyModule, guardRecord } = require('../middlewares/moduleScope');

const ofPayment = guardRecord('payments', 't.module'); // a payment in the other business (or a shared one) is owner-only

const pay = permit('payments.create');

router.get('/', permit('payments.view'), scopeLists, payments.list);
router.post('/on-account', pay, bodyModule('module'), payments.onAccount);
router.post('/expire-stale', pay, payments.expireStale); // before /:id

router.get('/:id', permit('payments.view', 'payments.create'), ofPayment, payments.get);
router.post('/:id/allocate', pay, ofPayment, payments.allocate);
router.get('/:id/stk-status', pay, ofPayment, payments.stkStatus);
router.post('/:id/stk-query', pay, ofPayment, payments.stkQuery);
router.post('/:id/confirm-manually', permit('payments.mpesa_manual'), ofPayment, payments.confirmManually);
router.post('/:id/cancel', pay, ofPayment, payments.cancelPending);
router.post('/:id/reverse', permit('payments.view'), ofPayment, requireApproval('payments.reverse'), payments.reverse);

module.exports = router;
