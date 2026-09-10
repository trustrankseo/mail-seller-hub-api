const admin = require('firebase-admin');

let db = null;

function initFirebase() {
  if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  }

  db = admin.firestore();
  return db;
}

async function saveOrder(order) {
  if (!db) initFirebase();
  return await db.collection('orders').add(order);
}

module.exports = { initFirebase, saveOrder };
