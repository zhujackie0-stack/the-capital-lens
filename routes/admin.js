const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for image uploads
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Accept any image MIME type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Multer config for DOCX uploads (memory storage for mammoth)
const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isDocx = ext === '.docx' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    cb(null, isDocx);
  }
});

// Helper: save a buffer as an image file and return its URL
function saveImageBuffer(buffer, extension) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = extension || '.png';
  const filename = 'docx-' + uniqueSuffix + ext;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);
  return '/uploads/' + filename;
}

// Helper: get file extension from content type
function getExtFromContentType(contentType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/x-emf': '.emf',
    'image/x-wmf': '.wmf'
  };
  return map[contentType] || '.png';
}

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
// DOCX UPLOAD (convert to HTML with images)
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
        ],
        // Save embedded images to disk instead of base64
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            const ext = getExtFromContentType(image.contentType);
            const buffer = Buffer.from(imageBuffer, 'base64');
            const url = saveImageBuffer(buffer, ext);
            return { src: url };
          });
        })
      }
    );

    res.json({
      html: result.value,
      messages: result.messages.filter(m => m.type === 'warning').map(m => m.message)
    });
  } catch (err) {
    console.error('DOCX conversion error:', err);
    res.status(500).json({ error: 'Failed to convert DOCX file: ' + err.message });
  }
});

module.exports = router;
