/**
 * POST /api/matches/import-json
 * 批量导入训练赛 JSON 文件
 * 支持单个或多个文件（multipart/form-data, 字段名: files）
 *
 * JSON 格式（来自游戏内导出）：
 * {
 *   match: { map, startTime, endTime, winner, userSide, home: {score}, away: {score} }
 *   scoreboard: { home: [...players], away: [...players] }
 * }
 */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const db      = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// ── UR 队员 Steam64 ID 集合（用于识别 UR 所在边）──────────────
const UR_STEAM_IDS = new Set([
  '76561198090169593', // Goatnikola (aiwa)
  '76561198042567819', // HZ (Coach)
  '76561198789419093', // drace
  '76561198864933623', // 4ever
  '76561199656268685', // doomer
  '76561198847845386', // 0z (IGL)
  '76561198900098635', // glong
  '76561198337239221', // Smokky
]);

// 对手名标准化（与 dashboard.js 保持一致）
const OPPONENT_ALIASES = {
  'Mongolz.A':    ['mongolza', 'mongolz.a', 'mongolz a', 'mongolz_a'],
  'NEXVOID':      ['nexvoid', 'nextvoid', 'next void', 'nex void'],
  'Tengri':       ['tengri', 'tenjri', 'tengrie'],
  'The Cube':     ['thecube', 'the cube', 'the_cube', 'theqube', 'the qube'],
  'Oasis Gaming': ['oasis gaming', 'oasis_gaming', 'oasisgaming', 'oasis'],
  '100RA':        ['100ra', '100 ra'],
  'Wydo':         ['wydo'],
  'Modun':        ['modun'],
  'ZEVS':         ['zevs'],
  'Nas':          ['nas'],
  'Dy2k':         ['dy2k'],
  'RDC':          ['rdc', 'relove deep cross', 'relovedeepcross'],
};
function normalizeOpponent(name) {
  if (!name) return name;
  const key = name.toLowerCase().replace(/[\s._\-]/g, '');
  for (const [standard, aliases] of Object.entries(OPPONENT_ALIASES)) {
    if (aliases.some(a => a.replace(/[\s._\-]/g, '') === key)) return standard;
  }
  return name;
}

// CS2 地图名标准化
const MAP_NAME_MAP = {
  'de_ancient':  'Ancient',
  'de_anubis':   'Anubis',
  'de_dust2':    'Dust2',
  'de_inferno':  'Inferno',
  'de_mirage':   'Mirage',
  'de_nuke':     'Nuke',
  'de_overpass': 'Overpass',
  'de_train':    'Train',
  'de_vertigo':  'Vertigo',
};
function normalizeMap(map) {
  if (!map) return map;
  return MAP_NAME_MAP[map.toLowerCase()] || map;
}

// 从文件名解析对手名（格式：MMDD_对手名_M序号.json）
function parseOpponentFromFilename(filename) {
  const base  = filename.replace(/\.(json|JSON)$/, '');
  const parts = base.split('_');
  if (parts.length < 2) return parts[0] || 'Unknown';
  // 第1段=日期, 最后1段=地图/序号; 中间为对手, 过滤掉 vs 连接词
  const mid = parts.slice(1, -1).filter(p => p.toLowerCase() !== 'vs');
  if (mid.length > 0) return mid.join('_');
  const cand = parts[1];
  if (cand && cand.toLowerCase() !== 'vs') return cand;
  return parts[parts.length - 1] || 'Unknown';
}

// 从文件名解析日期（MMDD → 2026-MM-DD）
function parseDateFromFilename(filename) {
  const base  = filename.replace(/\.(json|JSON)$/, '');
  const first = base.split('_')[0];
  const year  = new Date().getFullYear();
  // 兼容 6-25 / 06-25 这种带横杠的日期
  let m = first.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  // 兼容 0625 这种 MMDD 连写
  m = first.match(/^(\d{4})$/);
  if (m) return `${year}-${m[1].slice(0,2)}-${m[1].slice(2,4)}`;
  return null;
}

