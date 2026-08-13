require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const SHARES_FILE = path.join(__dirname, 'shares.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

// e.g. BASE_PATH=/dropme when hosted at https://example.com/dropme instead of the domain root.
// Normalized to have no trailing slash ('' means root).
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const ROOT_URL = `${BASE_PATH}/`;
const LOGIN_URL = `${BASE_PATH}/login`;
const ADMIN_URL = `${BASE_PATH}/admin`;

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Usernames are never case-sensitive: always stored and looked up lowercase.
function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : username;
}

// Users predate the admin flag as plain "username": "bcryptHash" entries;
// normalize both that shape and the newer { hash, isAdmin } shape here.
function getUserRecord(users, username) {
  const raw = users[normalizeUsername(username)];
  if (!raw) return null;
  if (typeof raw === 'string') return { hash: raw, isAdmin: false };
  return { hash: raw.hash, isAdmin: !!raw.isAdmin };
}

function loadShares() {
  if (!fs.existsSync(SHARES_FILE)) return {};
  return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8'));
}

function saveShares(shares) {
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

function findShareToken(shares, username, filename) {
  return (
    Object.keys(shares).find(
      (token) => shares[token].username === username && shares[token].filename === filename
    ) || null
  );
}

// Returns the existing share token for this file, or mints and stores a new one.
function getOrCreateShareToken(username, filename) {
  const shares = loadShares();
  const existing = findShareToken(shares, username, filename);
  if (existing) return existing;

  let token;
  do {
    token = crypto.randomBytes(24).toString('hex');
  } while (shares[token]);

  shares[token] = { username, filename };
  saveShares(shares);
  return token;
}

// Revokes any share for this file so its old public URL stops working.
function revokeShare(username, filename) {
  const shares = loadShares();
  const token = findShareToken(shares, username, filename);
  if (token) {
    delete shares[token];
    saveShares(shares);
  }
}

// Injects BASE_PATH (and any extra __VAR__ placeholders) into the HTML shell
// so asset links, fetch calls, and redirects generated client-side resolve
// correctly under a path prefix.
function renderPage(name, vars = {}) {
  let html = fs.readFileSync(path.join(__dirname, 'views', name), 'utf8');
  html = html.replace(/__BASE_PATH__/g, BASE_PATH);
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`__${key}__`, value);
  }
  return html;
}

function listFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const stat = fs.statSync(path.join(dir, entry.name));
      return { name: entry.name, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function listUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return [];

  return fs
    .readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((username) => ({
      username,
      files: listFilesIn(path.join(UPLOADS_DIR, username)),
    }));
}

const app = express();
app.set('trust proxy', 1);

app.use(express.json());

const router = express.Router();

router.use(express.static(path.join(__dirname, 'public')));

router.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    path: BASE_PATH || '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

function requireAuthPage(req, res, next) {
  if (req.session.user) return next();
  res.redirect(LOGIN_URL);
}

function requireAuthApi(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function requireAdminPage(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect(ROOT_URL);
}

function requireAdminApi(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(403).json({ error: 'Forbidden' });
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(ROOT_URL);
  res.type('html').send(renderPage('login.html'));
});

router.get('/', requireAuthPage, (req, res) => {
  if (req.session.isAdmin) return res.redirect(ADMIN_URL);
  res.type('html').send(renderPage('app.html'));
});

router.get('/admin', requireAuthPage, requireAdminPage, (req, res) => {
  res.type('html').send(renderPage('admin.html', { USERNAME: req.session.user }));
});

// Public, unauthenticated download via a share token — anyone with the link can hit this.
router.get('/s/:token', (req, res) => {
  const shares = loadShares();
  const entry = shares[req.params.token];
  if (!entry) return res.status(404).send('Not found');

  const filePath = path.join(UPLOADS_DIR, entry.username, entry.filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  res.download(filePath, entry.filename);
});

router.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null, isAdmin: !!req.session.isAdmin });
});

router.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const normalized = normalizeUsername(username);
  const users = loadUsers();
  const record = getUserRecord(users, normalized);
  if (!record || !bcrypt.compareSync(password, record.hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.user = normalized;
  req.session.isAdmin = record.isAdmin;
  res.json({ ok: true });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const userDir = path.join(UPLOADS_DIR, req.session.user);
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename(req, file, cb) {
    // Strip any directory components so a crafted filename can't escape the user's upload dir.
    cb(null, path.basename(file.originalname));
  },
});

const upload = multer({ storage });

