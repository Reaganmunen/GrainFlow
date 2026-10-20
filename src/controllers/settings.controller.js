const { Settings, ActivityLog, BackupLog } = require('../models');
const AppError = require('../utils/AppError');
const { ok, page } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  async profile(req, res) { ok(res, await Settings.getProfile()); },
  async updateProfile(req, res) { ok(res, await Settings.updateProfile(req.body, req.ctx)); },

  async settings(req, res) { ok(res, await Settings.listSettings()); },
  /** PUT /settings/:key { value, description? } */
  async setSetting(req, res) {
    if (req.body.value === undefined) throw new AppError('value is required');
    ok(res, await Settings.setSetting(req.params.key, req.body.value, req.body.description, req.ctx));
  },

  async mpesaConfig(req, res) { ok(res, await Settings.getMpesaConfig()); },
  async updateMpesaConfig(req, res) { ok(res, await Settings.updateMpesaConfig(req.body, req.ctx)); },

  async activity(req, res) { page(res, await ActivityLog.list(req.query)); },
  async activityCategories(req, res) { ok(res, await ActivityLog.categories()); },

  async backups(req, res) { ok(res, await BackupLog.list(Number(req.query.limit) || 30)); },
  async lastBackup(req, res) { ok(res, await BackupLog.last()); },
});
