// GCA Website — Static File Server
// Run: node index.js
// Serves at http://localhost:3000

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3000;
const PUBLIC    = path.join(__dirname, 'public');
const ROOT      = __dirname;

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

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // brand_assets and other root-level static files served from project root
  const isRootAsset = urlPath.startsWith('/brand_assets/');
  const filePath = isRootAsset
    ? path.join(ROOT, urlPath)
    : path.join(PUBLIC, urlPath);

  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log('GCA \u2014 http://localhost:' + PORT);
});
