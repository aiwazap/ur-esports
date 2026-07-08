/**
 * 训练计划模块后端路由
 * GET  /api/training-plans/tactics          - 获取战术总表
 * POST /api/training-plans/tactics          - 新增战术
 * PUT  /api/training-plans/tactics/:id      - 编辑战术
 * DELETE /api/training-plans/tactics/:id    - 删除战术
 * GET  /api/training-plans/briefings        - 获取所有简报
 * GET  /api/training-plans/briefings/:date  - 获取指定日期简报
 * POST /api/training-plans/briefings        - 新建/更新简报
 * GET  /api/training-plans/logs             - 获取训练日志列表
 * GET  /api/training-plans/logs/:id         - 获取单条日志详情
 * POST /api/training-plans/logs             - 新建日志
 * PUT  /api/training-plans/logs/:id/rounds  - 保存回合数据
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// ── 角色权限中间件（#6 教练/领队分工）──
// coachAuth：仅 教练 + 管理员（简报、战术总表的编辑）
// staffAuth：教练 + 领队 + 管理员（训练日志的录入）
const coachAuth = (req, res, next) => auth(req, res, () => {
  if (!['coach', 'admin'].includes(req.user.role)) return res.status(403).json({ error: '仅教练或管理员可编辑（简报 / 战术总表）' });
  next();
});
const staffAuth = (req, res, next) => auth(req, res, () => {
  if (!['coach', 'team_lead', 'admin'].includes(req.user.role)) return res.status(403).json({ error: '仅教练 / 领队 / 管理员可编辑训练日志' });
  next();
});

// ── 初始化建表（首次启动时执行）──────────────────────────────
async function ensureTables() {
  await db.query(`
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
    )
  `);

  // 确保 tactics_v2 有 steps 字段（旧库升级 / 跨环境自动补列）
  try {
    const [tcols] = await db.query("PRAGMA table_info(tactics_v2)");
    if (!tcols.some(c => c.name === 'steps')) {
      await db.query("ALTER TABLE tactics_v2 ADD COLUMN steps TEXT");
    }
  } catch (e) { console.error('tactics_v2 steps 列检查失败:', e.message); }

  await db.query(`
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
    )
  `);

  await db.query(`
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
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS training_logs_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_id  INTEGER DEFAULT NULL,
      log_date     TEXT NOT NULL,
      opponent     TEXT NOT NULL DEFAULT '',
      created_by   INTEGER DEFAULT NULL,
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(log_date, opponent)
    )
  `);

  await db.query(`
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
    )
  `);

  // 多人并发录入: 回合行级时间戳(列已存在时报错忽略)
  try { await db.query(`ALTER TABLE training_log_rounds ADD COLUMN updated_at TEXT DEFAULT NULL`); } catch (e) {}

  // ── 犯错类型库 ──
  await db.query(`
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
    )
  `);
  try { await db.query(`ALTER TABLE training_log_rounds ADD COLUMN error_type_id INTEGER DEFAULT NULL`); } catch (e) {}

  // ── 赛训档案（教练/领队资料库，分区权限隔离）──
  await db.query(`
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
    )
  `);

  // ── 赛训档案 · 自由表格（Excel 式：列/行自定义）──
  await db.query(`
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
    )
  `);
}
ensureTables().catch(e => console.error('[training-plans] 建表失败:', e.message));

// ═══════════════════════════════════════════════
// 战术总表
// ═══════════════════════════════════════════════

// GET /tactics - 获取全部战术（支持按地图/阵营/局型筛选）
router.get('/tactics', auth, async (req, res) => {
  try {
    const { map, side, round_type } = req.query;
    let sql = 'SELECT * FROM tactics_v2 WHERE is_active = 1';
    const params = [];
    if (map)        { sql += ' AND map_abbr = ?';    params.push(map); }
    if (side)       { sql += ' AND team_side = ?';   params.push(side.toUpperCase()); }
    if (round_type) { sql += ' AND round_type = ?';  params.push(round_type.toUpperCase()); }
    sql += ' ORDER BY map_abbr, team_side, round_type, tactic_id';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /tactics - 新增战术
router.post('/tactics', coachAuth, async (req, res) => {
  try {
    const { map_abbr, map_name, team_side, round_type, name, target_area, notes, alias } = req.body;
    if (!map_abbr || !team_side || !round_type || !name)
      return res.status(400).json({ error: '缺少必填字段' });

    // 自动生成编号
    const [existing] = await db.query(
      'SELECT COUNT(*) as cnt FROM tactics_v2 WHERE map_abbr=? AND team_side=? AND round_type=?',
      [map_abbr, team_side, round_type]
    );
    const seq = (existing[0].cnt || 0) + 1;
    const tactic_id = `${map_abbr}-${team_side}-${round_type}${String(seq).padStart(2,'0')}`;

    await db.query(
      `INSERT INTO tactics_v2 (tactic_id, map_abbr, map_name, team_side, round_type, name, target_area, notes, alias)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tactic_id, map_abbr, map_name||map_abbr, team_side, round_type, name, target_area||'', notes||'', alias||'']
    );
    res.json({ tactic_id, message: '创建成功' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /tactics/:id - 编辑战术
router.put('/tactics/:id', coachAuth, async (req, res) => {
  try {
    const { name, target_area, notes, alias, is_active } = req.body;
    await db.query(
      `UPDATE tactics_v2 SET name=?, target_area=?, notes=?, alias=?, is_active=? WHERE tactic_id=?`,
      [name, target_area||'', notes||'', alias||'', is_active===false?0:1, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /tactics/:id
router.delete('/tactics/:id', coachAuth, async (req, res) => {
  try {
    await db.query('UPDATE tactics_v2 SET is_active=0 WHERE tactic_id=?', [req.params.id]);
    res.json({ message: '已停用' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /tactics/:id/steps - 保存战术详细执行步骤（:id 为 tactic_id）
router.put('/tactics/:id/steps', coachAuth, async (req, res) => {
  try {
    const { steps } = req.body;
    const clean = Array.isArray(steps) ? steps.map(x => String(x || '').trim()).filter(Boolean) : [];
    await db.query('UPDATE tactics_v2 SET steps=? WHERE tactic_id=?', [JSON.stringify(clean), req.params.id]);
    res.json({ message: '步骤已保存', count: clean.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /tactics/batch - 批量导入战术（初始化用）
router.put('/tactics/:id/duties', coachAuth, async (req, res) => {
  try {
    const { player_duties } = req.body;
    const clean = Array.isArray(player_duties)
      ? player_duties
          .map(x => ({ player: String((x && x.player) || '').trim(), duty: String((x && x.duty) || '').trim() }))
          .filter(x => x.player || x.duty)
      : [];
    await db.query('UPDATE tactics_v2 SET player_duties=? WHERE tactic_id=?', [JSON.stringify(clean), req.params.id]);
    res.json({ message: '队员职责已保存', count: clean.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/tactics/batch', coachAuth, async (req, res) => {
  try {
    const { tactics } = req.body;
    if (!Array.isArray(tactics)) return res.status(400).json({ error: '需要 tactics 数组' });
    let inserted = 0, skipped = 0;
    for (const t of tactics) {
      try {
        await db.query(
          `INSERT OR IGNORE INTO tactics_v2 (tactic_id, map_abbr, map_name, team_side, round_type, name, target_area, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.tactic_id, t.map_abbr, t.map_name, t.team_side, t.round_type, t.name, t.target_area||'', t.notes||'']
        );
        inserted++;
      } catch { skipped++; }
    }
    res.json({ message: `导入完成`, inserted, skipped });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// 每日简报
// ═══════════════════════════════════════════════

// GET /briefings - 获取简报列表
router.get('/briefings', auth, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const [rows] = await db.query(
      `SELECT b.*, 
        (SELECT COUNT(*) FROM briefing_tactics_v2 bt WHERE bt.briefing_id = b.id) as tactics_count
       FROM briefings_v2 b
       ORDER BY b.brief_date DESC LIMIT ?`,
      [parseInt(limit)]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /briefings/:date - 获取指定日期简报（含战术条目）
router.get('/briefings/:date', auth, async (req, res) => {
  try {
    const [[briefing]] = await db.query(
      'SELECT * FROM briefings_v2 WHERE brief_date = ?', [req.params.date]
    );
    if (!briefing) return res.status(404).json({ error: '该日期暂无简报' });

    const [tactics] = await db.query(
      `SELECT bt.*, t.name as tactic_name, t.target_area, t.notes as tactic_notes
       FROM briefing_tactics_v2 bt
       LEFT JOIN tactics_v2 t ON t.tactic_id = bt.tactic_id
       WHERE bt.briefing_id = ?
       ORDER BY bt.map_slot, bt.team_side, bt.sort_order`,
      [briefing.id]
    );
    res.json({ ...briefing, tactics });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /briefings - 新建或更新简报
router.post('/briefings', coachAuth, async (req, res) => {
  try {
    const { date, opponent, vrs_rank, map1_name, map2_name, notes, tactics, published } = req.body;
    if (!date) return res.status(400).json({ error: '日期必填' });

    const [[existing]] = await db.query('SELECT id FROM briefings_v2 WHERE brief_date=?', [date]);

    let briefingId;
    if (existing) {
      briefingId = existing.id;
      await db.query(
        `UPDATE briefings_v2 SET opponent=?, vrs_rank=?, map1_name=?, map2_name=?,
         notes=?, published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [opponent||'', vrs_rank||'', map1_name||'', map2_name||'', notes||'', published?1:0, briefingId]
      );
    } else {
      const [result] = await db.query(
        `INSERT INTO briefings_v2 (brief_date, opponent, vrs_rank, map1_name, map2_name, notes, published)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [date, opponent||'', vrs_rank||'', map1_name||'', map2_name||'', notes||'', published?1:0]
      );
      briefingId = result.insertId;
    }

    // 更新战术条目（全量替换）
    if (Array.isArray(tactics)) {
      await db.query('DELETE FROM briefing_tactics_v2 WHERE briefing_id=?', [briefingId]);
      for (let i = 0; i < tactics.length; i++) {
        const t = tactics[i];
        await db.query(
          `INSERT INTO briefing_tactics_v2 (briefing_id, map_slot, map_name, team_side, round_type, tactic_id, instruction, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [briefingId, t.map_slot||'M1', t.map_name||'', t.team_side||'T', t.round_type||'F',
           t.tactic_id, t.instruction||'', i]
        );
      }
    }

    res.json({ briefing_id: briefingId, message: existing ? '更新成功' : '创建成功' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// 训练日志
// ═══════════════════════════════════════════════

// GET /logs - 日志列表
router.get('/logs', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT l.*,
        (SELECT COUNT(*) FROM training_log_rounds r WHERE r.log_id = l.id) as rounds_count,
        0 as scrim_only
       FROM training_logs_v2 l
       ORDER BY l.log_date DESC LIMIT 50`
    );
    // 并入"只导入了 JSON(matches 有 scrim 比分)、尚未建训练日志"的训练赛；防御式，失败则仅返回训练日志
    let scrimItems = [];
    try {
      const [scrimRows] = await db.query(
        `SELECT m.match_date AS log_date, m.opponent, GROUP_CONCAT(DISTINCT m.map_name) AS scrim_maps
         FROM matches m
         WHERE m.match_type='scrim'
           AND NOT EXISTS (SELECT 1 FROM training_logs_v2 l WHERE l.log_date=m.match_date AND LOWER(l.opponent)=LOWER(m.opponent))
         GROUP BY m.match_date, m.opponent
         ORDER BY m.match_date DESC LIMIT 50`
      );
      scrimItems = (scrimRows || []).map(s => ({
        id: null, log_date: s.log_date, opponent: s.opponent,
        rounds_count: 0, scrim_only: 1, briefing_id: null, scrim_maps: s.scrim_maps || ''
      }));
    } catch (e) { /* matches 查询失败则忽略，保持原列表不受影响 */ }
    const merged = [...rows, ...scrimItems].sort((a, b) => String(b.log_date || '').localeCompare(String(a.log_date || '')));
    res.json(merged);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /logs/:id - 日志详情（含所有回合）
