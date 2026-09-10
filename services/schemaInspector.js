function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value && typeof value.toDate === 'function') return 'timestamp';
  if (value && typeof value === 'object') return 'object';
  return typeof value;
}

function collectShape(data = {}, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(data || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const type = valueType(value);
    if (!out[path]) out[path] = new Set();
    out[path].add(type);

    if (type === 'object' && prefix.split('.').length < 2) {
      collectShape(value, path, out);
    }
  }
  return out;
}

function serializeShape(shape) {
  return Object.fromEntries(
    Object.entries(shape)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, types]) => [key, Array.from(types).sort()])
  );
}

async function inspectProductSource(getDb) {
  const db = getDb();
  const forced = process.env.PRODUCTS_COLLECTION;
  const candidates = forced ? [forced] : ['products', 'inventory', 'mails', 'emails', 'stock'];

  for (const collectionName of candidates) {
    const snap = await db.collection(collectionName).limit(5).get();
    if (snap.empty) continue;

    const shape = {};
    for (const doc of snap.docs) collectShape(doc.data(), '', shape);

    return {
      found: true,
      collection: collectionName,
      sampleDocuments: snap.size,
      fields: serializeShape(shape)
    };
  }

  return { found: false, collection: forced || null, sampleDocuments: 0, fields: {} };
}

async function inspectPaymentSource(getDb) {
  const db = getDb();
  const forced = process.env.PAYMENT_DOC_PATH;
  const paths = forced ? [forced] : ['settings/payment', 'payment/settings', 'payments/main'];

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2) continue;
    const doc = await db.collection(parts[0]).doc(parts[1]).get();
    if (!doc.exists) continue;

    const shape = {};
    collectShape(doc.data(), '', shape);
    return {
      found: true,
      path,
      fields: serializeShape(shape),
      source: 'known_path'
    };
  }

  const rootCollections = await db.listCollections();
  const likely = rootCollections.filter((c) => /(payment|setting|config|wallet|binance)/i.test(c.id)).slice(0, 10);
  const candidates = [];

  for (const collection of likely) {
    const snap = await collection.limit(5).get();
    const shape = {};
    for (const doc of snap.docs) collectShape(doc.data(), '', shape);
    candidates.push({
      collection: collection.id,
      sampleDocumentIds: snap.docs.map((doc) => doc.id),
      fields: serializeShape(shape)
    });
  }

  return {
    found: false,
    path: forced || null,
    fields: {},
    source: 'search',
    candidateCollections: candidates
  };
}

module.exports = { inspectProductSource, inspectPaymentSource };