// multer：内存存储，不写磁盘
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 50 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(json|JSON)$/)) cb(null, true);
    else cb(new Error(`非 JSON 文件: ${file.originalname}`));
  },
});

// ── 解析单个 JSON 文件 ────────────────────────────────────────
function parseMatchJson(buffer, filename) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf-8'));
  } catch (e) {
    return { error: `JSON 解析失败: ${e.message}` };
  }

  const match = data.match;
  if (!match) return { error: '缺少 match 字段' };

  const scoreboard = data.scoreboard;
  if (!scoreboard) return { error: '缺少 scoreboard 字段' };

  // 识别 UR 所在边（通过 Steam ID）
  let urSide = null;
  for (const side of ['home', 'away']) {
    const players = scoreboard[side] || [];
    if (players.some(p => UR_STEAM_IDS.has(p.steamId64))) {
      urSide = side;
      break;
    }
  }
  if (!urSide) return { error: '无法识别 UR 所在边（Steam ID 未匹配）' };

  const oppSide   = urSide === 'home' ? 'away' : 'home';
  const ourScore  = match[urSide]?.score ?? 0;
  const theirScore = match[oppSide]?.score ?? 0;

  // 对手名：从文件名提取后标准化
  const rawOpp = parseOpponentFromFilename(filename);
  const opponent = normalizeOpponent(rawOpp);

  // 日期
  const matchDate = parseDateFromFilename(filename)
    || (match.startTime ? match.startTime.slice(0, 10) : null);
  if (!matchDate) return { error: '无法解析比赛日期' };

  // 地图
  const mapName = normalizeMap(match.map);

  // 选手数据（UR 这边）
  const urPlayers = (scoreboard[urSide] || []).filter(p =>
    p.role === 'player' && UR_STEAM_IDS.has(p.steamId64)
  );

  // 对手球员数据
  const oppPlayers = (scoreboard[oppSide] || []).filter(p =>
    p.role === 'player'
  );

  return {
    matchDate,
    opponent,
    mapName,
    ourScore,
    theirScore,
    matchTime: match.startTime ? match.startTime.slice(11, 16) : null,
    players: urPlayers.map(p => ({
      steamId:  p.steamId64,
      name:     p.name,
      kills:    p.kills          || 0,
      deaths:   p.deaths         || 0,
      assists:  p.assists        || 0,
      adr:      p.adr            || 0,
      hs:       p.headShotKills  || 0,
      hsPct:    p.hsPercent      || 0,
      kd:       p.kd             || 0,
    })),
    oppPlayers: oppPlayers.map(p => ({
      name:     p.name,
      kills:    p.kills          || 0,
      deaths:   p.deaths         || 0,
      assists:  p.assists        || 0,
      adr:      p.adr            || 0,
      hs:       p.headShotKills  || 0,
      hsPct:    p.hsPercent      || 0,
      kd:       p.kd             || 0,
    })),
  };
}

