const router = require('express').Router();
const { expenses } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, bodyModule, guardRecord } = require('../middlewares/moduleScope');

const ofExpense = guardRecord('expenses', 't.module'); // shared (whole-business) expenses are owner-only

const view = permit('expenses.view');

router.get('/', view, scopeLists, expenses.list);
router.post('/', permit('expenses.create'), bodyModule('module'), expenses.create);
router.get('/summary', view, scopeLists, expenses.summary); // static paths before /:id
router.get('/categories', permit('expenses.view', 'expenses.create'), expenses.categories);
router.post('/categories', permit('expenses.manage'), expenses.createCategory);
router.put('/categories/:id', permit('expenses.manage'), expenses.updateCategory);
router.get('/:id', view, ofExpense, expenses.get);
router.put('/:id', permit('expenses.create'), ofExpense, bodyModule('module', { required: false }), expenses.update);
router.post('/:id/void', permit('expenses.void'), ofExpense, expenses.void);

module.exports = router;
