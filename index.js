// GCA Website — Static File Server
// Run: node index.js
// Serves at http://localhost:3000

require('dotenv').config();

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3000;
const PUBLIC    = path.join(__dirname, 'public');
const ROOT      = __dirname;
const DATA_DIR  = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const APPS_FILE  = path.join(DATA_DIR, 'applications.json');

const UPLOADS_DIR = path.join(PUBLIC, 'uploads');

// Ensure data directory and data files exist
if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(POSTS_FILE))  fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
if (!fs.existsSync(APPS_FILE))   fs.writeFileSync(APPS_FILE,  '[]', 'utf8');

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

function buildEmailHtml(firstName, bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1a1a1a;"><div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px;"><h2 style="margin:0;font-size:20px;color:#111;">Global Communication Association</h2></div><p style="font-size:16px;">Hi ${firstName},</p>${bodyHtml}<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Global Communication Association</div></div>`;
}

async function sendResendEmail(app, adminEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('RESEND_API_KEY not set — skipping email'); return; }

  let subject, html;
  if (app.status === 'Accepted') {
    subject = 'Your GCA Application — Congratulations!';
    html = buildEmailHtml(app.firstName, `<p style="font-size:16px;line-height:1.6;">We are pleased to inform you that your application to the <strong>Global Communication Association</strong> has been <strong style="color:#16a34a;">accepted</strong>.</p><p style="font-size:16px;line-height:1.6;">Welcome to the team! We will be in touch shortly with next steps.</p>`);
  } else if (app.status === 'Rejected') {
    subject = 'Your GCA Application — Update';
    html = buildEmailHtml(app.firstName, `<p style="font-size:16px;line-height:1.6;">Thank you for your interest in the <strong>Global Communication Association</strong> and for taking the time to apply.</p><p style="font-size:16px;line-height:1.6;">After careful consideration, we are unable to move forward with your application at this time. We appreciate your effort and encourage you to apply again in the future.</p>`);
  } else if (app.status === 'Interview Scheduled') {
    subject = 'Interview Request — Global Communication Association';
    html = buildEmailHtml(app.firstName, `<p style="font-size:16px;line-height:1.6;">We have reviewed your application to the <strong>Global Communication Association</strong> and would love to schedule an interview with you as the next step in our process.</p><p style="font-size:16px;line-height:1.6;"><strong>Please reply to this email with 2–3 dates and times that work for you</strong> and we will confirm a time as soon as possible.</p><p style="font-size:16px;line-height:1.6;">We look forward to speaking with you!</p>`);
  } else {
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'GCA Team <onboarding@resend.dev>',
        to: [app.email],
        reply_to: adminEmail || undefined,
        subject,
        html,
      }),
    });
    if (!res.ok) console.error('Resend error:', res.status, await res.text());
    else console.log('Email sent to', app.email, '— status:', app.status);
  } catch (e) {
    console.error('Failed to send email:', e.message);
  }
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

      var required = ['title', 'category', 'excerpt', 'author'];
      for (var i = 0; i < required.length; i++) {
        if (!post[required[i]] || !String(post[required[i]]).trim()) {
          json(res, 400, { error: 'Missing field: ' + required[i] }); return;
        }
      }
      var hasBlocks  = Array.isArray(post.blocks) && post.blocks.length > 0;
      var hasContent = post.content && String(post.content).trim();
      if (!hasBlocks && !hasContent) {
        json(res, 400, { error: 'Missing field: blocks or content' }); return;
      }

      fs.readFile(POSTS_FILE, 'utf8', function(err, data) {
        var posts = err ? [] : JSON.parse(data);
        var id = Date.now();

        // Handle optional cover image
        var imagePath = null;
        if (post.imageData && post.imageExt) {
          var ext = String(post.imageExt).toLowerCase().replace('.','');
          if (ext === 'jpg') ext = 'jpeg';
          if (ext === 'png' || ext === 'jpeg') {
            var filename = 'post-' + id + '-cover.' + ext;
            var buf = Buffer.from(String(post.imageData), 'base64');
            fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
            imagePath = '/uploads/' + filename;
          }
        }

        // Process content blocks (rich post body)
        var blocks  = [];
        var allText = '';
        if (hasBlocks) {
          var imgIdx = 0;
          post.blocks.forEach(function(block) {
            if (block.type === 'text' && block.content && String(block.content).trim()) {
              var c = String(block.content).trim();
              blocks.push({ type: 'text', content: c });
              allText += ' ' + c;
            } else if (block.type === 'image' && block.data && block.ext) {
              var bext = String(block.ext).toLowerCase().replace('.','');
              if (bext === 'jpg') bext = 'jpeg';
              if (bext === 'png' || bext === 'jpeg') {
                var bname = 'post-' + id + '-b' + imgIdx + '.' + bext;
                var bbuf  = Buffer.from(String(block.data), 'base64');
                fs.writeFileSync(path.join(UPLOADS_DIR, bname), bbuf);
                blocks.push({ type: 'image', src: '/uploads/' + bname });
                imgIdx++;
              }
            }
          });
        } else {
          allText = String(post.content).trim();
          blocks  = [{ type: 'text', content: allText }];
        }

        var newPost = {
          id:       id,
          title:    String(post.title).trim(),
          category: String(post.category).trim(),
          excerpt:  String(post.excerpt).trim(),
          author:   String(post.author).trim(),
          date:     new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
          readTime: Math.max(1, Math.ceil(allText.trim().split(/\s+/).length / 200)) + ' min read',
          image:    imagePath,
          blocks:   blocks,
        };
        posts.unshift(newPost);
        fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), function() {
          json(res, 201, newPost);
        });
      });
    });
    return;
  }

  // ── API: PUT /api/posts/:id ───────────────────────────────────────────────
  if (method === 'PUT' && urlPath.startsWith('/api/posts/')) {
    var putId = parseInt(urlPath.split('/')[3], 10);
    if (!putId) { json(res, 400, { error: 'Invalid id' }); return; }
    readBody(req, function(body) {
      var post;
      try { post = JSON.parse(body); } catch(e) { json(res, 400, { error: 'Invalid JSON' }); return; }

      var required = ['title', 'category', 'excerpt', 'author'];
      for (var i = 0; i < required.length; i++) {
        if (!post[required[i]] || !String(post[required[i]]).trim()) {
          json(res, 400, { error: 'Missing field: ' + required[i] }); return;
        }
      }
      var hasBlocks  = Array.isArray(post.blocks) && post.blocks.length > 0;
      var hasContent = post.content && String(post.content).trim();
      if (!hasBlocks && !hasContent) {
        json(res, 400, { error: 'Missing field: blocks or content' }); return;
      }

      fs.readFile(POSTS_FILE, 'utf8', function(err, data) {
        var posts = err ? [] : JSON.parse(data);
        var idx = -1;
        for (var i = 0; i < posts.length; i++) { if (posts[i].id === putId) { idx = i; break; } }
        if (idx === -1) { json(res, 404, { error: 'Not found' }); return; }
        var existing = posts[idx];

        // Cover image: new upload > explicit clear > keep existing
        var imagePath = existing.image || null;
        if (post.imageData && post.imageExt) {
          var ext = String(post.imageExt).toLowerCase().replace('.','');
          if (ext === 'jpg') ext = 'jpeg';
          if (ext === 'png' || ext === 'jpeg') {
            var filename = 'post-' + putId + '-cover-' + Date.now() + '.' + ext;
            var buf = Buffer.from(String(post.imageData), 'base64');
            fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
            imagePath = '/uploads/' + filename;
          }
        } else if (post.hasOwnProperty('imageSrc')) {
          imagePath = post.imageSrc || null;
        }

        // Process blocks
        var blocks = [];
        var allText = '';
        if (hasBlocks) {
          var imgIdx = 0;
          post.blocks.forEach(function(block) {
            if (block.type === 'text' && block.content && String(block.content).trim()) {
              var c = String(block.content).trim();
              blocks.push({ type: 'text', content: c });
              allText += ' ' + c;
            } else if (block.type === 'image') {
              if (block.data && block.ext) {
                var bext = String(block.ext).toLowerCase().replace('.','');
                if (bext === 'jpg') bext = 'jpeg';
                if (bext === 'png' || bext === 'jpeg') {
                  var bname = 'post-' + putId + '-b' + imgIdx + '-' + Date.now() + '.' + bext;
                  var bbuf  = Buffer.from(String(block.data), 'base64');
                  fs.writeFileSync(path.join(UPLOADS_DIR, bname), bbuf);
                  blocks.push({ type: 'image', src: '/uploads/' + bname });
                  imgIdx++;
                }
              } else if (block.src) {
                blocks.push({ type: 'image', src: block.src });
              }
            }
          });
        } else {
          allText = String(post.content).trim();
          blocks  = [{ type: 'text', content: allText }];
        }

        var updated = {
          id:       existing.id,
          title:    String(post.title).trim(),
          category: String(post.category).trim(),
          excerpt:  String(post.excerpt).trim(),
          author:   String(post.author).trim(),
          date:     existing.date,
          readTime: Math.max(1, Math.ceil(allText.trim().split(/\s+/).length / 200)) + ' min read',
          image:    imagePath,
          blocks:   blocks,
        };
        posts[idx] = updated;
        fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), function() {
          json(res, 200, updated);
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

  // ── API: PATCH /api/applications/:id ─────────────────────────────────────
  const appMatch = urlPath.match(/^\/api\/applications\/(\d+)$/);
  if (method === 'PATCH' && appMatch) {
    var appId = parseInt(appMatch[1]);
    readBody(req, function(body) {
      var update;
      try { update = JSON.parse(body); } catch(e) { json(res, 400, { error: 'Invalid JSON' }); return; }
      fs.readFile(APPS_FILE, 'utf8', function(err, data) {
        var apps = err ? [] : JSON.parse(data);
        var idx = apps.findIndex(function(a) { return a.id === appId; });
        if (idx === -1) { json(res, 404, { error: 'Not found' }); return; }
        if (update.status) apps[idx].status = String(update.status).trim();
        fs.writeFile(APPS_FILE, JSON.stringify(apps, null, 2), function() {
          var saved = apps[idx];
          json(res, 200, saved);
          // Fire-and-forget email
          sendResendEmail(saved, update.adminEmail || null);
        });
      });
    });
    return;
  }

  // ── API: GET /api/firebase-config ────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/firebase-config') {
    var config = {
      apiKey:            process.env.FIREBASE_API_KEY,
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      projectId:         process.env.FIREBASE_PROJECT_ID,
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId:             process.env.FIREBASE_APP_ID,
      measurementId:     process.env.FIREBASE_MEASUREMENT_ID,
    };
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' });
    res.end('window.firebaseConfig = ' + JSON.stringify(config) + ';');
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
