const router = require('express').Router();
const { payments } = require('../controllers');
const { permit, requireApproval } = require('./guards');

const pay = permit('payments.create');

router.get('/', permit('payments.view'), payments.list);
router.post('/on-account', pay, payments.onAccount);
router.post('/expire-stale', pay, payments.expireStale); // before /:id

router.get('/:id', permit('payments.view', 'payments.create'), payments.get);
router.post('/:id/allocate', pay, payments.allocate);
router.get('/:id/stk-status', pay, payments.stkStatus);
router.post('/:id/stk-query', pay, payments.stkQuery);
router.post('/:id/confirm-manually', permit('payments.mpesa_manual'), payments.confirmManually);
router.post('/:id/cancel', pay, payments.cancelPending);
router.post('/:id/reverse', permit('payments.view'), requireApproval('payments.reverse'), payments.reverse);

module.exports = router;
