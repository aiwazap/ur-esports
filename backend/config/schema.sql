-- UR Esports Database Schema (SQLite)

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  steam_id TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'pending' CHECK(role IN ('admin','player','coach','pending','team_lead','analyst','manager','ceo')),
  division TEXT DEFAULT 'cs2' CHECK(division IN ('cs2','val','all')),
  created_at TEXT DEFAULT (datetime('now','localtime')),
  approved_at TEXT,
  approved_by INTEGER
);

-- 选手表
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  real_name TEXT,
  steam_id TEXT,
  role TEXT,
  in_game_role TEXT,
  join_date TEXT,
  leave_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','left')),
  team_type TEXT DEFAULT 'roster' CHECK(team_type IN ('roster','staff','former')),
  hltv_url TEXT,
  bio TEXT,
  avatar_url TEXT,
  division TEXT DEFAULT 'cs2' CHECK(division IN ('cs2','val')),
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 赛事表 (每行=一张地图)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT NOT NULL,
  match_time TEXT,
  opponent TEXT NOT NULL,
  event_name TEXT,
  match_type TEXT DEFAULT 'scrim' CHECK(match_type IN ('official','scrim')),
  map_name TEXT,
  our_score INTEGER DEFAULT 0,
  their_score INTEGER DEFAULT 0,
  t_score INTEGER DEFAULT 0,
  ct_score INTEGER DEFAULT 0,
  pistol_rounds TEXT,
  result TEXT GENERATED ALWAYS AS (
    CASE WHEN our_score > their_score THEN 'win'
         WHEN our_score < their_score THEN 'loss'
         ELSE 'draw' END
  ) STORED,
  bo_format TEXT,
  notes TEXT,
  division TEXT DEFAULT 'cs2' CHECK(division IN ('cs2','val')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 选手单场数据表
CREATE TABLE IF NOT EXISTS player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  adr REAL DEFAULT 0,
  rating REAL DEFAULT 0,
  kast REAL DEFAULT 0,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- 即将赛事表
CREATE TABLE IF NOT EXISTS upcoming_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT NOT NULL,
  match_time TEXT,
  opponent TEXT NOT NULL,
  event_name TEXT,
  match_type TEXT DEFAULT 'official' CHECK(match_type IN ('official','scrim')),
  bo_format TEXT,
  notes TEXT,
  division TEXT DEFAULT 'cs2' CHECK(division IN ('cs2','val')),
  location_type TEXT DEFAULT 'online' CHECK(location_type IN ('online','offline','hybrid')),
  source_link TEXT,
  stage TEXT,
  region TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ============================================
-- 赛训分析模块
-- ============================================

-- 战术总表（参考数据，全量覆盖式导入）
CREATE TABLE IF NOT EXISTS tactics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tactic_id TEXT NOT NULL UNIQUE,
  map_name TEXT NOT NULL,
  team_side TEXT NOT NULL CHECK(team_side IN ('T','CT')),
  round_type TEXT,
  category TEXT NOT NULL,
  name TEXT,
  description TEXT,
  details TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tactic_id ON tactics(tactic_id);
CREATE INDEX IF NOT EXISTS idx_map_side ON tactics(map_name, team_side);
CREATE INDEX IF NOT EXISTS idx_round_type ON tactics(round_type);

-- 训练赛次表
CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_date TEXT NOT NULL,
  opponent TEXT NOT NULL,
  event_name TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(match_date, opponent)
);

-- 每日简报条目表
CREATE TABLE IF NOT EXISTS briefing_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  map_name TEXT NOT NULL,
  team_side TEXT NOT NULL CHECK(team_side IN ('T','CT')),
  tactic_id TEXT,
  round_type TEXT,
  priority TEXT DEFAULT '一般' CHECK(priority IN ('核心','重点','一般')),
  instruction TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_briefing_session ON briefing_items(session_id);
CREATE INDEX IF NOT EXISTS idx_briefing_tactic ON briefing_items(tactic_id);

-- 训练日志回合表
CREATE TABLE IF NOT EXISTS training_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  map_name TEXT NOT NULL,
  team_side TEXT NOT NULL CHECK(team_side IN ('T','CT')),
  round_type TEXT,
  command_text TEXT,
  execution_text TEXT,
  first_death_reason TEXT,
  issue_grenade INTEGER DEFAULT 0 CHECK(issue_grenade IN (0,1)),
  issue_position INTEGER DEFAULT 0 CHECK(issue_position IN (0,1)),
  issue_aim INTEGER DEFAULT 0 CHECK(issue_aim IN (0,1)),
  issue_comms INTEGER DEFAULT 0 CHECK(issue_comms IN (0,1)),
  issue_tactics INTEGER DEFAULT 0 CHECK(issue_tactics IN (0,1)),
  round_result TEXT CHECK(round_result IN ('win','loss')),
  players_involved TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rounds_session ON training_rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_rounds_map ON training_rounds(map_name);
CREATE INDEX IF NOT EXISTS idx_rounds_side ON training_rounds(team_side);

-- 特殊事件表（放假/对手弃权/调休等，每日简报地图字段检测）の
CREATE TABLE IF NOT EXISTS special_events (
  date TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 初始超级管理员账号 (密码: URAdmin2026!)
INSERT OR IGNORE INTO users (username, password_hash, steam_id, role, division, approved_at)
VALUES ('admin', '$2b$10$rQZ9uAVBv5Q5Z5Z5Z5Z5ZeKQZ9uAVBv5Q5Z5Z5Z5Z5ZeKQZ9uAVB', '00000000000000000', 'admin', 'all', datetime('now','localtime'));

-- ============================================
-- v2.1 新增模块
-- ============================================

-- 选手外设表
CREATE TABLE IF NOT EXISTS peripherals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE,
  keyboard TEXT,
  mouse TEXT,
  headset TEXT,
  mousepad TEXT,
  monitor TEXT,
  notes TEXT,
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- 库存管理表
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

-- 训练计划表
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

-- 对手情报表
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

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  config_key TEXT PRIMARY KEY NOT NULL,
  config_value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES ('founded_date', '2025-03-27', '分部成立日期');
INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES ('vrs_rank', '43', 'VRS Asia 排名');
