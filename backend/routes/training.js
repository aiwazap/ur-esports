const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Shared date range cache across dashboard / match-records calls
const dateCache = { start: null, end: null, ts: 0 };

// 确保 player_stats 有 assists / hs_pct 列（旧库可能没有，按需安全补列；只跑一次）
let _psColsEnsured = false;
async function ensurePlayerStatsCols() {
  if (_psColsEnsured) return;
  try {
    const [cols] = await db.query(`PRAGMA table_info(player_stats)`);
    const names = new Set((cols || []).map(c => c.name));
    if (!names.has('assists')) await db.query(`ALTER TABLE player_stats ADD COLUMN assists INTEGER DEFAULT 0`);
    if (!names.has('hs_pct'))  await db.query(`ALTER TABLE player_stats ADD COLUMN hs_pct INTEGER DEFAULT 0`);
    _psColsEnsured = true;
  } catch (e) { console.error('[ensurePlayerStatsCols]', e.message); }
}

// 保留原始文件扩展名，否则 openpyxl 无法识别 .xlsx 格式
const uploadStorage = multer.diskStorage({
  destination: 'uploads/tmp/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage: uploadStorage });
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

// Python 可执行文件路径（Windows 使用完整路径，否则 PATH 中可能找不到）
const PYTHON_EXE = process.platform === 'win32'
  ? 'C:\\Users\\Administrator.DESKTOP-NHVJ2AT\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe'
  : 'python3';

// ========== Python 脚本调用封装 ==========
function runPython(scriptName, filePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    execFile(PYTHON_EXE, [scriptPath, absFilePath],
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message));
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) return reject(new Error(result.error));
          resolve(result);
        } catch {
          reject(new Error('Python 输出解析失败'));
        }
      }
    );
  });
}

// ========== 获取或创建训练赛次 ==========
async function getOrCreateSession(matchDate, opponent, eventName) {
  // Reject placeholder opponent names
  if (!opponent || opponent.toUpperCase() === 'OPPONENT' || opponent === '未知') {
    throw new Error(`无效对手名: "${opponent}"，请检查Excel Sheet名称是否已更新`);
  }
  // 对手名标准化(防止 wydo/Wydo、THE QUBE/The Cube 等分裂成多条赛次)
  opponent = normOpponent(opponent);
  // Clean up any stale OPPONENT/未知 sessions on same date
  await db.query(
    'DELETE FROM training_rounds WHERE session_id IN (SELECT id FROM training_sessions WHERE match_date = ? AND (opponent = ? OR opponent = ?))',
    [matchDate, 'OPPONENT', '未知']
  );
  await db.query(
    'DELETE FROM briefing_items WHERE session_id IN (SELECT id FROM training_sessions WHERE match_date = ? AND (opponent = ? OR opponent = ?))',
    [matchDate, 'OPPONENT', '未知']
  );
  await db.query(
    'DELETE FROM training_sessions WHERE match_date = ? AND (opponent = ? OR opponent = ?)',
    [matchDate, 'OPPONENT', '未知']
  );

  const [existing] = await db.query(
    'SELECT id FROM training_sessions WHERE match_date = ? AND lower(opponent) = lower(?)',
    [matchDate, opponent]
  );
  if (existing.length) return existing[0].id;

  const [result] = await db.query(
    'INSERT INTO training_sessions (match_date, opponent, event_name) VALUES (?, ?, ?)',
    [matchDate, opponent, eventName || null]
  );
  return result.insertId;
}

