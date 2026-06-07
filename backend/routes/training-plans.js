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

module.exports = router;
