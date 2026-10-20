const router = require('express').Router();
const { reports } = require('../controllers');
const { permit } = require('./guards');

const dash = permit('dashboard.view');
const view = permit('reports.view');
const money = permit('reports.profit'); // profit, margin, stock value

// owner dashboard
router.get('/dashboard', dash, reports.dashboard);
router.get('/alerts', dash, reports.alerts);
router.get('/sales-trend', dash, reports.salesTrend);

// reports
router.get('/sales-daily', view, reports.salesDaily);
router.get('/payments-daily', view, reports.paymentsDaily);
router.get('/profit', money, reports.profit);
router.get('/margin', money, reports.margin);
router.get('/stock-value', money, reports.stockValue);
router.get('/customer-balances', view, reports.customerBalances);
router.get('/credit-overdue', view, reports.creditOverdue);
router.get('/receivables-aging', view, reports.receivablesAging);
router.get('/supplier-balances', view, reports.supplierBalances);

module.exports = router;
