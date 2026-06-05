// 创建默认管理员账号 (SQLite)
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

async function setup() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'ur_esports.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const hash = bcrypt.hashSync('admin123', 10);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
    console.log('管理员密码已重置');
  } else {
    db.prepare(`INSERT INTO users (username, password_hash, steam_id, role, division)
      VALUES (?, ?, ?, 'admin', 'all')`).run('admin', hash, 'ADMIN0000000000001');
    console.log('管理员账号已创建');
  }

  console.log('用户名: admin');
  console.log('密码: admin123');
  db.close();
}

setup().catch(e => { console.error(e.message); process.exit(1); });
