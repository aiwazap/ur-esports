const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

const ENV_PATH = path.join(__dirname, '..', '.env');
const FACEIT_API_BASE = 'https://open.faceit.com/data/v4';

const DEFAULT_CONFIG = {
  team_name: 'UR FACEIT SEA',
  target_elo: '3200',
  deadline: '2026-07-31',
  avg_elo_per_win: '25',
  sample_size: '10',
  daily_start_time: '19:00',
  settlement_time: '00:30',
  reminders_enabled: '1',
};

const DEFAULT_PLAYERS = [
  { player_name: '4ever', faceit_nickname: 'L1XYyy', role: 'Rifle', current_elo: 2403, sort_order: 1 },
  { player_name: 'glong', faceit_nickname: 'NDWSS', role: 'Rifle', current_elo: 2452, sort_order: 2 },
  { player_name: 'melody', faceit_nickname: 'Me1odyovo', role: 'Rifle', current_elo: 1910, sort_order: 3 },
];

const DEFAULT_COACHES = [
  { player_name: 'HZ / Coach', faceit_nickname: 'HZZZZZ', role: 'Coach', current_elo: 0, sort_order: 90 },
];

const RETIRED_FACEIT_NICKNAME = '-maider666';
const COACH_FACEIT_NICKNAMES = new Set(['hzzzzz']);
const GAME_ID = 'cs2';

const SAMPLE_MATCHES = [
  {
    faceit_match_id: '1-4050d6d1-3b47-4548-8f71-c844e573e5b1',
    match_room_url: 'https://www.faceit.com/en/cs2/room/1-4050d6d1-3b47-4548-8f71-c844e573e5b1/scoreboard',
    started_at: '2026-07-09 21:11:00',
    match_date: '2026-07-09',
    map: 'Dust 2',
    team_score: 13,
    opponent_score: 9,
    result: 'win',
    elo_delta: 25,
  },
  {
    faceit_match_id: '1-cfbf4866-a680-4acb-b9c9-719257105aea',
    match_room_url: 'https://www.faceit.com/en/cs2/room/1-cfbf4866-a680-4acb-b9c9-719257105aea/scoreboard',
    started_at: '2026-07-09 21:47:00',
    match_date: '2026-07-09',
    map: 'Anubis',
    team_score: 13,
    opponent_score: 5,
    result: 'win',
    elo_delta: 24,
  },
];