router.post('/api/upload', requireAuthApi, upload.array('files'), (req, res) => {
  const names = (req.files || []).map((f) => f.filename);
  res.json({ ok: true, files: names });
});

router.get('/api/files', requireAuthApi, (req, res) => {
  res.json({ files: listFilesIn(path.join(UPLOADS_DIR, req.session.user)) });
});

router.get('/api/download/:filename', requireAuthApi, (req, res) => {
  // path.basename strips any directory components, so this can't escape the user's own upload dir.
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.session.user, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  res.download(filePath, filename);
});

router.delete('/api/files/:filename', requireAuthApi, (req, res) => {
  // path.basename strips any directory components, so this can't escape the user's own upload dir.
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.session.user, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  revokeShare(req.session.user, filename);
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

router.get('/api/share/:filename', requireAuthApi, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.session.user, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  const token = findShareToken(loadShares(), req.session.user, filename);
  res.json({ token });
});

router.post('/api/share/:filename', requireAuthApi, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, req.session.user, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({ token: getOrCreateShareToken(req.session.user, filename) });
});

router.delete('/api/share/:filename', requireAuthApi, (req, res) => {
  const filename = path.basename(req.params.filename);
  revokeShare(req.session.user, filename);
  res.json({ ok: true });
});

router.get('/api/admin/files', requireAuthApi, requireAdminApi, (req, res) => {
  res.json({ users: listUploads() });
});

router.get('/api/admin/download/:username/:filename', requireAuthApi, requireAdminApi, (req, res) => {
  // path.basename strips any directory components, so neither param can escape UPLOADS_DIR.
  const username = path.basename(req.params.username);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, username, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  res.download(filePath, filename);
});

router.delete('/api/admin/files/:username/:filename', requireAuthApi, requireAdminApi, (req, res) => {
  // path.basename strips any directory components, so neither param can escape UPLOADS_DIR.
  const username = path.basename(req.params.username);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, username, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  revokeShare(username, filename);
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

router.get('/api/admin/share/:username/:filename', requireAuthApi, requireAdminApi, (req, res) => {
  const username = path.basename(req.params.username);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, username, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  const token = findShareToken(loadShares(), username, filename);
  res.json({ token });
});

router.post('/api/admin/share/:username/:filename', requireAuthApi, requireAdminApi, (req, res) => {
  const username = path.basename(req.params.username);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, username, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({ token: getOrCreateShareToken(username, filename) });
});

router.delete('/api/admin/share/:username/:filename', requireAuthApi, requireAdminApi, (req, res) => {
  const username = path.basename(req.params.username);
  const filename = path.basename(req.params.filename);
  revokeShare(username, filename);
  res.json({ ok: true });
});

router.get('/api/admin/users', requireAuthApi, requireAdminApi, (req, res) => {
  const users = loadUsers();
  const list = Object.keys(users)
    .sort()
    .map((username) => ({ username, isAdmin: getUserRecord(users, username).isAdmin }));
  res.json({ users: list });
});

router.post('/api/admin/users', requireAuthApi, requireAdminApi, (req, res) => {
  const { password, isAdmin } = req.body || {};
  const username = normalizeUsername(req.body?.username);

  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, hyphens and underscores.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password cannot be empty.' });
  }

  const users = loadUsers();
  if (users[username]) {
    return res.status(409).json({ error: 'That username already exists.' });
  }

  users[username] = { hash: bcrypt.hashSync(password, 10), isAdmin: !!isAdmin };
  saveUsers(users);
  res.json({ ok: true });
});

router.put('/api/admin/users/:username/password', requireAuthApi, requireAdminApi, (req, res) => {
  const username = normalizeUsername(req.params.username);
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: 'Password cannot be empty.' });
  }

  const users = loadUsers();
  const record = getUserRecord(users, username);
  if (!record) {
    return res.status(404).json({ error: 'User not found.' });
  }

  users[username] = { hash: bcrypt.hashSync(password, 10), isAdmin: record.isAdmin };
  saveUsers(users);
  res.json({ ok: true });
});

router.delete('/api/admin/users/:username', requireAuthApi, requireAdminApi, (req, res) => {
  const username = normalizeUsername(req.params.username);

  if (username === req.session.user) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const users = loadUsers();
  if (!users[username]) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Intentionally leave uploads/<username>/ on disk — only the login is removed.
  delete users[username];
  saveUsers(users);
  res.json({ ok: true });
});

app.use(BASE_PATH || '/', router);

app.listen(PORT, () => {
  console.log(`dropme listening on http://localhost:${PORT}${BASE_PATH}`);
});
