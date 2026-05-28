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

// Category display helpers
const categoryMeta = {
  'equity': { name: 'Equity Research', section: 'investment-research', description: 'Deep-dive analysis on public equities — valuations, earnings, and investment theses.' },
  'fixed-income': { name: 'Fixed-Income Research', section: 'investment-research', description: 'Research on bonds, credit markets, interest rates, and fixed-income strategies.' },
  'career-paths': { name: 'Career Paths in Finance', section: 'career-paths', description: 'Guides, insights, and advice on building a career in the finance industry.' }
};

// Homepage — latest articles from all sections
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const equityArticles = queryAll(db,
    'SELECT id, title, author, category, created_at FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 6',
    ['equity']
  );
  const fiArticles = queryAll(db,
    'SELECT id, title, author, category, created_at FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 6',
    ['fixed-income']
  );
  const careerArticles = queryAll(db,
    'SELECT id, title, author, category, created_at FROM articles WHERE category = ? ORDER BY created_at DESC LIMIT 6',
    ['career-paths']
  );

  res.render('home', {
    title: 'Home',
    equityArticles,
    fiArticles,
    careerArticles
  });
});

// Section listing
router.get('/section/:category', (req, res) => {
  const db = req.app.locals.db;
  const category = req.params.category;
  if (!categoryMeta[category]) {
    return res.status(404).render('404', { title: 'Not Found' });
  }
  const articles = queryAll(db,
    'SELECT id, title, author, category, created_at FROM articles WHERE category = ? ORDER BY created_at DESC',
    [category]
  );

  const meta = categoryMeta[category];

  res.render('section', {
    title: meta.name,
    sectionName: meta.name,
    category,
    description: meta.description,
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
  const meta = categoryMeta[article.category] || { name: article.category, section: '' };
  res.render('article', {
    title: article.title,
    article,
    categoryName: meta.name
  });
});

module.exports = router;
