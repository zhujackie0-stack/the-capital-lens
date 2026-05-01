const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for image uploads
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype.split('/')[1]);
    cb(null, extOk || mimeOk);
  }
});

// Multer config for DOCX uploads (memory storage for mammoth)
const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.docx');
  }
});

// Helper: convert sql.js result to array of objects
function queryAll(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db, sql, params) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/capitallens/login');
}

// Login page
router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login', error: null });
});

// Login POST
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { username, password } = req.body;
  const user = queryOne(db, 'SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin/login', { title: 'Admin Login', error: 'Invalid username or password' });
  }

  req.session.user = { id: user.id, username: user.username, displayName: user.display_name, role: user.role };
  res.redirect('/capitallens/dashboard');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const articles = queryAll(db, 'SELECT * FROM articles ORDER BY created_at DESC');
  res.render('admin/dashboard', { title: 'Dashboard', articles });
});

// New article form
router.get('/new', requireAuth, (req, res) => {
  res.render('admin/editor', { title: 'New Article', article: null, error: null });
});

// Create article
router.post('/new', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const save = req.app.locals.saveDatabase;
  const { title, author, category, body } = req.body;

  if (!title || !author || !category || !body) {
    return res.render('admin/editor', {
      title: 'New Article',
      article: { title, author, category, body },
      error: 'All fields are required'
    });
  }

  db.run('INSERT INTO articles (title, author, body, category) VALUES (?, ?, ?, ?)', [title, author, body, category]);
  save(db);
  res.redirect('/capitallens/dashboard');
});

// Edit article form
router.get('/edit/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const article = queryOne(db, 'SELECT * FROM articles WHERE id = ?', [parseInt(req.params.id)]);
  if (!article) return res.redirect('/capitallens/dashboard');
  res.render('admin/editor', { title: 'Edit Article', article, error: null });
});

// Update article
router.post('/edit/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const save = req.app.locals.saveDatabase;
  const { title, author, category, body } = req.body;

  if (!title || !author || !category || !body) {
    return res.render('admin/editor', {
      title: 'Edit Article',
      article: { id: req.params.id, title, author, category, body },
      error: 'All fields are required'
    });
  }

  db.run('UPDATE articles SET title = ?, author = ?, body = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    title, author, body, category, parseInt(req.params.id)
  ]);
  save(db);
  res.redirect('/capitallens/dashboard');
});

// Delete article
router.post('/delete/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const save = req.app.locals.saveDatabase;
  db.run('DELETE FROM articles WHERE id = ?', [parseInt(req.params.id)]);
  save(db);
  res.redirect('/capitallens/dashboard');
});

// ============================================
// IMAGE UPLOAD (for inline images in editor)
// ============================================
router.post('/upload-image', requireAuth, imageUpload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided or invalid format' });
  }
  const url = '/uploads/' + req.file.filename;
  res.json({ url });
});

// ============================================
// DOCX UPLOAD (convert to HTML)
// ============================================
router.post('/upload-docx', requireAuth, docxUpload.single('docx'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No .docx file provided' });
  }

  try {
    const result = await mammoth.convertToHtml(
      { buffer: req.file.buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh",
          "p[style-name='Heading 3'] => h4:fresh",
          "p[style-name='Quote'] => blockquote > p:fresh",
          "p[style-name='Intense Quote'] => blockquote > p:fresh"
        ]
      }
    );

    res.json({
      html: result.value,
      messages: result.messages.filter(m => m.type === 'warning').map(m => m.message)
    });
  } catch (err) {
    console.error('DOCX conversion error:', err);
    res.status(500).json({ error: 'Failed to convert DOCX file' });
  }
});

module.exports = router;
