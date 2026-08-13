require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// e.g. BASE_PATH=/dropme when hosted at https://example.com/dropme instead of the domain root.
// Normalized to have no trailing slash ('' means root).
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const ROOT_URL = `${BASE_PATH}/`;
const LOGIN_URL = `${BASE_PATH}/login`;

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// Injects BASE_PATH into the HTML shell so asset links, fetch calls, and
// redirects generated client-side resolve correctly under a path prefix.
function renderPage(name) {
  const html = fs.readFileSync(path.join(__dirname, 'views', name), 'utf8');
  return html.replace(/__BASE_PATH__/g, BASE_PATH);
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

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(ROOT_URL);
  res.type('html').send(renderPage('login.html'));
});

router.get('/', requireAuthPage, (req, res) => {
  res.type('html').send(renderPage('app.html'));
});

router.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

router.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = loadUsers();
  const hash = users[username];
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.user = username;
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

app.use(BASE_PATH || '/', router);

app.listen(PORT, () => {
  console.log(`dropme listening on http://localhost:${PORT}${BASE_PATH}`);
});
