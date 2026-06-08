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

// PUT /api/opponent-intel/:name — 创建或更新对手情报 (upsert)
router.put('/:name', adminAuth, async (req, res) => {
  try {
    const {
      display_name, hltv_url, vrs_rank, region,
      map_preference, core_players, h2h_wins, h2h_losses, h2h_draws,
      last_match_date, last_match_score, last_match_result, notes,
      image_url, source_link
    } = req.body;
    const opponentName = req.params.name;

    // 检查是否已存在
    const [existing] = await db.query(
      'SELECT opponent_name FROM opponent_intel WHERE opponent_name = ?', [opponentName]
    );

    if (existing.length > 0) {
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
          image_url || null, source_link || null, opponentName]);
    } else {
      await db.query(`
        INSERT INTO opponent_intel
          (opponent_name, display_name, hltv_url, vrs_rank, region,
           map_preference, core_players, h2h_wins, h2h_losses, h2h_draws,
           last_match_date, last_match_score, last_match_result, notes,
           image_url, source_link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [opponentName, display_name || null, hltv_url || null, vrs_rank || null, region || 'Asia',
          map_preference || null, core_players || null, h2h_wins || 0, h2h_losses || 0, h2h_draws || 0,
          last_match_date || null, last_match_score || null, last_match_result || null, notes || null,
          image_url || null, source_link || null]);
    }

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

// GET /api/opponent-intel/extract/from-data — 从简报+比赛记录提取对手列表
router.get('/extract/from-data', auth, async (req, res) => {
  try {
    // 占位符过滤
    const junkFilter = `opponent IS NOT NULL AND opponent != ''
      AND LOWER(opponent) NOT IN ('opponent', '__', '未知', '0525_match', 'match_data', '---')
      AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
      AND LENGTH(opponent) >= 2`;

    // 从 training_sessions + matches 提取，LOWER 合并大小写变体
    const [rows] = await db.query(`
      SELECT UPPER(SUBSTR(opponent_name,1,1)) || SUBSTR(opponent_name,2) as display_name,
             opponent_name,
             SUM(match_days) as match_days,
             MAX(last_date) as last_date,
             MIN(first_date) as first_date
      FROM (
        SELECT LOWER(opponent) as opponent_name,
               COUNT(DISTINCT match_date) as match_days,
               MAX(match_date) as last_date,
               MIN(match_date) as first_date
        FROM training_sessions WHERE ${junkFilter}
        GROUP BY LOWER(opponent)
        UNION ALL
        SELECT LOWER(opponent) as opponent_name,
               COUNT(DISTINCT match_date) as match_days,
               MAX(match_date) as last_date,
               MIN(match_date) as first_date
        FROM matches WHERE ${junkFilter}
        GROUP BY LOWER(opponent)
      )
      GROUP BY opponent_name
      ORDER BY last_date DESC
    `);

    // 用 LOWER 匹配已有情报
    const allLower = rows.map(r => r.opponent_name);
    const allDisplay = rows.map(r => r.display_name);
    const searchKeys = [...new Set([...allLower, ...allDisplay])];
    const [existing] = searchKeys.length > 0
      ? await db.query(
          `SELECT * FROM opponent_intel WHERE LOWER(opponent_name) IN (${searchKeys.map(() => '?').join(',')})`,
          searchKeys
        )
      : [[]];

    const intelMap = {};
    for (const e of existing) {
      intelMap[LOWER(e.opponent_name)] = e;
    }

    const result = rows.map(r => ({
      opponent_name: r.display_name,
      match_days: r.match_days,
      first_date: r.first_date,
      last_date: r.last_date,
      has_intel: !!intelMap[r.opponent_name],
      intel: intelMap[r.opponent_name] || null,
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /opponent-intel/extract/from-data error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
