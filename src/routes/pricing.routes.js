// Mounted at the API root: serves /prices /min-prices /milling-rates /yield-standards
const router = require('express').Router();
const { pricing } = require('../controllers');
const { permit } = require('./guards');
const { requireModule, scopeLists, guardRecord, guardBodyRecord } = require('../middlewares/moduleScope');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

// an item belongs to a business (items.owner_module); a manager may only price / set minimums for their own business
const ITEM_MODULE = 't.owner_module';
const ofItemParam = guardRecord('items', ITEM_MODULE, 'itemId');
const ofItemBody = guardBodyRecord('items', ITEM_MODULE, 'item_id');
/** PUT /prices/bulk { prices: [{ item_id, ... }] }: every item must be in the user's business */
const ofItemsInBulk = async (req, res, next) => {
  if (req.access.owner) return next();
  try {
    const ids = [...new Set(((req.body && req.body.prices) || []).map((p) => p && p.item_id).filter((x) => /^\d+$/.test(String(x))))];
    if (!ids.length) return next();
    const { rows } = await pool.query('SELECT owner_module::text AS m FROM items WHERE id = ANY($1::bigint[])', [ids]);
    if (rows.some((r) => !r.m || !req.access.modules.includes(r.m))) {
      return next(new AppError('You can only change prices for your own business', 403, { code: 'FORBIDDEN' }));
    }
    next();
  } catch (err) { next(err); }
};
const mill = requireModule('MILL'); // milling rates and yield standards are posho-mill only

// price lists (reads open to any logged-in user)
router.get('/prices', scopeLists, pricing.prices);
router.put('/prices/bulk', permit('prices.update'), ofItemsInBulk, pricing.setPrices); // before any /prices/:x
router.put('/prices', permit('prices.update'), ofItemBody, pricing.setPrice);
router.get('/prices/:itemId/history', permit('prices.update', 'reports.view'), ofItemParam, pricing.priceHistory);

// minimum prices
router.get('/min-prices', permit('prices.min_price', 'prices.update'), scopeLists, pricing.minPrices);
router.put('/min-prices/:itemId', permit('prices.min_price'), ofItemParam, pricing.setMinPrice);
router.delete('/min-prices/:itemId', permit('prices.min_price'), ofItemParam, pricing.removeMinPrice);

// milling rates
router.get('/milling-rates', mill, pricing.millingRates);
router.get('/milling-rates/current/:grainItemId', mill, pricing.currentMillingRate); // before /:id
router.post('/milling-rates', mill, permit('rates.manage'), pricing.createMillingRate);
router.get('/milling-rates/:id', mill, pricing.millingRate);
router.put('/milling-rates/:id', mill, permit('rates.manage'), pricing.updateMillingRate);

// yield standards
router.get('/yield-standards', mill, permit('mill.view', 'rates.manage'), pricing.yieldStandards);
router.post('/yield-standards', mill, permit('rates.manage'), pricing.createYieldStandard);
router.put('/yield-standards/:id', mill, permit('rates.manage'), pricing.updateYieldStandard);

module.exports = router;
