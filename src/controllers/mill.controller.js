const { MillJob, Machine, YieldAlert } = require('../models');
const { ok, created, page, found } = require('../utils/respond');
const controller = require('../utils/controller');

module.exports = controller({
  // ---- jobs ----
  async jobs(req, res) { page(res, await MillJob.list(req.query)); },
  /** GET /mill/jobs/open - the job board */
  async openJobs(req, res) { ok(res, await MillJob.open()); },
  async billable(req, res) { ok(res, await MillJob.billable(req.query)); },
  async job(req, res) { ok(res, found(await MillJob.findById(req.params.id), 'Job')); },
  async createJob(req, res) {
    const d = { ...req.body };
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    created(res, await MillJob.create(d, req.ctx));
  },
  async updateJob(req, res) { ok(res, await MillJob.update(req.params.id, req.body, req.ctx)); },
  async startJob(req, res) {
    const d = { ...req.body };
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    ok(res, await MillJob.start(req.params.id, d, req.ctx));
  },
  /** POST /mill/jobs/:id/complete { weight_out_kg, bran_kg?, flour_destination?, bran_destination?, outputs? } */
  async completeJob(req, res) {
    const d = { ...req.body };
    if (!d.miller_id && req.user.role_code === 'MILLER') d.miller_id = req.user.id;
    ok(res, await MillJob.complete(req.params.id, d, req.ctx));
  },
  async collectJob(req, res) { ok(res, await MillJob.collect(req.params.id, req.ctx)); },
  async cancelJob(req, res) { ok(res, await MillJob.cancel(req.params.id, req.body.reason, req.ctx)); },

  // ---- machines & power log ----
  async machines(req, res) { ok(res, await Machine.list(req.query)); },
  async machine(req, res) { ok(res, found(await Machine.findById(req.params.id), 'Machine')); },
  async createMachine(req, res) { created(res, await Machine.create(req.body, req.ctx)); },
  async updateMachine(req, res) { ok(res, await Machine.update(req.params.id, req.body, req.ctx)); },
  async machineLogs(req, res) { ok(res, await Machine.logs(req.query)); },
  async saveMachineLog(req, res) { ok(res, await Machine.saveLog(req.body, req.ctx)); },

  // ---- yield ----
  async yieldAlerts(req, res) { page(res, await YieldAlert.list(req.query)); },
  /** PUT /mill/yield-alerts/:id/review { status: EXPLAINED | CONFIRMED_LOSS | DISMISSED, review_note } */
  async reviewYieldAlert(req, res) { ok(res, await YieldAlert.review(req.params.id, req.body, req.ctx)); },
  async yieldReport(req, res) { page(res, await YieldAlert.report(req.query)); },
  async yieldByGrain(req, res) { ok(res, await YieldAlert.byGrain(req.query)); },
  async yieldByMiller(req, res) { ok(res, await YieldAlert.byMiller(req.query)); },
});
