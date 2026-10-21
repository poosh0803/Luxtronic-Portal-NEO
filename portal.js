const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;

loadEnvFile(path.join(ROOT, '.env'));

const PORT = process.env.PORT || 3000;

const REDIRECTS = {
  '/links/mastex-price-list': process.env.MASTEX_PRICE_LIST_URL,
};

const DATA_DIR = path.join(ROOT, 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const MAX_NOTIFICATIONS = 200;
const VALID_LEVELS = ['info', 'warning', 'error'];

function readNotifications() {
  try {
    return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeNotifications(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(list, null, 2));
}

function readJsonBody(req, callback) {
  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1e6) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on('end', () => {
    if (tooLarge) return;
    try {
      callback(null, body ? JSON.parse(body) : {});
    } catch (err) {
      callback(err);
    }
  });
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function handleGetNotifications(res) {
  sendJson(res, 200, readNotifications());
}

function handleDeleteNotification(res, id) {
  const list = readNotifications();
  const next = list.filter((n) => n.id !== id);
  if (next.length === list.length) {
    return sendJson(res, 404, { error: 'Notification not found' });
  }
  writeNotifications(next);
  sendJson(res, 200, { deleted: id });
}

function handlePostNotification(req, res) {
  readJsonBody(req, (err, data) => {
    if (err) return sendJson(res, 400, { error: 'Invalid JSON body' });

    const { source, title, message, level, url } = data || {};
    if (!source || !title || !message) {
      return sendJson(res, 400, { error: 'source, title, and message are required' });
    }

    const notification = {
      id: `n_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      source: String(source).slice(0, 50),
      level: VALID_LEVELS.includes(level) ? level : 'info',
      title: String(title).slice(0, 200),
      message: String(message).slice(0, 1000),
      url: url ? String(url).slice(0, 500) : null,
      createdAt: new Date().toISOString(),
    };

    const list = readNotifications();
    list.unshift(notification);
    if (list.length > MAX_NOTIFICATIONS) list.length = MAX_NOTIFICATIONS;
    writeNotifications(list);

    sendJson(res, 201, notification);
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/api/notifications' && req.method === 'GET') {
    return handleGetNotifications(res);
  }
  if (urlPath === '/api/notifications' && req.method === 'POST') {
    return handlePostNotification(req, res);
  }
  if (urlPath.startsWith('/api/notifications/') && req.method === 'DELETE') {
    return handleDeleteNotification(res, urlPath.slice('/api/notifications/'.length));
  }

  if (Object.prototype.hasOwnProperty.call(REDIRECTS, urlPath)) {
    const target = REDIRECTS[urlPath];
    if (!target) return send(res, 502, 'Redirect target not configured');
    return send(res, 302, '', { Location: target });
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return fs.readFile(path.join(ROOT, '404.html'), (err404, data404) => {
        if (err404) return send(res, 404, 'Not found');
        send(res, 404, data404, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  });
});

server.listen(PORT, () => {
  console.log(`Luxtronic Portal NEO running at http://localhost:${PORT}`);
});
