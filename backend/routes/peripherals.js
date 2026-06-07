const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/peripherals — 获取所有选手外设
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pe.*, p.nickname, p.in_game_role
      FROM peripherals pe
      JOIN players p ON p.id = pe.player_id
      WHERE p.status = 'active' AND p.team_type = 'roster'
      ORDER BY p.sort_order ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /peripherals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/peripherals/:playerId — 获取单个选手外设
router.get('/:playerId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM peripherals WHERE player_id = ?', [req.params.playerId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('GET /peripherals/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/peripherals/:playerId — 创建或更新外设
router.put('/:playerId', adminAuth, async (req, res) => {
  try {
    const { playerId } = req.params;
    const { keyboard, mouse, headset, mousepad, monitor, notes } = req.body;
    const userId = req.user?.id || 0;

    const [existing] = await db.query('SELECT id FROM peripherals WHERE player_id = ?', [playerId]);

    if (existing.length > 0) {
      await db.query(`
        UPDATE peripherals SET
          keyboard = ?, mouse = ?, headset = ?, mousepad = ?, monitor = ?,
          notes = ?, updated_by = ?, updated_at = datetime('now','localtime')
        WHERE player_id = ?
      `, [keyboard || null, mouse || null, headset || null, mousepad || null,
          monitor || null, notes || null, userId, playerId]);
    } else {
      await db.query(`
        INSERT INTO peripherals (player_id, keyboard, mouse, headset, mousepad, monitor, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [playerId, keyboard || null, mouse || null, headset || null,
          mousepad || null, monitor || null, notes || null, userId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /peripherals/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
