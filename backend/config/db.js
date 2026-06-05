const path = require('path');

const Database = require('better-sqlite3');


const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ur_esports.db');
const fs = require('fs');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = DELETE');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

// SQL translation: MySQL -> SQLite
function translateSQL(sql) {
  return sql
    .replace(/NOW\(\)/gi, "datetime('now','localtime')")
    .replace(/CURRENT_TIMESTAMP/gi, "datetime('now','localtime')")
    .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '')
    .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
    .replace(/ENGINE=InnoDB\s*/gi, '')
    .replace(/DEFAULT CHARSET=utf8mb4\s*/gi, '')
    .replace(/INSERT IGNORE/gi, 'INSERT OR IGNORE')
    .replace(/CHARACTER SET utf8mb4\s*/gi, '')
    .replace(/COLLATE utf8mb4_unicode_ci\s*/gi, '');
}

// Wrapper that mimics mysql2's pool.query() API
const pool = {
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      try {
        const translated = translateSQL(sql);
        const stmt = sqlite.prepare(translated);
        const trimmed = sql.trim().toUpperCase();

        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA')) {
          const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
          resolve([rows]);
        } else if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE') || trimmed.startsWith('REPLACE')) {
          const result = params.length > 0 ? stmt.run(...params) : stmt.run();
          resolve([{ insertId: result.lastInsertRowid, affectedRows: result.changes }]);
        } else {
          // CREATE, ALTER, DROP, etc.
          const result = params.length > 0 ? stmt.run(...params) : stmt.run();
          resolve([result]);
        }
      } catch (e) {
        reject(e);
      }
    });
  },

  // Mimic mysql2's getConnection for transactions
  getConnection() {
    return Promise.resolve({
      query: pool.query,
      beginTransaction() {
        sqlite.prepare('BEGIN TRANSACTION').run();
        return Promise.resolve();
      },
      commit() {
        sqlite.prepare('COMMIT').run();
        return Promise.resolve();
      },
      rollback() {
        try { sqlite.prepare('ROLLBACK').run(); } catch {}
        return Promise.resolve();
      },
      release() { /* no-op */ },
    });
  },
};

module.exports = pool;
