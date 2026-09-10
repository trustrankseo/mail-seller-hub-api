const admin = require('firebase-admin');

let db = null;

function firebaseConfigStatus() {
  const hasJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
  const hasSplit = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  return {
    configured: hasJson || hasSplit,
    projectConfigured: Boolean(process.env.FIREBASE_PROJECT_ID),
    mode: hasJson ? 'service_account_json' : hasSplit ? 'split_env_vars' : null
  };
}

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (raw.private_key) raw.private_key = raw.private_key.replace(/\\n/g, '\n');
    return admin.credential.cert(raw);
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  }

  throw new Error(
    'Firebase Admin is not fully configured. Add FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in Vercel.'
  );
}

function getDb() {
  if (db) return db;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: getCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID || undefined
    });
  }

  db = admin.firestore();
  return db;
}

function numberValue(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeProduct(id, data = {}) {
  const name = data.name || data.title || data.productName || data.product || data.type || data.category || id;
  // Website categories use `pricePerEmail`. Prefer it over legacy fields so
  // the Telegram bot always shows the same base price as the website.
  const price = numberValue(data.pricePerEmail ?? data.price ?? data.unitPrice ?? data.salePrice ?? data.rate, 0);
  const stock = numberValue(data.stockCount ?? data.stock ?? data.quantity ?? data.qty ?? data.available ?? data.count ?? data.inventory, 0);
  const currency = data.currency || data.currencyCode || process.env.DEFAULT_CURRENCY || 'USD';
  const active = data.isActive !== false && data.active !== false && data.enabled !== false && String(data.status || '').toLowerCase() !== 'inactive';
  const tiers = Array.isArray(data.tiers)
    ? data.tiers
      .map((tier) => ({
        minQty: Math.max(0, numberValue(tier?.minQty, 0)),
        maxQty: Math.max(0, numberValue(tier?.maxQty, 0)),
        price: numberValue(tier?.price, 0)
      }))
      .filter((tier) => tier.minQty > 0 && tier.price > 0)
      .sort((a, b) => a.minQty - b.minQty)
    : [];

  return {
    id,
    name: String(name),
    price,
    tiers,
    stock,
    currency: String(currency),
    active
  };
}

async function resolveProductsCollection() {
  const firestore = getDb();
  const forced = process.env.PRODUCTS_COLLECTION;
  if (forced) return forced;

  // The website keeps sellable product/category metadata in `categories`.
  // Individual inventory rows live in `emails` and must never be exposed as products.
  const candidates = ['categories', 'products', 'inventory', 'mails', 'stock'];
  for (const name of candidates) {
    try {
      const snap = await firestore.collection(name).limit(1).get();
      if (!snap.empty) return name;
    } catch (error) {
      console.warn(`Unable to inspect Firestore collection ${name}:`, error.message);
    }
  }

  return 'categories';
}

async function listProducts({ availableOnly = false } = {}) {
  const firestore = getDb();
  const collectionName = await resolveProductsCollection();
  const snap = await firestore.collection(collectionName).get();
  const products = snap.docs.map((doc) => normalizeProduct(doc.id, doc.data()));

  return products
    .filter((product) => product.active)
    .filter((product) => !availableOnly || product.stock > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getProduct(productId) {
  const firestore = getDb();
  const collectionName = await resolveProductsCollection();
  const doc = await firestore.collection(collectionName).doc(String(productId)).get();
  return doc.exists ? normalizeProduct(doc.id, doc.data()) : null;
}

async function upsertProduct(product = {}) {
  const firestore = getDb();
  const collectionName = await resolveProductsCollection();
  const id = String(product.id || product.slug || product.name || `product_${Date.now()}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `product_${Date.now()}`;

  const ref = firestore.collection(collectionName).doc(id);
  const before = await ref.get();
  const normalizedStock = numberValue(product.stockCount ?? product.stock ?? product.quantity ?? product.qty, 0);
  const incomingPrice = numberValue(product.pricePerEmail ?? product.price ?? product.unitPrice, 0);
  const payload = {
    name: product.name || product.title || id,
    currency: product.currency || process.env.DEFAULT_CURRENCY || 'USD',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (collectionName === 'categories') {
    payload.pricePerEmail = incomingPrice;
    payload.stockCount = normalizedStock;
    payload.isActive = product.isActive !== false && product.active !== false;
    if (Array.isArray(product.tiers)) payload.tiers = product.tiers;
  } else {
    payload.price = incomingPrice;
    payload.stock = normalizedStock;
    payload.active = product.active !== false;
  }

  if (!before.exists) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(payload, { merge: true });
  const after = await ref.get();

  return {
    created: !before.exists,
    product: normalizeProduct(after.id, after.data())
  };
}

async function getPaymentSettings() {
  const envFallback = {
    label: process.env.PAYMENT_LABEL || 'Binance USDT',
    network: process.env.PAYMENT_NETWORK || 'USDT',
    address: process.env.BINANCE_ADDRESS || '',
    currency: process.env.PAYMENT_CURRENCY || 'USDT'
  };

  const firestore = getDb();
  const forcedPath = process.env.PAYMENT_DOC_PATH;
  const paths = forcedPath
    ? [forcedPath]
    : ['settings/payment', 'payment/settings', 'payments/main'];

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2) continue;
    try {
      const doc = await firestore.collection(parts[0]).doc(parts[1]).get();
      if (doc.exists) {
        const data = doc.data() || {};
        return {
          label: data.label || data.name || envFallback.label,
          network: data.network || data.chain || envFallback.network,
          address: data.address || data.wallet || data.walletAddress || envFallback.address,
          currency: data.currency || data.asset || envFallback.currency
        };
      }
    } catch (error) {
      console.warn(`Unable to read payment settings at ${path}:`, error.message);
    }
  }

  return envFallback;
}

async function saveSubscriber(user = {}, active = true) {
  const firestore = getDb();
  const collection = process.env.SUBSCRIBERS_COLLECTION || 'telegram_subscribers';
  const chatId = String(user.chatId || user.id || '');
  if (!chatId) throw new Error('chatId is required');

  await firestore.collection(collection).doc(chatId).set({
    chatId,
    userId: user.userId ? String(user.userId) : null,
    username: user.username || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    active: Boolean(active),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(active ? { subscribedAt: admin.firestore.FieldValue.serverTimestamp() } : { unsubscribedAt: admin.firestore.FieldValue.serverTimestamp() })
  }, { merge: true });

  return { chatId, active: Boolean(active) };
}

async function listSubscribers() {
  const firestore = getDb();
  const collection = process.env.SUBSCRIBERS_COLLECTION || 'telegram_subscribers';
  const snap = await firestore.collection(collection).where('active', '==', true).get();
  return snap.docs.map((doc) => doc.data()).filter((item) => item.chatId);
}

async function saveOrder(order = {}) {
  const firestore = getDb();
  const collection = process.env.ORDERS_COLLECTION || 'orders';
  const payload = {
    ...order,
    status: order.status || 'pending_payment',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const ref = await firestore.collection(collection).add(payload);
  return { id: ref.id, ...payload };
}

async function saveSession(chatId, data = {}) {
  const firestore = getDb();
  const collection = process.env.SESSIONS_COLLECTION || 'telegram_sessions';
  await firestore.collection(collection).doc(String(chatId)).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function getSession(chatId) {
  const firestore = getDb();
  const collection = process.env.SESSIONS_COLLECTION || 'telegram_sessions';
  const doc = await firestore.collection(collection).doc(String(chatId)).get();
  return doc.exists ? doc.data() : null;
}

async function clearSession(chatId) {
  const firestore = getDb();
  const collection = process.env.SESSIONS_COLLECTION || 'telegram_sessions';
  await firestore.collection(collection).doc(String(chatId)).delete().catch(() => null);
}

module.exports = {
  normalizeProduct,
  firebaseConfigStatus,
  getDb,
  listProducts,
  getProduct,
  upsertProduct,
  getPaymentSettings,
  saveSubscriber,
  listSubscribers,
  saveOrder,
  saveSession,
  getSession,
  clearSession
};
