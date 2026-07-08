-- 整份脚本用事务包裹：任一语句失败则全部回滚，避免半成品库
BEGIN TRANSACTION;

-- UR Esports Database Schema (SQLite)
-- 本文件为 2026-07-01 以实际线上库（3001/3000，二者结构完全一致）为唯一事实来源重写
-- 生成方式：从实际库 `.schema` 原样提取全部 42 张表+索引，逐一核对差异后合并，非手写臆测

-- players
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
, birth_date TEXT, sort_order INTEGER, game_steam_id TEXT, leave_reason TEXT, hometown TEXT, destination TEXT, id_card TEXT, phone TEXT, steam_id64 TEXT, id_5e TEXT, id_pw TEXT, id_faceit_sea TEXT, id_faceit_eu TEXT, roster_status TEXT DEFAULT 'starter');

-- matches
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
, opponent_players TEXT DEFAULT NULL, tournament_id INTEGER, stage_id INTEGER, is_walkover INTEGER DEFAULT 0, map_order INTEGER, pick_type TEXT, bp_json TEXT);

-- player_stats
CREATE TABLE IF NOT EXISTS player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  adr REAL DEFAULT 0,
  rating REAL DEFAULT 0,
  kast REAL DEFAULT 0, hs INTEGER DEFAULT 0, assists INTEGER DEFAULT 0, hs_pct INTEGER DEFAULT 0,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- upcoming_matches
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
  created_at TEXT DEFAULT (datetime('now','localtime'))
, signup_method TEXT DEFAULT '', signup_deadline TEXT DEFAULT '', opponent_rank TEXT DEFAULT '');

-- operation_logs
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- tactics
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

-- training_sessions
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

-- briefing_items
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

-- training_rounds
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

-- special_events
CREATE TABLE IF NOT EXISTS special_events (date TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, note TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')));

-- system_config
CREATE TABLE IF NOT EXISTS system_config (
  config_key TEXT PRIMARY KEY NOT NULL,
  config_value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- peripherals
CREATE TABLE IF NOT EXISTS peripherals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE,
  keyboard TEXT, mouse TEXT, headset TEXT, mousepad TEXT, monitor TEXT, notes TEXT,
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- inventory
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL, item_name TEXT,
  current_count INTEGER DEFAULT 0, max_count INTEGER DEFAULT 0, notes TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime')), updated_by INTEGER
);

-- training_plans
CREATE TABLE IF NOT EXISTS training_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_date TEXT NOT NULL, start_time TEXT, end_time TEXT,
  title TEXT NOT NULL, subtitle TEXT, tags TEXT, sort_order INTEGER DEFAULT 0,
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_training_plans_date ON training_plans(plan_date);

-- opponent_intel
CREATE TABLE IF NOT EXISTS opponent_intel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opponent_name TEXT NOT NULL UNIQUE, display_name TEXT, hltv_url TEXT, vrs_rank INTEGER,
  region TEXT DEFAULT 'Asia', map_preference TEXT, core_players TEXT,
  h2h_wins INTEGER DEFAULT 0, h2h_losses INTEGER DEFAULT 0, h2h_draws INTEGER DEFAULT 0,
  last_match_date TEXT, last_match_score TEXT, last_match_result TEXT, notes TEXT,
  image_url TEXT, source_link TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_opponent_intel_name ON opponent_intel(opponent_name);

-- trial_players
CREATE TABLE IF NOT EXISTS trial_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      ign TEXT,
      nationality TEXT DEFAULT '',
      age INTEGER DEFAULT 0,
      steam_id TEXT DEFAULT '',
      faceit TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      wechat TEXT DEFAULT '',
      translator TEXT DEFAULT '',
      translator_phone TEXT DEFAULT '',
      flight_info TEXT DEFAULT '',
      room_no TEXT DEFAULT '',
      workstation TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    , form_json TEXT DEFAULT '', medical_report TEXT DEFAULT '');

-- trial_contacts
CREATE TABLE IF NOT EXISTS trial_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      contact_person TEXT DEFAULT '',
      contact_date TEXT DEFAULT '',
      checklist_json TEXT DEFAULT '[]',
      chinese_listening INTEGER DEFAULT 0,
      chinese_speaking INTEGER DEFAULT 0,
      chinese_notes TEXT DEFAULT '',
      q1 TEXT DEFAULT '',
      q2 TEXT DEFAULT '',
      q3 TEXT DEFAULT '',
      q4 TEXT DEFAULT '',
      q5 TEXT DEFAULT '',
      q6 TEXT DEFAULT '',
      q7 TEXT DEFAULT '',
      q8 TEXT DEFAULT '',
      handler_sign TEXT DEFAULT '',
      manager_confirm TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (player_id) REFERENCES trial_players(id)
    );

