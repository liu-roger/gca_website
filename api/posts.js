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
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!db) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Database not configured. Set FIREBASE_SERVICE_ACCOUNT in environment variables.' }));
  }

  // GET /api/posts
  if (req.method === 'GET') {
    const snap = await db.collection('posts').orderBy('id', 'desc').get();
    return res.end(JSON.stringify(snap.docs.map(d => d.data())));
  }

  // POST /api/posts
  if (req.method === 'POST') {
    const post = await readBody(req);

    const required = ['title', 'category', 'excerpt', 'author'];
    for (const f of required) {
      if (!post[f] || !String(post[f]).trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing field: ' + f }));
      }
    }

    const hasBlocks  = Array.isArray(post.blocks) && post.blocks.length > 0;
    const hasContent = post.content && String(post.content).trim();
    if (!hasBlocks && !hasContent) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Missing field: blocks or content' }));
    }

    const id = Date.now();
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

    const newPost = {
      id,
      title:    String(post.title).trim(),
      category: String(post.category).trim(),
      excerpt:  String(post.excerpt).trim(),
      author:   String(post.author).trim(),
      date:     new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      readTime: Math.max(1, Math.ceil(allText.trim().split(/\s+/).length / 200)) + ' min read',
      image:    post.image || null,
      blocks,
    };

    await db.collection('posts').doc(String(id)).set(newPost);
    res.statusCode = 201;
    return res.end(JSON.stringify(newPost));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
