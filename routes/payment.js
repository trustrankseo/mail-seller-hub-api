const express = require('express');
const router = express.Router();
const { getPaymentSettings, getDb } = require('../services/firebaseService');
const { inspectPaymentSource } = require('../services/schemaInspector');

router.get('/schema', async (req, res) => {
  try {
    const schema = await inspectPaymentSource(getDb);
    res.json({ ok: true, schema });
  } catch (error) {
    console.error('Payment schema inspect error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

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
