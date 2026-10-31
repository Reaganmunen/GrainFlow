const router = require('express').Router();
const { auth } = require('../controllers');
const { authenticate } = require('./guards');

router.post('/login', auth.login); // public
router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);
router.post('/change-password', authenticate, auth.changePassword);

module.exports = router;
