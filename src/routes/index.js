/**
 * Mount with:  app.use('/api', require('./routes'));
 * Public: POST /api/auth/login and POST /api/mpesa/stk-callback/:secret. Everything else needs a valid session.
 */
const router = require('express').Router();
const { authenticate } = require('./guards');

// ---- public ----
router.use('/auth', require('./auth.routes')); // login is public; the other auth routes authenticate themselves
router.use('/mpesa', require('./mpesa.routes'));

// ---- everything below requires a logged-in user ----
router.use(authenticate);

// routers that declare their own full paths (mounted at the root)
router.use(require('./users.routes'));      // /users, /roles
router.use(require('./settings.routes'));   // /settings, /activity-log, /backups
router.use(require('./suppliers.routes'));  // /suppliers, /supplier-payments
router.use(require('./catalogue.routes'));  // /grains, /grades, /units, /price-tiers, /items
router.use(require('./pricing.routes'));    // /prices, /min-prices, /milling-rates, /yield-standards

router.use('/customers', require('./customers.routes'));
router.use('/stock', require('./stock.routes'));
router.use('/purchases', require('./purchases.routes'));
router.use('/mill', require('./mill.routes'));
router.use('/sales', require('./sales.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/receipts', require('./receipts.routes'));
router.use('/deliveries', require('./deliveries.routes'));
router.use('/expenses', require('./expenses.routes'));
router.use('/daily-close', require('./dailyClose.routes'));
router.use('/reports', require('./reports.routes'));

module.exports = router;
