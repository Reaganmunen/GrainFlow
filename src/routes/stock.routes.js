const router = require('express').Router();
const { stock } = require('../controllers');
const { permit } = require('./guards');

const view = permit('stock.view');

// stock on hand
router.get('/', view, stock.balances);
router.get('/balances', view, stock.balances);
router.get('/low', view, stock.lowStock);
router.get('/value', permit('stock.view', 'reports.profit'), stock.valueSummary);
router.get('/movements', view, stock.movements);
router.get('/customer-grain', permit('stock.view', 'mill.view'), stock.customerGrain);
router.post('/opening', permit('stock.opening'), stock.openingStock);

// adjustments (losses, spoilage, corrections)
router.get('/adjustments', view, stock.adjustments);
router.get('/adjustments/loss-summary', view, stock.lossSummary); // before /:id
router.get('/adjustments/:id', view, stock.adjustment);
router.post('/adjustments', permit('stock.adjust'), stock.createAdjustment);

// stock takes
router.get('/takes', view, stock.takes);
router.post('/takes', permit('stock.take'), stock.createTake);
router.get('/takes/:id', view, stock.take);
router.put('/takes/:id/lines', permit('stock.take'), stock.saveTakeLines);
router.delete('/takes/:id/lines/:itemId', permit('stock.take'), stock.removeTakeLine);
router.post('/takes/:id/post', permit('stock.take_post'), stock.postTake);
router.delete('/takes/:id', permit('stock.take'), stock.removeTake);

// transfers between mill and cereal
router.get('/transfers', view, stock.transfers);
router.post('/transfers', permit('stock.transfer'), stock.createTransfer);
router.get('/transfers/:id', view, stock.transfer);

module.exports = router;