-- trial_scores
CREATE TABLE IF NOT EXISTS trial_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      score_date TEXT DEFAULT '',
      evaluator TEXT DEFAULT '',
      trial_week INTEGER DEFAULT 1,
      phase TEXT DEFAULT '',
      opponent TEXT DEFAULT '',
      map_name TEXT DEFAULT '',
      match_rating REAL DEFAULT 0,
      match_adr REAL DEFAULT 0,
      match_kast REAL DEFAULT 0,
      d1 INTEGER DEFAULT 0,
      d1_note TEXT DEFAULT '',
      d2 INTEGER DEFAULT 0,
      d2_note TEXT DEFAULT '',
      d3 INTEGER DEFAULT 0,
      d3_note TEXT DEFAULT '',
      d4 INTEGER DEFAULT 0,
      d4_note TEXT DEFAULT '',
      d5 INTEGER DEFAULT 0,
      d5_note TEXT DEFAULT '',
      comment TEXT DEFAULT '',
      weighted_score REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (player_id) REFERENCES trial_players(id)
    );

-- trial_costs
CREATE TABLE IF NOT EXISTS trial_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      cost_type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (player_id) REFERENCES trial_players(id)
    );

-- tactics_v2
CREATE TABLE IF NOT EXISTS tactics_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tactic_id    TEXT NOT NULL UNIQUE,
      map_abbr     TEXT NOT NULL,
      map_name     TEXT NOT NULL,
      team_side    TEXT NOT NULL,
      round_type   TEXT NOT NULL,
      name         TEXT NOT NULL,
      target_area  TEXT DEFAULT '',
      notes        TEXT DEFAULT '',
      alias        TEXT DEFAULT '',
      is_active    INTEGER DEFAULT 1,
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    , steps TEXT);

-- briefings_v2
CREATE TABLE IF NOT EXISTS briefings_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_date   TEXT NOT NULL UNIQUE,
      opponent     TEXT NOT NULL DEFAULT '',
      vrs_rank     TEXT DEFAULT '',
      map1_name    TEXT DEFAULT '',
      map2_name    TEXT DEFAULT '',
      notes        TEXT DEFAULT '',
      published    INTEGER DEFAULT 0,
      created_by   INTEGER DEFAULT NULL,
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      updated_at   TEXT DEFAULT (datetime('now','localtime'))
    );

-- briefing_tactics_v2
CREATE TABLE IF NOT EXISTS briefing_tactics_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_id  INTEGER NOT NULL,
      map_slot     TEXT NOT NULL,
      map_name     TEXT NOT NULL,
      team_side    TEXT NOT NULL,
      round_type   TEXT NOT NULL,
      tactic_id    TEXT NOT NULL,
      instruction  TEXT DEFAULT '',
      sort_order   INTEGER DEFAULT 0
    );

-- training_logs_v2
CREATE TABLE IF NOT EXISTS training_logs_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_id  INTEGER DEFAULT NULL,
      log_date     TEXT NOT NULL,
      opponent     TEXT NOT NULL DEFAULT '',
      created_by   INTEGER DEFAULT NULL,
      created_at   TEXT DEFAULT (datetime('now','localtime')), mvp_player_id INTEGER DEFAULT NULL,
      UNIQUE(log_date, opponent)
    );

-- training_log_rounds
CREATE TABLE IF NOT EXISTS training_log_rounds (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id           INTEGER NOT NULL,
      map_name         TEXT NOT NULL DEFAULT '',
      round_number     TEXT NOT NULL DEFAULT '',
      team_side        TEXT DEFAULT NULL,
      coach_tactic_id  TEXT DEFAULT NULL,
      coach_tactic_note TEXT DEFAULT NULL,
      execution        TEXT DEFAULT NULL,
      coach_comment    TEXT DEFAULT NULL,
      responsible      TEXT DEFAULT NULL,
      igl_tactic_id    TEXT DEFAULT NULL,
      igl_tactic_note  TEXT DEFAULT NULL,
      fd_player        TEXT DEFAULT NULL,
      fd_time          TEXT DEFAULT NULL,
      fd_cause         TEXT DEFAULT NULL,
      fd_cause_note    TEXT DEFAULT NULL,
      round_result     TEXT DEFAULT NULL
    , updated_at TEXT DEFAULT NULL, error_type_id INTEGER DEFAULT NULL, created_by_role TEXT DEFAULT "", created_by_user INTEGER DEFAULT NULL, igl_in_briefing INTEGER DEFAULT NULL, fd_affect_result INTEGER DEFAULT NULL);

