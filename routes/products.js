const express = require('express');
const router = express.Router();
const { listProducts, upsertProduct, getDb } = require('../services/firebaseService');
const { broadcastInventoryUpdate } = require('../services/telegramBot');
const { inspectProductSource } = require('../services/schemaInspector');

function requireAdminSecret(req, res, next) {
  const expected = process.env.ADMIN_SYNC_SECRET;
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'ADMIN_SYNC_SECRET is not configured' });
  }
  const supplied = req.get('x-admin-secret');
  if (!supplied || supplied !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

router.get('/schema', async (req, res) => {
  try {
    const schema = await inspectProductSource(getDb);
    res.json({ ok: true, schema });
  } catch (error) {
    console.error('Product schema inspect error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const products = await listProducts({ availableOnly: req.query.available === '1' });
    res.json({ ok: true, products });
  } catch (error) {
    console.error('Products read error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Trusted website/admin hook: write through this endpoint to update Firebase and notify subscribers.
router.post('/', requireAdminSecret, async (req, res) => {
  try {
    const result = await upsertProduct(req.body || {});
    let notification = { sent: 0, failed: 0, skipped: true };

    const shouldNotify = req.body?.notify !== false && result.product.stock > 0;
    if (shouldNotify) {
      notification = await broadcastInventoryUpdate(result.product);
    }

    res.json({ ok: true, ...result, notification });
  } catch (error) {
    console.error('Products write error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
