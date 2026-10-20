const router = require('express').Router();
const { purchases } = require('../controllers');
const { permit } = require('./guards');

router.get('/', permit('purchases.view'), purchases.list);
router.post('/', permit('purchases.create'), purchases.create);
router.get('/:id', permit('purchases.view'), purchases.get);
router.put('/:id', permit('purchases.create'), purchases.update);
router.delete('/:id', permit('purchases.create'), purchases.removeDraft);

router.post('/:id/lines', permit('purchases.create'), purchases.addLine);
router.put('/:id/lines/:lineId', permit('purchases.create'), purchases.updateLine);
router.delete('/:id/lines/:lineId', permit('purchases.create'), purchases.removeLine);

router.post('/:id/post', permit('purchases.post'), purchases.post);

module.exports = router;