router.get('/logs/:id', auth, async (req, res) => {
  try {
    const [[log]] = await db.query('SELECT * FROM training_logs_v2 WHERE id=?', [req.params.id]);
    if (!log) return res.status(404).json({ error: '日志不存在' });

    const [rounds] = await db.query(
      `SELECT r.*,
        ct.name as coach_tactic_name,
        it.name as igl_tactic_name
       FROM training_log_rounds r
       LEFT JOIN tactics_v2 ct ON ct.tactic_id = r.coach_tactic_id
       LEFT JOIN tactics_v2 it ON it.tactic_id = r.igl_tactic_id
       WHERE r.log_id = ?
       ORDER BY r.map_name, CAST(REPLACE(r.round_number,'R','') AS INTEGER)`,
      [log.id]
    );

    // 每个回合附加结构化失误(round_errors)
    try { await revEnsure(); } catch(e){}
    for (const r of rounds) {
      try {
        const [errs] = await db.query(
          `SELECT id, error_type_id, category, responsible, co_responsible, detail, source
           FROM round_errors WHERE round_id=? ORDER BY id`, [r.id]);
        r.errors = errs.map(e => ({
          id: e.id, error_type_id: e.error_type_id, category: e.category,
          responsible: e.responsible, co_responsible: e.co_responsible || '',
          detail: e.detail || '', source: e.source,
        }));
      } catch(e) { r.errors = []; }
    }

    // 关联简报
    let briefing = null;
    if (log.briefing_id) {
      const [[b]] = await db.query('SELECT * FROM briefings_v2 WHERE id=?', [log.briefing_id]);
      if (b) {
        const [bt] = await db.query(
          `SELECT bt.*, t.name as tactic_name FROM briefing_tactics_v2 bt
           LEFT JOIN tactics_v2 t ON t.tactic_id = bt.tactic_id
           WHERE bt.briefing_id=? ORDER BY bt.map_slot, bt.sort_order`,
          [b.id]
        );
        briefing = { ...b, tactics: bt };
      }
    }

    // 计算执行率
    const execStats = calcExecRate(rounds, briefing);

    res.json({ log, rounds, briefing, execStats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /logs - 新建日志（从简报自动生成框架）
router.post('/logs', staffAuth, async (req, res) => {
  try {
    const { log_date, opponent, briefing_id } = req.body;
    if (!log_date || !opponent) return res.status(400).json({ error: '日期和对手必填' });

    const [[existing]] = await db.query(
      'SELECT id FROM training_logs_v2 WHERE log_date=? AND opponent=?', [log_date, opponent]
    );
    if (existing) return res.json({ log_id: existing.id, message: '已存在', existed: true });

    // 查找关联简报
    let briefId = briefing_id || null;
    if (!briefId) {
      const [[b]] = await db.query('SELECT id FROM briefings_v2 WHERE brief_date=?', [log_date]);
      if (b) briefId = b.id;
    }

    const [result] = await db.query(
      `INSERT INTO training_logs_v2 (log_date, opponent, briefing_id) VALUES (?, ?, ?)`,
      [log_date, opponent, briefId]
    );
    const logId = result.insertId;

    // 确定地图来源：优先简报，其次手动传入的 maps 数组
    let maps = [];
    if (briefId) {
      const [[brief]] = await db.query('SELECT * FROM briefings_v2 WHERE id=?', [briefId]);
      maps = [brief.map1_name, brief.map2_name].filter(Boolean);
    }
    if (maps.length === 0 && Array.isArray(req.body.maps)) {
      maps = req.body.maps.filter(Boolean);
    }

    // 每张地图生成25个回合框架
    for (const mapName of maps) {
      for (let i = 1; i <= 25; i++) {
        await db.query(
          `INSERT INTO training_log_rounds (log_id, map_name, round_number)
           VALUES (?, ?, ?)`,
          [logId, mapName, `R${i}`]
        );
      }
    }

    res.json({ log_id: logId, message: '创建成功', briefing_linked: !!briefId, maps_created: maps.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /logs/:id - 修改日志基本信息（日期/对手，自动重新关联简报）
router.put('/logs/:id', staffAuth, async (req, res) => {
  try {
    const { log_date, opponent } = req.body;
    if (!log_date || !opponent) return res.status(400).json({ error: '日期和对手必填' });
    const [[log]] = await db.query('SELECT id FROM training_logs_v2 WHERE id=?', [req.params.id]);
    if (!log) return res.status(404).json({ error: '日志不存在' });

    // 重新关联简报
    let briefId = null;
    const [[b]] = await db.query('SELECT id FROM briefings_v2 WHERE brief_date=?', [log_date]);
    if (b) briefId = b.id;

    await db.query(
      'UPDATE training_logs_v2 SET log_date=?, opponent=?, briefing_id=? WHERE id=?',
      [log_date, opponent, briefId, req.params.id]
    );
    res.json({ message: '更新成功', briefing_linked: !!briefId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /logs/:id - 删除日志及其所有回合
router.delete('/logs/:id', staffAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM training_log_rounds WHERE log_id=?', [req.params.id]);
    await db.query('DELETE FROM training_logs_v2 WHERE id=?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /logs/:id/rounds - 保存回合数据(增量: 前端只发修改过的行, 支持多人同时录入)
router.put('/logs/:id/rounds', staffAuth, async (req, res) => {
  try {
    await revEnsure();
    const { rounds } = req.body;
    if (!Array.isArray(rounds)) return res.status(400).json({ error: '需要 rounds 数组' });

    // 取当天简报的战术id集合(用于自动判定 igl_in_briefing)
    let briefIds = new Set();
    try {
      const [[log]] = await db.query('SELECT briefing_id, log_date FROM training_logs_v2 WHERE id=?', [req.params.id]);
      if (log) {
        let bid = log.briefing_id;
        if (!bid && log.log_date) {
          const [[b]] = await db.query('SELECT id FROM briefings_v2 WHERE brief_date=?', [log.log_date]);
          bid = b ? b.id : null;
        }
        if (bid) {
          const [bt] = await db.query("SELECT tactic_id FROM briefing_tactics_v2 WHERE briefing_id=? AND tactic_id IS NOT NULL AND tactic_id!=''", [bid]);
          briefIds = new Set(bt.map(x => String(x.tactic_id)));
        }
      }
    } catch(e){}

    for (const r of rounds) {
      if (!r.id) continue;
      // 自动判定 igl_in_briefing: IGL有战术 → 在简报内=1 否则=0; 没填IGL → NULL
      // 若前端显式传了 igl_in_briefing(人工覆盖), 以前端为准
      let iglIn = null;
      if (r.igl_in_briefing === 0 || r.igl_in_briefing === 1) {
        iglIn = r.igl_in_briefing;
      } else if (r.igl_tactic_id && String(r.igl_tactic_id).trim()) {
        iglIn = briefIds.has(String(r.igl_tactic_id)) ? 1 : 0;
      }
      const fdAffect = (r.fd_affect_result === 0 || r.fd_affect_result === 1) ? r.fd_affect_result : null;

      await db.query(
        `UPDATE training_log_rounds SET
          team_side=?, coach_tactic_id=?, coach_tactic_note=?,
          execution=?, coach_comment=?, responsible=?,
          igl_tactic_id=?, igl_tactic_note=?,
          fd_player=?, fd_time=?, fd_cause=?, fd_cause_note=?, round_result=?,
          error_type_id=?, igl_in_briefing=?, fd_affect_result=?,
          updated_at=datetime('now','localtime')
         WHERE id=?`,
        [r.team_side||null, r.coach_tactic_id||null, r.coach_tactic_note||null,
         r.execution||null, r.coach_comment||null, r.responsible||null,
         r.igl_tactic_id||null, r.igl_tactic_note||null,
         r.fd_player||null, r.fd_time||null, r.fd_cause||null,
         r.fd_cause_note||null, r.round_result||null,
         r.error_type_id||null, iglIn, fdAffect, r.id]
      );

      // 结构化失误: 若前端传了 errors 数组, 整体替换该回合的人工失误
      if (Array.isArray(r.errors)) {
        // 删旧(只删该回合的, 保留其它回合); 这里整条回合的失误以前端为准
        await db.query("DELETE FROM round_errors WHERE round_id=?", [r.id]);
        for (const e of r.errors) {
          if (!e.responsible && !e.category && !e.error_type_id && !e.detail) continue;
          let cat = e.category;
          if (e.error_type_id && !cat) {
            const [[t]] = await db.query("SELECT category FROM error_types WHERE id=?", [e.error_type_id]);
            cat = t ? t.category : null;
          }
          const co = Array.isArray(e.co_responsible)
            ? e.co_responsible.map(revCanonPlayer).filter(Boolean).join(',')
            : (e.co_responsible ? String(e.co_responsible).replace(/，/g,',').split(/[,/、]/).map(revCanonPlayer).filter(Boolean).join(',') : null);
          await db.query(
            "INSERT INTO round_errors (round_id,error_type_id,category,responsible,co_responsible,detail,source) VALUES (?,?,?,?,?,?, 'manual')",
            [r.id, e.error_type_id||null, cat||'未分类', revCanonPlayer(e.responsible)||'全队', co||null, e.detail||null]);
        }
      }
    }
    res.json({ message: '保存成功', count: rounds.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 执行率计算函数 ─────────────────────────────────────────
function calcExecRate(rounds, briefing) {
  if (!briefing || !briefing.tactics) return null;

  const briefingTacticIds = new Set(briefing.tactics.map(t => t.tactic_id));
  let total = 0, matched = 0, unmatched = [];

  // 首死执行影响
  const FD_PASSIVE = new Set(['正常突破被接','吃白','压力期突破']); // 不算主动失误
  const FD_ACTIVE  = new Set(['被双拉','主动突破','位置暴露','信息失误']); // 算主动失误

  let fdTotal = 0, fdActiveCount = 0, fdAffectedCount = 0;

  for (const r of rounds) {
    // 战术执行率
    const tId = r.coach_tactic_id || r.igl_tactic_id;
    if (tId) {
      total++;
      if (briefingTacticIds.has(tId)) {
        matched++;
      } else {
        unmatched.push({
          round: r.round_number,
          map: r.map_name,
          tactic_id: tId,
          tactic_name: r.coach_tactic_name || r.igl_tactic_name || tId,
        });
      }
    }

    // 首死执行影响（仅统计1:00-1:55内）
    if (r.fd_player && r.fd_time) {
      const parts = r.fd_time.split(':');
      if (parts.length === 2) {
        const secs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        if (secs >= 60 && secs <= 115) {
          fdTotal++;
          if (FD_ACTIVE.has(r.fd_cause)) fdActiveCount++;
        }
      }
    }
  }

  return {
    tactic_exec_rate: total > 0 ? Math.round(matched / total * 100) : null,
    tactic_total: total,
    tactic_matched: matched,
    tactic_unmatched: unmatched,
    fd_total_in_range: fdTotal,
    fd_active_mistakes: fdActiveCount,
    fd_passive_count: fdTotal - fdActiveCount,
    fd_active_rate: fdTotal > 0 ? Math.round(fdActiveCount / fdTotal * 100) : null,
  };
}

// ═══════════════════════════════════════════════
// 犯错类型库
// ═══════════════════════════════════════════════

// GET /error-types — 获取全部(支持按分类筛选)
router.get('/error-types', auth, async (req, res) => {
  try {
    let sql = 'SELECT * FROM error_types';
    const params = [];
    if (req.query.active !== undefined) { sql += ' WHERE is_active=?'; params.push(req.query.active); }
    sql += ' ORDER BY category, sort_order, id';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /error-types — 新增
router.post('/error-types', adminAuth, async (req, res) => {
  try {
    const { category, name, keywords, description, severity, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '名称必填' });
    const [r] = await db.query(
      `INSERT INTO error_types (category,name,keywords,description,severity,sort_order)
       VALUES (?,?,?,?,?,?)`,
      [category||'', name, keywords||'', description||'', severity||'mid', sort_order||0]
    );
    res.json({ id: r.insertId, message: '创建成功' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /error-types/:id — 编辑
router.put('/error-types/:id', adminAuth, async (req, res) => {
  try {
    const { category, name, keywords, description, severity, is_active, sort_order } = req.body;
    await db.query(
      `UPDATE error_types SET category=?,name=?,keywords=?,description=?,severity=?,is_active=?,sort_order=? WHERE id=?`,
      [category||'', name||'', keywords||'', description||'', severity||'mid',
       is_active !== undefined ? is_active : 1, sort_order||0, req.params.id]
    );
    res.json({ message: '更新成功' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /error-types/:id — 删除
router.delete('/error-types/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM error_types WHERE id=?', [req.params.id]);
    res.json({ message: '已删除' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /error-types/seed — 初始化种子数据(幂等)
router.post('/error-types/seed', adminAuth, async (req, res) => {
  try {
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) as cnt FROM error_types');
    if (cnt > 0) return res.json({ message: '已有数据,跳过初始化', count: cnt });

    const SEED = [
      ['道具使用','闪光弹闪到队友','闪队友,闪自己人,队友被闪,flash team','','high'],
      ['道具使用','烟雾封错位置','烟封错,封烟失败,烟雾偏了,smoke wrong','','high'],
      ['道具使用','燃烧弹/火瓶浪费(未阻敌)','火瓶浪费,molly miss,火没烧到','','mid'],
      ['道具使用','道具投掷时机过早/过晚','道具时机,投早了,投晚了,utility timing','','mid'],
      ['道具使用','手雷伤害己方','炸队友,HE队友,自伤,nade damage team','','high'],
      ['道具使用','未按简报要求投掷道具','没扔道具,漏道具,道具未执行','','mid'],
      ['道具使用','道具储备不足(经济决策)','没买道具,道具不够,utility economy','','low'],
      ['道具使用','烟雾缺口被对手利用','烟雾缺口,one way,烟被穿','','high'],
      ['站位走位','过度暴露身位(over-peek)','over peek,探头太多,身位暴露,peek太宽','','high'],
      ['站位走位','站位与队友重叠(trade距离不当)','重叠站位,trade距离,站一起了','','mid'],
      ['站位走位','转点时机过慢','转点慢,rotate slow,转点迟','','mid'],
      ['站位走位','未守住分配点位','丢点,没守住,abandoned site','','high'],
      ['站位走位','残局走位暴露','残局暴露,clutch position,残局被发现','','mid'],
      ['站位走位','背后/侧面被人无感知','被背身,被绕后,flanked,没听到脚步','','high'],
      ['站位走位','架枪角度可被多人同时清','角度差,被夹,crossfire exposed','','mid'],
      ['站位走位','回防路线选择错误','回防路线错,rotation path,绕远了','','mid'],
      ['信息报点','漏报敌人位置','漏报,没报点,missed call,没说','','high'],
      ['信息报点','报点错误(方向/人数)','报错,方向错,人数错,wrong call','','high'],
      ['信息报点','报点过晚','报晚了,late call,慢了','','mid'],
      ['信息报点','报点时机干扰队友开枪','报点干扰,说话干扰,callout timing','','mid'],
      ['信息报点','未报自身血量/道具状态','没报血量,没报道具,hp not called','','low'],
      ['信息报点','关键时刻无语音交流','没交流,沉默,no comms,不说话','','mid'],
      ['枪法对枪','准星位置过低/偏移','准星低,crosshair placement,瞄脚','','mid'],
      ['枪法对枪','连续whiff(空枪)','whiff,空枪,打不到,spray miss','','mid'],
      ['枪法对枪','不该peek的时候peek','不该peek,unnecessary peek,乱peek','','high'],
      ['枪法对枪','wide swing被接住','wide swing,swing太宽,被接住','','mid'],
      ['枪法对枪','残局1vN决策失误','残局失误,clutch fail,残局决策','','high'],
      ['枪法对枪','近距离选错武器(未切副武器)','没切手枪,weapon switch,近距离大枪','','low'],
      ['战术执行','未按简报战术执行','没按战术,战术未执行,不按计划,off strat','','high'],
      ['战术执行','进攻/防守节奏与队友不同步','节奏不同步,timing off,快了慢了','','high'],
      ['战术执行','假动作暴露真实意图','假动作暴露,fake exposed,被看穿','','mid'],
      ['战术执行','rush时不同步到位','rush不同步,rush timing,rush scattered','','high'],
      ['战术执行','中期调度未响应IGL指令','不听指挥,未响应,ignored IGL','','mid'],
      ['战术执行','包点后防守站位混乱','after plant乱,包点混乱,post plant bad','','mid'],
      ['经济管理','该ECO时强起','强起,force buy错,economy break','','high'],
      ['经济管理','队伍经济不统一','经济不统一,buy不一致,different buy','','mid'],
      ['经济管理','未按指示买道具','没买指定道具,wrong buy,买错了','','mid'],
      ['经济管理','存枪局不必要送枪','送枪,save局送,unnecessary death save','','high'],
      ['经济管理','半起装备选择不当','半起选错,half buy wrong,半起装备','','low'],
      ['时间管理','进攻方浪费回合时间','浪费时间,time waste,磨叽','','mid'],
      ['时间管理','过早暴露进攻意图','暴露意图,early aggro,过早暴露','','high'],
      ['时间管理','CT方过早激进反推','CT反推,aggressive CT,反推太早','','high'],
      ['时间管理','包点后拆包时间判断失误','拆包时间,defuse timing,拆包判断','','mid'],
      ['时间管理','残局时间分配不当','残局时间,clutch time,时间不够','','mid'],
      ['团队配合','未及时补枪(trade)','没trade,补枪慢,no trade,trade fail','','high'],
      ['团队配合','double peek被各个击破','double peek,一起peek被打,双peek','','high'],
      ['团队配合','闪光配合缺失(干peek)','干peek,没闪就peek,dry peek,no flash','','mid'],
      ['团队配合','交叉火力未建立','交叉火力,crossfire fail,没架好','','mid'],
      ['团队配合','救人/不救人决策失误','救人失误,save vs fight,该救没救','','mid'],
      ['团队配合','包点后各自为战','各自为战,no teamwork post plant','','mid'],
      ['心态纪律','情绪化操作(上头冲)','上头,tilt,情绪化,冲动','','high'],
      ['心态纪律','不听从IGL指令','不听指挥,无视IGL,不配合','','high'],
      ['心态纪律','连续失误后自暴自弃','放弃,消极,give up,自暴自弃','','mid'],
      ['心态纪律','不必要的键盘/语音争吵','吵架,争吵,toxic,互喷','','mid'],
      ['心态纪律','注意力下降(走神)','走神,不集中,分心,not focused','','low'],
    ];
    for (let i = 0; i < SEED.length; i++) {
      const [cat, name, kw, desc, sev] = SEED[i];
      await db.query(
        'INSERT INTO error_types (category,name,keywords,description,severity,sort_order) VALUES (?,?,?,?,?,?)',
        [cat, name, kw, desc, sev, i + 1]
      );
    }
    res.json({ message: '初始化完成', count: SEED.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════════
// 复盘汇总报告：按日期范围聚合 v2 数据 + 关键词自动分类 + 环比
//   GET    /review-report?range=day|week|month&end=YYYY-MM-DD  (或 ?from=&to=)
//   POST   /review/classify          重跑自动分类(幂等,保留人工修正)
//   PUT    /review/incident/:id       改一条失误(类型/责任人/描述)->人工
//   POST   /review/incident           给某回合补一条失误
//   DELETE /review/incident/:id       删一条失误
// ═══════════════════════════════════════════════
const REV_PLAYERS = {
  doomer: ['doomer','唐昊','唐浩'],
  drace:  ['drace','孙荣璟','孙荣景'],
  '0Z':   ['0z','辜龙'],
  glong:  ['glong','希子','石头','侯传丁'],
  '4ever':['4ever','李禹希','李禹熙'],
  'Azura':['azura','azura4zm'],
};
const REV_TYPES = ['道具','沟通','战术','走位','枪法','未分类'];
function revKws(s){ return String(s||'').replace(/，/g,',').split(',').map(k=>k.trim().toLowerCase()).filter(Boolean); }
function revCanonPlayer(s){
  if (s===undefined||s===null) return null;
  const sl=String(s).trim().toLowerCase(); if(!sl) return null;
  for (const [k,vs] of Object.entries(REV_PLAYERS)){
    if (k.toLowerCase()===sl || vs.some(v=>v.toLowerCase()===sl || sl.includes(v.toLowerCase()))) return k;
  }
  if (['全队','团队','team','所有人','大家','全体'].includes(sl)) return '全队';
  return String(s).trim();
}
function revFindPlayers(text){
  const tl=String(text||'').toLowerCase(); const hit=[];
  for (const [k,vs] of Object.entries(REV_PLAYERS)) if (vs.some(v=>tl.includes(v.toLowerCase()))) hit.push(k);
  return hit;
}
function revNormMap(m){ return (m && /^D\d+$/.test(m)) ? 'Dust2' : (m || '未知'); }
function revClassifyText(text, ets){
  const tl=String(text||'').toLowerCase(); let best=null, bn=0;
  for (const e of ets){ let n=0; for (const k of e.kw) if (k && tl.includes(k)) n++; if (n>bn){ bn=n; best=e; } }
  return best;
}
function safeParse(str, fallback){ try { return JSON.parse(str); } catch(e){ return fallback; } }

async function revEnsure(){
  await db.query(`CREATE TABLE IF NOT EXISTS round_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    error_type_id INTEGER DEFAULT NULL,
    category TEXT NOT NULL DEFAULT '未分类',
    responsible TEXT NOT NULL DEFAULT '全队',
    detail TEXT DEFAULT NULL,
    source TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  try { await db.query(`CREATE INDEX IF NOT EXISTS idx_round_errors_round ON round_errors(round_id)`); } catch(e){}
  try { await db.query(`CREATE INDEX IF NOT EXISTS idx_round_errors_cat ON round_errors(category)`); } catch(e){}
  // 一期: 训练日志回合补领队字段(达标判定 / 首死影响胜负)
  try { await db.query(`ALTER TABLE training_log_rounds ADD COLUMN igl_in_briefing INTEGER DEFAULT NULL`); } catch(e){}
  try { await db.query(`ALTER TABLE training_log_rounds ADD COLUMN fd_affect_result INTEGER DEFAULT NULL`); } catch(e){}
  // 一期: round_errors 加连带责任人(主责存responsible, 连带存co_responsible逗号分隔)
  try { await db.query(`ALTER TABLE round_errors ADD COLUMN co_responsible TEXT DEFAULT NULL`); } catch(e){}
  // 选手高光: 训练日志按日标记MVP
  try { await db.query(`ALTER TABLE training_logs_v2 ADD COLUMN mvp_player_id INTEGER DEFAULT NULL`); } catch(e){}
  // 赛训汇总报告: 教练手填的"待改善问题 + 改进优先级"(按日期范围存, key=from~to)
  await db.query(`CREATE TABLE IF NOT EXISTS review_notes (
    range_key TEXT PRIMARY KEY,
    improve_text TEXT DEFAULT '',
    priority_json TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
}
// 自动回填 igl_in_briefing: IGL的tactic_id ∈ 当天简报tactic_id集合 → 1, 否则0
// 幂等: 只处理 igl_tactic_id 有值 且 igl_in_briefing 为 NULL 的回合(不覆盖人工)
async function revFillCompliance(){
  const [logs] = await db.query("SELECT id, log_date FROM training_logs_v2");
  let filled=0;
  for (const lg of logs){
    const [brows] = await db.query(
      `SELECT bt.tactic_id FROM briefing_tactics_v2 bt JOIN briefings_v2 b ON b.id=bt.briefing_id
       WHERE b.brief_date=? AND bt.tactic_id IS NOT NULL AND bt.tactic_id!=''`, [lg.log_date]);
    if (!brows.length) continue;
    const briefIds = new Set(brows.map(x=>String(x.tactic_id)));
    const [rounds] = await db.query(
      `SELECT id, igl_tactic_id FROM training_log_rounds
       WHERE log_id=? AND igl_tactic_id IS NOT NULL AND igl_tactic_id!='' AND igl_tactic_id!='0'
       AND igl_in_briefing IS NULL`, [lg.id]);
    for (const r of rounds){
      const inB = briefIds.has(String(r.igl_tactic_id)) ? 1 : 0;
      await db.query("UPDATE training_log_rounds SET igl_in_briefing=? WHERE id=?", [inB, r.id]);
      filled++;
    }
  }
  return filled;
}
// 自动分类填充(幂等: 只重建 source='auto', 保留人工修正 'manual')
async function revClassifyAll(){
  await revEnsure();
  const [etRows] = await db.query("SELECT id,category,name,keywords FROM error_types WHERE is_active=1");
  const ets = etRows.map(r=>({id:r.id,category:r.category,name:r.name,kw:revKws(r.keywords)}));
  await db.query("DELETE FROM round_errors WHERE source='auto'");
  // 已有手动失误的回合集合 → 自动分类跳过(以人工录入为准, 不混算)
  const [manRows] = await db.query("SELECT DISTINCT round_id FROM round_errors WHERE source='manual'");
  const manualRounds = new Set(manRows.map(x=>x.round_id));
  const [rounds] = await db.query("SELECT id, coach_comment, responsible FROM training_log_rounds WHERE coach_comment IS NOT NULL AND TRIM(coach_comment)!=''");
  let n=0;
  for (const r of rounds){
    if (manualRounds.has(r.id)) continue;   // 该回合已人工录入, 跳过自动分类
    let whos=[];
    if (r.responsible && String(r.responsible).trim())
      whos = String(r.responsible).replace(/，/g,',').split(/[,/、]/).map(revCanonPlayer).filter(Boolean);
    if (!whos.length) whos = revFindPlayers(r.coach_comment);
    if (!whos.length) whos = ['全队'];
    whos = [...new Set(whos)];
    const best = revClassifyText(r.coach_comment, ets);
    const eid = best?best.id:null, cat = best?best.category:'未分类';
    for (const w of whos){
      await db.query("INSERT INTO round_errors (round_id,error_type_id,category,responsible,source) VALUES (?,?,?,?, 'auto')", [r.id, eid, cat, w]);
      n++;
    }
  }
  return n;
}
function revIsoUTC(d){ return d.toISOString().slice(0,10); }
function revParseUTC(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(Date.UTC(y,(m||1)-1,d||1)); }
function revTodayLocal(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }
function revResolveRange(q){
  const to = q.to || q.end || revTodayLocal();
  let from = q.from;
  if (!from){
    const range=q.range||'week'; const d=revParseUTC(to);
    if (range==='day') from=to;
    else if (range==='month'){ d.setUTCDate(d.getUTCDate()-29); from=revIsoUTC(d); }
    else { d.setUTCDate(d.getUTCDate()-6); from=revIsoUTC(d); }
  }
  return { from, to };
}
function revPrevWindow(from,to){
  const d0=revParseUTC(from), d1=revParseUTC(to);
  const span=Math.round((d1-d0)/86400000);
  const pe=new Date(d0); pe.setUTCDate(pe.getUTCDate()-1);
  const ps=new Date(pe); ps.setUTCDate(ps.getUTCDate()-span);
  return { from: revIsoUTC(ps), to: revIsoUTC(pe) };
}
async function revAggregate(from,to){
  const [allLogs] = await db.query("SELECT id, log_date, opponent, briefing_id FROM training_logs_v2 WHERE log_date BETWEEN ? AND ? ORDER BY log_date", [from,to]);
  // 三缺一门禁: 同一日期需 简报 + 训练日志 + JSON(matches有比分) 三者齐全
  const logs = [];
  for (const lg of allLogs){
    const [[hb]] = await db.query("SELECT COUNT(*) n FROM briefings_v2 WHERE brief_date=?", [lg.log_date]);
    const [[hm]] = await db.query("SELECT COUNT(*) n FROM matches WHERE match_date=?", [lg.log_date]);
    if (hb.n>0 && hm.n>0) logs.push(lg);   // 日志本身已有, 再要求简报+JSON
  }
  let totalRounds=0; const matches=[]; const logIds=[];
  for (const lg of logs){
    logIds.push(lg.id);
    const [[rc]] = await db.query("SELECT COUNT(*) n FROM training_log_rounds WHERE log_id=?", [lg.id]);
    totalRounds += rc.n;
    const [sc] = await db.query("SELECT map_name, our_score, their_score FROM matches WHERE match_date=? AND LOWER(opponent)=LOWER(?)", [lg.log_date, lg.opponent]);
    matches.push({ date: lg.log_date, opponent: lg.opponent, rounds: rc.n,
      maps: sc.map(s=>({ map: revNormMap(s.map_name), score: (s.our_score!=null && s.their_score!=null) ? (s.our_score+':'+s.their_score) : null })) });
  }
  let incidents=[];
  if (logIds.length){
    const ph=logIds.map(()=>'?').join(',');
    const [rows] = await db.query(
      `SELECT re.id, re.error_type_id, re.category, re.responsible, re.co_responsible, re.detail,
              r.id round_id, r.map_name, r.round_number, r.team_side, r.coach_comment,
              l.log_date, l.opponent, et.name type_name
       FROM round_errors re
       JOIN training_log_rounds r ON r.id=re.round_id
       JOIN training_logs_v2 l ON l.id=r.log_id
       LEFT JOIN error_types et ON et.id=re.error_type_id
       WHERE r.log_id IN (${ph})
       ORDER BY l.log_date, r.map_name, CAST(REPLACE(r.round_number,'R','') AS INTEGER)`, logIds);
    incidents = rows.map(x=>{
      const co = (x.co_responsible ? String(x.co_responsible).replace(/，/g,',').split(/[,/、]/) : [])
        .map(revCanonPlayer).filter(Boolean);
      // 主责也可能是组合(如"drace/doomer/glong")，按分隔符拆分，每人单独归一化
      const whos = (x.responsible ? String(x.responsible).replace(/，/g,',').split(/[,/、]/) : [])
        .map(revCanonPlayer).filter(Boolean);
      return {
        id:x.id, round_id:x.round_id, date:x.log_date, opponent:x.opponent,
        map:revNormMap(x.map_name), round:x.round_number, side:x.team_side,
        who: whos[0] || '全队',                        // 主责(第一个,兼容旧用法)
        whos: whos.length ? whos : ['全队'],           // 主责全部(拆分后)
        co_responsible: co,                            // 连带(已规范化)
        type:x.category, type_id:x.error_type_id, type_name:x.type_name,
        detail: x.detail || x.coach_comment,
      };
    });
  }
  const byType={}; REV_TYPES.forEach(t=>byType[t]=0);
  const pmap={};
  function bumpPlayer(name, type){
    const p = pmap[name] || (pmap[name]=Object.fromEntries(REV_TYPES.map(t=>[t,0])));
    if (p[type]!=null) p[type]++; else p[type]=(p[type]||0)+1;
  }
  for (const x of incidents){
    byType[x.type]=(byType[x.type]||0)+1;        // 类型分布: 一个失误事件算一次(含全队,反映整体失误量)
    const counted = new Set();                    // 本失误已计数的人,避免主责/连带重复计
    for (const w of (x.whos||[])){                // 主责(拆分后)每人 +1, 全队不计入个人
      if (w && w!=='全队' && !counted.has(w)){ bumpPlayer(w, x.type); counted.add(w); }
    }
    for (const co of (x.co_responsible||[])){      // 连带 各 +1 (与主责去重)
      if (co && co!=='全队' && !counted.has(co)){ bumpPlayer(co, x.type); counted.add(co); }
    }
  }
  const players = Object.entries(pmap).map(([name,bt])=>({ name, total:Object.values(bt).reduce((a,b)=>a+b,0), by_type:bt })).sort((a,b)=>b.total-a.total);
  const probRounds = new Set(incidents.filter(x=>x.type!=='教练点赞').map(x=>x.round_id)).size; // 教练点赞是正向，不算问题回合

  // ── 简报执行达标率(口径A: 按图, 分母=已记录IGL判定的回合) ──
  let compliance = [];
  if (logIds.length){
    const ph2=logIds.map(()=>'?').join(',');
    const [crows] = await db.query(
      `SELECT l.log_date, l.opponent, r.map_name,
        COUNT(*) total_rounds,
        SUM(CASE WHEN r.igl_in_briefing IS NOT NULL THEN 1 ELSE 0 END) recorded,
        SUM(CASE WHEN r.igl_in_briefing=1 THEN 1 ELSE 0 END) pass
       FROM training_log_rounds r JOIN training_logs_v2 l ON l.id=r.log_id
       WHERE r.log_id IN (${ph2})
       GROUP BY l.log_date, r.map_name
       ORDER BY l.log_date, r.map_name`, logIds);
    compliance = crows.map(c=>{
      const recorded = c.recorded||0;
      const rate = recorded>0 ? Math.round(c.pass/recorded*100) : null;
      return { date:c.log_date, opponent:c.opponent, map:revNormMap(c.map_name),
        total_rounds:c.total_rounds, recorded, pass:c.pass||0, rate,
        status: rate==null ? 'pending' : (rate>=80 ? 'pass' : 'fail') };
    });
    // 附加每个(日期×地图)的未执行回合明细(igl_in_briefing=0)
    const [urows] = await db.query(
      `SELECT l.log_date, r.map_name, r.round_number, r.team_side,
              r.igl_tactic_id, it.name igl_tactic_name, r.igl_tactic_note, r.coach_comment
       FROM training_log_rounds r
       JOIN training_logs_v2 l ON l.id=r.log_id
       LEFT JOIN tactics_v2 it ON it.tactic_id=r.igl_tactic_id
       WHERE r.log_id IN (${ph2}) AND r.igl_in_briefing=0
       ORDER BY l.log_date, r.map_name, CAST(REPLACE(r.round_number,'R','') AS INTEGER)`, logIds);
    for (const c of compliance) {
      c.unexec = urows.filter(u => u.log_date===c.date && revNormMap(u.map_name)===c.map)
        .map(u => ({
          round: u.round_number, side: u.team_side,
          igl: u.igl_tactic_name || u.igl_tactic_id || '-',
          note: u.igl_tactic_note || u.coach_comment || '',
        }));
    }
  }

  // ── 核心问题: 失误总数最高的 4 个类型(剔除未分类); 每类带责任人分布 ──
  const typeAgg = {};   // { 类型: { count, whoMap:{责任人:次数} } }
  for (const x of incidents){
    if (x.type==='未分类' || x.type==='教练点赞') continue;
    const a = typeAgg[x.type] || (typeAgg[x.type]={ type:x.type, count:0, whoMap:{}, samples:[] });
    a.count++;
    const bump = (w)=>{ if(w && w!=='全队') a.whoMap[w]=(a.whoMap[w]||0)+1; };
    bump(x.who);
    for (const co of (x.co_responsible||[])) if (co!==x.who) bump(co);
    if (a.samples.length<3 && x.detail) a.samples.push({ date:x.date, map:x.map, round:x.round, detail:x.detail });
  }
  const coreIssues = Object.values(typeAgg)
    .sort((a,b)=>b.count-a.count)
    .slice(0,4)
    .map(a=>({
      type:a.type, count:a.count, samples:a.samples,
      top_players: Object.entries(a.whoMap).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([who,n])=>({who,n})),
    }));

  // 指令执行率(口径A): 已记录IGL判定的回合中, 在简报内的占比
  const cmdRecorded = compliance.reduce((s,c)=>s+(c.recorded||0),0);
  const cmdPass = compliance.reduce((s,c)=>s+(c.pass||0),0);
  const cmd_rate = cmdRecorded>0 ? Math.round(cmdPass/cmdRecorded*100) : null;

  return { from, to, matches, total_rounds:totalRounds, problem_rounds:probRounds,
    problem_rate: totalRounds? Math.round(probRounds/totalRounds*1000)/10 : 0,
    by_type:byType, players, incidents, compliance, core_issues:coreIssues,
    cmd_rate, cmd_recorded:cmdRecorded, cmd_pass:cmdPass };
}

// GET /review-report — 复盘汇总报告(按日期范围)
router.get('/review-report', auth, async (req,res)=>{
  try{
    await revEnsure();
    try { await revFillCompliance(); } catch(e){ console.error('[review] fill-compliance:', e.message); }
    const [[{cnt}]] = await db.query("SELECT COUNT(*) cnt FROM round_errors");
    if (!cnt){ try { await revClassifyAll(); } catch(e){ console.error('[review] auto-classify:', e.message); } }
    const { from, to } = revResolveRange(req.query);
    const cur = await revAggregate(from, to);
    const pv = revPrevWindow(from, to);
    const prev = await revAggregate(pv.from, pv.to);
    res.json({
      range: { from, to, days: Math.round((revParseUTC(to)-revParseUTC(from))/86400000)+1 },
      summary: { matches: cur.matches.length, total_rounds: cur.total_rounds, problem_rounds: cur.problem_rounds, problem_rate: cur.problem_rate, by_type: cur.by_type, cmd_rate: cur.cmd_rate, cmd_recorded: cur.cmd_recorded, cmd_pass: cur.cmd_pass },
      prev: { from: pv.from, to: pv.to, total_rounds: prev.total_rounds, problem_rounds: prev.problem_rounds, problem_rate: prev.problem_rate, by_type: prev.by_type, players: prev.players, cmd_rate: prev.cmd_rate, cmd_recorded: prev.cmd_recorded, cmd_pass: prev.cmd_pass },
      matches: cur.matches,
      incidents: cur.incidents,
      players: cur.players,
      compliance: cur.compliance,
      core_issues: cur.core_issues,
      types: REV_TYPES,
    });
  }catch(e){ res.status(500).json({ error:'生成报告失败: '+e.message }); }
});

// GET /review-notes?from=&to= — 取该日期范围教练手填的待改善问题+改进优先级
router.get('/review-notes', auth, async (req,res)=>{
  try{
    await revEnsure();
    const { from, to } = revResolveRange(req.query);
    const key = `${from}~${to}`;
    const [[row]] = await db.query("SELECT improve_text, priority_json FROM review_notes WHERE range_key=?", [key]);
    res.json({
      range_key: key,
      exists: !!row,
      improve_text: row?.improve_text || '',
      priorities: row ? safeParse(row.priority_json, []) : [],
    });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// PUT /review-notes — 保存该日期范围的待改善问题+改进优先级
router.put('/review-notes', auth, async (req,res)=>{
  try{
    await revEnsure();
    const { from, to } = revResolveRange(req.query);
    const key = `${from}~${to}`;
    const improve = (req.body.improve_text || '').toString();
    const priorities = Array.isArray(req.body.priorities) ? req.body.priorities : [];
    await db.query(
      `INSERT INTO review_notes (range_key, improve_text, priority_json, updated_at)
       VALUES (?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(range_key) DO UPDATE SET improve_text=excluded.improve_text, priority_json=excluded.priority_json, updated_at=datetime('now','localtime')`,
      [key, improve, JSON.stringify(priorities)]
    );
    res.json({ message:'已保存' });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// POST /review/classify — 重跑自动分类
router.post('/review/classify', adminAuth, async (req,res)=>{
  try{ const n = await revClassifyAll(); res.json({ message:'重新分类完成', inserted:n }); }
  catch(e){ res.status(500).json({ error:e.message }); }
});

// PUT /review/incident/:id — 修改一条失误
router.put('/review/incident/:id', auth, async (req,res)=>{
  try{
    await revEnsure();
    const { error_type_id, category, responsible, co_responsible, detail } = req.body;
    let cat = category;
    if (error_type_id && !cat){ const [[t]] = await db.query("SELECT category FROM error_types WHERE id=?", [error_type_id]); cat = t? t.category : category; }
    const coStr = Array.isArray(co_responsible)
      ? co_responsible.map(revCanonPlayer).filter(Boolean).join(',')
      : (co_responsible ? String(co_responsible).replace(/，/g,',').split(/[,/、]/).map(revCanonPlayer).filter(Boolean).join(',') : null);
    await db.query("UPDATE round_errors SET error_type_id=?, category=?, responsible=?, co_responsible=?, detail=?, source='manual' WHERE id=?",
      [error_type_id||null, cat||'未分类', revCanonPlayer(responsible)||'全队', coStr||null, detail||null, req.params.id]);
    res.json({ message:'已保存' });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// POST /review/incident — 给某回合补一条失误
router.post('/review/incident', auth, async (req,res)=>{
  try{
    await revEnsure();
    const { round_id, error_type_id, category, responsible, co_responsible, detail } = req.body;
    if (!round_id) return res.status(400).json({ error:'缺少 round_id' });
    let cat = category;
    if (error_type_id && !cat){ const [[t]] = await db.query("SELECT category FROM error_types WHERE id=?", [error_type_id]); cat = t? t.category : category; }
    const coStr = Array.isArray(co_responsible)
      ? co_responsible.map(revCanonPlayer).filter(Boolean).join(',')
      : (co_responsible ? String(co_responsible).replace(/，/g,',').split(/[,/、]/).map(revCanonPlayer).filter(Boolean).join(',') : null);
    const [r] = await db.query("INSERT INTO round_errors (round_id,error_type_id,category,responsible,co_responsible,detail,source) VALUES (?,?,?,?,?,?, 'manual')",
      [round_id, error_type_id||null, cat||'未分类', revCanonPlayer(responsible)||'全队', coStr||null, detail||null]);
    res.json({ message:'已添加', id:r.insertId });
  }catch(e){ res.status(500).json({ error:e.message }); }
});

// DELETE /review/incident/:id — 删一条失误
router.delete('/review/incident/:id', auth, async (req,res)=>{
  try{ await revEnsure(); await db.query("DELETE FROM round_errors WHERE id=?", [req.params.id]); res.json({ message:'已删除' }); }
  catch(e){ res.status(500).json({ error:e.message }); }
});


// ════════════════════════════════════════════════════════════
// 选手高光 (击杀王/Rating王/MVP/失误率最低/进步最快)
// ════════════════════════════════════════════════════════════
// GET /highlights?from&to — 5维度高光评选
router.get('/highlights', auth, async (req,res)=>{
  try{
    await revEnsure();
    const { from, to } = revResolveRange(req.query);
    const pv = revPrevWindow(from, to);

    // 现役5人(id↔nickname↔avatar)
    // 兜底:若 in_game_role / sort_order 等可选列在某些库里不存在,退回最小字段集,避免整个接口 500
    let roster;
    try {
      [roster] = await db.query(
        "SELECT id, nickname, avatar_url, in_game_role FROM players WHERE status='active' AND team_type='roster' AND division='cs2' ORDER BY sort_order");
    } catch (e) {
      console.error('[highlights] roster 全字段查询失败, 退回最小字段集:', e.message);
      [roster] = await db.query(
        "SELECT id, nickname, avatar_url FROM players WHERE status='active' AND team_type='roster' AND division='cs2'");
    }
    const pid2nick = {}; const nick2pid = {};
    for (const p of roster){ pid2nick[p.id]=p.nickname; nick2pid[(p.nickname||'').toLowerCase()]=p.id; }
    const rosterIds = roster.map(p=>p.id);

    // ── 击杀 / Rating: player_stats join 训练赛 ──
    const ph = rosterIds.length ? rosterIds.map(()=>'?').join(',') : 'NULL';
    const [statRows] = rosterIds.length ? await db.query(
      `SELECT ps.player_id,
              SUM(ps.kills) kills, SUM(ps.deaths) deaths, COUNT(*) games
       FROM player_stats ps JOIN matches m ON m.id=ps.match_id
       WHERE m.match_type='scrim' AND m.match_date>=? AND m.match_date<=?
         AND ps.player_id IN (${ph})
       GROUP BY ps.player_id`, [from, to, ...rosterIds]) : [[]];
    const statBy = {}; for (const s of statRows) statBy[s.player_id]=s;

    // ── MVP: round_errors 里 category='教练点赞' 按选手统计(教练对当天好表现的点赞) ──
    //   留空=没有值得表扬的；点赞最多者为 MVP。responsible 可能是组合,需拆分+归一化
    const praiseBy = {};  // nickname(小写) → 点赞次数
    try {
      const [praiseRows] = await db.query(
        `SELECT re.responsible, re.co_responsible
           FROM round_errors re
           JOIN training_log_rounds r ON r.id=re.round_id
           JOIN training_logs_v2 l ON l.id=r.log_id
          WHERE l.log_date>=? AND l.log_date<=? AND re.category='教练点赞'`,
        [from, to]);
      for (const pr of praiseRows) {
        const names = [];
        if (pr.responsible) names.push(...String(pr.responsible).replace(/，/g,',').split(/[,/、]/));
        if (pr.co_responsible) names.push(...String(pr.co_responsible).replace(/，/g,',').split(/[,/、]/));
        const canon = [...new Set(names.map(revCanonPlayer).filter(n=>n && n!=='全队'))];
        for (const c of canon) {
          const cl = c.toLowerCase();
          praiseBy[cl] = (praiseBy[cl]||0) + 1;
        }
      }
    } catch(e){ console.error('[highlights] 教练点赞统计失败:', e.message); }

    // ── 失误数(本期/上期): 复用 revAggregate.players (已按 nickname, 排除全队) ──
    // 包一层 try:即使 revAggregate(本期/上期) 抛错(如上期窗口无数据), 也不让整个高光接口 500——
    // 击杀王/Rating王/MVP 仍能正常返回, 只是"失误率最低/进步最快"两项可能空缺
    const errCur = {}, errPrev = {};
    try {
      const cur = await revAggregate(from, to);
      const prev = await revAggregate(pv.from, pv.to);
      for (const p of cur.players) errCur[(p.name||'').toLowerCase()]=p.total;
      for (const p of prev.players) errPrev[(p.name||'').toLowerCase()]=p.total;
    } catch (e) {
      console.error('[highlights] 失误聚合(revAggregate)失败, 跳过失误率/进步项:', e.message);
    }

    // 参与回合: 该选手有 player_stats 记录的场次 × 该场总回合(matches.our+their)
    const [rndRows] = rosterIds.length ? await db.query(
      `SELECT ps.player_id, SUM(COALESCE(m.our_score,0)+COALESCE(m.their_score,0)) rounds
       FROM player_stats ps JOIN matches m ON m.id=ps.match_id
       WHERE m.match_type='scrim' AND m.match_date>=? AND m.match_date<=?
         AND ps.player_id IN (${ph})
       GROUP BY ps.player_id`, [from, to, ...rosterIds]) : [[]];
    const roundsBy = {}; for (const r of rndRows) roundsBy[r.player_id]=r.rounds||0;

    // 组装每人指标
    const board = roster.map(p=>{
      const nick = p.nickname; const nl = (nick||'').toLowerCase();
      const cnl = (revCanonPlayer(nick)||nick||'').toLowerCase();  // 归一key:让 Azura4ZM↔Azura 等"昵称≠花名"也能对上失误/点赞数据
      const st = statBy[p.id] || {};
      const errN = errCur[cnl] || 0;
      const rounds = roundsBy[p.id] || 0;
      const prevErr = errPrev[cnl];
      return {
        player_id: p.id, nickname: nick, avatar_url: p.avatar_url, role: p.in_game_role,
        kills: st.kills || 0,
        rating: (() => { const k = Number(st.kills)||0, d = Number(st.deaths)||0; return (k>0||d>0) ? Math.round((0.5 + (d>0 ? k/d : k)*0.5)*100)/100 : null; })(),
        mvp: praiseBy[cnl] || 0,                                     // 教练点赞次数(MVP依据)
        errors: errN,
        rounds,
        games: st.games || 0,                                       // 参与场次(用于失误最少门槛)
        err_rate: rounds>0 ? Math.round(errN/rounds*1000)/10 : null,  // 失误/回合 %
        prev_errors: prevErr==null ? null : prevErr,
        err_drop: prevErr==null ? null : (prevErr - errN),            // 较上期减少
      };
    });

    // 评选得主
    const pick = (arr, key, dir='max', filter=null) => {
      let pool = arr.filter(x => x[key]!=null && (filter? filter(x):true));
      if (!pool.length) return null;
      pool.sort((a,b)=> dir==='max' ? b[key]-a[key] : a[key]-b[key]);
      return pool[0];
    };
    const killWinner   = pick(board, 'kills', 'max', x=>x.kills>0);
    const ratingWinner = pick(board, 'rating', 'max');
    const mvpWinner    = pick(board, 'mvp', 'max', x=>x.mvp>0);
    // 失误最少: 样本门槛按日期范围天数动态(近3天≥2场, 近7天≥4场) = round(天数×0.6)
    const _d0 = new Date(from+'T00:00:00Z'), _d1 = new Date(to+'T00:00:00Z');
    const rangeDays = Math.round((_d1 - _d0)/86400000) + 1;        // 含首尾
    const minGames = Math.max(1, Math.ceil(rangeDays / 2));        // 参赛场次≥标签天数/2(近7天≥4,近3天≥2,近30天≥15),至少1场
    const errRateWinner= pick(board.filter(x=>x.rounds>0 && x.games>=minGames), 'err_rate', 'min');  // 失误率最低(样本≥minGames场)
    const progressWinner = pick(board, 'err_drop', 'max', x=>x.err_drop!=null && x.err_drop>0); // 进步(降幅>0)

    res.json({
      range: { from, to }, prev: { from: pv.from, to: pv.to },
      board,
      highlights: {
        kills:    killWinner   && { ...killWinner,   metric: killWinner.kills,      unit:'总击杀' },
        rating:   ratingWinner && { ...ratingWinner, metric: ratingWinner.rating,   unit:'平均 Rating' },
        mvp:      mvpWinner    && { ...mvpWinner,     metric: mvpWinner.mvp,         unit:'本周期 MVP' },
        err_rate: errRateWinner&& { ...errRateWinner, metric: errRateWinner.err_rate,unit:'失误 / 回合' },
        progress: progressWinner&&{ ...progressWinner,metric: progressWinner.err_drop,unit:'失误较上期↓' },
      },
    });
  }catch(e){ res.status(500).json({ error:'高光生成失败: '+e.message }); }
});

// PUT /logs/:id/mvp — 标记某训练日的MVP
router.put('/logs/:id/mvp', staffAuth, async (req,res)=>{
  try{
    await revEnsure();
    const { mvp_player_id } = req.body;
    await db.query("UPDATE training_logs_v2 SET mvp_player_id=? WHERE id=?", [mvp_player_id||null, req.params.id]);
    res.json({ message:'已保存' });
  }catch(e){ res.status(500).json({ error:e.message }); }
});


// ════════════════════════════════════════════════════════════
// 赛训档案 — 教练/领队资料库（分区权限隔离）
// section: 'coach'(教练编辑) | 'leader'(领队编辑)；对方只读，admin 全权
// ════════════════════════════════════════════════════════════
function canEditArchive(role, section) {
  if (role === 'admin') return true;
  if (section === 'coach') return role === 'coach';
  if (section === 'leader') return role === 'team_lead';
  return false;
}

// 读：任何登录用户都能看（对方只读）
router.get('/archives', auth, async (req, res) => {
  try {
    const { section } = req.query;
    let sql = 'SELECT * FROM archives_v1', params = [];
    if (section) { sql += ' WHERE section = ?'; params.push(section); }
    sql += ' ORDER BY category, updated_at DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 新建
router.post('/archives', auth, async (req, res) => {
  try {
    const { section, category, title, content, file_location } = req.body;
    if (!['coach', 'leader'].includes(section)) return res.status(400).json({ error: '分区无效' });
    if (!canEditArchive(req.user.role, section)) return res.status(403).json({ error: '无权在该分区新建（教练管教练区 / 领队管领队区）' });
    await db.query(
      `INSERT INTO archives_v1 (section, category, title, content, file_location, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`,
      [section, category || '', title || '', content || '', file_location || '', req.user.username || req.user.name || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 编辑
router.put('/archives/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT section FROM archives_v1 WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: '条目不存在' });
    if (!canEditArchive(req.user.role, row.section)) return res.status(403).json({ error: '无权编辑对方分区的内容' });
    const { category, title, content, file_location } = req.body;
    await db.query(
      `UPDATE archives_v1 SET category=?, title=?, content=?, file_location=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [category || '', title || '', content || '', file_location || '', req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除
router.delete('/archives/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT section FROM archives_v1 WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: '条目不存在' });
    if (!canEditArchive(req.user.role, row.section)) return res.status(403).json({ error: '无权删除对方分区的内容' });
    await db.query('DELETE FROM archives_v1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// 赛训档案 · 自由表格（Excel 式，列/行自定义，分区权限隔离）
// ════════════════════════════════════════════════════════════

// 读：任何登录用户都能看该区所有表（对方只读）
router.get('/sheets', auth, async (req, res) => {
  try {
    const { section } = req.query;
    let sql = 'SELECT * FROM sheets_v1', params = [];
    if (section) { sql += ' WHERE section = ?'; params.push(section); }
    sql += ' ORDER BY id ASC';
    const [rows] = await db.query(sql, params);
    res.json(rows.map(r => ({ ...r, columns: safeParse(r.columns, []), rows: safeParse(r.rows, []) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 新建表
router.post('/sheets', auth, async (req, res) => {
  try {
    const { section, name, category } = req.body;
    if (!['coach', 'leader'].includes(section)) return res.status(400).json({ error: '分区无效' });
    if (!canEditArchive(req.user.role, section)) return res.status(403).json({ error: '无权在该分区新建表' });
    await db.query(
      `INSERT INTO sheets_v1 (section, category, name, columns, rows, created_by, created_at, updated_at)
       VALUES (?, ?, ?, '[]', '[]', ?, datetime('now','localtime'), datetime('now','localtime'))`,
      [section, category || '', name || '未命名表', req.user.username || req.user.name || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 一键生成模板表（教练/领队各一套预设表，已存在同名则跳过）
const SHEET_TEMPLATES = {
  coach: [
    { name: '选手短板跟踪', columns: ['选手', '短板类型', '具体表现', '训练措施', '改善进度', '状态'] },
    { name: '低级失误记录', columns: ['日期', '选手', '失误类型', '分级(A/B/C)', '描述', '处理'] },
    { name: 'Demo复盘记录', columns: ['日期', '对手', '地图', '复盘要点', '待改进'] },
    { name: '对手情报',     columns: ['对手', '强图', '弱图', '惯用战术', '关键选手', 'BP倾向'] },
    { name: '选手评分',     columns: ['选手', '周期', '枪法', '战术', '配合', '态度', '潜力', '总分'] },
    { name: '战术本清单',   columns: ['编号', '地图', 'T/CT', '战术名', '状态'] },
  ],
  leader: [
    { name: '训练考勤',     columns: ['日期', '选手', '出勤', '迟到时长', '备注'] },
    { name: '录像归档清单', columns: ['日期', '对手', '地图', '文件名', '归档位置'] },
    { name: '队员信息',     columns: ['姓名', 'Steam/Faceit', '手机', '紧急联系人', '合同到期'] },
    { name: '外设库存',     columns: ['设备型号', '总数', '在用', '备件', '损坏', '状态'] },
    { name: '月度成本',     columns: ['月份', '项目', '预算', '实际', '差异', '备注'] },
    { name: '文件归档检查', columns: ['文件类型', '命名规范', '存储位置', '状态'] },
  ],
};
router.post('/sheets/seed-templates', auth, async (req, res) => {
  try {
    const { section } = req.body;
    if (!['coach', 'leader'].includes(section)) return res.status(400).json({ error: '分区无效' });
    if (!canEditArchive(req.user.role, section)) return res.status(403).json({ error: '无权在该分区生成模板' });
    const tpls = SHEET_TEMPLATES[section] || [];
    const [existing] = await db.query('SELECT name FROM sheets_v1 WHERE section = ?', [section]);
    const existNames = new Set(existing.map(r => r.name));
    let created = 0;
    for (const t of tpls) {
      if (existNames.has(t.name)) continue;
      await db.query(
        `INSERT INTO sheets_v1 (section, category, name, columns, rows, created_by, created_at, updated_at)
         VALUES (?, '', ?, ?, '[]', ?, datetime('now','localtime'), datetime('now','localtime'))`,
        [section, t.name, JSON.stringify(t.columns), req.user.username || req.user.name || '']
      );
      created++;
    }
    res.json({ ok: true, created, skipped: tpls.length - created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 保存整表（列名 + 数据）
router.put('/sheets/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT section FROM sheets_v1 WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: '表不存在' });
    if (!canEditArchive(req.user.role, row.section)) return res.status(403).json({ error: '无权编辑对方分区的表' });
    const { name, category, columns, rows: dataRows } = req.body;
    await db.query(
      `UPDATE sheets_v1 SET name=?, category=?, columns=?, rows=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [name || '未命名表', category || '', JSON.stringify(columns || []), JSON.stringify(dataRows || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删表
router.delete('/sheets/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT section FROM sheets_v1 WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: '表不存在' });
    if (!canEditArchive(req.user.role, row.section)) return res.status(403).json({ error: '无权删除对方分区的表' });
    await db.query('DELETE FROM sheets_v1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.__revClassifyAll = revClassifyAll;
