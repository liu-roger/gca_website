const { db } = require('../_lib/firebase');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatPostDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return MONTH_NAMES[mo - 1] + ' ' + d + ', ' + y;
}

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

  if (!db) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Database not configured. Set FIREBASE_SERVICE_ACCOUNT in environment variables.' }));
  }

  const id = parseInt(req.query.id, 10);
  if (!id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid id' }));
  }

  // PUT /api/posts/:id
  if (req.method === 'PUT') {
    const post = await readBody(req);

    const required = ['title', 'category', 'excerpt', 'author', 'date'];
    for (const f of required) {
      if (!post[f] || !String(post[f]).trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing field: ' + f }));
      }
    }

    const formattedDate = formatPostDate(post.date);
    if (!formattedDate) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid date' }));
    }

    const docRef = db.collection('posts').doc(String(id));
    const existing = (await docRef.get()).data();
    if (!existing) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    const hasBlocks  = Array.isArray(post.blocks) && post.blocks.length > 0;
    const hasContent = post.content && String(post.content).trim();
    if (!hasBlocks && !hasContent) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Missing field: blocks or content' }));
    }

    let blocks = [];
    let allText = '';
    if (hasBlocks) {
      blocks = post.blocks.filter(b => {
        if (b.type === 'text') { allText += ' ' + (b.content || ''); return !!b.content; }
        if (b.type === 'image') return !!b.src;
        return false;
      });
    } else {
      allText = String(post.content).trim();
      blocks = [{ type: 'text', content: allText }];
    }

    // Image: new upload URL > explicit imageSrc (keep existing) > null
    let image = null;
    if (post.image)    image = post.image;
    else if (post.imageSrc) image = post.imageSrc;
    else if (!post.hasOwnProperty('image') && !post.hasOwnProperty('imageSrc')) image = existing.image || null;

    const updated = {
      id: existing.id,
      title:    String(post.title).trim(),
      category: String(post.category).trim(),
      excerpt:  String(post.excerpt).trim(),
      author:   String(post.author).trim(),
      date:     formattedDate,
      readTime: Math.max(1, Math.ceil(allText.trim().split(/\s+/).length / 200)) + ' min read',
      image,
      blocks,
    };

    await docRef.set(updated);
    return res.end(JSON.stringify(updated));
  }

  // DELETE /api/posts/:id
  if (req.method === 'DELETE') {
    const docRef = db.collection('posts').doc(String(id));
    const doc = await docRef.get();
    if (!doc.exists) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    await docRef.delete();
    return res.end(JSON.stringify({ ok: true }));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
