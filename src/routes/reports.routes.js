const router = require('express').Router();
const { reports } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, ownerOnly } = require('../middlewares/moduleScope');

const dash = permit('dashboard.view');
const view = permit('reports.view');
const money = permit('reports.profit'); // profit, margin, stock value

// owner dashboard
router.get('/dashboard', ownerOnly, dash, reports.dashboard); // both businesses together: owner only
router.get('/alerts', ownerOnly, dash, reports.alerts);
router.get('/sales-trend', ownerOnly, dash, reports.salesTrend);

// reports
router.get('/sales-daily', view, scopeLists, reports.salesDaily);
router.get('/payments-daily', view, scopeLists, reports.paymentsDaily);
router.get('/profit', money, scopeLists, reports.profit);
router.get('/margin', money, scopeLists, reports.margin);
router.get('/stock-value', ownerOnly, money, reports.stockValue);
router.get('/customer-balances', ownerOnly, view, reports.customerBalances);
router.get('/credit-overdue', ownerOnly, view, reports.creditOverdue);
router.get('/receivables-aging', ownerOnly, view, reports.receivablesAging);
router.get('/supplier-balances', ownerOnly, view, reports.supplierBalances);

module.exports = router;