// ── POST /api/matches/import-json ─────────────────────────────
router.post('/import-json', auth, upload.array('files', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '未收到文件' });
  }

  // 检查 player_stats 是否有 hs 列
  let hsColExists = false;
  try {
    const [pragma] = await db.query('PRAGMA table_info(player_stats)');
    hsColExists = pragma.some(c => c.name === 'hs');
  } catch {}

  // 如果没有 hs 列，先添加
  if (!hsColExists) {
    try {
      await db.query('ALTER TABLE player_stats ADD COLUMN hs INTEGER DEFAULT 0');
      await db.query('ALTER TABLE player_stats ADD COLUMN hs_pct REAL DEFAULT 0');
      hsColExists = true;
    } catch (e) {
      console.warn('添加 hs 列失败:', e.message);
    }
  }

  const results = {
    total:    req.files.length,
    inserted: 0,
    updated:  0,
    skipped:  0,
    errors:   [],
    details:  [],
  };

  for (const file of req.files) {
    const filename = file.originalname;

    // 跳过空文件
    if (!file.buffer || file.buffer.length === 0) {
      results.skipped++;
      results.details.push({ file: filename, status: 'skipped', reason: '空文件' });
      continue;
    }

    // 解析 JSON
    const parsed = parseMatchJson(file.buffer, filename);
    if (parsed.error) {
      results.errors.push({ file: filename, error: parsed.error });
      results.skipped++;
      continue;
    }

    const { matchDate, opponent, mapName, ourScore, theirScore, matchTime, players, oppPlayers } = parsed;
    const oppPlayersJson = JSON.stringify(oppPlayers || []);

    try {
      // 检查是否已存在（日期+对手+地图 唯一）
      const [existing] = await db.query(
        `SELECT id FROM matches
         WHERE match_date = ? AND LOWER(opponent) = LOWER(?) AND map_name = ? AND match_type = 'scrim'`,
        [matchDate, opponent, mapName]
      );

      let matchId;
      if (existing.length > 0) {
        // 更新
        matchId = existing[0].id;
        await db.query(
          `UPDATE matches SET our_score = ?, their_score = ?, match_time = ?, opponent_players = ? WHERE id = ?`,
          [ourScore, theirScore, matchTime, oppPlayersJson, matchId]
        );
        results.updated++;
        results.details.push({ file: filename, status: 'updated', matchId, opponent, mapName, score: `${ourScore}:${theirScore}` });
      } else {
        // 插入
        const [insertResult] = await db.query(
          `INSERT INTO matches (match_date, match_time, opponent, map_name, our_score, their_score, match_type, division, opponent_players)
           VALUES (?, ?, ?, ?, ?, ?, 'scrim', 'cs2', ?)`,
          [matchDate, matchTime, opponent, mapName, ourScore, theirScore, oppPlayersJson]
        );
        matchId = insertResult.insertId;
        results.inserted++;
        results.details.push({ file: filename, status: 'inserted', matchId, opponent, mapName, score: `${ourScore}:${theirScore}` });
      }

      // 写入选手数据
      for (const p of players) {
        // 通过 Steam ID 找选手
        const [playerRows] = await db.query(
          `SELECT id, nickname FROM players WHERE steam_id = ? AND division = 'cs2' LIMIT 1`,
          [p.steamId]
        );

        // Steam ID 找不到则尝试昵称模糊匹配
        let playerId = playerRows[0]?.id;
        if (!playerId) {
          const [byNick] = await db.query(
            `SELECT id FROM players WHERE LOWER(nickname) = LOWER(?) AND division = 'cs2' LIMIT 1`,
            [p.name]
          );
          playerId = byNick[0]?.id;
        }
        if (!playerId) continue; // 找不到选手跳过

        // 删旧数据再插入（保证幂等）
        await db.query('DELETE FROM player_stats WHERE match_id = ? AND player_id = ?', [matchId, playerId]);

        if (hsColExists) {
          await db.query(
            `INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, rating, kast, hs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [matchId, playerId, p.kills, p.deaths, p.adr,
             // rating 用 kd 估算：kd >= 1.2 → 1.1+, kd >= 1.0 → 1.0, 以此类推
             parseFloat((0.5 + p.kd * 0.5).toFixed(2)),
             0, // kast 暂无
             p.hs]
          );
        } else {
          await db.query(
            `INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, rating, kast)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [matchId, playerId, p.kills, p.deaths, p.adr,
             parseFloat((0.5 + p.kd * 0.5).toFixed(2)),
             0]
          );
        }
      }
    } catch (e) {
      results.errors.push({ file: filename, error: e.message });
      results.skipped++;
    }
  }

  res.json({
    success: true,
    summary: `${results.inserted} 新增 / ${results.updated} 更新 / ${results.skipped} 跳过`,
    ...results,
  });
});

module.exports = router;
