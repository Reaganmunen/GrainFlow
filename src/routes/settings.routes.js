// Mounted at the API root: serves /settings, /activity-log and /backups
const router = require('express').Router();
const { settings } = require('../controllers');
const { permit } = require('./guards');
const { ownerOnly } = require('../middlewares/moduleScope');

router.get('/settings', ownerOnly, permit('settings.view'), settings.settings);
router.get('/settings/profile', ownerOnly, permit('settings.view'), settings.profile);
router.put('/settings/profile', ownerOnly, permit('settings.manage'), settings.updateProfile);
router.get('/settings/mpesa', ownerOnly, permit('settings.manage'), settings.mpesaConfig);
router.put('/settings/mpesa', ownerOnly, permit('settings.manage'), settings.updateMpesaConfig);
router.put('/settings/:key', ownerOnly, permit('settings.manage'), settings.setSetting); // keep after the static PUTs

router.get('/activity-log', ownerOnly, permit('activity.view'), settings.activity);
router.get('/activity-log/categories', ownerOnly, permit('activity.view'), settings.activityCategories);

router.get('/backups', ownerOnly, permit('backups.view'), settings.backups);
router.get('/backups/last', ownerOnly, permit('backups.view'), settings.lastBackup);

module.exports = router;
