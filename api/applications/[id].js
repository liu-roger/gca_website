const { db } = require('../_lib/firebase');

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const id = req.query.id;
  if (!id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid id' }));
  }

  // PATCH /api/applications/:id
  if (req.method === 'PATCH') {
    const update = await readBody(req);
    const docRef = db.collection('applications').doc(String(id));
    const doc = await docRef.get();
    if (!doc.exists) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    const changes = {};
    if (update.status)        changes.status        = String(update.status).trim();
    if (update.interviewDate) changes.interviewDate = String(update.interviewDate).trim();
    await docRef.update(changes);
    return res.end(JSON.stringify({ ...doc.data(), ...changes }));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
