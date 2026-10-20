// Mounted at the API root: serves /settings, /activity-log and /backups
const router = require('express').Router();
const { settings } = require('../controllers');
const { permit } = require('./guards');

router.get('/settings', permit('settings.view'), settings.settings);
router.get('/settings/profile', permit('settings.view'), settings.profile);
router.put('/settings/profile', permit('settings.manage'), settings.updateProfile);
router.get('/settings/mpesa', permit('settings.manage'), settings.mpesaConfig);
router.put('/settings/mpesa', permit('settings.manage'), settings.updateMpesaConfig);
router.put('/settings/:key', permit('settings.manage'), settings.setSetting); // keep after the static PUTs

router.get('/activity-log', permit('activity.view'), settings.activity);
router.get('/activity-log/categories', permit('activity.view'), settings.activityCategories);

router.get('/backups', permit('backups.view'), settings.backups);
router.get('/backups/last', permit('backups.view'), settings.lastBackup);

module.exports = router;
