const router = require('express').Router();
const { dailyClose } = require('../controllers');
const { permit } = require('./guards');
const AppError = require('../utils/AppError');
const { scopeLists, bodyModule, ownerOnly, requireModule } = require('../middlewares/moduleScope');

// a close covers ONE business; closing the whole business (SHARED) is the owner's. A manager closes their own side.
const previewScope = (req, res, next) => {
  if (req.access.owner) return next();
  const asked = String(req.query.module || '').toUpperCase();
  if (!asked || asked === 'SHARED') {
    if (req.access.modules.length === 1) { req.query.module = req.access.modules[0]; return next(); }
    return next(new AppError('module is required'));
  }
  return requireModule(asked)(req, res, next);
};

router.get('/', permit('daily_close.view'), scopeLists, dailyClose.list);
router.get('/preview', permit('daily_close.perform'), previewScope, dailyClose.preview);
router.post('/', permit('daily_close.perform'), bodyModule('module'), dailyClose.perform);
router.post('/:id/reopen', ownerOnly, permit('daily_close.reopen'), dailyClose.reopen);

module.exports = router;
