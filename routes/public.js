const express = require('express');
const router = express.Router();

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

// Homepage — latest articles from both sections
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const equityArticles = queryAll(db,
    'SELECT id, title, author, category, created_at, substr(body, 1, 200) as excerpt FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 6',
    ['equity']
  );
  const fiArticles = queryAll(db,
    'SELECT id, title, author, category, created_at, substr(body, 1, 200) as excerpt FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 6',
    ['fixed-income']
  );

  res.render('home', {
    title: 'Home',
    equityArticles,
    fiArticles
  });
});

// Section listing
router.get('/section/:category', (req, res) => {
  const db = req.app.locals.db;
  const category = req.params.category;
  if (!['equity', 'fixed-income'].includes(category)) {
    return res.status(404).render('404', { title: 'Not Found' });
  }
  const articles = queryAll(db,
    'SELECT id, title, author, category, created_at, substr(body, 1, 300) as excerpt FROM articles WHERE category = ? ORDER BY created_at DESC',
    [category]
  );

  const sectionName = category === 'equity' ? 'Equity Research' : 'Fixed-Income Research';

  res.render('section', {
    title: sectionName,
    sectionName,
    category,
    articles
  });
});

// Single article
router.get('/article/:id', (req, res) => {
  const db = req.app.locals.db;
  const article = queryOne(db, 'SELECT * FROM articles WHERE id = ?', [parseInt(req.params.id)]);
  if (!article) {
    return res.status(404).render('404', { title: 'Article Not Found' });
  }
  res.render('article', {
    title: article.title,
    article
  });
});

module.exports = router;
