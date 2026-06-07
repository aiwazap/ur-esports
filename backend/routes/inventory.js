const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/inventory — 获取所有库存
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM inventory ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('GET /inventory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory — 新建库存项
router.post('/', adminAuth, async (req, res) => {
  try {
    const { item_type, item_name, current_count, max_count } = req.body;
    const [result] = await db.query(
      `INSERT INTO inventory (item_type, item_name, current_count, max_count, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [item_type, item_name || null, current_count || 0, max_count || 0, req.user?.id || 0]
    );
    res.json({ id: result.insertId, success: true });
  } catch (err) {
    console.error('POST /inventory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/:id — 更新库存项
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { item_type, item_name, current_count, max_count, notes } = req.body;
    await db.query(`
      UPDATE inventory SET
        item_type = ?, item_name = ?, current_count = ?, max_count = ?,
        notes = ?, updated_by = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `, [item_type, item_name || null, current_count, max_count, notes || null, req.user?.id || 0, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /inventory/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id — 删除库存项
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM inventory WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /inventory/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventory/batch — 批量更新库存
router.put('/batch', adminAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ id, current_count, max_count }, ...]
    const userId = req.user?.id || 0;

    for (const item of items) {
      if (item.id) {
        await db.query(
          `UPDATE inventory SET current_count = ?, max_count = ?, updated_by = ?,
           updated_at = datetime('now','localtime') WHERE id = ?`,
          [item.current_count, item.max_count, userId, item.id]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /inventory/batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
