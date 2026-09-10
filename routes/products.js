const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { listProducts, getProduct, upsertProduct, getDb } = require('../services/firebaseService');
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

async function requireFirebaseAdmin(req, res, next) {
  try {
    const authorization = String(req.get('authorization') || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ ok: false, error: 'Firebase ID token is required' });

    // getDb() initializes firebase-admin with the configured service account.
    const firestore = getDb();
    const decoded = await admin.auth().verifyIdToken(token);
    const adminDoc = await firestore.collection('admin').doc(decoded.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin access is required' });
    }

    req.firebaseUser = decoded;
    next();
  } catch (error) {
    console.error('Firebase admin authorization failed:', error.message);
    res.status(401).json({ ok: false, error: 'Invalid Firebase authentication' });
  }
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

// Called by the authenticated website immediately after an inventory upload.
// Product data is re-read from Firestore so the client cannot forge the price.
router.post('/notify', requireFirebaseAdmin, async (req, res) => {
  try {
    const productId = String(req.body?.productId || '');
    if (!productId) return res.status(400).json({ ok: false, error: 'productId is required' });

    const product = await getProduct(productId);
    if (!product) return res.status(404).json({ ok: false, error: 'Product not found' });

    const notification = product.active && product.stock > 0
      ? await broadcastInventoryUpdate(product)
      : { sent: 0, failed: 0, skipped: true };

    res.json({ ok: true, product, notification });
  } catch (error) {
    console.error('Inventory notification error:', error);
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
