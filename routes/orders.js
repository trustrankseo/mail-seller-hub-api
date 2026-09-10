const express = require('express');
const router = express.Router();
const { saveOrder } = require('../services/firebaseService');

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.productId && !body.productName) {
      return res.status(400).json({ ok: false, error: 'productId or productName is required' });
    }
    if (!body.quantity || Number(body.quantity) <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid quantity is required' });
    }

    const order = await saveOrder({ ...body, source: body.source || 'website' });
    res.status(201).json({ ok: true, orderId: order.id, order });
  } catch (error) {
    console.error('Order save error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
