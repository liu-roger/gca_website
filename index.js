// GCA Website — Static File Server
// Run: node index.js
// Serves at http://localhost:3000

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3000;
const PUBLIC    = path.join(__dirname, 'public');
const ROOT      = __dirname;
const DATA_DIR  = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const APPS_FILE  = path.join(DATA_DIR, 'applications.json');

// Ensure data directory and data files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
if (!fs.existsSync(APPS_FILE))  fs.writeFileSync(APPS_FILE,  '[]', 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.json': 'application/json',
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, cb) {
  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', function() { cb(Buffer.concat(chunks).toString()); });
}

const server = http.createServer(function (req, res) {
  const method  = req.method;
  let urlPath   = decodeURIComponent(req.url.split('?')[0]);

  // ── API: GET /api/posts ───────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/posts') {
    fs.readFile(POSTS_FILE, 'utf8', function(err, data) {
      json(res, 200, err ? [] : JSON.parse(data));
    });
    return;
  }

  // ── API: POST /api/posts ──────────────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/posts') {
    readBody(req, function(body) {
      var post;
      try { post = JSON.parse(body); } catch(e) { json(res, 400, { error: 'Invalid JSON' }); return; }

      var required = ['title', 'category', 'excerpt', 'content', 'author'];
      for (var i = 0; i < required.length; i++) {
        if (!post[required[i]] || !String(post[required[i]]).trim()) {
          json(res, 400, { error: 'Missing field: ' + required[i] }); return;
        }
      }

      fs.readFile(POSTS_FILE, 'utf8', function(err, data) {
        var posts = err ? [] : JSON.parse(data);
        var newPost = {
          id:       Date.now(),
          title:    String(post.title).trim(),
          category: String(post.category).trim(),
          excerpt:  String(post.excerpt).trim(),
          content:  String(post.content).trim(),
          author:   String(post.author).trim(),
          date:     new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
          readTime: Math.max(1, Math.ceil(String(post.content).trim().split(/\s+/).length / 200)) + ' min read',
        };
        posts.unshift(newPost);
        fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), function() {
          json(res, 201, newPost);
        });
      });
    });
    return;
  }

  // ── API: DELETE /api/posts/:id ────────────────────────────────────────────
  if (method === 'DELETE' && urlPath.startsWith('/api/posts/')) {
    var id = parseInt(urlPath.split('/')[3], 10);
    if (!id) { json(res, 400, { error: 'Invalid id' }); return; }
    fs.readFile(POSTS_FILE, 'utf8', function(err, data) {
      var posts = err ? [] : JSON.parse(data);
      var next  = posts.filter(function(p) { return p.id !== id; });
      if (next.length === posts.length) { json(res, 404, { error: 'Not found' }); return; }
      fs.writeFile(POSTS_FILE, JSON.stringify(next, null, 2), function() {
        json(res, 200, { ok: true });
      });
    });
    return;
  }

  // ── API: GET /api/applications ────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/applications') {
    fs.readFile(APPS_FILE, 'utf8', function(err, data) {
      json(res, 200, err ? [] : JSON.parse(data));
    });
    return;
  }

  // ── API: POST /api/applications ───────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/applications') {
    readBody(req, function(body) {
      var app;
      try { app = JSON.parse(body); } catch(e) { json(res, 400, { error: 'Invalid JSON' }); return; }

      var required = ['firstName', 'lastName', 'email'];
      for (var i = 0; i < required.length; i++) {
        if (!app[required[i]] || !String(app[required[i]]).trim()) {
          json(res, 400, { error: 'Missing field: ' + required[i] }); return;
        }
      }

      fs.readFile(APPS_FILE, 'utf8', function(err, data) {
        var apps = err ? [] : JSON.parse(data);
        var newApp = {
          id:          Date.now(),
          firstName:   String(app.firstName).trim(),
          lastName:    String(app.lastName).trim(),
          email:       String(app.email).trim(),
          org:         String(app.org || '').trim(),
          role:        String(app.role || '').trim(),
          why:         String(app.why || '').trim(),
          submittedAt: new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
          status:      'Pending',
        };
        apps.unshift(newApp);
        fs.writeFile(APPS_FILE, JSON.stringify(apps, null, 2), function() {
          json(res, 201, newApp);
        });
      });
    });
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────────
  if (urlPath === '/') urlPath = '/index.html';

  const isRootAsset = urlPath.startsWith('/brand_assets/');
  const filePath    = isRootAsset ? path.join(ROOT, urlPath) : path.join(PUBLIC, urlPath);
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log('GCA \u2014 http://localhost:' + PORT);
});
