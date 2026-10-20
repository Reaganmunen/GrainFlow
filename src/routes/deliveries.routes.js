const router = require('express').Router();
const { deliveries } = require('../controllers');
const { permit } = require('./guards');

router.get('/', permit('deliveries.view'), deliveries.list);
router.post('/', permit('deliveries.manage'), deliveries.create);
router.get('/:id', permit('deliveries.view'), deliveries.get);
router.put('/:id', permit('deliveries.manage'), deliveries.update);
router.put('/:id/status', permit('deliveries.manage'), deliveries.setStatus);
router.get('/:id/note', permit('deliveries.view'), deliveries.note);

module.exports = router;
