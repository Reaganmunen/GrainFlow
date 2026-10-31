/**
 * Mount with:  app.use('/api', require('./routes'));
 * Public: POST /api/auth/login and POST /api/mpesa/stk-callback/:secret. Everything else needs a valid session.
 */
const router = require('express').Router();
const { authenticate } = require('./guards');
const { requireAnyModule, requireModule } = require('../middlewares/moduleScope');

// ---- public ----
router.use('/auth', require('./auth.routes')); // login is public; the other auth routes authenticate themselves
router.use('/mpesa', require('./mpesa.routes'));

// ---- everything below requires a logged-in user ----
router.use(authenticate);
router.use(requireAnyModule); // a user with no module assigned gets nothing (the owner is always in)

// routers that declare their own full paths (mounted at the root)
router.use(require('./users.routes'));      // /users, /roles
router.use(require('./settings.routes'));   // /settings, /activity-log, /backups
router.use(require('./suppliers.routes'));  // /suppliers, /supplier-payments
router.use(require('./catalogue.routes'));  // /grains, /grades, /units, /price-tiers, /items
router.use(require('./pricing.routes'));    // /prices, /min-prices, /milling-rates, /yield-standards

router.use('/customers', require('./customers.routes'));
router.use('/stock', require('./stock.routes'));
router.use('/purchases', require('./purchases.routes'));
router.use('/mill', requireModule('MILL'), require('./mill.routes')); // posho mill only
router.use('/sales', require('./sales.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/receipts', require('./receipts.routes'));
router.use('/deliveries', require('./deliveries.routes'));
router.use('/expenses', require('./expenses.routes'));
router.use('/daily-close', require('./dailyClose.routes'));
router.use('/reports', require('./reports.routes'));
router.use('/offline', require('./offline.routes')); // till data pack + saving what was done without internet

module.exports = router;
