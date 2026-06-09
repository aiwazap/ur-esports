const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// ============================================================
// 建表（幂等）
// ============================================================
async function ensureTables() {
  await db.query(`
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
    )
  `);

  await db.query(`
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
    )
  `);

  await db.query(`
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
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS trial_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      cost_type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (player_id) REFERENCES trial_players(id)
    )
  `);
}

// 确保表存在
ensureTables().catch(e => console.error('trial ensureTables error:', e.message));

// ============================================================
// 权限检查中间件
// ============================================================
function checkRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role || '';
    if (roles.includes(userRole) || userRole === 'CEO' || userRole === '经理') {
      return next();
    }
    return res.status(403).json({ error: '权限不足' });
  };
}

// ============================================================
// TRIAL PLAYERS — 试训队员 CRUD
// ============================================================

// 列表（支持 status 筛选）
router.get('/players', auth, async (req, res) => {
  try {
    const statusFilter = req.query.status ? `WHERE status = '${req.query.status}'` : 'WHERE 1=1';
    const [rows] = await db.query(
      `SELECT * FROM trial_players ${statusFilter} ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 详情
router.get('/players/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM trial_players WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '未找到' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 新增
router.post('/players', auth, async (req, res) => {
  try {
    const { name, ign, nationality, age, steam_id, faceit, phone, wechat,
            translator, translator_phone, flight_info, room_no, workstation, notes } = req.body;
    const [result] = await db.query(
      `INSERT INTO trial_players (name, ign, nationality, age, steam_id, faceit, phone, wechat,
         translator, translator_phone, flight_info, room_no, workstation, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, ign, nationality, age, steam_id, faceit, phone, wechat,
       translator, translator_phone, flight_info, room_no, workstation, notes]
    );
    res.json({ id: result.insertId, message: '新增成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新
router.put('/players/:id', auth, async (req, res) => {
  try {
    const fields = [];
    const vals = [];
    for (const key of ['name','ign','nationality','age','steam_id','faceit','phone','wechat',
                       'translator','translator_phone','flight_info','room_no','workstation','status','notes']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        vals.push(req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: '无字段更新' });
    fields.push("updated_at = datetime('now','localtime')");
    vals.push(req.params.id);
    await db.query(
      `UPDATE trial_players SET ${fields.join(', ')} WHERE id = ?`, vals
    );
    res.json({ message: '更新成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除
router.delete('/players/:id', auth, checkRole('CEO', '经理'), async (req, res) => {
  try {
    await db.query('DELETE FROM trial_players WHERE id = ?', [req.params.id]);
    // 级联删除关联数据
    await db.query('DELETE FROM trial_contacts WHERE player_id = ?', [req.params.id]);
    await db.query('DELETE FROM trial_scores WHERE player_id = ?', [req.params.id]);
    await db.query('DELETE FROM trial_costs WHERE player_id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// TRIAL CONTACTS — 接洽记录
// ============================================================

// 按队员ID查询
router.get('/contacts', auth, async (req, res) => {
  try {
    const pid = req.query.player_id;
    const where = pid ? `WHERE player_id = ${parseInt(pid)}` : 'WHERE 1=1';
    const [rows] = await db.query(`SELECT * FROM trial_contacts ${where} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 保存接洽记录
router.post('/contacts', auth, async (req, res) => {
  try {
    const { player_id, contact_person, contact_date, checklist_json,
            chinese_listening, chinese_speaking, chinese_notes,
            q1, q2, q3, q4, q5, q6, q7, q8, handler_sign, manager_confirm } = req.body;
    const [result] = await db.query(
      `INSERT INTO trial_contacts (player_id, contact_person, contact_date, checklist_json,
         chinese_listening, chinese_speaking, chinese_notes,
         q1, q2, q3, q4, q5, q6, q7, q8, handler_sign, manager_confirm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [player_id, contact_person, contact_date, JSON.stringify(checklist_json || []),
       chinese_listening, chinese_speaking, chinese_notes,
       q1, q2, q3, q4, q5, q6, q7, q8, handler_sign, manager_confirm]
    );
    res.json({ id: result.insertId, message: '接洽记录已保存' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新接洽记录
router.put('/contacts/:id', auth, async (req, res) => {
  try {
    const fields = [];
    const vals = [];
    for (const key of ['player_id','contact_person','contact_date','checklist_json',
                       'chinese_listening','chinese_speaking','chinese_notes',
                       'q1','q2','q3','q4','q5','q6','q7','q8','handler_sign','manager_confirm']) {
      if (req.body[key] !== undefined) {
        const val = key === 'checklist_json' ? JSON.stringify(req.body[key]) : req.body[key];
        fields.push(`${key} = ?`);
        vals.push(val);
      }
    }
    if (!fields.length) return res.status(400).json({ error: '无字段更新' });
    vals.push(req.params.id);
    await db.query(`UPDATE trial_contacts SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ message: '更新成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// TRIAL SCORES — 考核评分
// ============================================================

// 查询（支持 player_id + 日期范围）
router.get('/scores', auth, async (req, res) => {
  try {
    const { player_id, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    if (player_id) where += ` AND player_id = ${parseInt(player_id)}`;
    if (date_from) where += ` AND score_date >= '${date_from}'`;
    if (date_to) where += ` AND score_date <= '${date_to}'`;
    const [rows] = await db.query(
      `SELECT * FROM trial_scores ${where} ORDER BY score_date DESC, created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 统计（平均分 + 各维度平均）
router.get('/scores/stats', auth, async (req, res) => {
  try {
    const { player_id, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    if (player_id) where += ` AND player_id = ${parseInt(player_id)}`;
    if (date_from) where += ` AND score_date >= '${date_from}'`;
    if (date_to) where += ` AND score_date <= '${date_to}'`;

    const [rows] = await db.query(
      `SELECT
         COUNT(*) as total_count,
         ROUND(AVG(weighted_score), 2) as avg_weighted,
         ROUND(AVG(d1), 2) as avg_d1,
         ROUND(AVG(d2), 2) as avg_d2,
         ROUND(AVG(d3), 2) as avg_d3,
         ROUND(AVG(d4), 2) as avg_d4,
         ROUND(AVG(d5), 2) as avg_d5,
         MAX(weighted_score) as max_score,
         MIN(weighted_score) as min_score
       FROM trial_scores ${where}`
    );

    // 同时返回该日期范围内最新的几条综合评语
    const [comments] = await db.query(
      `SELECT score_date, evaluator, comment FROM trial_scores ${where}
       AND comment != '' ORDER BY score_date DESC LIMIT 20`
    );

    res.json({ stats: rows[0] || {}, comments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 提交评分
router.post('/scores', auth, async (req, res) => {
  try {
    const p = req.body;
    const weights = { d1: 0.30, d2: 0.20, d3: 0.25, d4: 0.15, d5: 0.10 };
    const weighted = (p.d1 * weights.d1 + p.d2 * weights.d2 + p.d3 * weights.d3
                    + p.d4 * weights.d4 + p.d5 * weights.d5).toFixed(2);

    const [result] = await db.query(
      `INSERT INTO trial_scores (player_id, score_date, evaluator, trial_week, phase,
         opponent, map_name, match_rating, match_adr, match_kast,
         d1, d1_note, d2, d2_note, d3, d3_note, d4, d4_note, d5, d5_note, comment, weighted_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.player_id, p.score_date, p.evaluator, p.trial_week, p.phase,
       p.opponent, p.map_name, p.match_rating, p.match_adr, p.match_kast,
       p.d1, p.d1_note, p.d2, p.d2_note, p.d3, p.d3_note, p.d4, p.d4_note, p.d5, p.d5_note,
       p.comment, weighted]
    );
    res.json({ id: result.insertId, weighted: parseFloat(weighted), message: '评分已保存' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除评分（仅单个）
router.delete('/scores/:id', auth, checkRole('CEO', '经理'), async (req, res) => {
  try {
    await db.query('DELETE FROM trial_scores WHERE id = ?', [req.params.id]);
    res.json({ message: '评分已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// TRIAL COSTS — 成本支出
// ============================================================

// 查询（按队员）
router.get('/costs', auth, async (req, res) => {
  try {
    const pid = req.query.player_id;
    const where = pid ? `WHERE player_id = ${parseInt(pid)}` : 'WHERE 1=1';
    const [rows] = await db.query(`SELECT * FROM trial_costs ${where} ORDER BY created_at DESC`);
    // 聚合总计
    const [total] = await db.query(
      `SELECT SUM(amount) as total_amount FROM trial_costs ${where}`
    );
    // 按类型分组
    const [byType] = await db.query(
      `SELECT cost_type, SUM(amount) as total, COUNT(*) as cnt
       FROM trial_costs ${where} GROUP BY cost_type ORDER BY total DESC`
    );
    res.json({ items: rows, total: total[0]?.total_amount || 0, byType });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 新增成本项
router.post('/costs', auth, checkRole('CEO', '经理'), async (req, res) => {
  try {
    const { player_id, cost_type, description, amount, notes } = req.body;
    const [result] = await db.query(
      `INSERT INTO trial_costs (player_id, cost_type, description, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [player_id, cost_type, description, amount, notes]
    );
    res.json({ id: result.insertId, message: '成本项已添加' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除成本项
router.delete('/costs/:id', auth, checkRole('CEO', '经理'), async (req, res) => {
  try {
    await db.query('DELETE FROM trial_costs WHERE id = ?', [req.params.id]);
    res.json({ message: '成本项已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// TRIAL PLANS — 入队方案（简单文本存储）
// ============================================================

router.get('/plans', auth, async (req, res) => {
  try {
    const pid = req.query.player_id;
    const where = pid ? `WHERE player_id = ${parseInt(pid)}` : 'WHERE 1=1';
    const [rows] = await db.query(`SELECT * FROM trial_plans ${where} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/plans', auth, checkRole('CEO', '经理'), async (req, res) => {
  try {
    const { player_id, title, content } = req.body;
    await db.query(`
      CREATE TABLE IF NOT EXISTS trial_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER,
        title TEXT DEFAULT '',
        content TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (player_id) REFERENCES trial_players(id)
      )
    `);
    const [result] = await db.query(
      'INSERT INTO trial_plans (player_id, title, content) VALUES (?, ?, ?)',
      [player_id, title, content]
    );
    res.json({ id: result.insertId, message: '方案已保存' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