-- error_types
CREATE TABLE IF NOT EXISTS error_types (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL DEFAULT '',
      name         TEXT NOT NULL,
      keywords     TEXT DEFAULT '',
      description  TEXT DEFAULT '',
      severity     TEXT DEFAULT 'mid',
      is_active    INTEGER DEFAULT 1,
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    );

-- hltv_training_matches
CREATE TABLE IF NOT EXISTS hltv_training_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hltv_match_id TEXT UNIQUE,
            match_date TEXT NOT NULL,
            opponent TEXT NOT NULL,
            event_name TEXT DEFAULT '',
            format TEXT DEFAULT '',
            our_score INTEGER DEFAULT 0,
            their_score INTEGER DEFAULT 0,
            match_url TEXT DEFAULT '',
            is_draw INTEGER DEFAULT 0,
            fetched_at TEXT
        );
CREATE INDEX IF NOT EXISTS idx_htm_hltv_id ON hltv_training_matches(hltv_match_id);

-- hltv_training_maps
CREATE TABLE IF NOT EXISTS hltv_training_maps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER REFERENCES hltv_training_matches(id) ON DELETE CASCADE,
            hltv_match_id TEXT,
            map_name TEXT NOT NULL,
            our_score INTEGER DEFAULT 0,
            their_score INTEGER DEFAULT 0,
            map_order INTEGER DEFAULT 0,
            result TEXT DEFAULT '',   -- 'win', 'loss', 'draw'
            fetched_at TEXT
        );
CREATE INDEX IF NOT EXISTS idx_htmp_hltv_id ON hltv_training_maps(hltv_match_id);

-- hltv_training_player_stats
CREATE TABLE IF NOT EXISTS hltv_training_player_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            map_id INTEGER REFERENCES hltv_training_maps(id) ON DELETE CASCADE,
            match_id INTEGER,
            hltv_match_id TEXT,
            team_side TEXT NOT NULL,  -- 'ur' or 'opponent'
            player_name TEXT NOT NULL,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            plus_minus INTEGER DEFAULT 0,
            adr REAL DEFAULT 0,
            kast REAL DEFAULT 0,
            hs_percent REAL DEFAULT 0,
            rating REAL DEFAULT 0,
            fetched_at TEXT
        );
CREATE INDEX IF NOT EXISTS idx_htps_hltv_id ON hltv_training_player_stats(hltv_match_id);

-- hltv_team_status
CREATE TABLE IF NOT EXISTS hltv_team_status (
            id INTEGER PRIMARY KEY,
            world_ranking TEXT,
            valve_ranking TEXT,
            peak_ranking TEXT,
            weeks_top30 TEXT,
            coach_name TEXT,
            coach_url TEXT,
            fetched_at TEXT
        );

-- hltv_players
CREATE TABLE IF NOT EXISTS hltv_players (
            id INTEGER PRIMARY KEY,
            nick TEXT UNIQUE,
            real_name TEXT,
            hltv_url TEXT,
            hltv_player_id TEXT,
            nationality TEXT,
            is_coach INTEGER DEFAULT 0,
            updated_at TEXT
        );

-- hltv_matches
CREATE TABLE IF NOT EXISTS hltv_matches (
            id INTEGER PRIMARY KEY,
            hltv_match_id TEXT UNIQUE,
            slug TEXT,
            match_date TEXT,
            opponent TEXT,
            event_name TEXT,
            result TEXT,
            our_score INTEGER,
            their_score INTEGER,
            format TEXT,
            hltv_url TEXT,
            updated_at TEXT
        );

-- hltv_roster_changes
CREATE TABLE IF NOT EXISTS hltv_roster_changes (
            id INTEGER PRIMARY KEY,
            change_date TEXT,
            player_nick TEXT,
            change_type TEXT,
            description TEXT,
            created_at TEXT
        );

-- player_id_mappings
CREATE TABLE IF NOT EXISTS player_id_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(player_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_player_game_id ON player_id_mappings(game_id);

-- users
CREATE TABLE IF NOT EXISTS "users" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      steam_id TEXT UNIQUE,
      role TEXT DEFAULT 'pending' CHECK(role IN ('admin','player','coach','team_lead','pending')),
      division TEXT DEFAULT 'cs2' CHECK(division IN ('cs2','val','all')),
      applied_identity TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      approved_at TEXT,
      approved_by INTEGER
    );

