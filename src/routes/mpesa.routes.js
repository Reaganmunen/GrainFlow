const router = require('express').Router();
const { payments } = require('../controllers');
const { verifyMpesaCallback } = require('./guards');

// PUBLIC: called by Safaricom, protected by the secret in the URL
router.post('/stk-callback/:secret', verifyMpesaCallback, payments.stkCallback);

module.exports = router;
