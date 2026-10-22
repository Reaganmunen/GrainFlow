const router = require('express').Router();
const { purchases } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, bodyPool, guardRecord } = require('../middlewares/moduleScope');

// a purchase is bought into one stock pool: MILL_STOCK (mill) or CEREAL_STOCK (cereals)
const PURCHASE_MODULE = "CASE WHEN t.stock_pool::text = 'MILL_STOCK' THEN 'MILL' WHEN t.stock_pool::text = 'CEREAL_STOCK' THEN 'CEREAL' END";
const ofPurchase = guardRecord('purchases', PURCHASE_MODULE);
const ofLine = guardRecord('purchase_lines', '(SELECT CASE WHEN p.stock_pool::text = \'MILL_STOCK\' THEN \'MILL\' WHEN p.stock_pool::text = \'CEREAL_STOCK\' THEN \'CEREAL\' END FROM purchases p WHERE p.id = t.purchase_id)', 'lineId');
const intoMyPool = bodyPool('stock_pool', { purchase: true });
const keepMyPool = bodyPool('stock_pool', { purchase: true, required: false });

router.get('/', permit('purchases.view'), scopeLists, purchases.list);
router.post('/', permit('purchases.create'), intoMyPool, purchases.create);
router.get('/:id', permit('purchases.view'), ofPurchase, purchases.get);
router.put('/:id', permit('purchases.create'), ofPurchase, keepMyPool, purchases.update);
router.delete('/:id', permit('purchases.create'), ofPurchase, purchases.removeDraft);

router.post('/:id/lines', permit('purchases.create'), ofPurchase, purchases.addLine);
router.put('/:id/lines/:lineId', permit('purchases.create'), ofPurchase, ofLine, purchases.updateLine);
router.delete('/:id/lines/:lineId', permit('purchases.create'), ofPurchase, ofLine, purchases.removeLine);

router.post('/:id/post', permit('purchases.post'), ofPurchase, purchases.post);

module.exports = router;
