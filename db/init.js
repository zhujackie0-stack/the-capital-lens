const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'blog.db');

async function initDatabase() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('equity', 'fixed-income')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin user if none exists
  const result = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (result.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)', [
      'admin', hash, 'Admin', 'admin'
    ]);
    console.log('✓ Default admin user created (admin / admin123)');
  }

  // Save to disk
  saveDatabase(db);

  return db;
}

function saveDatabase(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { initDatabase, saveDatabase };
