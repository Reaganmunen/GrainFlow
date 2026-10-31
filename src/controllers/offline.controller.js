const offline = require('../services/offline');
const { ok } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  /** GET /offline/bootstrap - reference data the till keeps on the computer so it can work without the internet */
  async bootstrap(req, res) { ok(res, await offline.bootstrap(req)); },

  /**
   * POST /offline/apply { op_id, type, client_time, device_id, local_no?, ref?, payload }
   * Saves ONE operation made on the till. Safe to send again: the same op_id returns the saved result with duplicate: true.
   */
  async apply(req, res) { ok(res, await offline.apply(req)); },
});
