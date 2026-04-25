const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

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

module.exports = router;
