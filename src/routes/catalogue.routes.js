// Mounted at the API root: serves /grains /grades /units /price-tiers /items
// Reads are open to any logged-in user (the till needs them).
// Writes: the owner (catalogue.manage) can do everything. A manager (catalogue.items) can ADD grains, grades and units
// and add / edit products, but only products of their own business; changing an existing grain, grade, unit or
// price tier stays with the owner.
const router = require('express').Router();
const { catalogue } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, bodyModule, guardRecord } = require('../middlewares/moduleScope');

const manage = permit('catalogue.manage');
const addItems = permit('catalogue.manage', 'catalogue.items');

// a product belongs to one business (items.owner_module): a manager only touches their own, never shared (null) ones
const ofItem = guardRecord('items', 't.owner_module', 'id');
/** An edit by a non-owner cannot move the product to another business or make it shared. */
const keepModule = (req, res, next) => {
  if (!req.access.owner && req.body) delete req.body.owner_module;
  next();
};

const lookup = (path, c) => {
  router.get(path, c.list);
  router.post(path, addItems, c.create);
  router.get(`${path}/:id`, c.get);
  router.put(`${path}/:id`, manage, c.update);
};
lookup('/grains', catalogue.grains);
lookup('/grades', catalogue.grades);
lookup('/units', catalogue.units);
lookup('/price-tiers', catalogue.tiers);

const items = catalogue.items;
router.get('/items/pos', scopeLists, items.pos); // before /items/:id
router.get('/items/kinds', items.kinds); // before /items/:id
router.get('/items', scopeLists, items.list);
router.post('/items', addItems, bodyModule('owner_module'), items.create);
router.get('/items/:id', items.get);
router.put('/items/:id', addItems, ofItem, keepModule, items.update);
router.get('/items/:id/units', items.units);
router.put('/items/:id/units/:unitId', addItems, ofItem, items.setUnit);
router.delete('/items/:id/units/:unitId', addItems, ofItem, items.removeUnit);

module.exports = router;
