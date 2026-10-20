const router = require('express').Router();
const { dailyClose } = require('../controllers');
const { permit } = require('./guards');

router.get('/', permit('daily_close.view'), dailyClose.list);
router.get('/preview', permit('daily_close.perform'), dailyClose.preview);
router.post('/', permit('daily_close.perform'), dailyClose.perform);
router.post('/:id/reopen', permit('daily_close.reopen'), dailyClose.reopen);

module.exports = router;
