/**
 * UR-ESPORTS v2.1 数据库迁移
 * 新增: player_stats.hs, peripherals, inventory, training_plans, opponent_intel, system_config
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'ur_esports.db');
console.log(`📦 数据库路径: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// 1. player_stats 新增 hs 列
// ============================================================
console.log('\n[1/6] 扩展 player_stats 表 (新增 hs 列)...');
try {
  db.prepare(`ALTER TABLE player_stats ADD COLUMN hs INTEGER DEFAULT 0`).run();
  console.log('  ✅ hs 列已添加');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('  ⏭️  hs 列已存在，跳过');
  } else {
    throw e;
  }
}

// ============================================================
// 2. 新建选手外设表
// ============================================================
console.log('\n[2/6] 创建 peripherals 表...');
db.exec(`
  CREATE TABLE IF NOT EXISTS peripherals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL UNIQUE,
    keyboard TEXT,
    mouse TEXT,
    headset TEXT,
    mousepad TEXT,
    monitor TEXT,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  );
`);
// 补充 updated_by 列（v2.1 后续更新）
try {
  db.prepare(`ALTER TABLE peripherals ADD COLUMN updated_by INTEGER`).run();
} catch (e) { /* ignore duplicate */ }
console.log('  ✅ peripherals 表已创建');

// ============================================================
// 3. 新建库存管理表
// ============================================================
console.log('\n[3/6] 创建 inventory 表...');
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL,
    item_name TEXT,
    current_count INTEGER DEFAULT 0,
    max_count INTEGER DEFAULT 0,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    updated_by INTEGER
  );
`);
console.log('  ✅ inventory 表已创建');

// ============================================================
// 4. 新建训练计划表
// ============================================================
console.log('\n[4/6] 创建 training_plans 表...');
db.exec(`
  CREATE TABLE IF NOT EXISTS training_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    tags TEXT,
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_training_plans_date ON training_plans(plan_date);
`);
console.log('  ✅ training_plans 表已创建');

// ============================================================
// 5. 新建对手情报表
// ============================================================
console.log('\n[5/6] 创建 opponent_intel 表...');
db.exec(`
  CREATE TABLE IF NOT EXISTS opponent_intel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opponent_name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    hltv_url TEXT,
    vrs_rank INTEGER,
    region TEXT DEFAULT 'Asia',
    map_preference TEXT,
    core_players TEXT,
    h2h_wins INTEGER DEFAULT 0,
    h2h_losses INTEGER DEFAULT 0,
    h2h_draws INTEGER DEFAULT 0,
    last_match_date TEXT,
    last_match_score TEXT,
    last_match_result TEXT,
    notes TEXT,
    image_url TEXT,
    source_link TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_opponent_intel_name ON opponent_intel(opponent_name);
`);
console.log('  ✅ opponent_intel 表已创建');

// ============================================================
// 6. 新建系统配置表
// ============================================================
console.log('\n[6/6] 创建 system_config 表...');
db.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    config_key TEXT PRIMARY KEY NOT NULL,
    config_value TEXT,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);
// 插入默认配置
db.prepare(`INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)`).run(
  'founded_date', '2025-03-27', '分部成立日期'
);
db.prepare(`INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)`).run(
  'vrs_rank', '43', 'VRS Asia 排名 (手动覆盖值，定时任务会更新)'
);
console.log('  ✅ system_config 表已创建 (含默认配置)');

// ============================================================
// 完成
// ============================================================
db.close();
console.log('\n==============================');
console.log('  ✅ 数据库迁移 v2.1 完成！');
console.log('==============================\n');
