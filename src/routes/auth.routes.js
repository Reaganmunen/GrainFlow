const router = require('express').Router();
const { auth } = require('../controllers');
const { authenticateAllowPasswordChange } = require('./guards');

router.post('/login', auth.login); // public
router.post('/logout', authenticateAllowPasswordChange, auth.logout);
router.get('/me', authenticateAllowPasswordChange, auth.me);
router.post('/change-password', authenticateAllowPasswordChange, auth.changePassword);

module.exports = router;