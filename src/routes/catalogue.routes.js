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
// the kinds the database allows for an item (an enum, or a CHECK list), so the form offers only valid ones
router.get('/items/kinds', async (req, res, next) => {
  try {
    const { pool } = require('../config/db');
    const e = await pool.query(
      `SELECT e.enumlabel FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE a.attrelid = 'pmc.items'::regclass AND a.attname = 'kind' ORDER BY e.enumsortorder`);
    let values = e.rows.map((r) => r.enumlabel);
    if (!values.length) { // a text column limited by a CHECK: read the quoted words out of the rule
      const c = await pool.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'pmc.items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kind%'`);
      values = [...new Set(c.rows.flatMap((r) => [...r.d.matchAll(/'([A-Za-z0-9_ ]+)'/g)].map((m) => m[1])))];
    }
    res.json({ success: true, data: values });
  } catch (err) { next(err); }
});
router.get('/items', scopeLists, items.list);
router.post('/items', manage, items.create);
router.get('/items/:id', items.get);
router.put('/items/:id', manage, items.update);
router.get('/items/:id/units', items.units);
router.put('/items/:id/units/:unitId', manage, items.setUnit);
router.delete('/items/:id/units/:unitId', manage, items.removeUnit);

module.exports = router;
