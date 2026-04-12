const admin = require('firebase-admin');

let db = null;

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(sa)),
      });
      db = admin.firestore();
    } catch (e) {
      console.error('Firebase Admin init failed:', e.message);
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT env var is not set — database calls will fail.');
  }
} else {
  db = admin.firestore();
}

module.exports = { admin, db };
