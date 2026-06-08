const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/training-plans?date=2026-06-07 — 按日期查询训练计划
router.get('/', auth, async (req, res) => {
  try {
    const { date } = req.query;
    let query = 'SELECT * FROM training_plans';
    const params = [];

    if (date) {
      query += ' WHERE plan_date = ?';
      params.push(date);
    } else {
      query += ' WHERE plan_date >= date(\'now\',\'localtime\') ORDER BY plan_date ASC, sort_order ASC LIMIT 50';
    }

    query += ' ORDER BY plan_date ASC, sort_order ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /training-plans error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/training-plans/dates — 获取有训练计划的所有日期
router.get('/dates', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT plan_date FROM training_plans ORDER BY plan_date DESC LIMIT 60'
    );
    res.json(rows.map(r => r.plan_date));
  } catch (err) {
    console.error('GET /training-plans/dates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training-plans — 创建训练计划项
router.post('/', adminAuth, async (req, res) => {
  try {
    const { plan_date, start_time, end_time, title, subtitle, tags, sort_order } = req.body;
    const [result] = await db.query(
      `INSERT INTO training_plans (plan_date, start_time, end_time, title, subtitle, tags, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [plan_date, start_time || null, end_time || null, title, subtitle || null,
       tags || null, sort_order || 0, req.user?.id || 0]
    );
    res.json({ id: result.insertId, success: true });
  } catch (err) {
    console.error('POST /training-plans error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/training-plans/:id — 更新训练计划项
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { plan_date, start_time, end_time, title, subtitle, tags, sort_order } = req.body;
    await db.query(
      `UPDATE training_plans SET
        plan_date = ?, start_time = ?, end_time = ?, title = ?, subtitle = ?,
        tags = ?, sort_order = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      [plan_date, start_time || null, end_time || null, title, subtitle || null,
       tags || null, sort_order || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /training-plans/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/training-plans/:id — 删除训练计划项
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM training_plans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /training-plans/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/training-plans/batch — 批量保存某天的训练计划
router.put('/batch', adminAuth, async (req, res) => {
  try {
    const { plan_date, items } = req.body; // [{ id?, start_time, end_time, title, subtitle, tags }, ...]
    const userId = req.user?.id || 0;

    // 删除该日期的旧数据
    if (plan_date) {
      await db.query('DELETE FROM training_plans WHERE plan_date = ?', [plan_date]);
    }

    // 批量插入
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await db.query(
        `INSERT INTO training_plans (plan_date, start_time, end_time, title, subtitle, tags, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [plan_date, item.start_time || null, item.end_time || null, item.title,
         item.subtitle || null, item.tags || null, i, userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /training-plans/batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/training-plans/sessions — 从简报提取训练赛次列表（用于生成训练计划）
router.get('/sessions', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id as session_id, s.match_date, s.opponent,
              COUNT(b.id) as briefing_count,
              GROUP_CONCAT(DISTINCT b.map_name) as maps
       FROM training_sessions s
       LEFT JOIN briefing_items b ON b.session_id = s.id
       GROUP BY s.id
       ORDER BY s.match_date DESC
       LIMIT 60`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /training-plans/sessions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/training-plans/generate — 从简报 session 自动生成训练计划
router.post('/generate', adminAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    const userId = req.user?.id || 0;

    // 获取 session 信息
    const [sessions] = await db.query(
      'SELECT * FROM training_sessions WHERE id = ?', [session_id]
    );
    if (!sessions.length) return res.status(404).json({ error: 'Session 不存在' });

    const s = sessions[0];

    // 获取该 session 的简报条目，按地图+方分组
    const [items] = await db.query(
      `SELECT map_name, team_side, GROUP_CONCAT(instruction, ' | ') as summary
       FROM briefing_items WHERE session_id = ?
       GROUP BY map_name, team_side
       ORDER BY map_name, team_side`,
      [session_id]
    );

    // 构建训练计划项
    const plans = items.map((b, i) => ({
      plan_date: s.match_date,
      start_time: '17:30',
      end_time: '20:00',
      title: `${b.map_name} ${b.team_side}侧 战术演练`,
      subtitle: `对阵 ${s.opponent} · ${b.summary?.substring(0, 80) || ''}`,
      tags: [b.team_side, b.map_name].join(','),
      sort_order: i,
    }));

    // 写入 training_plans
    // 先删旧数据
    await db.query('DELETE FROM training_plans WHERE plan_date = ?', [s.match_date]);

    for (const p of plans) {
      await db.query(
        `INSERT INTO training_plans (plan_date, start_time, end_time, title, subtitle, tags, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.plan_date, p.start_time, p.end_time, p.title, p.subtitle, p.tags, p.sort_order, userId]
      );
    }

    res.json({ success: true, count: plans.length });
  } catch (err) {
    console.error('POST /training-plans/generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