// ========== POST /import-tactics - 导入战术总表 ==========
router.post('/import-tactics', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传战术总表文件 (.xlsx)' });
  const filePath = req.file.path;
  try {
    const data = await runPython('parse_tactics.py', filePath);
    const tactics = data.tactics;
    if (!tactics || !tactics.length) {
      return res.status(400).json({ error: '未解析到战术数据' });
    }

    // 事务：获取新版本号、清空旧数据、批量插入
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 获取当前最大版本号 +1
      const [[{ maxVer }]] = await conn.query('SELECT COALESCE(MAX(version), 0) + 1 as maxVer FROM tactics');
      const version = maxVer;

      // 清空旧数据
      await conn.query('DELETE FROM tactics');

      // 批量插入
      const sql = `INSERT INTO tactics (tactic_id, map_name, team_side, round_type, category, name, description, version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      for (const t of tactics) {
        await conn.query(sql, [
          t.tactic_id, t.map_name, t.team_side,
          t.round_type || null, t.category, t.name || null,
          t.description || null, version
        ]);
      }

      await conn.commit();
      res.json({ message: '战术总表导入成功', count: tactics.length, version });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

// ========== POST /import-briefing - 导入每日简报 ==========
router.post('/import-briefing', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传每日简报文件 (.xlsx)' });
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  try {
    // V5 xlsx 格式：用 JS 解析器（新版）
    if (ext === '.xlsx' || ext === '.xlsm') {
      const data = parseBriefingV5(filePath);
      const sessions = [];

      for (const [dateKey, dateData] of Object.entries(data.dates)) {
        // 跳过空数据/模板 Sheet
        if (!dateData.opponent || dateData.opponent === '___' || dateData.opponent === '' || !dateData.items.length) continue;

        const dateStr = `2026-${dateKey.slice(0, 2)}-${dateKey.slice(2)}`;
        const sessionId = await getOrCreateSession(dateStr, dateData.opponent, null);

        await db.query('DELETE FROM briefing_items WHERE session_id = ?', [sessionId]);

        const sql = `INSERT INTO briefing_items
          (session_id, map_name, team_side, tactic_id, round_type, priority, instruction, notes, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        for (const item of dateData.items) {
          await db.query(sql, [
            sessionId,
            item.map_name || '',
            item.team_side || 'CT',
            item.tactic_id || null,
            item.round_type || null,
            item.priority || '一般',
            item.instruction || '',
            null,
            item.sort_order || 0,
          ]);
        }
        sessions.push({ date: dateStr, session_id: sessionId, opponent: dateData.opponent, items: dateData.items.length });
      }

      if (!sessions.length) {
        return res.status(400).json({ error: '未解析到简报数据，请检查文件格式' });
      }

      return res.json({ message: '简报导入成功', sessions });
    }

    // docx 旧格式 fallback
    const data = await runPython('parse_briefing.py', filePath);
    const { match_date, opponent, event_name, items } = data;

    if (!match_date || !opponent) {
      return res.status(400).json({ error: '无法从简报中提取日期或对手信息' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ error: '未解析到战术条目' });
    }

    const sessionId = await getOrCreateSession(match_date, opponent, event_name);
    await db.query('DELETE FROM briefing_items WHERE session_id = ?', [sessionId]);

    const sql = `INSERT INTO briefing_items
      (session_id, map_name, team_side, tactic_id, round_type, priority, instruction, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const item of items) {
      await db.query(sql, [
        sessionId,
        item.map_name || '',
        item.team_side || 'CT',
        item.tactic_id || null,
        item.round_type || null,
        item.priority || '一般',
        item.instruction || '',
        (item.notes && item.notes !== '一般') ? item.notes : null,
        item.sort_order || 0,
      ]);
    }

    res.json({
      message: '简报导入成功',
      session_id: sessionId,
      match_date, opponent,
      items_count: items.length
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

// ========== POST /import-training-log - 导入训练日志 ==========
router.post('/import-training-log', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传训练日志文件 (.xlsx)' });
  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();
  try {
    // V3 xlsx 格式：用 JS 解析器（新版）
    if (ext === '.xlsx' || ext === '.xlsm') {
      const data = parseTrainingV3(filePath);
      const sessions = [];

      for (const match of data.matches) {
        // 跳过空数据/模板 Sheet
        if (!match.opponent || match.opponent === 'OPPONENT' || match.opponent === '___' || !match.rounds.length) continue;

        const dateStr = `2026-${match.date.slice(0, 2)}-${match.date.slice(2)}`;
        const sessionId = await getOrCreateSession(dateStr, match.opponent, null);

        await db.query('DELETE FROM training_rounds WHERE session_id = ?', [sessionId]);

        const sql = `INSERT INTO training_rounds
          (session_id, round_number, map_name, team_side, round_type,
           command_text, execution_text, first_death_reason,
           issue_grenade, issue_position, issue_aim, issue_comms, issue_tactics,
           round_result, notes, players_involved)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        for (const r of match.rounds) {
          await db.query(sql, [
            sessionId,
            r.round_number,
            r.map_name || '',
            r.team_side || 'CT',
            r.round_type || null,
            r.command_text || null,
            r.execution_text || null,
            r.first_death_reason || null,
            r.issue_grenade ? 1 : 0,
            r.issue_position ? 1 : 0,
            r.issue_aim ? 1 : 0,
            r.issue_comms ? 1 : 0,
            r.issue_tactics ? 1 : 0,
            r.round_result || null,
            r.notes === '一般' ? null : (r.notes || null),
            r.players_involved || null,
          ]);
        }
        sessions.push({ date: dateStr, session_id: sessionId, opponent: match.opponent, rounds: match.rounds.length });
      }

      if (!sessions.length) {
        return res.status(400).json({ error: '未解析到训练日志数据，请检查文件格式' });
      }

      return res.json({ message: '训练日志导入成功', sessions });
    }

    // 旧格式 fallback
    const data = await runPython('parse_training.py', filePath);
    const { match_date, opponent, rounds } = data;

    if (!match_date || !opponent) {
      return res.status(400).json({ error: '无法从训练日志中提取日期或对手信息' });
    }
    if (!rounds || !rounds.length) {
      return res.status(400).json({ error: '未解析到回合数据' });
    }

    const sessionId = await getOrCreateSession(match_date, opponent, null);
    await db.query('DELETE FROM training_rounds WHERE session_id = ?', [sessionId]);

    const sql = `INSERT INTO training_rounds
      (session_id, round_number, map_name, team_side, round_type,
       command_text, execution_text, first_death_reason,
       issue_grenade, issue_position, issue_aim, issue_comms, issue_tactics,
       round_result, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const r of rounds) {
      await db.query(sql, [
        sessionId,
        r.round_number,
        r.map_name || '',
        r.team_side || 'CT',
        r.round_type || null,
        r.command_text || null,
        r.execution_text || null,
        r.first_death_reason || null,
        r.issue_grenade ? 1 : 0,
        r.issue_position ? 1 : 0,
        r.issue_aim ? 1 : 0,
        r.issue_comms ? 1 : 0,
        r.issue_tactics ? 1 : 0,
        r.round_result || null,
        r.notes === '一般' ? null : (r.notes || null),
      ]);
    }

    res.json({
      message: '训练日志导入成功',
      session_id: sessionId,
      match_date, opponent,
      rounds_count: rounds.length
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

// ========== GET /sessions - 获取所有训练赛次 ==========
router.get('/sessions', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        ts.id, ts.match_date, ts.opponent, ts.event_name, ts.created_at,
        (SELECT COUNT(*) FROM briefing_items bi WHERE bi.session_id = ts.id) as briefing_count,
        (SELECT COUNT(*) FROM training_rounds tr WHERE tr.session_id = ts.id) as rounds_count
      FROM training_sessions ts
      ORDER BY ts.match_date DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// ========== GET /tactics - 获取战术总表 ==========
router.get('/tactics', auth, async (req, res) => {
  const { map, side } = req.query;
  let sql = 'SELECT * FROM tactics WHERE 1=1';
  const params = [];
  if (map) { sql += ' AND map_name = ?'; params.push(map); }
  if (side) { sql += ' AND team_side = ?'; params.push(side.toUpperCase()); }
  sql += ' ORDER BY map_name, team_side, tactic_id';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// ========== GET /report/:sessionId - 获取联动报告数据 ==========
router.get('/report/:sessionId', auth, async (req, res) => {
  const { sessionId } = req.params;
  try {
    await ensurePlayerStatsCols();
    // 1. 赛次基本信息
    let session;
    if (typeof sessionId === 'string' && sessionId.includes('|')) {
      const idx = sessionId.indexOf('|');
      const datePart = sessionId.slice(0, idx);
      const oppPart = sessionId.slice(idx + 1);
      session = { id: sessionId, match_date: datePart, opponent: oppPart, event_name: null, notes: null };
    } else {
      const [[s]] = await db.query(
        'SELECT * FROM training_sessions WHERE id = ?', [sessionId]
      );
      if (!s) return res.status(404).json({ error: '赛次不存在' });
      session = s;
    }

    // 2. 简报条目（关联战术详情）
    const [briefing] = await db.query(`
      SELECT bi.*, t.name as tactic_name, t.category as tactic_category, t.description as tactic_description
      FROM briefing_items bi
      LEFT JOIN tactics t ON bi.tactic_id = t.tactic_id
      WHERE bi.session_id = ?
      ORDER BY bi.sort_order
    `, [sessionId]);

    // 3. 训练回合（关联战术详情）
    const [rounds] = await db.query(`
      SELECT tr.*
      FROM training_rounds tr
      WHERE tr.session_id = ?
      ORDER BY tr.map_name, tr.round_number
    `, [sessionId]);

    // 4. JS 层计算 summary
    const totalRounds = rounds.length;
    const wins = rounds.filter(r => r.round_result === 'win').length;
    const losses = rounds.filter(r => r.round_result === 'loss').length;

    // 按地图统计
    const byMap = {};
    rounds.forEach(r => {
      const m = r.map_name || 'Unknown';
      if (!byMap[m]) byMap[m] = { rounds: 0, wins: 0 };
      byMap[m].rounds++;
      if (r.round_result === 'win') byMap[m].wins++;
    });

    // 按回合类型统计
    const byType = {};
    rounds.forEach(r => {
      const t = r.round_type || 'Unknown';
      if (!byType[t]) byType[t] = { rounds: 0, wins: 0 };
      byType[t].rounds++;
      if (r.round_result === 'win') byType[t].wins++;
    });

    // 按阵营统计
    const bySide = { T: { rounds: 0, wins: 0 }, CT: { rounds: 0, wins: 0 } };
    rounds.forEach(r => {
      const s = r.team_side === 'T' ? 'T' : 'CT';
      bySide[s].rounds++;
      if (r.round_result === 'win') bySide[s].wins++;
    });

    // 问题类型汇总
    const issueStats = {
      grenade: rounds.filter(r => r.issue_grenade).length,
      position: rounds.filter(r => r.issue_position).length,
      aim: rounds.filter(r => r.issue_aim).length,
      comms: rounds.filter(r => r.issue_comms).length,
      tactics: rounds.filter(r => r.issue_tactics).length,
    };

    // 简报执行统计：简报中的每个战术，在训练日志中出现了多少次
    const tacticExecution = briefing.map(bi => {
      const related = rounds.filter(r => r.round_type === bi.round_type && r.map_name === bi.map_name);
      return {
        tactic_id: bi.tactic_id,
        tactic_name: bi.tactic_name,
        map_name: bi.map_name,
        team_side: bi.team_side,
        round_type: bi.round_type,
        priority: bi.priority,
        instruction: bi.instruction,
        related_rounds: related.length,
        related_wins: related.filter(r => r.round_result === 'win').length,
      };
    });

    // 真实比分：从 matches 表按 对手+日期 匹配（弹窗显示真实比分，不依赖坏的 round_result）
    let realScores = [], urPlayers = [], oppPlayers = [];
    try {
      const sessDate = (session.match_date || '').slice(0, 10);
      if (sessDate && session.opponent) {
        const [matchRows] = await db.query(
          `SELECT id, map_name, our_score, their_score, ct_score, t_score, opponent_players
           FROM matches
           WHERE date(match_date) = date(?) AND lower(trim(opponent)) = lower(trim(?))
           ORDER BY id`,
          [sessDate, session.opponent]
        );
        // 真实比分 + 半场CT/T(手动录入，没填则为 null）
        realScores = matchRows
          .filter(s => s.our_score != null && s.their_score != null)
          .map(s => ({
            id: s.id,
            map: s.map_name,
            our: s.our_score,
            their: s.their_score,
            ct: s.ct_score,
            t: s.t_score,
            result: s.our_score > s.their_score ? 'win' : s.our_score < s.their_score ? 'loss' : 'draw',
          }));
        // 对手选手（合并各图按 name 汇总，过滤教练 kills=0&deaths=0）
        const oppMap = {};
        for (const m of matchRows) {
          let arr = [];
          try { arr = JSON.parse(m.opponent_players || '[]'); } catch {}
          for (const p of (arr || [])) {
            if (!p || !p.name) continue;
            const k = p.kills || 0, d = p.deaths || 0;
            if (k === 0 && d === 0) continue;
            const o = oppMap[p.name] || (oppMap[p.name] = { name: p.name, kills: 0, deaths: 0, assists: 0, adr: 0, hs: 0, n: 0 });
            o.kills += k; o.deaths += d; o.assists += (p.assists || 0);
            o.adr += (p.adr || 0); o.hs += (p.hsPct ?? p.hsPercent ?? p.hs ?? 0); o.n++;
          }
        }
        // Rating 估算（JSON 无 HLTV rating，按 K/D 估算，UR 与对手同一口径）
        const ratingOf = (k, d) => parseFloat((0.5 + (d > 0 ? k / d : k) * 0.5).toFixed(2));
        oppPlayers = Object.values(oppMap).map(o => ({
          name: o.name,
          kills: o.kills, deaths: o.deaths, assists: o.assists,
          kd: `${o.kills}-${o.deaths}`,
          rating: ratingOf(o.kills, o.deaths),
          adr: o.n ? Math.round(o.adr / o.n) : 0,
          hs: o.n ? Math.round(o.hs / o.n) : 0,
        })).sort((a, b) => b.rating - a.rating);
        // UR 选手（从 player_stats 按本场次的 match 汇总；过滤教练/领队 kills=0&deaths=0）
        const matchIds = matchRows.map(m => m.id);
        if (matchIds.length) {
          const ph = matchIds.map(() => '?').join(',');
          const [psRows] = await db.query(
            `SELECT p.nickname, p.in_game_role,
                    SUM(ps.kills) kills, SUM(ps.deaths) deaths, SUM(ps.assists) assists,
                    ROUND(AVG(CASE WHEN ps.adr    > 0 THEN ps.adr    END), 1) adr,
                    ROUND(AVG(CASE WHEN ps.hs_pct > 0 THEN ps.hs_pct END))     hs
             FROM player_stats ps
             JOIN players p ON p.id = ps.player_id
             WHERE ps.match_id IN (${ph})
             GROUP BY p.id`,
            matchIds
          );
          urPlayers = psRows
            .filter(r => !((r.kills || 0) === 0 && (r.deaths || 0) === 0))
            .map(r => ({
              name: r.nickname,
              role: r.in_game_role || '',
              kills: r.kills || 0, deaths: r.deaths || 0, assists: r.assists || 0,
              kd: `${r.kills}-${r.deaths}`,
              rating: ratingOf(r.kills || 0, r.deaths || 0),
              adr: r.adr || 0,
              hs: r.hs || 0,
            }))
            .sort((a, b) => b.rating - a.rating);
        }
      }
    } catch (e) { console.error('[report] 查比分/选手失败:', e.message); }

    res.json({
      real_scores: realScores,
      players: urPlayers,
      oppPlayers: oppPlayers,
      session: {
        id: session.id,
        match_date: session.match_date,
        opponent: session.opponent,
        event_name: session.event_name,
        notes: session.notes,
      },
      briefing: briefing.map(bi => ({
        id: bi.id,
        map_name: bi.map_name,
        team_side: bi.team_side,
        tactic_id: bi.tactic_id,
        round_type: bi.round_type,
        priority: bi.priority,
        instruction: bi.instruction,
        notes: bi.notes,
        sort_order: bi.sort_order,
        tactic_name: bi.tactic_name,
        tactic_category: bi.tactic_category,
        tactic_description: bi.tactic_description,
      })),
      rounds: rounds.map(r => ({
        ...r,
        issue_grenade: !!r.issue_grenade,
        issue_position: !!r.issue_position,
        issue_aim: !!r.issue_aim,
        issue_comms: !!r.issue_comms,
        issue_tactics: !!r.issue_tactics,
      })),
      summary: {
        total_rounds: totalRounds,
        wins,
        losses,
        unknown: totalRounds - wins - losses,
        win_rate: totalRounds > 0 ? (wins / totalRounds * 100).toFixed(1) : 0,
        by_map: byMap,
        by_type: byType,
        by_side: bySide,
        issue_stats: issueStats,
        tactic_execution: tacticExecution,
        briefing_count: briefing.length,
        rounds_count: totalRounds,
      },
    });
  } catch (e) {
    res.status(500).json({ error: '获取报告失败: ' + e.message });
  }
});

// ==============================================================
// V3/V5 新版 Excel 格式导入 + 联动报告（用于赛训汇报页面）
// ==============================================================
const XLSX = require('xlsx');

const MAP_ALIASES = {
  overpass:'Overpass', op:'Overpass', ovp:'Overpass', 游乐园:'Overpass', 死亡游乐园:'Overpass',
  dust2:'Dust2', d2:'Dust2',
  ancient:'Ancient', anc:'Ancient',
  anubis:'Anubis', anb:'Anubis',
  nuke:'Nuke',
  mirage:'Mirage', mrg:'Mirage',
  train:'Train', inferno:'Inferno',
};
// 动态生成 D2-D25 → Dust2 映射
for (let d = 2; d <= 25; d++) MAP_ALIASES['d' + d] = 'Dust2';

// Map priority codes to human labels (must be in DB constraint: 核心/重点/一般)
const PRIORITY_MAP = { P:'核心', A:'重点', H:'一般', F:'一般', E:'一般', '核心':'核心', '重点':'重点', '一般':'一般' };

// 已知选手 ID 列表（用于从文本中推断参与者）
const KNOWN_PLAYER_IDS = ['0z', 'doomer', 'drace', 'glong', '4ever', 'Glong', 'Doomer', 'Drace', '0Z'];

// ── 解析每日简报 V5 xlsx（M1/M2 双区块，每 sheet 一个日期）──
function parseBriefingV5(filePath) {
  const wb = XLSX.readFile(filePath);
  const result = { dates: {} };

  for (const sn of wb.SheetNames) {
    if (!sn.match(/^\d{4}$/)) continue;
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 5) continue;

    // Row 1 (index 0): Title
    // Row 2 (index 1): Info — extract opponent, VRS, maps
    const infoText = String(rows[1][0] || '');
    const oppMatch = infoText.match(/对手[：:]?\s*([^(\n\r]+)/);
    const opponent = oppMatch ? oppMatch[1].trim() : '未知';
    const mapMatch = infoText.match(/地图[：:]?\s*(.+)/);
    let ourMap = '', theirMap = '';
    if (mapMatch) {
      const parts = mapMatch[1].split('/').map(s => s.trim());
      ourMap = parts[0] || '';
      theirMap = parts[1] || '';
    }

    // Scan for M1 and M2 blocks
    let currentMap = null;
    const items = [];  // { map_name, round_type, tactic_id, instruction, team_side, priority }

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const cellA = String(r[0] || '').trim();
      const cellB = String(r[1] || '').trim();
      const cellC = String(r[2] || '').trim();

      if (!cellA && !cellB) continue;

      // Detect section headers
      if (cellA.includes('图一') || cellA.includes('M1）') || cellA.includes('M1 ·')) {
        currentMap = ourMap || 'M1';
        continue;
      }
      if (cellA.includes('图二') || cellA.includes('M2）') || cellA.includes('M2 ·')) {
        currentMap = theirMap || 'M2';
        continue;
      }
      // Skip sub-header rows (局型/战术要求/战术编号)
      if (cellA === '局型' || cellB === '战术要求') continue;
      // Skip notes
      if (cellA.includes('P=手枪') || cellA.includes('说明')) continue;

      if (!currentMap) continue;
      if (!cellA && !cellB) continue;

      // Parse 局型: e.g., "CT手枪局", "T手枪局", "长枪局", "强钢局"
      let roundType = cellA;
      let teamSide = 'CT'; // default
      const ctMatch = cellA.match(/CT/i);
      const tMatch = cellA.match(/^T/i) || cellA.match(/[（(]?T[）)]?手枪/);
      if (tMatch) teamSide = 'T';

      let priority = '一般';
      // Map round type to database enum (priority must be in: 核心/重点/一般)
      if (/手枪/.test(cellA)) { roundType = '手枪局'; priority = '核心'; }
      else if (/强钢|强起/i.test(cellA)) { roundType = '强钢局'; priority = '重点'; }
      else if (/半起/i.test(cellA)) { roundType = '半起局'; priority = '一般'; }
      else if (/长枪/i.test(cellA)) { roundType = '长枪局'; priority = '一般'; }
      else if (/eco/i.test(cellA.toLowerCase())) { roundType = 'ECO'; priority = '一般'; }

      // Normalize map name
      let mapName = currentMap;
      const mapKey = mapName.toLowerCase();
      if (MAP_ALIASES[mapKey]) mapName = MAP_ALIASES[mapKey];

      items.push({
        map_name: mapName,
        team_side: teamSide,
        round_type: roundType,
        instruction: cellB,
        tactic_id: cellC || null,
        priority: cellC ? (PRIORITY_MAP[cellC] || '一般') : priority,
        sort_order: items.length,
      });
    }
    if (items.length > 0) {
      result.dates[sn] = { opponent, items, count: items.length };
    }
  }
  return result;
}

// ── 解析训练日志 V3 xlsx（A-L列，多 sheet，每 sheet 一场比赛）──
function parseTrainingV3(filePath) {
  const wb = XLSX.readFile(filePath);
  const matches = [];

  // Parse time string like "01:35" or "1:35" to seconds
  function parseTimeToSeconds(timeStr) {
    if (!timeStr) return null;
    const s = String(timeStr).trim();
    const m = s.match(/^(\d+):(\d+)$/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    return null;
  }

  for (const sn of wb.SheetNames) {
    const parts = sn.match(/^(\d{4})_vs_(.+)/i);
    if (!parts) continue;

    const dateKey = parts[1];
    const opponentRaw = parts[2].trim();
    // Skip placeholder sheets (OPPONENT not yet replaced by coach)
    if (opponentRaw.toUpperCase() === 'OPPONENT') continue;
    const opponent = opponentRaw.replace(/_/g, ' ');

    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 5) continue;
    const rounds = [];
    for (let i = 4; i < rows.length; i++) {  // Row 5 (index 4) = first data
      const r = rows[i];
      const mapRaw = String(r[0] || '').trim();
      const roundId = String(r[1] || '').trim();
      if (!mapRaw || !roundId) continue;

      const mapName = MAP_ALIASES[mapRaw.toLowerCase()] || mapRaw;
      const teamSide = String(r[2] || '').trim();           // C: 阵营
      const tactic = String(r[3] || '').trim();              // D: 战术
      const execution = String(r[4] || '').trim();           // E: 执行度
      const coachNoteRaw = String(r[5] || '').trim();           // F: 教练点评
      // 评价内容仅有"一般"二字 → 忽略
      const coachNote = coachNoteRaw === '一般' ? '' : coachNoteRaw;
      const responsible = String(r[6] || '').trim();         // G: 责任人
      const iglCommand = String(r[7] || '').trim();          // H: IGL指令
      const fdId = String(r[8] || '').trim();                // I: 首死ID
      const fdTimeRaw = r[9];                                // J: 首死时间
      const fdCause = String(r[10] || '').trim();            // K: 首死原因
      const roundResult = String(r[11] || '').trim();        // L: 胜负

      // Parse time
      let fdTime = '';
      let fdTimeSeconds = null;
      if (fdTimeRaw) {
        fdTimeSeconds = parseTimeToSeconds(fdTimeRaw);
        if (fdTimeRaw && typeof fdTimeRaw === 'number') {
          const ts = Math.round(fdTimeRaw * 86400);
          fdTimeSeconds = ts;
          fdTime = Math.floor(ts / 60) + ':' + String(ts % 60).padStart(2, '0');
        } else {
          fdTime = String(fdTimeRaw).trim();
          if (parseTimeToSeconds(fdTime) !== null) {
            fdTimeSeconds = parseTimeToSeconds(fdTime);
          }
        }
      }

      // First death reason: only keep 1:00~1:55 (60-115s)
      // 评价内容仅有"一般"二字 → 忽略，不记录为首死原因
      let firstDeathReason = '';
      if (fdId && fdCause !== '一般') {
        const inRange = fdTimeSeconds === null || (fdTimeSeconds >= 60 && fdTimeSeconds <= 115);
        if (inRange) {
          firstDeathReason = `${fdId} @ ${fdTime} ${fdCause}`.trim();
        }
      } else if (fdId && fdCause === '一般') {
        console.log(`[SKIP 一般] 训练日志 R${roundId} ${mapName} fdCause="一般" → 已忽略`);
      }

      // Determine round result from L column (胜/负)
      let result = null;
      if (roundResult === '胜') result = 'win';
      else if (roundResult === '负') result = 'loss';

      // Determine team side from C column or derive
      let side = teamSide;
      if (!side || (side !== 'CT' && side !== 'T')) {
        side = 'CT'; // default
      }

      // Build command_text from IGL + tactic
      const cmdText = [iglCommand, tactic ? `战术: ${tactic}` : '', coachNote].filter(Boolean).join(' | ');

      // Build execution_text
      const execText = execution || null;

      // Build players_involved: 优先读 G列(责任人)，为空则从文本推断
      let players = responsible || '';
      if (!players) {
        // 从首死ID、IGL指令、教练点评中推断涉及的选手
        const searchText = (fdId + ' ' + iglCommand + ' ' + coachNote).toLowerCase();
        const found = new Set();
        for (const pid of KNOWN_PLAYER_IDS) {
          if (searchText.includes(pid.toLowerCase())) found.add(pid.toLowerCase());
        }
        players = [...found].join(',');
      }

      // ── Issue detection ──
      // F列(教练点评) + K列(首死原因) = 走位/枪法/沟通/道具 -> F列+K列关键词
      // 战术 -> F列+K列关键词 + H列IGL指令 vs 简报比对
      const fkText = (coachNote + ' ' + fdCause).toLowerCase();
      const issues = {
        grenade:  /烟失败|雷失败|火失败|闪失败|丢次|丢呲|丢坏|乱丢|浪费|乱扔/.test(fkText),
        position: /peek|走位|身位|拉大了|挤|撞|迷路|前压/.test(fkText),
        aim:      /马了|没接住|泼水了|没架住|架不住/.test(fkText),
        comms:    /沟通|交流|告诉/.test(fkText),
        tactics:  /战术打错|战术忘记|忘记战术|战术不执行|不执行战术/.test(fkText),
      };

      rounds.push({
        round_number: roundId,
        map_name: mapName,
        team_side: side,
        round_type: null,
        command_text: cmdText,
        execution_text: execText,
        first_death_reason: firstDeathReason,
        issue_grenade: issues.grenade ? 1 : 0,
        issue_position: issues.position ? 1 : 0,
        issue_aim: issues.aim ? 1 : 0,
        issue_comms: issues.comms ? 1 : 0,
        issue_tactics: issues.tactics ? 1 : 0,
        round_result: result,
        notes: coachNote || null,
        players_involved: players,
        _fd_id: fdId,
        _fd_time: fdTime,
        _fd_cause: fdCause,
        _execution: execution,
        _responsible: responsible,
      });
    }
    matches.push({ date: dateKey, opponent, rounds, round_count: rounds.length });
  }
  return { matches };
}

// ── POST /upload-report — 上传简报+训练日志，UPSERT ──
router.post('/upload-report', adminAuth,
  upload.fields([
    { name: 'briefing', maxCount: 1 },
    { name: 'training', maxCount: 1 },
  ]),
  async (req, res) => {
    const briefingFile = req.files?.briefing?.[0];
    const trainingFile = req.files?.training?.[0];

    if (!briefingFile || !trainingFile) {
      return res.status(400).json({ error: '请同时上传每日简报(.xlsx)和训练日志(.xlsx)' });
    }

    try {
      const briefingData = parseBriefingV5(briefingFile.path);
      const trainingData = parseTrainingV3(trainingFile.path);

      const sessions = [];
      for (const match of trainingData.matches) {
        // 跳过空数据/模板 Sheet
        if (!match.opponent || match.opponent === 'OPPONENT' || match.opponent === '___' || !match.rounds.length) continue;
        const dateStr = `2026-${match.date.slice(0, 2)}-${match.date.slice(2)}`;
        const sessionId = await getOrCreateSession(dateStr, match.opponent, null);

        // UPSERT: delete old data for this session, insert new
        await db.query('DELETE FROM training_rounds WHERE session_id = ?', [sessionId]);

        const sql = `INSERT INTO training_rounds
          (session_id, round_number, map_name, team_side, round_type,
           command_text, execution_text, first_death_reason,
           issue_grenade, issue_position, issue_aim, issue_comms, issue_tactics,
           round_result, notes, players_involved)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        for (const r of match.rounds) {
          await db.query(sql, [
            sessionId, r.round_number, r.map_name, r.team_side, r.round_type,
            r.command_text, r.execution_text, r.first_death_reason,
            r.issue_grenade, r.issue_position, r.issue_aim, r.issue_comms, r.issue_tactics,
            r.round_result,
            r.notes === '一般' ? null : r.notes,
            r.players_involved || null,
          ]);
        }

        // Upsert briefing items — auto-match tactic IDs (skip empty data)
        const dateKey = match.date;
        if (briefingData.dates[dateKey] && briefingData.dates[dateKey].items.length) {
          await db.query('DELETE FROM briefing_items WHERE session_id = ?', [sessionId]);

          // Map round type to tactics table code
          const ROUND_TYPE_CODE = { '长枪局': 'F', '半起局': 'H', '强钢局': 'A', '手枪局': 'P', 'ECO': 'E' };

          const [allTactics] = await db.query(
            'SELECT tactic_id, map_name, team_side, round_type, name FROM tactics'
          );

          const biSql = `INSERT INTO briefing_items
            (session_id, map_name, team_side, tactic_id, round_type, priority, instruction, notes, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          for (const bi of briefingData.dates[dateKey].items) {
            // Auto-match tactic from tactics table
            let matchedId = null;
            const rtCode = ROUND_TYPE_CODE[bi.round_type] || '';
            const instr = (bi.instruction || '').trim();
            if (rtCode && instr) {
              const candidate = allTactics.find(t =>
                t.map_name === bi.map_name &&
                t.round_type === rtCode &&
                (t.name.includes(instr) || instr.includes(t.name))
              );
              if (candidate) matchedId = candidate.tactic_id;
            }

            await db.query(biSql, [
              sessionId,
              bi.map_name || '',
              bi.team_side || 'CT',
              matchedId,
              bi.round_type || null,
              bi.priority || '一般',
              bi.instruction || '',
              null,              // notes: 评价内容仅"一般"不录入
              bi.sort_order || 0,
            ]);
          }
        }

        sessions.push({ sessionId, date: match.date, opponent: match.opponent, rounds: match.round_count });
      }

      res.json({
        message: '导入成功',
        sessions,
        briefing_dates: Object.keys(briefingData.dates),
        training_matches: trainingData.matches.map(m => ({
          date: m.date, opponent: m.opponent, rounds: m.round_count,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: '导入失败: ' + e.message });
    } finally {
      try { fs.unlinkSync(briefingFile?.path); } catch {}
      try { fs.unlinkSync(trainingFile?.path); } catch {}
    }
  }
);

// ── GET /aggregated-report?dates=0526,0527,0528 - 多日汇总报告 ──
router.get('/aggregated-report', auth, async (req, res) => {
  const dates = (req.query.dates || '').split(',').filter(Boolean);
  try {
    let whereClause = '';
    const params = [];
    if (dates.length > 0) {
      const dateConditions = dates.map(d => {
        const ds = `2026-${d.slice(0, 2)}-${d.slice(2)}`;
        params.push(ds);
        return 'ts.match_date = ?';
      });
      whereClause = 'WHERE ' + dateConditions.join(' OR ');
    }

    // Fetch all matching sessions
    const [sessions] = await db.query(
      `SELECT * FROM training_sessions ts ${whereClause} ORDER BY ts.match_date`, params
    );

    const allReports = [];
    for (const session of sessions) {
      const [briefing] = await db.query(
        'SELECT * FROM briefing_items WHERE session_id = ? ORDER BY sort_order', [session.id]
      );
      const [rounds] = await db.query(
        'SELECT * FROM training_rounds WHERE session_id = ? ORDER BY map_name, round_number', [session.id]
      );

      const wins = rounds.filter(r => r.round_result === 'win').length;
      const losses = rounds.filter(r => r.round_result === 'loss').length;

      allReports.push({
        session: {
          id: session.id,
          match_date: session.match_date,
          opponent: session.opponent,
        },
        briefing: briefing.map(bi => ({
          ...bi,
          issue_grenade: !!bi.issue_grenade,
          issue_position: !!bi.issue_position,
          issue_aim: !!bi.issue_aim,
          issue_comms: !!bi.issue_comms,
          issue_tactics: !!bi.issue_tactics,
        })),
        rounds: rounds.map(r => ({
          ...r,
          issue_grenade: !!r.issue_grenade,
          issue_position: !!r.issue_position,
          issue_aim: !!r.issue_aim,
          issue_comms: !!r.issue_comms,
          issue_tactics: !!r.issue_tactics,
        })),
        summary: {
          total_rounds: rounds.length,
          wins, losses,
          win_rate: rounds.length > 0 ? (wins / rounds.length * 100).toFixed(1) : 0,
          briefing_count: briefing.length,
        },
      });
    }

    res.json({ reports: allReports, count: allReports.length });
  } catch (e) {
    res.status(500).json({ error: '获取汇总报告失败: ' + e.message });
  }
});

// ==============================================================
// ETL Sync — 一键同步四张Excel表到数据库
// ==============================================================
router.post('/etl-sync', adminAuth, async (req, res) => {
  const scriptPath = path.join(SCRIPTS_DIR, 'etl_sync_all.py');
  try {
    const result = await new Promise((resolve, reject) => {
      const pythonExe = process.platform === 'win32'
        ? 'C:\\Users\\Administrator.DESKTOP-NHVJ2AT\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe'
        : 'python3';
      execFile(pythonExe,
        [scriptPath],
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr || error.message));
          // Extract JSON from output
          const match = stdout.match(/__JSON__START__\r?\n([\s\S]*?)\r?\n__JSON__END__/);
          if (match) {
            resolve(JSON.parse(match[1]));
          } else {
            resolve({ message: stdout.trim() });
          }
        }
      );
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'ETL同步失败: ' + e.message });
  }
});

// ==============================================================
// GET /dashboard — 全局仪表盘数据（轻量统计+详情数据）
// ==============================================================
router.get('/dashboard', auth, async (req, res) => {
  try {
    // 动态日期范围：支持 ?start=YYYY-MM-DD&end=YYYY-MM-DD 或 ?days=N
    const { start, end, days } = req.query;
    const endDate = end || new Date().toISOString().split('T')[0];
    const startDate = start || (days
      ? new Date(Date.now() - parseInt(days) * 86400000).toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]);
    const dateFilter = `ts.match_date >= '${startDate}' AND ts.match_date <= '${endDate}'`;
    const matchDateFilter = `match_date >= '${startDate}' AND match_date <= '${endDate}'`;

    // Cache date range for match-records popup
    dateCache.start = startDate;
    dateCache.end = endDate;
    dateCache.ts = Date.now();
    // ── Overview (count sessions even without rounds, but exclude placeholder opponents) ──
    const [[overview]] = await db.query(`
      SELECT
        COUNT(DISTINCT ts.id) as total_matches,
        COUNT(tr.id) as total_rounds,
        SUM(CASE WHEN tr.round_result = 'win' THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN tr.round_result = 'loss' THEN 1 ELSE 0 END) as total_losses,
        SUM(CASE WHEN tr.round_result IS NOT NULL THEN 1 ELSE 0 END) as known_results,
        SUM(CASE WHEN (tr.issue_grenade + tr.issue_position + tr.issue_aim + tr.issue_comms + tr.issue_tactics) > 0 THEN 1 ELSE 0 END) as rounds_with_issues
      FROM training_sessions ts
      LEFT JOIN training_rounds tr ON ts.id = tr.session_id
      WHERE ${dateFilter}
        AND ts.opponent NOT IN ('OPPONENT', '未知', '___')
        AND ts.opponent NOT LIKE '%放假%' AND ts.opponent NOT LIKE '%开会%' AND ts.opponent NOT LIKE '%休息%'
    `);
    // ── Match-level win rate (from matches table, map-level results) ──
    // 数据完整性过滤：排除垃圾行（空日期/占位对手）
    const matchIntegrityFilter = `match_date IS NOT NULL AND match_date != '' AND length(match_date) >= 8 AND opponent NOT IN ('match_data', 'OPPONENT', '___')`;
    const [[matchOverview]] = await db.query(`
      SELECT
        COUNT(*) as total_maps,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as map_wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as map_losses,
        SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as map_draws
      FROM matches
      WHERE ${matchDateFilter}
        AND match_type = 'scrim'
        AND ${matchIntegrityFilter}
    `);
    // ── Data integrity warning ──
    if (overview.total_matches > 0) {
      const expectedMaxMaps = overview.total_matches * 5; // 一场训练赛最多5张图
      const actualMaps = matchOverview.total_maps || 0;
      if (actualMaps > expectedMaxMaps) {
        console.warn(`[Dashboard Integrity] 数据异常: ${overview.total_matches} 场训练赛却有 ${actualMaps} 张地图记录 (预期上限 ${expectedMaxMaps})，请检查 matches 表数据`);
      }
    }

    // ── Issue Distribution ──
    const [issueDist] = await db.query(`
      SELECT
        SUM(tr.issue_grenade) as grenade,
        SUM(tr.issue_position) as position,
        SUM(tr.issue_aim) as aim,
        SUM(tr.issue_comms) as comms,
        SUM(tr.issue_tactics) as tactics,
        SUM(CASE WHEN tr.first_death_reason IS NOT NULL AND tr.first_death_reason != '' AND tr.first_death_reason != '首死ID @ 首死时间 首死原因' THEN 1 ELSE 0 END) as first_death_raw
      FROM training_rounds tr
      JOIN training_sessions ts ON tr.session_id = ts.id
      WHERE ${dateFilter}
    `);

    // ── Per-map Stats + match-level results ──
    const [mapStats] = await db.query(`
      SELECT
        tr.map_name,
        COUNT(*) as rounds,
        COUNT(DISTINCT tr.session_id) as session_count,
        SUM(CASE WHEN tr.round_result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN tr.round_result = 'loss' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN tr.round_result IS NOT NULL THEN 1 ELSE 0 END) as known_results,
        SUM(CASE WHEN (tr.issue_grenade + tr.issue_position + tr.issue_aim + tr.issue_comms + tr.issue_tactics) > 0 THEN 1 ELSE 0 END) as issue_rounds
      FROM training_rounds tr
      JOIN training_sessions ts ON tr.session_id = ts.id
      WHERE ${dateFilter}
      GROUP BY tr.map_name
      ORDER BY rounds DESC
    `);

    // ── Fetch map-level results from matches table (match-level W/L) ──
    const [matchMapResults] = await db.query(`
      SELECT m.map_name,
        SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as match_wins,
        SUM(CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END) as match_losses,
        SUM(CASE WHEN m.result = 'draw' THEN 1 ELSE 0 END) as match_draws,
        COUNT(*) as total_matches
      FROM matches m
      WHERE m.${matchDateFilter}
        AND m.match_type = 'scrim'
        AND ${matchIntegrityFilter}
      GROUP BY m.map_name
    `);
    const mapResults = {};
    for (const r of matchMapResults) {
      mapResults[r.map_name] = {
        match_wins: r.match_wins || 0,
        match_losses: r.match_losses || 0,
        match_draws: r.match_draws || 0,
      };
    }

    // Merge match-level W/L into map stats (filter known CS2 maps only)
    const KNOWN_MAPS = new Set(['Mirage','Dust2','Inferno','Nuke','Ancient','Anubis','Overpass','Vertigo','Train']);
    let enrichedMapStats = mapStats
      .filter(m => KNOWN_MAPS.has(m.map_name))
      .map(m => {
        const mr = mapResults[m.map_name];
        return {
          ...m,
          match_wins: mr ? mr.match_wins : 0,
          match_losses: mr ? mr.match_losses : 0,
          match_draws: mr ? mr.match_draws : 0,
        };
      });
    // Include maps from matches table that don't have training rounds
    for (const [mapName, mr] of Object.entries(mapResults)) {
      if (!KNOWN_MAPS.has(mapName)) continue;
      if (!enrichedMapStats.find(m => m.map_name === mapName)) {
        enrichedMapStats.push({
          map_name: mapName, rounds: 0, session_count: 0, wins: 0, losses: 0, known_results: 0, issue_rounds: 0,
          match_wins: mr.match_wins, match_losses: mr.match_losses, match_draws: mr.match_draws,
        });
      }
    }
    enrichedMapStats.sort((a, b) => b.rounds - a.rounds || (b.match_wins + b.match_losses) - (a.match_wins + a.match_losses));

    // ── Per-match Summary ──
    const [matchSummary] = await db.query(`
      SELECT
        ts.id, ts.match_date, ts.opponent,
        COUNT(tr.id) as rounds,
        SUM(CASE WHEN (tr.issue_grenade + tr.issue_position + tr.issue_aim + tr.issue_comms + tr.issue_tactics) > 0 THEN 1 ELSE 0 END) as issue_rounds
      FROM training_sessions ts
      LEFT JOIN training_rounds tr ON ts.id = tr.session_id
      WHERE ${dateFilter}
        AND ts.opponent NOT IN ('OPPONENT', '未知', '___')
        AND ts.opponent NOT LIKE '%放假%' AND ts.opponent NOT LIKE '%开会%' AND ts.opponent NOT LIKE '%休息%'
      GROUP BY ts.id
      ORDER BY ts.match_date DESC
    `);

    // Build valid session keys from matchSummary (only these have complete training data)
    // key format: "date|opponent" (lowercase, normalized)
    const validSessionKeys = new Set(
      matchSummary.map(m => {
        const d = (m.match_date || '').split('T')[0];
        return d + '|' + (m.opponent || '').toLowerCase();
      })
    );

    // ── 比赛记录: 改以 matches 表为主(与近期赛事/地图胜率一致),不再依赖旧表 training_sessions ──
    // 问题数(issue_rounds)从新表 round_errors 按"日期+对手"统计
    const [errByDateOpp] = await db.query(`
      SELECT l.log_date AS d, LOWER(l.opponent) AS opp, COUNT(*) AS issue_cnt
      FROM round_errors re
      JOIN training_log_rounds r ON r.id = re.round_id
      JOIN training_logs_v2 l ON l.id = r.log_id
      WHERE l.log_date >= '${startDate}' AND l.log_date <= '${endDate}'
        AND re.category != '教练点赞'
      GROUP BY l.log_date, LOWER(l.opponent)
    `);
    const issueByKey = {};
    for (const e of errByDateOpp) issueByKey[(e.d||'') + '|' + (e.opp||'')] = e.issue_cnt;

    // ── 教练点评总结: 每场(日期+对手)聚合 training_log_rounds 的逐回合教练点评 ──
    // 关联路径与 issueByKey 一致(log_id → training_logs_v2 的 log_date+opponent), key = 日期|对手(小写)
    const [coachRows] = await db.query(`
      SELECT l.log_date AS d, LOWER(l.opponent) AS opp,
             r.map_name AS map_name, r.round_number AS rnd, r.coach_comment AS note
      FROM training_log_rounds r
      JOIN training_logs_v2 l ON l.id = r.log_id
      WHERE l.log_date >= '${startDate}' AND l.log_date <= '${endDate}'
        AND r.coach_comment IS NOT NULL AND TRIM(r.coach_comment) != ''
      ORDER BY l.log_date, r.map_name, CAST(REPLACE(r.round_number,'R','') AS INTEGER), r.round_number
    `);
    const coachByKey = {};
    for (const c of coachRows) {
      const k = (c.d||'') + '|' + (c.opp||'');
      if (!coachByKey[k]) coachByKey[k] = [];
      coachByKey[k].push({ map: c.map_name || '', round: c.rnd || '', note: String(c.note).trim() });
    }

    // Fetch all matches for date range and aggregate by date+opponent
    const [allMatches] = await db.query(`
      SELECT match_date, opponent, map_name, result, our_score, their_score, bo_format
      FROM matches
      WHERE ${matchDateFilter}
        AND match_type = 'scrim'
        AND ${matchIntegrityFilter}
      ORDER BY match_date, opponent, map_name
    `);

    // Group matches by date+opponent (case-insensitive)
    // 比赛记录以 matches 表为准, 不再用旧表 training_sessions 过滤(否则新比赛因旧表无记录被漏掉)
    const matchesByKey = {};
    const filteredMatches = [];
    for (const m of allMatches) {
      const dateKey = (m.match_date || '').split(' ')[0];
      const key = dateKey + '|' + (m.opponent || '').toLowerCase();
      filteredMatches.push(m);
      if (!matchesByKey[key]) matchesByKey[key] = [];
      matchesByKey[key].push(m);
    }

    // Recompute wins/losses from filtered matches (三表联动校验后的准确值)
    const validatedMapWins = filteredMatches.filter(x => x.result === 'win').length;
    const validatedMapLosses = filteredMatches.filter(x => x.result === 'loss').length;
    const validatedMapDraws = filteredMatches.filter(x => x.result === 'draw').length;

    // ── 比赛记录列表: 直接从 matches 表按"日期+对手"聚合(以matches为准) ──
    const matchGroups = {};   // key -> { match_date, opponent, maps:[] }
    for (const m of filteredMatches) {
      const dateStr = (m.match_date || '').split('T')[0].split(' ')[0];
      const key = dateStr + '|' + (m.opponent || '').toLowerCase();
      if (!matchGroups[key]) matchGroups[key] = { match_date: dateStr, opponent: m.opponent, maps: [] };
      matchGroups[key].maps.push(m);
    }
    const enrichedMatchSummary = Object.entries(matchGroups).map(([key, g]) => {
      const dateMatches = g.maps;
      const totalMaps = dateMatches.length;
      const mapWins = dateMatches.filter(x => x.result === 'win').length;
      const mapLosses = dateMatches.filter(x => x.result === 'loss').length;
      const mapDraws = dateMatches.filter(x => x.result === 'draw').length;
      // 总回合 = 各地图 our_score+their_score 之和; 问题数从新表round_errors取
      const rounds = dateMatches.reduce((s,x)=> s + (Number(x.our_score)||0) + (Number(x.their_score)||0), 0);
      return {
        id: key,                          // 用 date|opponent 作为行key
        match_date: g.match_date,
        opponent: g.opponent,
        rounds,
        issue_rounds: issueByKey[key] || 0,
        total_maps: totalMaps,
        map_wins: mapWins,
        map_losses: mapLosses,
        map_draws: mapDraws,
        map_results: dateMatches.map(x => ({
          map_name: x.map_name,
          result: x.result,
          our_score: x.our_score,
          their_score: x.their_score,
        })),
        coach_notes: coachByKey[key] || [],   // 该场逐回合教练点评(教练点评总结)
      };
    }).sort((a,b)=> (b.match_date||'').localeCompare(a.match_date||''));   // 按日期倒序

    // ── Per-player stats ──
    const [allRounds] = await db.query(`
      SELECT tr.id, tr.session_id, tr.round_number, tr.map_name, tr.team_side,
             tr.command_text, tr.first_death_reason, tr.players_involved, tr.notes,
             tr.issue_grenade, tr.issue_position, tr.issue_aim, tr.issue_comms, tr.issue_tactics,
             tr.round_result
      FROM training_rounds tr
      JOIN training_sessions ts ON tr.session_id = ts.id
      WHERE ${dateFilter}
        AND (tr.issue_grenade + tr.issue_position + tr.issue_aim + tr.issue_comms + tr.issue_tactics + CASE WHEN tr.first_death_reason IS NOT NULL AND tr.first_death_reason != '' AND tr.first_death_reason NOT LIKE '% 一般' THEN 1 ELSE 0 END) > 0
      ORDER BY tr.session_id, tr.map_name, tr.round_number
    `);

    // Build player stats from players_involved (correct names from roster)
    const playerMap = {
      'doomer': { name: 'Doomer', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      'Doomer': { name: 'Doomer', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      'drace':  { name: 'drace', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      '0z':     { name: '0z', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      'glong':  { name: 'gLong', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      'gLong':  { name: 'gLong', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
      '4ever':  { name: '4ever', grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, first_death: 0 },
    };

    for (const r of allRounds) {
      const players = String(r.players_involved || '').toLowerCase().split(',').map(p => p.trim()).filter(Boolean);
      if (players.length === 0) continue;
      for (const pid of players) {
        const key = String(pid).toLowerCase();
        if (!playerMap[key]) continue;
        if (r.issue_grenade) playerMap[key].grenade++;
        if (r.issue_position) playerMap[key].position++;
        if (r.issue_aim) playerMap[key].aim++;
        if (r.issue_comms) playerMap[key].comms++;
        if (r.issue_tactics) playerMap[key].tactics++;
      }
    }

    // First death per player — parse fd_id from first_death_reason, count if fd_time >= 1:00
    for (const r of allRounds) {
      const fdr = r.first_death_reason || '';
      if (!fdr) continue;
      const atIdx = fdr.indexOf(' @ ');
      if (atIdx === -1) continue;
      const fdId = fdr.substring(0, atIdx).toLowerCase().trim();
      const rest = fdr.substring(atIdx + 3);
      const spaceIdx = rest.indexOf(' ');
      const fdTime = spaceIdx !== -1 ? rest.substring(0, spaceIdx) : rest;
      const parts = fdTime.split(':');
      if (parts.length !== 2) continue;
      const mins = parseInt(parts[0], 10);
      if (isNaN(mins) || mins < 1) continue;
      const key = fdId;
      if (playerMap[key]) playerMap[key].first_death = (playerMap[key].first_death || 0) + 1;
    }

    // ── Player Performance: K/D/A from player_stats + matches within date range ──
    const [kdRows] = await db.query(`
      SELECT p.nickname, COUNT(DISTINCT ps.match_id) as matches,
             SUM(ps.kills) as kills, SUM(ps.deaths) as deaths,
             ROUND(AVG(ps.adr), 1) as avg_adr
      FROM player_stats ps
      JOIN matches m ON ps.match_id = m.id
      JOIN players p ON ps.player_id = p.id
      WHERE m.match_date >= '${startDate}' AND m.match_date <= '${endDate}'
        AND m.match_type = 'scrim'
      GROUP BY p.nickname
      ORDER BY kills DESC
    `);

    const kdMap = {};
    kdRows.forEach(r => {
      kdMap[r.nickname.toLowerCase()] = {
        nickname: r.nickname, matches: r.matches,
        kills: r.kills, deaths: r.deaths, avg_adr: r.avg_adr,
      };
    });

    // Merge K/D with problem stats (fallback to pure K/D if no problem data)
    const hasProblemData = Object.values(playerMap).some(v => (v.grenade + v.position + v.aim + v.comms + v.tactics) > 0);
    let playerPerformance;
    if (hasProblemData) {
      playerPerformance = Object.entries(playerMap)
        .filter(([_, v]) => (v.grenade + v.position + v.aim + v.comms + v.tactics) > 0)
        .map(([pid, stats]) => {
          const kd = kdMap[pid.toLowerCase()] || { nickname: stats.name, matches: 0, kills: 0, deaths: 0, avg_adr: 0 };
          return {
            id: pid, nickname: stats.name, matches: kd.matches,
            kills: kd.kills || 0, deaths: kd.deaths || 0,
            kd_ratio: kd.deaths > 0 ? (kd.kills / kd.deaths).toFixed(2) : '0.00',
            avg_adr: kd.avg_adr || 0,
            grenade: stats.grenade, position: stats.position, aim: stats.aim, comms: stats.comms, tactics: stats.tactics,
            issue_total: stats.grenade + stats.position + stats.aim + stats.comms + stats.tactics,
          };
        }).sort((a, b) => b.issue_total - a.issue_total);
    } else {
      playerPerformance = Object.values(kdMap).map(kd => ({
        id: kd.nickname.toLowerCase(), nickname: kd.nickname, matches: kd.matches,
        kills: kd.kills || 0, deaths: kd.deaths || 0,
        kd_ratio: kd.deaths > 0 ? (kd.kills / kd.deaths).toFixed(2) : '0.00',
        avg_adr: kd.avg_adr || 0,
        grenade: 0, position: 0, aim: 0, comms: 0, tactics: 0, issue_total: 0,
      })).sort((a, b) => b.kills - a.kills);
    }

    // ── Helpers: parse combined fields back to raw columns ──
    const parseFirstDeath = (fdr) => {
      if (!fdr) return { fd_id: '', fd_time: '', fd_cause: '' };
      const atIdx = fdr.indexOf(' @ ');
      if (atIdx === -1) return { fd_id: fdr, fd_time: '', fd_cause: '' };
      const fd_id = fdr.substring(0, atIdx);
      const rest = fdr.substring(atIdx + 3);
      const spaceIdx = rest.indexOf(' ');
      if (spaceIdx === -1) return { fd_id, fd_time: rest, fd_cause: '' };
      return { fd_id, fd_time: rest.substring(0, spaceIdx), fd_cause: rest.substring(spaceIdx + 1) };
    };
    const parseTactic = (cmd) => {
      if (!cmd) return '';
      const m = cmd.match(/战术:\s*(.+?)(?:\s*\||$)/);
      return m ? m[1].trim() : '';
    };

    // ── Build response ──
    // 胜负统计：三表联动校验后使用 validated values（仅统计有训练日志的 match 数据）
    const totalMatches = Object.keys(matchGroups).length;
    const totalRounds = filteredMatches.reduce((s,x)=> s + (Number(x.our_score)||0) + (Number(x.their_score)||0), 0);    const mapWins = validatedMapWins;
    const mapLosses = validatedMapLosses;
    const mapDraws = validatedMapDraws;

    // Special events in date range
    const [specialEventRows] = await db.query(
      `SELECT date, note FROM special_events WHERE date >= '${startDate}' AND date <= '${endDate}' ORDER BY date`
    );

    res.json({
      overview: {
        total_matches: totalMatches,
        total_rounds: totalRounds,
        total_wins: mapWins,
        total_losses: mapLosses,
        total_draws: mapDraws,
        known_results: mapWins + mapLosses,
        win_rate: (mapWins + mapLosses) > 0 ? (mapWins / (mapWins + mapLosses) * 100).toFixed(1) : 0,
        rounds_with_issues: overview.rounds_with_issues || 0,
        issue_free_rate: totalRounds > 0 ? ((totalRounds - (overview.rounds_with_issues || 0)) / totalRounds * 100).toFixed(1) : 0,
        // Match-level stats (三表联动校验: 仅统计有训练日志的比赛)
        match_total_maps: validatedMapWins + validatedMapLosses + validatedMapDraws,
        match_wins: mapWins,
        match_losses: mapLosses,
        match_draws: mapDraws,
        match_win_rate: (mapWins + mapLosses) > 0 
          ? (mapWins / (mapWins + mapLosses) * 100).toFixed(1) 
          : 0,
      },
      issue_distribution: {
        grenade: { count: issueDist[0].grenade || 0 },
        position: { count: issueDist[0].position || 0 },
        aim: { count: issueDist[0].aim || 0 },
        comms: { count: issueDist[0].comms || 0 },
        tactics: { count: issueDist[0].tactics || 0 },
        first_death: { count: allRounds.filter(r => {
          if (!r.first_death_reason || r.first_death_reason === '首死ID @ 首死时间 首死原因') return false;
          const atIdx = r.first_death_reason.indexOf(' @ ');
          if (atIdx === -1) return false;
          const rest = r.first_death_reason.substring(atIdx + 3);
          const spaceIdx = rest.indexOf(' ');
          const fdTime = spaceIdx !== -1 ? rest.substring(0, spaceIdx) : rest;
          const parts = fdTime.split(':');
          if (parts.length !== 2) return false;
          const mins = parseInt(parts[0], 10);
          return !isNaN(mins) && mins >= 1;
        }).length },
      },
      map_stats: enrichedMapStats,
      match_summary: enrichedMatchSummary,
      player_stats: Object.entries(playerMap)
        .map(([pid, stats]) => ({
          id: pid,
          name: stats.name,
          grenade: stats.grenade,
          position: stats.position,
          aim: stats.aim,
          comms: stats.comms,
          tactics: stats.tactics,
          first_death: stats.first_death || 0,
          total: stats.grenade + stats.position + stats.aim + stats.comms + stats.tactics + (stats.first_death || 0),
        }))
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total),
      player_performance: playerPerformance,
      all_issue_rounds: allRounds
        .filter(r => !(r.first_death_reason || '').endsWith(' 一般'))
        .map(r => {
        const fd = parseFirstDeath(r.first_death_reason);
        return {
          id: r.id,
          round_number: r.round_number,
          map_name: r.map_name,
          team_side: r.team_side,
          tactic: parseTactic(r.command_text),
          command_text: r.command_text,
          first_death_reason: r.first_death_reason,
          fd_id: fd.fd_id,
          fd_time: fd.fd_time,
          fd_cause: fd.fd_cause,
          players_involved: r.players_involved,
          notes: r.notes,
          issue_grenade: !!r.issue_grenade,
          issue_position: !!r.issue_position,
          issue_aim: !!r.issue_aim,
          issue_comms: !!r.issue_comms,
          issue_tactics: !!r.issue_tactics,
          round_result: r.round_result,
        };
      }),
      special_events: specialEventRows || [],
    });
  } catch (e) {
    res.status(500).json({ error: '获取仪表盘数据失败: ' + e.message });
  }
});

// ==============================================================
// GET /round-details — 查询训练日志回合详情（用于弹框）
// Query params: ?issue=grendade&player=doomer&date=0526&severity=严重&match_id=5
// ==============================================================
router.get('/round-details', auth, async (req, res) => {
  const { issue, player, date, severity, match_id, map } = req.query;
  try {
    let sql = `
      SELECT tr.*, ts.match_date, ts.opponent
      FROM training_rounds tr
      JOIN training_sessions ts ON tr.session_id = ts.id
      WHERE 1=1
    `;
    const params = [];

    if (issue) {
      const issueCol = `issue_${issue}`;
      if (['grenade', 'position', 'aim', 'comms', 'tactics'].includes(issue)) {
        sql += ` AND tr.${issueCol} = 1`;
      }
    }

    if (player) {
      // 精确匹配选手ID（逗号分隔），且选手名出现在问题证据文本中
      const p = player.toLowerCase();
      sql += ` AND (LOWER(tr.players_involved) = ? OR LOWER(tr.players_involved) LIKE ? OR LOWER(tr.players_involved) LIKE ? OR LOWER(tr.players_involved) LIKE ?)`;
      params.push(p, `${p},%`, `%,${p},%`, `%,${p}`);
      // 进一步过滤：选手ID必须出现在首死原因或教练点评中（该选手确实是问题参与者）
      sql += ` AND (LOWER(tr.first_death_reason) LIKE ? OR LOWER(tr.notes) LIKE ? OR LOWER(tr.command_text) LIKE ?)`;
      const txtPattern = `%${p}%`;
      params.push(txtPattern, txtPattern, txtPattern);
    }

    if (date) {
      const ds = date.length === 4 ? `2026-${date.slice(0,2)}-${date.slice(2)}` : date;
      sql += ` AND ts.match_date = ?`;
      params.push(ds);
    }

    if (severity) {
      sql += ` AND tr.notes = ?`;
      params.push(severity);
    }

    if (match_id) {
      sql += ` AND tr.session_id = ?`;
      params.push(match_id);
    }

    if (map) {
      sql += ` AND tr.map_name = ?`;
      params.push(map);
    }

    sql += ` AND tr.first_death_reason NOT LIKE '% 一般'`;
    sql += ` AND (tr.notes IS NULL OR tr.notes != '一般')`;
    sql += ` ORDER BY tr.session_id, tr.map_name, tr.round_number LIMIT 200`;

    const [rows] = await db.query(sql, params);

    res.json({
      count: rows.length,
      rounds: rows.map(r => ({
        id: r.id,
        session_id: r.session_id,
        match_date: r.match_date,
        opponent: r.opponent,
        map_name: r.map_name,
        round_number: r.round_number,
        team_side: r.team_side,
        command_text: r.command_text,
        execution_text: r.execution_text,
        first_death_reason: r.first_death_reason,
        players_involved: r.players_involved,
        notes: r.notes,
        issue_grenade: !!r.issue_grenade,
        issue_position: !!r.issue_position,
        issue_aim: !!r.issue_aim,
        issue_comms: !!r.issue_comms,
        issue_tactics: !!r.issue_tactics,
        round_result: r.round_result,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: '获取回合详情失败: ' + e.message });
  }
});

// GET /match-records — 比赛记录（按地图筛选）
router.get('/match-records', auth, async (req, res) => {
  try {
    const { map, start, end, days } = req.query;
    // Use explicit params first, then cached dashboard range, then default 7 days
    const endDate = end || dateCache.end || new Date().toISOString().split('T')[0];
    const startDate = start || dateCache.start || (days
      ? new Date(Date.now() - parseInt(days) * 86400000).toISOString().split('T')[0]
      : new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
    let sql = `SELECT id, match_date, opponent, map_name, result, our_score, their_score, t_score, ct_score, bo_format, match_type
               FROM matches WHERE match_date >= ? AND match_date <= ?`;
    const params = [startDate, endDate];
    if (map) { sql += ' AND map_name = ?'; params.push(map); }
    sql += ' ORDER BY match_date DESC';
    const [rows] = await db.query(sql, params);
    res.json({ matches: rows });
  } catch (e) {
    res.status(500).json({ error: '获取比赛记录失败: ' + e.message });
  }
});

// GET /opponent-stats — 对手统计（场次/地图/胜率/胜负记录）
router.get('/opponent-stats', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const endDate = end || new Date().toISOString().split('T')[0];
    const startDate = start || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    
    // 1. 训练赛次统计：按对手聚合回合数、场次数
    const [sessionStats] = await db.query(`
      SELECT
        ts.opponent,
        COUNT(DISTINCT ts.id) as session_count,
        COUNT(tr.id) as total_rounds,
        SUM(CASE WHEN tr.round_result = 'win' THEN 1 ELSE 0 END) as round_wins,
        SUM(CASE WHEN tr.round_result = 'loss' THEN 1 ELSE 0 END) as round_losses,
        SUM(CASE WHEN (tr.issue_grenade + tr.issue_position + tr.issue_aim + tr.issue_comms + tr.issue_tactics) > 0 THEN 1 ELSE 0 END) as issue_rounds
      FROM training_sessions ts
      INNER JOIN training_rounds tr ON ts.id = tr.session_id
      WHERE ts.match_date >= '${startDate}' AND ts.match_date <= '${endDate}'
        AND ts.opponent NOT IN ('OPPONENT', '未知', '___')
        AND ts.opponent NOT LIKE '%放假%' AND ts.opponent NOT LIKE '%开会%' AND ts.opponent NOT LIKE '%休息%'
      GROUP BY ts.opponent
      ORDER BY session_count DESC, total_rounds DESC
    `);

    // 2. 比赛地图统计：按对手+地图聚合胜负
    const [matchStats] = await db.query(`
      SELECT
        opponent,
        map_name,
        COUNT(*) as map_count,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as map_wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as map_losses,
        SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as map_draws
      FROM matches
      WHERE match_date >= '${startDate}' AND match_date <= '${endDate}'
        AND match_type = 'scrim'
        AND opponent NOT IN ('match_data', 'OPPONENT', '___')
        AND match_date IS NOT NULL AND match_date != '' AND length(match_date) >= 8
        AND map_name IS NOT NULL AND map_name != ''
      GROUP BY opponent, map_name
      ORDER BY opponent, map_count DESC
    `);

    // 3. 聚合：按对手合并训练数据和比赛数据（case-insensitive）
    const opponentMap = {};
    for (const s of sessionStats) {
      const key = (s.opponent || '').toLowerCase();
      if (!opponentMap[key]) {
        opponentMap[key] = {
          opponent: s.opponent,
          session_count: 0,
          total_rounds: 0,
          round_wins: 0,
          round_losses: 0,
          issue_rounds: 0,
          maps: {},
          total_maps: 0,
          map_wins: 0,
          map_losses: 0,
          map_draws: 0,
          match_records: []
        };
      }
      opponentMap[key].session_count += (s.session_count || 0);
      opponentMap[key].total_rounds += (s.total_rounds || 0);
      opponentMap[key].round_wins += (s.round_wins || 0);
      opponentMap[key].round_losses += (s.round_losses || 0);
      opponentMap[key].issue_rounds += (s.issue_rounds || 0);
    }
    for (const m of matchStats) {
      const key = (m.opponent || '').toLowerCase();
      if (!opponentMap[key]) {
        opponentMap[key] = {
          opponent: m.opponent,
          session_count: 0,
          total_rounds: 0,
          round_wins: 0,
          round_losses: 0,
          issue_rounds: 0,
          maps: {},
          total_maps: 0,
          map_wins: 0,
          map_losses: 0,
          map_draws: 0,
          match_records: []
        };
      }
      opponentMap[key].maps[m.map_name] = {
        map_name: m.map_name,
        count: (opponentMap[key].maps[m.map_name]?.count || 0) + (m.map_count || 0),
        wins: (opponentMap[key].maps[m.map_name]?.wins || 0) + (m.map_wins || 0),
        losses: (opponentMap[key].maps[m.map_name]?.losses || 0) + (m.map_losses || 0),
        draws: (opponentMap[key].maps[m.map_name]?.draws || 0) + (m.map_draws || 0),
      };
      opponentMap[key].total_maps += (m.map_count || 0);
      opponentMap[key].map_wins += (m.map_wins || 0);
      opponentMap[key].map_losses += (m.map_losses || 0);
      opponentMap[key].map_draws += (m.map_draws || 0);
    }

    // 4. 获取详细比赛记录（按日期+对手分组）
    const [detailRecords] = await db.query(`
      SELECT match_date, opponent, map_name, result, our_score, their_score
      FROM matches
      WHERE match_date >= '${startDate}' AND match_date <= '${endDate}'
        AND match_type = 'scrim'
        AND opponent NOT IN ('match_data', 'OPPONENT', '___')
        AND match_date IS NOT NULL AND match_date != '' AND length(match_date) >= 8
        AND map_name IS NOT NULL AND map_name != ''
      ORDER BY match_date DESC, opponent, map_name
    `);

    for (const r of detailRecords) {
      const key = (r.opponent || '').toLowerCase();
      if (!opponentMap[key]) continue;
      const dateStr = (r.match_date || '').split(' ')[0];
      let recs = opponentMap[key].match_records;
      let last = recs.length > 0 ? recs[recs.length - 1] : null;
      if (!last || last.date !== dateStr) {
        last = { date: dateStr, maps: [] };
        opponentMap[key].match_records.push(last);
      }
      last.maps.push({
        map_name: r.map_name,
        result: r.result,
        our_score: r.our_score,
        their_score: r.their_score,
      });
    }

    // 转换为数组，按交手次数排序，过滤掉无数据的对手
    const opponents = Object.values(opponentMap)
      .filter(o => o.session_count > 0 || o.total_maps > 0)
      .sort((a, b) => 
        b.session_count - a.session_count || b.total_maps - a.total_maps
      );

    res.json({ opponents });

  } catch (e) {
    res.status(500).json({ error: '获取对手统计失败: ' + e.message });
  }
});

// PUT /rounds/:id/players — 编辑回合关联选手ID
router.put('/rounds/:id/players', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { players_involved } = req.body;
    if (!players_involved && players_involved !== '') {
      return res.status(400).json({ error: 'players_involved 字段必传' });
    }

    // Verify the round exists
    const [[round]] = await db.query('SELECT id FROM training_rounds WHERE id = ?', [id]);
    if (!round) {
      return res.status(404).json({ error: '回合不存在' });
    }

    await db.query('UPDATE training_rounds SET players_involved = ? WHERE id = ?', [players_involved, id]);
    res.json({ id: parseInt(id), players_involved });
  } catch (e) {
    res.status(500).json({ error: '更新选手失败: ' + e.message });
  }
});

// ========== PUT /match/:id/halfscore — 手动录入/修改某场的 CT/T 半场得分 ==========
router.put('/match/:id/halfscore', auth, async (req, res) => {
  const { id } = req.params;
  const { ct_score, t_score } = req.body;
  const toIntOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  };
  const ct = toIntOrNull(ct_score);
  const t  = toIntOrNull(t_score);
  if ((ct != null && ct < 0) || (t != null && t < 0)) {
    return res.status(400).json({ error: 'CT/T 得分必须是非负整数' });
  }
  try {
    const [[m]] = await db.query('SELECT id FROM matches WHERE id = ?', [id]);
    if (!m) return res.status(404).json({ error: '比赛不存在' });
    await db.query('UPDATE matches SET ct_score = ?, t_score = ? WHERE id = ?', [ct, t, id]);
    res.json({ ok: true, id: Number(id), ct_score: ct, t_score: t });
  } catch (e) {
    console.error('[halfscore] 保存失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// ==============================================================
// POST /import-match-json — 导入比赛 JSON 数据（多地图自动识别）
// ==============================================================
const jsonUpload = multer({ storage: uploadStorage });
// ── 对手名标准化(与历史数据保持一致, 防止大小写/拼写差异造成重复)──
const OPPONENT_NORM = {
  'tyloo': 'TYLOO', 'the cube': 'The Cube', 'the qube': 'The Cube',
  'thecube': 'The Cube', 'theqube': 'The Cube',
  'mongolz.a': 'Mongolz.A', 'mongolza': 'Mongolz.A',
  'nexvoid': 'NEXVOID', 'nextvoid': 'NEXVOID',
  'tengri': 'Tengri', 'tenjri': 'Tengri',
  'wydo': 'Wydo', 'dy2k': 'Dy2k', 'modun': 'Modun',
  'rdc': 'RDC', 'relove deep cross': 'RDC',
  '100ra': '100RA', 'zevs': 'ZEVS', 'nas': 'Nas',
  'oasis gaming': 'Oasis Gaming',
  'ex-nemesis': 'ex-Nemesis', 'exnemesis': 'ex-Nemesis',
  'unitronics': 'Unitronics',
};
function normOpponent(name) {
  if (!name) return name;
  const t = String(name).trim();
  return OPPONENT_NORM[t.toLowerCase()] || t;
}

router.post('/import-match-json', auth, jsonUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 JSON 文件' });
    const raw = fs.readFileSync(req.file.path, 'utf-8');
    const data = JSON.parse(raw);

    const match = data.match || {};
    const mapRaw = match.map || 'unknown';
    const MAP_ALIASES = {
      'de_mirage': 'Mirage', 'de_dust2': 'Dust2', 'de_inferno': 'Inferno',
      'de_nuke': 'Nuke', 'de_ancient': 'Ancient', 'de_anubis': 'Anubis',
      'de_overpass': 'Overpass', 'de_vertigo': 'Vertigo', 'de_train': 'Train',
    };
    const mapName = MAP_ALIASES[mapRaw] || mapRaw.replace('de_', '').replace(/^\w/, c => c.toUpperCase());

    const startTime = match.startTime ? match.startTime.split('T')[0] : new Date().toISOString().split('T')[0];
    const homeScore = match.home?.score || 0;
    const awayScore = match.away?.score || 0;
    // 我方坐 home 还是 away 由 userSide 决定，不能默认 home=我方（否则我方在 away 时比分/胜负会全部存反）
    const userSide = (match.userSide === 'away') ? 'away' : 'home';
    const ourScore = userSide === 'away' ? awayScore : homeScore;
    const theirScore = userSide === 'away' ? homeScore : awayScore;
    const result = ourScore > theirScore ? 'win' : (ourScore < theirScore ? 'loss' : 'draw');

    // 对手名解析优先级：文件名提取 > 用户填写 > JSON 内容 > DB training_sessions
    // 文件名优先，避免残留的全局对手名污染本次导入
    let opponent = '';
    if (req.file.originalname) {
      const m = req.file.originalname.match(/^\d{4}[_-](.+?)_[Mm]\d+/);
      if (m) opponent = m[1];
    }
    opponent = opponent || req.body.opponent || match.opponent || match.opponent_name || '';

    if (!opponent) {
      // Try to find opponent from training sessions on same date, ordered by most recently created
      const [sessions] = await db.query(
        'SELECT id, opponent FROM training_sessions WHERE match_date = ? ORDER BY created_at DESC LIMIT 1', [startTime]
      );
      opponent = (sessions && sessions.length > 0) ? sessions[0].opponent : '';
    }

    // Guard: if opponent still unresolved, reject
    if (!opponent) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '无法确定对手名称，请检查文件名格式或手动填写' });
    }
    opponent = normOpponent(opponent);
    const matchTime = match.startTime ? match.startTime.slice(11, 16) : null;

    // 对手队员数据(进 opponent_players 列, 供比赛记录页展示)
    let oppPlayersJson = null;
    if (data.scoreboard && match.userSide && data.scoreboard.home && data.scoreboard.away) {
      const oppSide = match.userSide === 'home' ? data.scoreboard.away : data.scoreboard.home;
      if (Array.isArray(oppSide)) {
        const oppPlayers = oppSide
          .filter(p => p && (p.role === 'player' || (p.role === undefined && p.kills !== undefined)))
          .map(p => ({ name: p.name, kills: p.kills||0, deaths: p.deaths||0, assists: p.assists||0,
                       adr: p.adr||0, hs: p.headShotKills||0, hsPct: p.hsPercent||0, kd: p.kd||0 }));
        if (oppPlayers.length) oppPlayersJson = JSON.stringify(oppPlayers);
      }
    }

    // Upsert match record(宽松匹配: 忽略日期里的时间部分、忽略对手名/地图大小写, 防止重复)
    const [existing] = await db.query(
      `SELECT id FROM matches WHERE substr(match_date,1,10)=? AND lower(opponent)=lower(?)
       AND lower(ifnull(map_name,''))=lower(?) AND match_type='scrim' ORDER BY id DESC LIMIT 1`,
      [startTime, opponent, mapName]
    );
    let matchId;
    if (existing.length > 0) {
      matchId = existing[0].id;
      await db.query('DELETE FROM player_stats WHERE match_id=?', [matchId]);
      await db.query('UPDATE matches SET our_score=?, their_score=?, match_time=COALESCE(?, match_time), opponent_players=COALESCE(?, opponent_players), notes=? WHERE id=?',
        [ourScore, theirScore, matchTime, oppPlayersJson, JSON.stringify({ source: 'json_import', file: req.file.originalname }), matchId]
      );
    } else {
      const [matchResult] = await db.query(
        `INSERT INTO matches (match_date, match_time, opponent, map_name, our_score, their_score, match_type, notes, opponent_players)
         VALUES (?, ?, ?, ?, ?, ?, 'scrim', ?, ?)`,
        [startTime, matchTime, opponent, mapName, ourScore, theirScore, JSON.stringify({ source: 'json_import', file: req.file.originalname }), oppPlayersJson]
      );
      matchId = matchResult.insertId;
    }

    // Load player map from DB
    const [dbPlayers] = await db.query('SELECT id, nickname, steam_id FROM players');
    const steamMap = {}; // steamId64 → { id, nickname }
    dbPlayers.forEach(p => {
      if (p.steam_id) {
        p.steam_id.split(',').forEach(sid => {
          const clean = sid.trim();
          if (clean) steamMap[clean] = { id: p.id, nickname: p.nickname };
        });
      }
    });

    // Insert player stats — 递归遍历整个 JSON 对象树，收集所有含 SteamID 的对象
    function getAllPlayerCandidates(jsonData) {
      const candidates = [];
      const visited = new Set();

      function walk(obj) {
        if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
        visited.add(obj);
        const sid = obj.steamId64 || obj.steamId || obj.steam_id || obj.steamid;
        if (sid) candidates.push(obj);
        if (Array.isArray(obj)) {
          obj.forEach(item => walk(item));
        } else {
          Object.values(obj).forEach(v => { if (typeof v === 'object' && v !== null) walk(v); });
        }
      }

      walk(jsonData);
      return candidates;
    }
    function getSteamId(entry) {
      return entry.steamId64 || entry.steamId || entry.steam_id || entry.steamid || '';
    }

    const candidates = getAllPlayerCandidates(data);
    let statsInserted = 0;
    await ensurePlayerStatsCols();
    for (const p of candidates) {
      const steamId = getSteamId(p);
      if (!steamId) continue;
      const dbPlayer = steamMap[steamId];
      if (!dbPlayer) continue;
      await db.query(
        `INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, assists, hs_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [matchId, dbPlayer.id, p.kills || 0, p.deaths || 0, p.adr || 0, p.assists || 0, p.hsPercent || 0]
      );
      statsInserted++;
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    res.json({ message: '导入成功', match_id: matchId, map: mapName, score: `${homeScore}-${awayScore}`, result, players: statsInserted });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// ==============================================================
// POST /import-match-json-batch — 批量导入比赛 JSON 数据
// ==============================================================
router.post('/import-match-json-batch', auth, jsonUpload.array('files', 50), async (req, res) => {
  const results = [];
  const uploadedFiles = req.files || [];

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: '请上传至少一个 JSON 文件' });
  }

  // 用户手动填写的对手名作为全局兜底值
  const globalOpponent = req.body.opponent?.trim() || '';

  // Preload DB player map once for all files
  const [dbPlayers] = await db.query('SELECT id, nickname, steam_id FROM players');
  const steamMap = {};
  dbPlayers.forEach(p => {
    if (p.steam_id) {
      p.steam_id.split(',').forEach(sid => {
        const clean = sid.trim();
        if (clean) steamMap[clean] = { id: p.id, nickname: p.nickname };
      });
    }
  });

  const MAP_ALIASES = {
    'de_mirage': 'Mirage', 'de_dust2': 'Dust2', 'de_inferno': 'Inferno',
    'de_nuke': 'Nuke', 'de_ancient': 'Ancient', 'de_anubis': 'Anubis',
    'de_overpass': 'Overpass', 'de_vertigo': 'Vertigo', 'de_train': 'Train',
  };

  // 从文件名解析对手名：MMDD_对手名_M*.json
  function getOpponentFromFilename(filename) {
    const m = filename.match(/^\d{4}[_-](.+?)_[Mm]\d+/);
    return m ? m[1] : '';
  }

  for (const file of uploadedFiles) {
    try {
      const raw = fs.readFileSync(file.path, 'utf-8');
      const data = JSON.parse(raw);
      const match = data.match || {};
      const mapRaw = match.map || 'unknown';
      const mapName = MAP_ALIASES[mapRaw] || mapRaw.replace('de_', '').replace(/^\w/, c => c.toUpperCase());

      const startTime = match.startTime
        ? match.startTime.split('T')[0]
        : new Date().toISOString().split('T')[0];
      const homeScore = match.home?.score || 0;
      const awayScore = match.away?.score || 0;
      // 我方坐 home 还是 away 由 userSide 决定，不能默认 home=我方（否则我方在 away 时比分/胜负会全部存反）
      const userSide = (match.userSide === 'away') ? 'away' : 'home';
      const ourScore = userSide === 'away' ? awayScore : homeScore;
      const theirScore = userSide === 'away' ? homeScore : awayScore;
      const result = ourScore > theirScore ? 'win' : (ourScore < theirScore ? 'loss' : 'draw');

      // 对手名解析优先级：文件名提取 > 用户填写 > JSON 内容 > DB training_sessions
      // 文件名优先，避免上一次导入的 globalOpponent 残留污染本次导入
      const fnOpponent = getOpponentFromFilename(file.originalname);
      let opponent = fnOpponent || globalOpponent || match.opponent || match.opponent_name || '';

      // 最后兜底：从相同日期的训练赛次查找对手
      if (!opponent) {
        const [sessions] = await db.query(
          'SELECT id, opponent FROM training_sessions WHERE match_date = ? ORDER BY created_at DESC LIMIT 1',
          [startTime]
        );
        opponent = (sessions && sessions.length > 0) ? sessions[0].opponent : '';
      }

      if (!opponent) {
        results.push({ success: false, filename: file.originalname, error: '无法确定对手名称，请检查文件名格式或手动填写' });
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        continue;
      }
      opponent = normOpponent(opponent);
      const matchTime = match.startTime ? match.startTime.slice(11, 16) : null;

      // 对手队员数据
      let oppPlayersJson = null;
      if (data.scoreboard && match.userSide && data.scoreboard.home && data.scoreboard.away) {
        const oppSide = match.userSide === 'home' ? data.scoreboard.away : data.scoreboard.home;
        if (Array.isArray(oppSide)) {
          const oppPlayers = oppSide
            .filter(p => p && (p.role === 'player' || (p.role === undefined && p.kills !== undefined)))
            .map(p => ({ name: p.name, kills: p.kills||0, deaths: p.deaths||0, assists: p.assists||0,
                         adr: p.adr||0, hs: p.headShotKills||0, hsPct: p.hsPercent||0, kd: p.kd||0 }));
          if (oppPlayers.length) oppPlayersJson = JSON.stringify(oppPlayers);
        }
      }

      // Upsert: 宽松匹配(忽略日期里的时间部分、忽略对手名/地图大小写), 防止重复
      const [existing] = await db.query(
        `SELECT id FROM matches WHERE substr(match_date,1,10)=? AND lower(opponent)=lower(?)
         AND lower(ifnull(map_name,''))=lower(?) AND match_type='scrim' ORDER BY id DESC LIMIT 1`,
        [startTime, opponent, mapName]
      );
      let matchId;
      if (existing.length > 0) {
        matchId = existing[0].id;
        // 删除旧选手数据
        await db.query('DELETE FROM player_stats WHERE match_id=?', [matchId]);
        // 更新比分
        await db.query(
          'UPDATE matches SET our_score=?, their_score=?, match_time=COALESCE(?, match_time), opponent_players=COALESCE(?, opponent_players), notes=? WHERE id=?',
          [ourScore, theirScore, matchTime, oppPlayersJson, JSON.stringify({ source: 'json_import_batch', file: file.originalname }), matchId]
        );
      } else {
        const [matchResult] = await db.query(
          `INSERT INTO matches (match_date, match_time, opponent, map_name, our_score, their_score, match_type, notes, opponent_players)
           VALUES (?, ?, ?, ?, ?, ?, 'scrim', ?, ?)`,
          [startTime, matchTime, opponent, mapName, ourScore, theirScore, JSON.stringify({ source: 'json_import_batch', file: file.originalname }), oppPlayersJson]
        );
        matchId = matchResult.insertId;
      }

      // Insert player stats — 递归遍历整个 JSON 对象树，收集所有含 SteamID 的对象
      function getAllPlayerCandidates(jsonData) {
        const candidates = [];
        const visited = new Set();

        function walk(obj) {
          if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
          visited.add(obj);

          // 先检查当前对象自身是否包含 SteamID
          const sid = obj.steamId64 || obj.steamId || obj.steam_id || obj.steamid;
          if (sid) candidates.push(obj);

          // 递归搜索所有子节点（数组 + 对象）
          if (Array.isArray(obj)) {
            obj.forEach(item => walk(item));
          } else {
            Object.values(obj).forEach(v => {
              if (typeof v === 'object' && v !== null) walk(v);
            });
          }
        }

        walk(jsonData);
        return candidates;
      }

      const candidates = getAllPlayerCandidates(data);
      let statsInserted = 0;
      const skippedReasons = [];

      function getSteamId(entry) {
        return entry.steamId64 || entry.steamId || entry.steam_id || entry.steamid || '';
      }

      if (candidates.length === 0) {
        skippedReasons.push('JSON 未找到任何含 SteamID 的选手条目');
        skippedReasons.push('顶层键: ' + Object.keys(data).filter(k => !k.startsWith('_')).join(', '));
        // 深入诊断 scoreboard 结构
        if (data.scoreboard) {
          if (Array.isArray(data.scoreboard)) {
            skippedReasons.push('scoreboard 是数组，长度: ' + data.scoreboard.length);
            if (data.scoreboard[0]) {
              skippedReasons.push('scoreboard[0] 的键: ' + Object.keys(data.scoreboard[0]).join(', '));
            }
          } else if (typeof data.scoreboard === 'object') {
            const subKeys = Object.keys(data.scoreboard);
            skippedReasons.push('scoreboard 子键: ' + subKeys.join(', '));
            for (const k of subKeys.slice(0, 3)) {
              const v = data.scoreboard[k];
              if (Array.isArray(v)) {
                skippedReasons.push(k + ' 是数组，长度: ' + v.length + (v[0] ? '，首项键: ' + Object.keys(v[0]).join(', ') : ''));
              } else if (typeof v === 'object' && v !== null) {
                skippedReasons.push(k + ' 是对象，子键: ' + Object.keys(v).join(', '));
              }
            }
          }
        }
      }

      await ensurePlayerStatsCols();
      for (const p of candidates) {
        const steamId = getSteamId(p);
        if (!steamId) continue;
        const dbPlayer = steamMap[steamId];
        if (!dbPlayer) continue; // 不是我们的队员，跳过
        await db.query(
          `INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, assists, hs_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [matchId, dbPlayer.id, p.kills || 0, p.deaths || 0, p.adr || 0, p.assists || 0, p.hsPercent || 0]
        );
        statsInserted++;
      }

      results.push({
        success: true,
        filename: file.originalname,
        match_id: matchId,
        map: mapName,
        score: `${homeScore}-${awayScore}`,
        result,
        opponent,
        players: statsInserted,
        totalEntries: candidates.length,
        skippedReasons: statsInserted === 0 ? skippedReasons.slice(0, 5) : undefined,
      });
    } catch (e) {
      results.push({
        success: false,
        filename: file.originalname,
        error: e.message,
      });
    } finally {
      // Clean up each temp file
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
    }
  }

  res.json({ results, total: results.length, successCount: results.filter(r => r.success).length });
});

// ==============================================================
// POST /manual-match — 手动录入比赛数据（无 JSON / 无截图，纯表单）
// 字段与 batch 导入完全对齐：player_stats 只写 kills/deaths/adr
// ADR = 伤害 / 总回合(我方+对方比分)，对手名走 normOpponent 标准化
// 校验：UR 必须满 5 名且各不相同，否则整场拒绝（不写半截脏数据）
// ==============================================================
router.post('/manual-match', auth, async (req, res) => {
  try {
    const { match_date, opponent, map_name, our_score, their_score, ur_players, opp_players } = req.body;

    // —— 赛事类型：scrim(训练赛，默认) / official(正赛) ——
    // 正赛时可携带 tournament_id / stage_id，关联到赛事系统
    const matchType = (req.body.match_type === 'official') ? 'official' : 'scrim';
    const tournamentId = (matchType === 'official' && req.body.tournament_id) ? Number(req.body.tournament_id) : null;
    const stageId = (matchType === 'official' && req.body.stage_id) ? Number(req.body.stage_id) : null;
    const mapOrder = (matchType === 'official' && req.body.map_order) ? Number(req.body.map_order) : null;
    const pickType = (matchType === 'official' && req.body.pick_type) ? String(req.body.pick_type) : null;
    const bpJson = (matchType === 'official' && req.body.bp_json) ? (typeof req.body.bp_json === 'string' ? req.body.bp_json : JSON.stringify(req.body.bp_json)) : null;

    // —— 弃权标记：弃权场次不需要比分与选手数据，仅记胜负方 ——
    const isWalkover = req.body.is_walkover === true || req.body.is_walkover === 1 || req.body.is_walkover === '1';

    // —— 比赛信息校验 ——
    if (!match_date) return res.status(400).json({ error: '请填写比赛日期' });
    if (!opponent || !String(opponent).trim()) return res.status(400).json({ error: '请填写对手名称' });
    if (!isWalkover && !map_name) return res.status(400).json({ error: '请选择地图' });

    let ours, theirs, totalRounds;
    let filled = [];
    if (isWalkover) {
      // 弃权：按胜负方记 1:0 / 0:1（用于 result 计算），免填比分与选手
      const winner = (req.body.walkover_winner === 'them') ? 'them' : 'us';
      ours = winner === 'us' ? 1 : 0;
      theirs = winner === 'us' ? 0 : 1;
      totalRounds = 1;
    } else {
      ours = parseInt(our_score, 10);
      theirs = parseInt(their_score, 10);
      if (Number.isNaN(ours) || Number.isNaN(theirs)) return res.status(400).json({ error: '请填写双方比分（数字）' });
      totalRounds = ours + theirs;
      if (totalRounds <= 0) return res.status(400).json({ error: '总回合数必须大于 0（比分填写有误）' });

      // —— UR 选手校验：必须 5 名、各有选手、数据完整(击杀/死亡/ADR) ——
      if (!Array.isArray(ur_players)) return res.status(400).json({ error: '选手数据格式错误' });
      filled = ur_players.filter(p =>
        p && p.player_id &&
        p.kills !== '' && p.kills != null &&
        p.deaths !== '' && p.deaths != null &&
        p.adr !== '' && p.adr != null
      );
      if (filled.length < 5) {
        return res.status(400).json({ error: `UR 选手数据不全（已填 ${filled.length}/5），整场不录入` });
      }
      const uniqueIds = new Set(filled.map(p => String(p.player_id)));
      if (uniqueIds.size < 5) {
        return res.status(400).json({ error: '存在重复选手，请确认 5 名选手各不相同' });
      }
    }

    const opp = normOpponent(String(opponent).trim());

    // ADR = 伤害 / 总回合
    const adrOf = (dmg) => totalRounds > 0 ? parseFloat((Number(dmg || 0) / totalRounds).toFixed(1)) : 0;

    // —— 对手数据（可选），格式与 batch 的 opponent_players 一致 ——
    let oppPlayersJson = null;
    if (Array.isArray(opp_players)) {
      const cleaned = opp_players
        .filter(p => p && p.name && String(p.name).trim())
        .map(p => {
          const k = Number(p.kills) || 0;
          const d = Number(p.deaths) || 0;
          return {
            name: String(p.name).trim(),
            kills: k, deaths: d, assists: Number(p.assists) || 0,
            adr: parseFloat(p.adr) || 0,
            rating: parseFloat(p.rating) || 0,
            hs: 0, hsPct: 0,
            kd: d > 0 ? parseFloat((k / d).toFixed(2)) : k
          };
        });
      if (cleaned.length) oppPlayersJson = JSON.stringify(cleaned);
    }

    // —— Upsert 去重键：日期 + 对手名 + 地图 + 双方比分（不再按比赛类型查重）——
    // 四者全同 → 同一场，删旧写新只留一条；地图不同 → 各自保留（BO3 同比分多图不会误删）
    const [existing] = await db.query(
      `SELECT id FROM matches WHERE substr(match_date,1,10)=? AND lower(opponent)=lower(?)
       AND lower(ifnull(map_name,''))=lower(?) AND our_score=? AND their_score=? ORDER BY id DESC LIMIT 1`,
      [match_date, opp, map_name || '', ours, theirs]
    );
    let matchId;
    let mode;
    if (existing.length > 0) {
      matchId = existing[0].id;
      await db.query('DELETE FROM player_stats WHERE match_id=?', [matchId]);
      await db.query(
        'UPDATE matches SET our_score=?, their_score=?, match_type=?, tournament_id=?, stage_id=?, map_order=?, pick_type=?, bp_json=COALESCE(?, bp_json), opponent_players=COALESCE(?, opponent_players), is_walkover=? WHERE id=?',
        [ours, theirs, matchType, tournamentId, stageId, mapOrder, pickType, bpJson, oppPlayersJson, isWalkover ? 1 : 0, matchId]
      );
      mode = 'updated';
    } else {
      const [r] = await db.query(
        `INSERT INTO matches (match_date, opponent, map_name, our_score, their_score, match_type, division, tournament_id, stage_id, map_order, pick_type, bp_json, opponent_players, is_walkover)
         VALUES (?, ?, ?, ?, ?, ?, 'cs2', ?, ?, ?, ?, ?, ?, ?)`,
        [match_date, opp, map_name || '', ours, theirs, matchType, tournamentId, stageId, mapOrder, pickType, bpJson, oppPlayersJson, isWalkover ? 1 : 0]
      );
      matchId = r.insertId;
      mode = 'inserted';
    }

    // —— 写 UR 选手数据：击杀/死亡/助攻/ADR/Rating(均为用户直接填写值) ——
    for (const p of filled) {
      await db.query(
        `INSERT INTO player_stats (match_id, player_id, kills, deaths, assists, adr, rating) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [matchId, p.player_id,
         Number(p.kills) || 0, Number(p.deaths) || 0, Number(p.assists) || 0,
         parseFloat(p.adr) || 0, p.rating != null && p.rating !== '' ? parseFloat(p.rating) : null]
      );
    }

    // —— 单败赛制自动推进：该场正赛 + 属某单败阶段 + 非弃权 + 分出胜负 ——
    //    我方负 → 赛事之旅结束；我方胜 → 当前阶段推进到下一阶段(stage_order+1)，无下一阶段则暂标记结束(夺冠/出线细化后期完善)
    try {
      if (matchType === 'official' && stageId && !isWalkover && Number(ours) !== Number(theirs)) {
        const [strow] = await db.query('SELECT bracket_type, tournament_id, stage_name, stage_order FROM tournament_stages WHERE id=?', [stageId]);
        if (strow.length && (strow[0].bracket_type || 'single') === 'single' && strow[0].tournament_id) {
          const tId = strow[0].tournament_id;
          if (Number(theirs) > Number(ours)) {
            // 输 → 赛事结束，名次记为止步阶段
            await db.query(
              "UPDATE tournaments SET is_finished=1, status='已结束', current_stage_id=?, placement=COALESCE(NULLIF(placement,''), ?) WHERE id=?",
              [stageId, strow[0].stage_name || null, tId]
            );
          } else {
            // 赢 → 找下一阶段(同赛事 stage_order 更大的最近一个)
            const [nextRows] = await db.query(
              'SELECT id, stage_name FROM tournament_stages WHERE tournament_id=? AND stage_order > ? ORDER BY stage_order ASC, id ASC LIMIT 1',
              [tId, strow[0].stage_order]
            );
            if (nextRows.length) {
              // 有下一阶段 → 把当前阶段推进过去
              await db.query('UPDATE tournaments SET current_stage_id=? WHERE id=?', [nextRows[0].id, tId]);
            } else {
              // 没有下一阶段(赢了最后一阶段) → 暂标记结束(夺冠/出线逻辑后期完善)
              await db.query(
                "UPDATE tournaments SET is_finished=1, status='已结束', current_stage_id=? WHERE id=?",
                [stageId, tId]
              );
            }
          }
        }
      }
    } catch (autoEndErr) { /* 自动推进失败不影响录入本身 */ }

    res.json({
      success: true,
      match_id: matchId,
      mode,
      match_type: matchType,
      message: isWalkover
        ? `已${mode === 'updated' ? '更新' : '录入'}${matchType === 'official' ? '【正赛】' : '【训练赛】'}：${opp} · 弃权${ours > theirs ? '胜' : '负'}`
        : `已${mode === 'updated' ? '更新' : '录入'}${matchType === 'official' ? '【正赛】' : '【训练赛】'}：${opp} · ${map_name} · ${ours}:${theirs} · 5 名选手`,
    });
  } catch (e) {
    res.status(500).json({ error: '录入失败: ' + e.message });
  }
});

