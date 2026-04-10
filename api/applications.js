const { db } = require('./_lib/firebase');

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

  // GET /api/applications
  if (req.method === 'GET') {
    const snap = await db.collection('applications').orderBy('id', 'desc').get();
    return res.end(JSON.stringify(snap.docs.map(d => d.data())));
  }

  // POST /api/applications
  if (req.method === 'POST') {
    const app = await readBody(req);

    const required = ['firstName', 'lastName', 'email'];
    for (const f of required) {
      if (!app[f] || !String(app[f]).trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing field: ' + f }));
      }
    }

    const id = Date.now();
    const newApp = {
      id,
      firstName:   String(app.firstName).trim(),
      lastName:    String(app.lastName).trim(),
      email:       String(app.email).trim(),
      org:         String(app.org  || '').trim(),
      role:        String(app.role || '').trim(),
      why:         String(app.why  || '').trim(),
      submittedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      status:      'Pending',
    };

    await db.collection('applications').doc(String(id)).set(newApp);
    res.statusCode = 201;
    return res.end(JSON.stringify(newApp));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