let ready;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInclusive(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function localDateTimeFromUnix(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { date: '', dateTime: '' };
  const d = new Date(n * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, dateTime: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}` };
}

function monthBounds(date) {
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayStr();
  const [year, month] = raw.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(year, month, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end, label: `${year}-${String(month).padStart(2, '0')}` };
}

function normalizeMapName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const key = raw.toLowerCase().replace(/^de_/, '').replace(/\s+/g, '');
  const names = {
    dust2: 'Dust 2',
    dustii: 'Dust 2',
    mirage: 'Mirage',
    inferno: 'Inferno',
    nuke: 'Nuke',
    ancient: 'Ancient',
    anubis: 'Anubis',
    overpass: 'Overpass',
    vertigo: 'Vertigo',
    train: 'Train',
  };
  return names[key] || raw.replace(/^de_/, '');
}

function faceitRoomUrl(match) {
  const url = String(match?.faceit_url || match?.match_room_url || '').replace('{lang}', 'en');
  if (url) return url;
  return match?.match_id ? `https://www.faceit.com/en/cs2/room/${match.match_id}` : '';
}

function readEnvKey(key) {
  if (!fs.existsSync(ENV_PATH)) return '';
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const match = content.match(new RegExp('^' + key + '=(.*)', 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

function writeEnvKey(key, value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const escaped = String(value).includes(' ') ? `"${value}"` : String(value);
  const regex = new RegExp('^' + key + '=.*', 'm');
  content = regex.test(content)
    ? content.replace(regex, `${key}=${escaped}`)
    : `${content.trimEnd()}\n${key}=${escaped}\n`;
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
  process.env[key] = String(value);
}

function isCoachPlayer(player) {
  const role = String(player?.role || '').trim().toLowerCase();
  const nickname = String(player?.faceit_nickname || '').trim().toLowerCase();
  const name = String(player?.player_name || '').trim().toLowerCase();
  return role === 'coach'
    || role === '教练'
    || COACH_FACEIT_NICKNAMES.has(nickname)
    || name === 'hz'
    || name === 'hz / coach';
}

function isKpiPlayer(player) {
  return Number(player?.is_active) === 1 && !isCoachPlayer(player);
}

function classifyMatchType(match) {
  const raw = [
    match?.queue_type,
    match?.competition_name,
    match?.competition_type,
    match?.match_type,
    match?.league_name,
    match?.event_name,
    match?.match_room_url,
  ].filter(Boolean).join(' ').toLowerCase();
  const isLeague = /(esea|league|open|season|tournament|championship|cup|联赛|赛事|championship)/i.test(raw);
  return {
    key: isLeague ? 'league' : 'ranked',
    label: isLeague ? '联赛' : '排位',
  };
}

function decorateMatch(match) {
  const type = classifyMatchType(match);
  return {
    ...match,
    match_type_key: type.key,
    match_type_label: type.label,
  };
}

async function ensureReady() {
  if (!ready) ready = initSchemaAndSeed();
  return ready;
}

async function initSchemaAndSeed() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS faceit_sea_config (
      config_key TEXT PRIMARY KEY NOT NULL,
      config_value TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS faceit_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      faceit_nickname TEXT NOT NULL UNIQUE,
      faceit_player_id TEXT,
      role TEXT,
      is_active INTEGER DEFAULT 1,
      current_elo INTEGER DEFAULT 0,
      last_synced_at TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS faceit_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faceit_match_id TEXT NOT NULL UNIQUE,
      match_room_url TEXT,
      started_at TEXT,
      match_date TEXT,
      map TEXT,
      region TEXT DEFAULT 'SEA',
      queue_type TEXT DEFAULT 'FACEIT SEA',
      team_score INTEGER DEFAULT 0,
      opponent_score INTEGER DEFAULT 0,
      result TEXT CHECK(result IN ('win','loss','draw')) DEFAULT 'win',
      is_full_stack INTEGER DEFAULT 0,
      stack_type TEXT DEFAULT 'solo' CHECK(stack_type IN ('full_stack','partial','solo','unknown')),
      data_source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS faceit_match_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faceit_match_id TEXT NOT NULL,
      faceit_player_id TEXT,
      faceit_nickname TEXT NOT NULL,
      team_id TEXT DEFAULT 'UR',
      kills INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      adr REAL DEFAULT 0,
      elo_before INTEGER,
      elo_after INTEGER,
      elo_delta INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(faceit_match_id, faceit_nickname)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS faceit_daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_date TEXT NOT NULL UNIQUE,
      target_elo INTEGER DEFAULT 3200,
      current_best_elo INTEGER DEFAULT 0,
      best_player_id INTEGER,
      remaining_elo INTEGER DEFAULT 0,
      avg_elo_per_win REAL DEFAULT 25,
      required_net_wins INTEGER DEFAULT 0,
      remaining_days INTEGER DEFAULT 0,
      required_daily_net_wins INTEGER DEFAULT 0,
      today_net_wins INTEGER DEFAULT 0,
      status TEXT DEFAULT 'not_started',
      generated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await db.query(
      `INSERT OR IGNORE INTO faceit_sea_config (config_key, config_value)
       VALUES (?, ?)`,
      [key, value]
    );
  }

  for (const p of DEFAULT_PLAYERS) {
    await db.query(
      `INSERT INTO faceit_players
       (player_name, faceit_nickname, faceit_player_id, role, is_active, current_elo, sort_order)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(faceit_nickname) DO UPDATE SET
         player_name = excluded.player_name,
         role = excluded.role,
         is_active = 1,
         current_elo = CASE
           WHEN faceit_players.faceit_player_id IS NULL
             OR faceit_players.faceit_player_id LIKE 'sample:%'
             OR faceit_players.last_synced_at IS NULL
           THEN excluded.current_elo
           ELSE faceit_players.current_elo
         END,
         sort_order = excluded.sort_order,
         updated_at = datetime('now','localtime')`,
      [p.player_name, p.faceit_nickname, `sample:${p.faceit_nickname}`, p.role, p.current_elo, p.sort_order]
    );
  }

  for (const p of DEFAULT_COACHES) {
    await db.query(
      `INSERT OR IGNORE INTO faceit_players
       (player_name, faceit_nickname, faceit_player_id, role, is_active, current_elo, sort_order)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [p.player_name, p.faceit_nickname, `sample:${p.faceit_nickname}`, p.role, p.current_elo, p.sort_order]
    );
  }

  await db.query(
    `UPDATE faceit_players
        SET is_active = 0, role = 'Coach', sort_order = 90, updated_at = datetime('now','localtime')
      WHERE LOWER(faceit_nickname) = 'hzzzzz'
         OR LOWER(player_name) IN ('hz', 'hz / coach')
         OR LOWER(role) IN ('coach', '教练')`
  );

  await db.query(
    `UPDATE faceit_players
        SET is_active = 0, sort_order = 99, updated_at = datetime('now','localtime')
      WHERE faceit_nickname = ?
         OR LOWER(player_name) LIKE '%azura%'`,
    [RETIRED_FACEIT_NICKNAME]
  );

  const [players] = await db.query(
    `SELECT * FROM faceit_players ORDER BY is_active DESC, sort_order, id`
  );
  const kpiPlayers = players.filter(isKpiPlayer);
  for (const match of SAMPLE_MATCHES) {
    await db.query(
      `INSERT OR IGNORE INTO faceit_matches
       (faceit_match_id, match_room_url, started_at, match_date, map, region, queue_type,
        team_score, opponent_score, result, is_full_stack, stack_type, data_source)
       VALUES (?, ?, ?, ?, ?, 'SEA', 'FACEIT SEA', ?, ?, ?, 1, 'full_stack', 'sample')`,
      [
        match.faceit_match_id,
        match.match_room_url,
        match.started_at,
        match.match_date,
        match.map,
        match.team_score,
        match.opponent_score,
        match.result,
      ]
    );

    for (const [idx, player] of kpiPlayers.entries()) {
      const before = Math.max(0, (toInt(player.current_elo) - match.elo_delta - (idx % 2)));
      await db.query(
        `INSERT OR IGNORE INTO faceit_match_players
         (faceit_match_id, faceit_player_id, faceit_nickname, team_id, kills, deaths, assists,
          rating, adr, elo_before, elo_after, elo_delta)
         VALUES (?, ?, ?, 'UR', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match.faceit_match_id,
          player.faceit_player_id,
          player.faceit_nickname,
          15 + idx,
          9 + (idx % 3),
          4 + (idx % 2),
          Number((1.08 + idx * 0.04).toFixed(2)),
          72 + idx * 4,
          before,
          before + match.elo_delta,
          match.elo_delta,
        ]
      );
    }
  }
}

async function getConfig() {
  await ensureReady();
  const [rows] = await db.query(`SELECT config_key, config_value FROM faceit_sea_config`);
  const config = { ...DEFAULT_CONFIG };
  for (const row of rows) config[row.config_key] = row.config_value;
  return config;
}

async function getPlayers() {
  await ensureReady();
  const [rows] = await db.query(
    `SELECT * FROM faceit_players ORDER BY is_active DESC, sort_order ASC, id ASC`
  );
  return rows;
}

async function getMatches(date) {
  await ensureReady();
  const [matches] = await db.query(
    `SELECT * FROM faceit_matches
     WHERE match_date = ?
     ORDER BY started_at DESC, id DESC`,
    [date]
  );
  if (!matches.length) return [];
  const ids = matches.map((m) => m.faceit_match_id);
  const placeholders = ids.map(() => '?').join(',');
  const [participants] = await db.query(
    `SELECT * FROM faceit_match_players
     WHERE faceit_match_id IN (${placeholders})
     ORDER BY rating DESC, id ASC`,
    ids
  );
  return matches.map((m) => decorateMatch({
    ...m,
    players: participants.filter((p) => p.faceit_match_id === m.faceit_match_id),
  }));
}

async function getLatestFullStack() {
  const [rows] = await db.query(
    `SELECT * FROM faceit_matches
     WHERE is_full_stack = 1
     ORDER BY started_at DESC, id DESC
     LIMIT 5`
  );
  return rows.map(decorateMatch);
}

async function getMonthlyMatchCounts(date, players) {
  if (!players.length) return {};
  const { start, end } = monthBounds(date);
  const nicknames = players.map((p) => p.faceit_nickname);
  const placeholders = nicknames.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT mp.faceit_nickname, COUNT(DISTINCT mp.faceit_match_id) AS match_count
       FROM faceit_match_players mp
       JOIN faceit_matches m ON m.faceit_match_id = mp.faceit_match_id
      WHERE mp.faceit_nickname IN (${placeholders})
        AND m.match_date >= ?
        AND m.match_date < ?
        AND m.data_source != 'sample'
      GROUP BY mp.faceit_nickname`,
    [...nicknames, start, end]
  );
  return rows.reduce((acc, row) => {
    acc[row.faceit_nickname] = toInt(row.match_count, 0);
    return acc;
  }, {});
}

async function resolveAvgEloPerWin(config) {
  const sampleSize = Math.max(1, toInt(config.sample_size, 10));
  const [rows] = await db.query(
    `SELECT mp.elo_delta
       FROM faceit_match_players mp
       JOIN faceit_matches m ON m.faceit_match_id = mp.faceit_match_id
      JOIN faceit_players fp ON fp.faceit_nickname = mp.faceit_nickname
      WHERE m.is_full_stack = 1
        AND m.result = 'win'
        AND mp.elo_delta > 0
        AND fp.is_active = 1
        AND LOWER(COALESCE(fp.role, '')) NOT IN ('coach', '教练')
        AND LOWER(fp.faceit_nickname) NOT IN ('hzzzzz')
      ORDER BY m.started_at DESC
      LIMIT ?`,
    [sampleSize * 4]
  );
  if (rows.length >= Math.min(5, sampleSize)) {
    const avg = rows.reduce((sum, r) => sum + Number(r.elo_delta || 0), 0) / rows.length;
    return { value: Math.max(1, Number(avg.toFixed(1))), source: 'recent_wins' };
  }
  return { value: Math.max(1, Number(config.avg_elo_per_win || 25)), source: 'default_config' };
}

function buildStatus({ matches, todayNetWins, requiredDailyNetWins, players }) {
  if (!players.length || players.some((p) => !p.faceit_nickname)) return 'data_error';
  if (!matches.length) return 'not_started';
  if (todayNetWins >= requiredDailyNetWins) return 'completed';
  return 'behind';
}

function statusText(status) {
  return {
    data_error: '数据异常',
    not_started: '当日无记录',
    in_progress: '进行中',
    behind: '进度不足',
    completed: '已完成',
  }[status] || status;
}

async function buildSummary(date) {
  const config = await getConfig();
  const allPlayers = await getPlayers();
  const players = allPlayers.filter(isKpiPlayer);
  const activeNicknames = new Set(players.map((p) => p.faceit_nickname));
  const matches = (await getMatches(date)).map((m) => ({
    ...m,
    players: (m.players || []).filter((p) => activeNicknames.has(p.faceit_nickname)),
  }));
  const latestFullStack = await getLatestFullStack();
  const fullStackMatches = matches.filter((m) => Number(m.is_full_stack) === 1);
  const partialMatches = matches.filter((m) => m.stack_type === 'partial');
  const soloMatches = matches.filter((m) => m.stack_type === 'solo');
  const todayFullWins = fullStackMatches.filter((m) => m.result === 'win').length;
  const todayFullLosses = fullStackMatches.filter((m) => m.result === 'loss').length;
  const todayNetWins = todayFullWins - todayFullLosses;

  const targetElo = toInt(config.target_elo, 3200);
  const rosterSize = players.length;
  const currentAverageElo = rosterSize
    ? Number((players.reduce((sum, p) => sum + toInt(p.current_elo), 0) / rosterSize).toFixed(1))
    : 0;
  const bestPlayer = players.reduce((best, p) => (toInt(p.current_elo) > toInt(best?.current_elo) ? p : best), players[0] || null);
  const currentBestElo = bestPlayer ? toInt(bestPlayer.current_elo) : 0;
  const remainingElo = Math.max(0, Number((targetElo - currentAverageElo).toFixed(1)));
  const avg = await resolveAvgEloPerWin(config);
  const requiredNetWins = Math.ceil(remainingElo / avg.value);
  const remainingDays = daysInclusive(date, config.deadline || DEFAULT_CONFIG.deadline);
  const requiredDailyNetWins = remainingDays > 0 ? Math.ceil(requiredNetWins / remainingDays) : requiredNetWins;
  const todayRemainingWins = Math.max(0, requiredDailyNetWins - todayNetWins);
  const status = buildStatus({ matches, todayNetWins, requiredDailyNetWins, players });
  const monthlyCounts = await getMonthlyMatchCounts(date, players);
  const month = monthBounds(date);

  const playerTasks = players.map((p) => {
    const playerRows = matches
      .flatMap((m) => (m.players || []).map((mp) => ({ ...mp, match: m })))
      .filter((mp) => mp.faceit_nickname === p.faceit_nickname);
    const wins = playerRows.filter((r) => r.match.result === 'win').length;
    const losses = playerRows.filter((r) => r.match.result === 'loss').length;
    const fullStackCount = playerRows.filter((r) => Number(r.match.is_full_stack) === 1).length;
    const eloDelta = playerRows.reduce((sum, r) => sum + Number(r.elo_delta || 0), 0);
    let playerStatus = 'not_started';
    if (playerRows.length && fullStackCount > 0) playerStatus = todayNetWins >= requiredDailyNetWins ? 'completed' : 'in_progress';
    else if (playerRows.length) playerStatus = 'in_progress';
    return {
      id: p.id,
      player_name: p.player_name,
      faceit_nickname: p.faceit_nickname,
      current_elo: toInt(p.current_elo),
      matches_played: playerRows.length,
      today_matches: playerRows.length,
      month_matches: monthlyCounts[p.faceit_nickname] || 0,
      month_label: month.label,
      wins,
      losses,
      elo_delta: eloDelta,
      full_stack: fullStackCount > 0,
      latest_match_room_url: playerRows[0]?.match?.match_room_url || '',
      status: playerStatus,
      status_text: statusText(playerStatus),
      last_synced_at: p.last_synced_at,
    };
  }).sort((a, b) => (b.month_matches - a.month_matches)
    || (b.current_elo - a.current_elo)
    || a.player_name.localeCompare(b.player_name));

  return {
    date,
    config: {
      team_name: config.team_name,
      target_elo: targetElo,
      deadline: config.deadline,
      avg_elo_per_win: avg.value,
      avg_elo_source: avg.source,
      sample_size: toInt(config.sample_size, 10),
      daily_start_time: config.daily_start_time,
      settlement_time: config.settlement_time,
      reminders_enabled: config.reminders_enabled === '1',
    },
    progress: {
      target_average_elo: targetElo,
      current_average_elo: currentAverageElo,
      remaining_average_elo: remainingElo,
      roster_size: rosterSize,
      best_player: bestPlayer ? bestPlayer.player_name : '',
      best_faceit_nickname: bestPlayer ? bestPlayer.faceit_nickname : '',
      current_best_elo: currentBestElo,
      remaining_elo: remainingElo,
      required_net_wins: requiredNetWins,
      remaining_days: remainingDays,
      required_daily_net_wins: requiredDailyNetWins,
      today_full_stack_matches: fullStackMatches.length,
      today_partial_matches: partialMatches.length,
      today_solo_matches: soloMatches.length,
      today_full_wins: todayFullWins,
      today_full_losses: todayFullLosses,
      today_net_wins: todayNetWins,
      today_remaining_wins: todayRemainingWins,
      status,
      status_text: statusText(status),
      month_start: month.start,
      month_end: month.end,
      month_label: month.label,
    },
    players: playerTasks,
    matches,
    latest_full_stack: latestFullStack,
    sync: {
      api_key_configured: Boolean(process.env.FACEIT_API_KEY || readEnvKey('FACEIT_API_KEY')),
      last_success_at: config.last_success_at || '',
      last_error: config.last_error || '',
      data_mode: [...matches, ...latestFullStack].some((m) => m.data_source === 'sample') ? 'sample' : 'live',
    },
  };
}

function faceitGet(pathname, apiKey) {
  return new Promise((resolve, reject) => {
    const url = `${FACEIT_API_BASE}${pathname}`;
    const req = https.get(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = body ? JSON.parse(body) : {}; } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        const err = new Error(json.message || json.error || `FACEIT API ${res.statusCode}`);
        err.statusCode = res.statusCode;
        err.body = json;
        reject(err);
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('FACEIT API timeout'));
    });
  });
}

async function findFaceitPlayer(player, apiKey) {
  const search = await faceitGet(`/search/players?nickname=${encodeURIComponent(player.faceit_nickname)}&game=${GAME_ID}&offset=0&limit=10`, apiKey);
  const found = (search.items || []).find((x) => String(x.nickname).toLowerCase() === String(player.faceit_nickname).toLowerCase()) || (search.items || [])[0];
  if (!found) throw new Error(`未找到 FACEIT 账号：${player.faceit_nickname}`);
  return found;
}

async function ensureFaceitPlayerIds(players, apiKey) {
  const resolved = [];
  for (const p of players) {
    const currentId = String(p.faceit_player_id || '');
    if (currentId && !currentId.startsWith('sample:')) {
      resolved.push(p);
      continue;
    }
    const found = await findFaceitPlayer(p, apiKey);
    const elo = found.games?.[GAME_ID]?.faceit_elo || p.current_elo || 0;
    await db.query(
      `UPDATE faceit_players
          SET faceit_player_id=?, current_elo=?, last_synced_at=datetime('now','localtime'),
              updated_at=datetime('now','localtime')
        WHERE id=?`,
      [found.player_id || p.faceit_player_id, Number(elo) || 0, p.id]
    );
    resolved.push({
      ...p,
      faceit_player_id: found.player_id || p.faceit_player_id,
      current_elo: Number(elo) || p.current_elo || 0,
    });
  }
  return resolved;
}

function teamPlayers(team) {
  return Array.isArray(team?.players) ? team.players : [];
}

function playerMatchesActive(row, player) {
  const playerId = String(player?.faceit_player_id || '').toLowerCase();
  const nickname = String(player?.faceit_nickname || '').toLowerCase();
  return String(row?.player_id || '').toLowerCase() === playerId
    || String(row?.nickname || row?.faceit_nickname || '').toLowerCase() === nickname;
}

function activePlayersInTeam(team, players) {
  const rows = teamPlayers(team);
  return players.filter((p) => rows.some((row) => playerMatchesActive(row, p)));
}

function findOurStatsTeam(statsRound, players) {
  const teams = Array.isArray(statsRound?.teams) ? statsRound.teams : [];
  if (!teams.length) return { team: null, opponent: null, participants: [] };
  const ranked = teams.map((team) => ({ team, participants: activePlayersInTeam(team, players) }))
    .sort((a, b) => b.participants.length - a.participants.length);
  const best = ranked[0];
  return {
    team: best?.team || null,
    opponent: teams.find((team) => team !== best?.team) || null,
    participants: best?.participants || [],
  };
}

function activePlayersInHistoryFaction(faction, players) {
  const rows = Array.isArray(faction?.players) ? faction.players : [];
  return players.filter((p) => rows.some((row) => playerMatchesActive(row, p)));
}

function findOurHistoryFaction(match, players) {
  const teams = match?.teams || {};
  const entries = Object.entries(teams).map(([key, faction]) => ({
    key,
    faction,
    participants: activePlayersInHistoryFaction(faction, players),
  })).sort((a, b) => b.participants.length - a.participants.length);
  const best = entries[0] || {};
  const opponent = entries.find((entry) => entry.key !== best.key) || {};
  return {
    key: best.key || '',
    opponentKey: opponent.key || '',
    participants: best.participants || [],
  };
}

function teamScore(team) {
  return toInt(team?.team_stats?.['Final Score'], 0);
}

function playerStatsFromTeam(team, player) {
  return teamPlayers(team).find((row) => playerMatchesActive(row, player)) || null;
}

function buildFaceitMatchPayload(match, stats, activePlayers) {
  const statsRound = stats?.rounds?.[0] || {};
  const statsTeam = findOurStatsTeam(statsRound, activePlayers);
  const histTeam = findOurHistoryFaction(match, activePlayers);
  const participants = statsTeam.participants.length ? statsTeam.participants : histTeam.participants;
  if (!participants.length) return null;

  const started = localDateTimeFromUnix(match.started_at || match.finished_at);
  const score = match.results?.score || {};
  const statsTeamScore = statsTeam.team ? teamScore(statsTeam.team) : null;
  const statsOpponentScore = statsTeam.opponent ? teamScore(statsTeam.opponent) : null;
  const historyTeamScore = histTeam.key ? toInt(score[histTeam.key], 0) : 0;
  const historyOpponentScore = histTeam.opponentKey ? toInt(score[histTeam.opponentKey], 0) : 0;
  const ourScore = Number.isFinite(statsTeamScore) && statsTeam.team ? statsTeamScore : historyTeamScore;
  const opponentScore = Number.isFinite(statsOpponentScore) && statsTeam.opponent ? statsOpponentScore : historyOpponentScore;
  const result = ourScore === opponentScore ? 'draw' : (ourScore > opponentScore ? 'win' : 'loss');
  const mapName = normalizeMapName(statsRound.round_stats?.Map || match.map || '');
  const queueType = match.competition_name || match.competition_type || match.match_type || 'FACEIT';
  const stackType = participants.length >= activePlayers.length ? 'full_stack' : (participants.length > 1 ? 'partial' : 'solo');

  const playerRows = participants.map((player) => {
    const statsRow = statsTeam.team ? playerStatsFromTeam(statsTeam.team, player) : null;
    const ps = statsRow?.player_stats || {};
    return {
      faceit_match_id: match.match_id,
      faceit_player_id: player.faceit_player_id,
      faceit_nickname: player.faceit_nickname,
      kills: toInt(ps.Kills, 0),
      deaths: toInt(ps.Deaths, 0),
      assists: toInt(ps.Assists, 0),
      rating: toFloat(ps['K/D Ratio'], 0),
      adr: toFloat(ps.ADR, 0),
      elo_delta: 0,
    };
  });

  return {
    match: {
      faceit_match_id: match.match_id,
      match_room_url: faceitRoomUrl(match),
      started_at: started.dateTime,
      match_date: started.date,
      map: mapName,
      region: statsRound.round_stats?.Region || match.region || 'SEA',
      queue_type: queueType,
      team_score: ourScore,
      opponent_score: opponentScore,
      result,
      is_full_stack: stackType === 'full_stack' ? 1 : 0,
      stack_type: stackType,
      data_source: 'faceit_api',
    },
    players: playerRows,
  };
}

async function upsertFaceitMatch(payload) {
  const m = payload.match;
  await db.query(
    `INSERT INTO faceit_matches
     (faceit_match_id, match_room_url, started_at, match_date, map, region, queue_type,
      team_score, opponent_score, result, is_full_stack, stack_type, data_source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(faceit_match_id) DO UPDATE SET
       match_room_url=excluded.match_room_url,
       started_at=excluded.started_at,
       match_date=excluded.match_date,
       map=excluded.map,
       region=excluded.region,
       queue_type=excluded.queue_type,
       team_score=excluded.team_score,
       opponent_score=excluded.opponent_score,
       result=excluded.result,
       is_full_stack=excluded.is_full_stack,
       stack_type=excluded.stack_type,
       data_source=excluded.data_source,
       updated_at=datetime('now','localtime')`,
    [
      m.faceit_match_id, m.match_room_url, m.started_at, m.match_date, m.map, m.region, m.queue_type,
      m.team_score, m.opponent_score, m.result, m.is_full_stack, m.stack_type, m.data_source,
    ]
  );

  for (const p of payload.players) {
    await db.query(
      `INSERT INTO faceit_match_players
       (faceit_match_id, faceit_player_id, faceit_nickname, team_id, kills, deaths, assists,
        rating, adr, elo_delta)
       VALUES (?, ?, ?, 'UR', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(faceit_match_id, faceit_nickname) DO UPDATE SET
         faceit_player_id=excluded.faceit_player_id,
         kills=excluded.kills,
         deaths=excluded.deaths,
         assists=excluded.assists,
         rating=excluded.rating,
         adr=excluded.adr,
         elo_delta=excluded.elo_delta`,
      [
        p.faceit_match_id, p.faceit_player_id, p.faceit_nickname,
        p.kills, p.deaths, p.assists, p.rating, p.adr, p.elo_delta,
      ]
    );
  }
}

async function syncFaceitMatches(apiKey, options = {}) {
  await ensureReady();
  const limit = Math.max(5, Math.min(50, toInt(options.limit, 30)));
  const activePlayers = await ensureFaceitPlayerIds((await getPlayers()).filter(isKpiPlayer), apiKey);
  const matchMap = new Map();

  for (const player of activePlayers) {
    const history = await faceitGet(`/players/${player.faceit_player_id}/history?game=${GAME_ID}&offset=0&limit=${limit}`, apiKey);
    for (const item of history.items || []) {
      if (!item.match_id || !item.started_at) continue;
      const existing = matchMap.get(item.match_id) || { item, seen: new Set() };
      existing.seen.add(player.faceit_nickname);
      matchMap.set(item.match_id, existing);
    }
  }

  const candidates = [...matchMap.values()]
    .sort((a, b) => Number(b.item.started_at || 0) - Number(a.item.started_at || 0))
    .slice(0, limit);
  let synced = 0;
  let skipped = 0;
  const errors = [];

  for (const candidate of candidates) {
    try {
      const stats = await faceitGet(`/matches/${candidate.item.match_id}/stats`, apiKey);
      const payload = buildFaceitMatchPayload(candidate.item, stats, activePlayers);
      if (!payload) {
        skipped += 1;
        continue;
      }
      await upsertFaceitMatch(payload);
      synced += 1;
    } catch (err) {
      errors.push(`${candidate.item.match_id}: ${err.message}`);
    }
  }

  const successValue = new Date().toISOString();
  await db.query(
    `INSERT INTO faceit_sea_config (config_key, config_value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
     updated_at = datetime('now','localtime')`,
    ['last_matches_sync_at', successValue]
  );
  await db.query(
    `INSERT INTO faceit_sea_config (config_key, config_value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
     updated_at = datetime('now','localtime')`,
    ['last_error', errors.length ? errors.slice(0, 6).join('; ') : '']
  );

  return { synced, skipped, errors, considered: candidates.length };
}

router.get('/summary', auth, async (req, res) => {
  try {
    await ensureReady();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
      ? String(req.query.date)
      : todayStr();
    res.json(await buildSummary(date));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/config', auth, async (req, res) => {
  try {
    const config = await getConfig();
    const players = await getPlayers();
    res.json({
      config: {
        ...config,
        api_key_configured: Boolean(process.env.FACEIT_API_KEY || readEnvKey('FACEIT_API_KEY')),
      },
      players,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', adminAuth, async (req, res) => {
  try {
    await ensureReady();
    const { config = {}, players = [], faceit_api_key } = req.body || {};
    const allowedConfig = [
      'team_name', 'target_elo', 'deadline', 'avg_elo_per_win', 'sample_size',
      'daily_start_time', 'settlement_time', 'reminders_enabled',
    ];
    for (const key of allowedConfig) {
      if (config[key] !== undefined) {
        await db.query(
          `INSERT INTO faceit_sea_config (config_key, config_value, updated_at)
           VALUES (?, ?, datetime('now','localtime'))
           ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
           updated_at = datetime('now','localtime')`,
          [key, String(config[key])]
        );
      }
    }
    if (typeof faceit_api_key === 'string' && faceit_api_key.trim()) {
      writeEnvKey('FACEIT_API_KEY', faceit_api_key.trim());
    }
    for (const p of players.slice(0, 10)) {
      const payload = [
        String(p.player_name || '').trim(),
        String(p.faceit_nickname || '').trim(),
        String(p.faceit_player_id || '').trim() || null,
        String(p.role || '').trim(),
        Number(p.is_active) ? 1 : 0,
        Math.max(0, toInt(p.current_elo, 0)),
        Math.max(0, toInt(p.sort_order, 0)),
      ];
      if (!payload[0] || !payload[1]) continue;
      if (p.id) {
        await db.query(
          `UPDATE faceit_players
             SET player_name=?, faceit_nickname=?, faceit_player_id=?, role=?, is_active=?,
                 current_elo=?, sort_order=?, updated_at=datetime('now','localtime')
           WHERE id=?`,
          [...payload, p.id]
        );
      } else {
        await db.query(
          `INSERT INTO faceit_players
           (player_name, faceit_nickname, faceit_player_id, role, is_active, current_elo, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          payload
        );
      }
    }
    res.json({ success: true, summary: await buildSummary(todayStr()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-players', adminAuth, async (req, res) => {
  try {
    await ensureReady();
    const apiKey = process.env.FACEIT_API_KEY || readEnvKey('FACEIT_API_KEY');
    if (!apiKey) return res.status(400).json({ error: 'FACEIT_API_KEY 未配置' });

    const players = (await getPlayers()).filter(isKpiPlayer);
    const results = [];
    for (const p of players) {
      try {
        const search = await faceitGet(`/search/players?nickname=${encodeURIComponent(p.faceit_nickname)}&game=cs2&offset=0&limit=10`, apiKey);
        const found = (search.items || []).find((x) => String(x.nickname).toLowerCase() === String(p.faceit_nickname).toLowerCase()) || (search.items || [])[0];
        if (!found) throw new Error('未找到 FACEIT 账号');
        const elo = found.games?.cs2?.faceit_elo || found.games?.cs2?.skill_level || p.current_elo || 0;
        await db.query(
          `UPDATE faceit_players
              SET faceit_player_id=?, current_elo=?, last_synced_at=datetime('now','localtime'),
                  updated_at=datetime('now','localtime')
            WHERE id=?`,
          [found.player_id || p.faceit_player_id, Number(elo) || 0, p.id]
        );
        results.push({ faceit_nickname: p.faceit_nickname, ok: true, current_elo: Number(elo) || 0 });
      } catch (err) {
        results.push({ faceit_nickname: p.faceit_nickname, ok: false, error: err.message });
      }
    }
    const failed = results.filter((r) => !r.ok);
    await db.query(
      `INSERT INTO faceit_sea_config (config_key, config_value, updated_at)
       VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
       updated_at = datetime('now','localtime')`,
      ['last_success_at', failed.length === results.length ? '' : new Date().toISOString()]
    );
    await db.query(
      `INSERT INTO faceit_sea_config (config_key, config_value, updated_at)
       VALUES (?, ?, datetime('now','localtime'))
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
       updated_at = datetime('now','localtime')`,
      ['last_error', failed.length ? failed.map((r) => `${r.faceit_nickname}: ${r.error}`).join('; ') : '']
    );
    res.json({ success: failed.length === 0, results, summary: await buildSummary(todayStr()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-matches', adminAuth, async (req, res) => {
  try {
    await ensureReady();
    const apiKey = process.env.FACEIT_API_KEY || readEnvKey('FACEIT_API_KEY');
    if (!apiKey) return res.status(400).json({ error: 'FACEIT_API_KEY 未配置' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || ''))
      ? String(req.body.date)
      : todayStr();
    const result = await syncFaceitMatches(apiKey, { limit: req.body?.limit || 30 });
    res.json({
      success: result.errors.length === 0,
      ...result,
      summary: await buildSummary(date),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