// ==============================================================
// GET /manual-match/:id — 取单场完整数据（供编辑回填表单）
//   返回基本字段 + ur_players(含 player_id) + opp_players
// ==============================================================
router.get('/manual-match/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的比赛 ID' });
    const [[m]] = await db.query(
      `SELECT id, substr(match_date,1,10) AS match_date, opponent, map_name,
              our_score, their_score, match_type, tournament_id, stage_id,
              opponent_players, is_walkover, bp_json
       FROM matches WHERE id=? AND division='cs2'`, [id]
    );
    if (!m) return res.status(404).json({ error: '比赛不存在' });
    const [stats] = await db.query(
      `SELECT player_id, kills, deaths, assists, adr, rating
       FROM player_stats WHERE match_id=?`, [id]
    );
    let opp = [];
    try { opp = m.opponent_players ? JSON.parse(m.opponent_players) : []; } catch { opp = []; }
    res.json({
      id: m.id,
      match_date: m.match_date,
      opponent: m.opponent,
      map_name: m.map_name || '',
      our_score: m.our_score,
      their_score: m.their_score,
      match_type: m.match_type || 'scrim',
      tournament_id: m.tournament_id,
      stage_id: m.stage_id,
      is_walkover: !!m.is_walkover,
      bp_json: m.bp_json || null,
      ur_players: (stats || []).map(s => ({
        player_id: String(s.player_id),
        kills: s.kills, deaths: s.deaths, assists: s.assists,
        adr: s.adr, rating: (s.rating == null ? '' : s.rating),
      })),
      opp_players: (opp || []).map(p => ({
        name: p.name || '',
        kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '',
        adr: p.adr ?? '', rating: p.rating ?? '',
      })),
    });
  } catch (e) {
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// ==============================================================
// PUT /manual-match/:id — 更新整场（编辑保存，按 id 定位，不走去重）
//   校验与录入一致：非弃权场 UR 必须满 5 名且各不相同
// ==============================================================
router.put('/manual-match/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的比赛 ID' });
    const [[exist]] = await db.query("SELECT id FROM matches WHERE id=? AND division='cs2'", [id]);
    if (!exist) return res.status(404).json({ error: '比赛不存在' });

    const { match_date, opponent, map_name, our_score, their_score, ur_players, opp_players } = req.body;
    const matchType = (req.body.match_type === 'official') ? 'official' : 'scrim';
    const tournamentId = (matchType === 'official' && req.body.tournament_id) ? Number(req.body.tournament_id) : null;
    const stageId = (matchType === 'official' && req.body.stage_id) ? Number(req.body.stage_id) : null;
    const bpJson = (matchType === 'official' && req.body.bp_json) ? (typeof req.body.bp_json === 'string' ? req.body.bp_json : JSON.stringify(req.body.bp_json)) : null;
    const isWalkover = req.body.is_walkover === true || req.body.is_walkover === 1 || req.body.is_walkover === '1';

    if (!match_date) return res.status(400).json({ error: '请填写比赛日期' });
    if (!opponent || !String(opponent).trim()) return res.status(400).json({ error: '请填写对手名称' });
    if (!isWalkover && !map_name) return res.status(400).json({ error: '请选择地图' });

    let ours, theirs, totalRounds, filled = [];
    if (isWalkover) {
      const winner = (req.body.walkover_winner === 'them') ? 'them' : 'us';
      ours = winner === 'us' ? 1 : 0;
      theirs = winner === 'us' ? 0 : 1;
      totalRounds = 1;
    } else {
      ours = parseInt(our_score, 10);
      theirs = parseInt(their_score, 10);
      if (Number.isNaN(ours) || Number.isNaN(theirs)) return res.status(400).json({ error: '请填写双方比分（数字）' });
      totalRounds = ours + theirs;
      if (totalRounds <= 0) return res.status(400).json({ error: '总回合数必须大于 0（比分填写有误）' });
      if (!Array.isArray(ur_players)) return res.status(400).json({ error: '选手数据格式错误' });
      filled = ur_players.filter(p =>
        p && p.player_id &&
        p.kills !== '' && p.kills != null &&
        p.deaths !== '' && p.deaths != null &&
        p.adr !== '' && p.adr != null
      );
      if (filled.length < 5) return res.status(400).json({ error: `UR 选手数据不全（已填 ${filled.length}/5），整场不保存` });
      if (new Set(filled.map(p => String(p.player_id))).size < 5) return res.status(400).json({ error: '存在重复选手，请确认 5 名选手各不相同' });
    }

    const opp = normOpponent(String(opponent).trim());

    let oppPlayersJson = null;
    if (Array.isArray(opp_players)) {
      const cleaned = opp_players
        .filter(p => p && p.name && String(p.name).trim())
        .map(p => {
          const k = Number(p.kills) || 0;
          const d = Number(p.deaths) || 0;
          return {
            name: String(p.name).trim(),
            kills: k, deaths: d, assists: Number(p.assists) || 0,
            adr: parseFloat(p.adr) || 0,
            rating: parseFloat(p.rating) || 0,
            hs: 0, hsPct: 0,
            kd: d > 0 ? parseFloat((k / d).toFixed(2)) : k,
          };
        });
      if (cleaned.length) oppPlayersJson = JSON.stringify(cleaned);
    }

    await db.query(
      `UPDATE matches SET match_date=?, opponent=?, map_name=?, our_score=?, their_score=?,
              match_type=?, tournament_id=?, stage_id=?, bp_json=COALESCE(?, bp_json),
              opponent_players=COALESCE(?, opponent_players), is_walkover=? WHERE id=?`,
      [match_date, opp, map_name || '', ours, theirs, matchType, tournamentId, stageId, bpJson, oppPlayersJson, isWalkover ? 1 : 0, id]
    );

    // 重写 UR 选手数据（先清后插，不合并）
    await db.query('DELETE FROM player_stats WHERE match_id=?', [id]);
    for (const p of filled) {
      await db.query(
        `INSERT INTO player_stats (match_id, player_id, kills, deaths, assists, adr, rating) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, p.player_id,
         Number(p.kills) || 0, Number(p.deaths) || 0, Number(p.assists) || 0,
         parseFloat(p.adr) || 0, p.rating != null && p.rating !== '' ? parseFloat(p.rating) : null]
      );
    }

    // —— 单败赛制自动推进：该场正赛 + 属某单败阶段 + 非弃权 + 分出胜负 ——
    //    我方负 → 赛事之旅结束；我方胜 → 当前阶段推进到下一阶段(stage_order+1)，无下一阶段则暂标记结束(夺冠/出线细化后期完善)
    try {
      if (matchType === 'official' && stageId && !isWalkover && Number(ours) !== Number(theirs)) {
        const [strow] = await db.query('SELECT bracket_type, tournament_id, stage_name, stage_order FROM tournament_stages WHERE id=?', [stageId]);
        if (strow.length && (strow[0].bracket_type || 'single') === 'single' && strow[0].tournament_id) {
          const tId = strow[0].tournament_id;
          if (Number(theirs) > Number(ours)) {
            // 输 → 赛事结束，名次记为止步阶段
            await db.query(
              "UPDATE tournaments SET is_finished=1, status='已结束', current_stage_id=?, placement=COALESCE(NULLIF(placement,''), ?) WHERE id=?",
              [stageId, strow[0].stage_name || null, tId]
            );
          } else {
            // 赢 → 找下一阶段(同赛事 stage_order 更大的最近一个)
            const [nextRows] = await db.query(
              'SELECT id, stage_name FROM tournament_stages WHERE tournament_id=? AND stage_order > ? ORDER BY stage_order ASC, id ASC LIMIT 1',
              [tId, strow[0].stage_order]
            );
            if (nextRows.length) {
              // 有下一阶段 → 把当前阶段推进过去
              await db.query('UPDATE tournaments SET current_stage_id=? WHERE id=?', [nextRows[0].id, tId]);
            } else {
              // 没有下一阶段(赢了最后一阶段) → 暂标记结束(夺冠/出线逻辑后期完善)
              await db.query(
                "UPDATE tournaments SET is_finished=1, status='已结束', current_stage_id=? WHERE id=?",
                [stageId, tId]
              );
            }
          }
        }
      }
    } catch (autoEndErr) { /* 自动推进失败不影响录入本身 */ }

    res.json({
      success: true,
      match_id: id,
      message: isWalkover
        ? `已更新${matchType === 'official' ? '【正赛】' : '【训练赛】'}：${opp} · 弃权${ours > theirs ? '胜' : '负'}`
        : `已更新${matchType === 'official' ? '【正赛】' : '【训练赛】'}：${opp} · ${map_name} · ${ours}:${theirs}`,
    });
  } catch (e) {
    res.status(500).json({ error: '更新失败: ' + e.message });
  }
});

// ==============================================================
// DELETE /manual-match/:id — 删除整场（连带删除该场选手数据，不留孤儿）
// ==============================================================
router.delete('/manual-match/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: '无效的比赛 ID' });
    const [[m]] = await db.query("SELECT id, opponent, map_name FROM matches WHERE id=? AND division='cs2'", [id]);
    if (!m) return res.status(404).json({ error: '比赛不存在' });
    await db.query('DELETE FROM player_stats WHERE match_id=?', [id]);
    await db.query('DELETE FROM matches WHERE id=?', [id]);
    res.json({ success: true, message: `已删除：${m.opponent || ''}${m.map_name ? ' · ' + m.map_name : ''}` });
  } catch (e) {
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});
