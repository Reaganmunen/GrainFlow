const router = require('express').Router();
const { stock } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, requireModule, ownerOnly, bodyPool, guardRecord } = require('../middlewares/moduleScope');

// a stock pool belongs to a business: mill stock + customer grain = mill, cereal stock = cereal
const POOL_MODULE = "CASE WHEN t.pool::text IN ('MILL_STOCK','CUSTOMER_GRAIN') THEN 'MILL' WHEN t.pool::text = 'CEREAL_STOCK' THEN 'CEREAL' END";
const ofAdjustment = guardRecord('stock_adjustments', POOL_MODULE);
const ofTake = guardRecord('stock_takes', POOL_MODULE);

const view = permit('stock.view');

// stock on hand
router.get('/', view, scopeLists, stock.balances);
router.get('/balances', view, scopeLists, stock.balances);
router.get('/low', view, scopeLists, stock.lowStock);
router.get('/value', permit('stock.view', 'reports.profit'), scopeLists, stock.valueSummary);
router.get('/movements', view, scopeLists, stock.movements);
router.get('/customer-grain', requireModule('MILL'), permit('stock.view', 'mill.view'), stock.customerGrain); // customer grain waiting to be milled
router.post('/opening', permit('stock.opening'), bodyPool('pool'), stock.openingStock);

// adjustments (losses, spoilage, corrections)
router.get('/adjustments', view, scopeLists, stock.adjustments);
router.get('/adjustments/loss-summary', view, scopeLists, stock.lossSummary); // before /:id
router.get('/adjustments/:id', view, ofAdjustment, stock.adjustment);
router.post('/adjustments', permit('stock.adjust'), bodyPool('pool'), stock.createAdjustment);

// stock takes
router.get('/takes', view, scopeLists, stock.takes);
router.post('/takes', permit('stock.take'), bodyPool('pool'), stock.createTake);
router.get('/takes/:id', view, ofTake, stock.take);
router.put('/takes/:id/lines', permit('stock.take'), ofTake, stock.saveTakeLines);
router.delete('/takes/:id/lines/:itemId', permit('stock.take'), ofTake, stock.removeTakeLine);
router.post('/takes/:id/post', permit('stock.take_post'), ofTake, stock.postTake);
router.delete('/takes/:id', permit('stock.take'), ofTake, stock.removeTake);

// transfers between mill and cereal
// transfers move stock BETWEEN the two businesses, so only the owner (who is in both) can see or make them
router.get('/transfers', ownerOnly, view, stock.transfers);
router.post('/transfers', ownerOnly, permit('stock.transfer'), stock.createTransfer);
router.get('/transfers/:id', ownerOnly, view, stock.transfer);

module.exports = router;
