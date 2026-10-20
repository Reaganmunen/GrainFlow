const router = require('express').Router();
const { mill } = require('../controllers');
const { permit } = require('./guards');

const view = permit('mill.view');

// job tickets (static paths before /jobs/:id)
router.get('/jobs', view, mill.jobs);
router.get('/jobs/open', view, mill.openJobs);
router.get('/jobs/billable', permit('mill.view', 'sales.create'), mill.billable);
router.post('/jobs', permit('mill.create'), mill.createJob);
router.get('/jobs/:id', view, mill.job);
router.put('/jobs/:id', permit('mill.create', 'mill.update'), mill.updateJob);
router.post('/jobs/:id/start', permit('mill.update'), mill.startJob);
router.post('/jobs/:id/complete', permit('mill.update'), mill.completeJob);
router.post('/jobs/:id/collect', permit('mill.collect'), mill.collectJob);
router.post('/jobs/:id/cancel', permit('mill.cancel'), mill.cancelJob);

// machines and power log
router.get('/machines', view, mill.machines);
router.post('/machines', permit('mill.machines'), mill.createMachine);
router.get('/machines/logs', view, mill.machineLogs); // before /machines/:id
router.post('/machines/logs', permit('mill.machines'), mill.saveMachineLog);
router.get('/machines/:id', view, mill.machine);
router.put('/machines/:id', permit('mill.machines'), mill.updateMachine);

// yield check
router.get('/yield-alerts', permit('mill.yield'), mill.yieldAlerts);
router.put('/yield-alerts/:id/review', permit('mill.yield'), mill.reviewYieldAlert);
router.get('/yield-report', permit('mill.yield', 'reports.view'), mill.yieldReport);
router.get('/yield-report/by-grain', permit('mill.yield', 'reports.view'), mill.yieldByGrain);
router.get('/yield-report/by-miller', permit('mill.yield', 'reports.view'), mill.yieldByMiller);

module.exports = router;
