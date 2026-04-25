const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase, saveDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy (required for secure cookies behind Render's reverse proxy)
if (isProduction) {
  app.set('trust proxy', 1);
}

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'finance-blog-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Make session user available to all templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Initialize database then start server
initDatabase().then((db) => {
  // Make db and save function accessible to routes
  app.locals.db = db;
  app.locals.saveDatabase = saveDatabase;

  // Routes
  const publicRoutes = require('./routes/public');
  const adminRoutes = require('./routes/admin');

  app.use('/', publicRoutes);
  app.use('/capitallens', adminRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ✦ Finance Blog running at http://localhost:${PORT}\n`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
