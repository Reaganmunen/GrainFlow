// Mounted at the API root: serves /prices /min-prices /milling-rates /yield-standards
const router = require('express').Router();
const { pricing } = require('../controllers');
const { permit } = require('./guards');

// price lists (reads open to any logged-in user)
router.get('/prices', pricing.prices);
router.put('/prices/bulk', permit('prices.update'), pricing.setPrices); // before any /prices/:x
router.put('/prices', permit('prices.update'), pricing.setPrice);
router.get('/prices/:itemId/history', permit('prices.update', 'reports.view'), pricing.priceHistory);

// minimum prices
router.get('/min-prices', permit('prices.min_price', 'prices.update'), pricing.minPrices);
router.put('/min-prices/:itemId', permit('prices.min_price'), pricing.setMinPrice);
router.delete('/min-prices/:itemId', permit('prices.min_price'), pricing.removeMinPrice);

// milling rates
router.get('/milling-rates', pricing.millingRates);
router.get('/milling-rates/current/:grainItemId', pricing.currentMillingRate); // before /:id
router.post('/milling-rates', permit('rates.manage'), pricing.createMillingRate);
router.get('/milling-rates/:id', pricing.millingRate);
router.put('/milling-rates/:id', permit('rates.manage'), pricing.updateMillingRate);

// yield standards
router.get('/yield-standards', permit('mill.view', 'rates.manage'), pricing.yieldStandards);
router.post('/yield-standards', permit('rates.manage'), pricing.createYieldStandard);
router.put('/yield-standards/:id', permit('rates.manage'), pricing.updateYieldStandard);

module.exports = router;
