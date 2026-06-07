const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// GET /api/opponent-intel — 获取所有对手情报
router.get('/', auth, async (req, res) => {
  try {
    const { opponent } = req.query;
    let query = 'SELECT * FROM opponent_intel';
    const params = [];

    if (opponent) {
      query += ' WHERE opponent_name LIKE ?';
      params.push(`%${opponent}%`);
    }

    query += ' ORDER BY vrs_rank ASC NULLS LAST, opponent_name ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /opponent-intel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opponent-intel/:name — 获取单个对手情报
router.get('/:name', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM opponent_intel WHERE opponent_name = ?',
      [req.params.name]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('GET /opponent-intel/:name error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/opponent-intel — 创建对手情报
router.post('/', adminAuth, async (req, res) => {
  try {
    const {
      opponent_name, display_name, hltv_url, vrs_rank, region,
      map_preference, core_players, h2h_wins, h2h_losses, h2h_draws,
      last_match_date, last_match_score, last_match_result, notes,
      image_url, source_link
    } = req.body;

    await db.query(`
      INSERT INTO opponent_intel
        (opponent_name, display_name, hltv_url, vrs_rank, region,
         map_preference, core_players, h2h_wins, h2h_losses, h2h_draws,
         last_match_date, last_match_score, last_match_result, notes,
         image_url, source_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [opponent_name, display_name || null, hltv_url || null, vrs_rank || null, region || 'Asia',
        map_preference || null, core_players || null, h2h_wins || 0, h2h_losses || 0, h2h_draws || 0,
        last_match_date || null, last_match_score || null, last_match_result || null, notes || null,
        image_url || null, source_link || null]);

    res.json({ success: true });
  } catch (err) {
    console.error('POST /opponent-intel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/opponent-intel/:name — 更新对手情报
router.put('/:name', adminAuth, async (req, res) => {
  try {
    const {
      display_name, hltv_url, vrs_rank, region,
      map_preference, core_players, h2h_wins, h2h_losses, h2h_draws,
      last_match_date, last_match_score, last_match_result, notes,
      image_url, source_link
    } = req.body;

    await db.query(`
      UPDATE opponent_intel SET
        display_name = ?, hltv_url = ?, vrs_rank = ?, region = ?,
        map_preference = ?, core_players = ?, h2h_wins = ?, h2h_losses = ?, h2h_draws = ?,
        last_match_date = ?, last_match_score = ?, last_match_result = ?, notes = ?,
        image_url = ?, source_link = ?, updated_at = datetime('now','localtime')
      WHERE opponent_name = ?
    `, [display_name || null, hltv_url || null, vrs_rank || null, region || 'Asia',
        map_preference || null, core_players || null, h2h_wins || 0, h2h_losses || 0, h2h_draws || 0,
        last_match_date || null, last_match_score || null, last_match_result || null, notes || null,
        image_url || null, source_link || null, req.params.name]);

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /opponent-intel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/opponent-intel/:name — 删除对手情报
router.delete('/:name', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM opponent_intel WHERE opponent_name = ?', [req.params.name]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /opponent-intel error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