-- round_errors
CREATE TABLE IF NOT EXISTS round_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    error_type_id INTEGER DEFAULT NULL,
    category TEXT NOT NULL DEFAULT '未分类',
    responsible TEXT NOT NULL DEFAULT '全队',
    detail TEXT DEFAULT NULL,
    source TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  , co_responsible TEXT DEFAULT NULL);
CREATE INDEX IF NOT EXISTS idx_round_errors_round ON round_errors(round_id);
CREATE INDEX IF NOT EXISTS idx_round_errors_cat ON round_errors(category);

-- review_notes
CREATE TABLE IF NOT EXISTS review_notes (
    range_key TEXT PRIMARY KEY,
    improve_text TEXT DEFAULT '',
    priority_json TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

-- archives_v1
CREATE TABLE IF NOT EXISTS archives_v1 (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      section       TEXT NOT NULL DEFAULT 'coach',
      category      TEXT NOT NULL DEFAULT '',
      title         TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      file_location TEXT DEFAULT '',
      created_by    TEXT DEFAULT '',
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime'))
    );

-- sheets_v1
CREATE TABLE IF NOT EXISTS sheets_v1 (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      section     TEXT NOT NULL DEFAULT 'coach',
      category    TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL DEFAULT '未命名表',
      columns     TEXT NOT NULL DEFAULT '[]',
      rows        TEXT NOT NULL DEFAULT '[]',
      created_by  TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    );

-- trial_contact_snapshots
CREATE TABLE IF NOT EXISTS trial_contact_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      snapshot_html TEXT DEFAULT '',
      saved_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (player_id) REFERENCES trial_players(id)
    );

-- event_details
CREATE TABLE IF NOT EXISTS event_details (
  event_id   INTEGER PRIMARY KEY,
  basic_info TEXT,
  timeline   TEXT,
  rules      TEXT,
  checklist  TEXT,
  updated_by TEXT,
  updated_at TEXT
);

-- tournaments
CREATE TABLE IF NOT EXISTS tournaments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,                 -- 赛事名称
      status           TEXT DEFAULT '报名中',          -- 报名中 / 进行中 / 已结束
      start_date       TEXT,                          -- 开始日期
      end_date         TEXT,                          -- 结束日期
      prize            TEXT,                          -- 奖金(文字,如"5万元")
      organizer        TEXT,                          -- 主办方
      logo_url         TEXT,                          -- 赛事 logo 路径
      result           TEXT,                          -- 赛果文字(如"亚军""八强止步""夺冠")
      placement        TEXT,                          -- 名次(如"第3名""冠军")
      is_finished      INTEGER DEFAULT 0,             -- 是否结束 0/1
      current_stage_id INTEGER,                       -- 当前阶段id(指向 tournament_stages.id)
      notes            TEXT,                          -- 备注
      created_at       TEXT DEFAULT (datetime('now','localtime'))
    , bo_format TEXT DEFAULT 'BO1', next_opponent TEXT, next_match_date TEXT, next_match_time TEXT, has_vrs INTEGER DEFAULT 0);

-- tournament_stages
CREATE TABLE IF NOT EXISTS tournament_stages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id   INTEGER NOT NULL,              -- 所属赛事
      stage_name      TEXT NOT NULL,                 -- 阶段名(海选/封选/淘汰赛...自由填)
      stage_order     INTEGER DEFAULT 0,             -- 显示顺序
      status          TEXT DEFAULT '未开始',          -- 未开始 / 进行中 / 已结束
      next_stage_time TEXT,                          -- 下一阶段开始时间(倒计时用,可选)
      notes           TEXT,                          -- 备注
      created_at      TEXT DEFAULT (datetime('now','localtime'))
    , bo_format TEXT DEFAULT 'BO1', bracket_type TEXT DEFAULT 'single');

-- 初始超级管理员账号（初始密码: admin123，登录后请务必修改）
INSERT OR IGNORE INTO users (username, password_hash, steam_id, role, division, approved_at)
VALUES ('admin', '$2b$10$jEozMwz6YJuJhdbeYhFjBerviWLzPNpDwuZDNOzDmPf7uGzeNvcM2', '00000000000000000', 'admin', 'all', datetime('now','localtime'));

-- 系统配置初始值
INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES ('founded_date', '2025-03-27', '分部成立日期');
INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES ('vrs_rank', '43', 'VRS Asia 排名');
COMMIT;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now','localtime')));

ALTER TABLE players ADD COLUMN contract_url TEXT;
