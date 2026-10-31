// Offline support: the data pack a till downloads, and the endpoint that receives what it saved while the internet was down.
// Permissions and modules are checked per operation inside services/offline.js.
const router = require('express').Router();
const { offline } = require('../controllers');

router.get('/bootstrap', offline.bootstrap);
router.post('/apply', offline.apply);

module.exports = router;
