const router = require('express').Router();
const { customers } = require('../controllers');
const { permit } = require('./guards');
const { requireModule } = require('../middlewares/moduleScope');

// anyone who serves customers needs to find them
const find = permit('customers.view', 'sales.create', 'mill.create');

router.get('/lookup', find, customers.lookup);
router.get('/', permit('customers.view'), customers.list);
router.post('/', permit('customers.create'), customers.create);
router.get('/:id', find, customers.get);
router.put('/:id', permit('customers.update'), customers.update);
router.get('/:id/ledger', permit('customers.view'), customers.ledger);
router.get('/:id/open-sales', permit('customers.view', 'payments.create'), customers.openSales);
router.get('/:id/grain-held', requireModule('MILL'), permit('customers.view', 'mill.view'), customers.grainHeld);
router.post('/:id/opening-balance', permit('customers.opening_balance'), customers.setOpeningBalance);

module.exports = router;
