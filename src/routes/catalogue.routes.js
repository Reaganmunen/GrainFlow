// Mounted at the API root: serves /grains /grades /units /price-tiers /items
// Reads are open to any logged-in user (the till needs them); writes need catalogue.manage.
const router = require('express').Router();
const { catalogue } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists } = require('../middlewares/moduleScope');

const manage = permit('catalogue.manage');

const lookup = (path, c) => {
  router.get(path, c.list);
  router.post(path, manage, c.create);
  router.get(`${path}/:id`, c.get);
  router.put(`${path}/:id`, manage, c.update);
};
lookup('/grains', catalogue.grains);
lookup('/grades', catalogue.grades);
lookup('/units', catalogue.units);
lookup('/price-tiers', catalogue.tiers);

const items = catalogue.items;
router.get('/items/pos', scopeLists, items.pos); // before /items/:id
router.get('/items', scopeLists, items.list);
router.post('/items', manage, items.create);
router.get('/items/:id', items.get);
router.put('/items/:id', manage, items.update);
router.get('/items/:id/units', items.units);
router.put('/items/:id/units/:unitId', manage, items.setUnit);
router.delete('/items/:id/units/:unitId', manage, items.removeUnit);

module.exports = router;
