const express = require('express');
const router = express.Router();
const { getPaymentSettings } = require('../services/firebaseService');

router.get('/', async (req, res) => {
  try {
    const payment = await getPaymentSettings();
    res.json({ ok: true, payment });
  } catch (error) {
    console.error('Payment settings error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
