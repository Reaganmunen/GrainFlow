const router = require('express').Router();
const { deliveries } = require('../controllers');
const { permit } = require('./guards');
const { scopeLists, guardRecord, guardBodyRecord } = require('../middlewares/moduleScope');

const ofDelivery = guardRecord('deliveries', '(SELECT s.module FROM sales s WHERE s.id = t.sale_id)');
const ofSaleInBody = guardBodyRecord('sales', 't.module', 'sale_id');

router.get('/', permit('deliveries.view'), scopeLists, deliveries.list);
router.post('/', permit('deliveries.manage'), ofSaleInBody, deliveries.create);
router.get('/:id', permit('deliveries.view'), ofDelivery, deliveries.get);
router.put('/:id', permit('deliveries.manage'), ofDelivery, deliveries.update);
router.put('/:id/status', permit('deliveries.manage'), ofDelivery, deliveries.setStatus);
router.get('/:id/note', permit('deliveries.view'), ofDelivery, deliveries.note);

module.exports = router;
