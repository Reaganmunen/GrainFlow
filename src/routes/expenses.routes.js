const router = require('express').Router();
const { expenses } = require('../controllers');
const { permit } = require('./guards');

const view = permit('expenses.view');

router.get('/', view, expenses.list);
router.post('/', permit('expenses.create'), expenses.create);
router.get('/summary', view, expenses.summary); // static paths before /:id
router.get('/categories', permit('expenses.view', 'expenses.create'), expenses.categories);
router.post('/categories', permit('expenses.manage'), expenses.createCategory);
router.put('/categories/:id', permit('expenses.manage'), expenses.updateCategory);
router.get('/:id', view, expenses.get);
router.put('/:id', permit('expenses.create'), expenses.update);
router.post('/:id/void', permit('expenses.void'), expenses.void);

module.exports = router;
