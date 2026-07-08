const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// 地图胜率统计
router.get('/maps', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT map_name,
        COUNT(*) as played,
        SUM(result='win') as wins,
        ROUND(SUM(result='win')/COUNT(*)*100,1) as win_rate,
        ROUND(AVG(ct_score),1) as avg_ct,
        ROUND(AVG(t_score),1) as avg_t
      FROM matches WHERE division='cs2' AND map_name IS NOT NULL
      GROUP BY map_name ORDER BY played DESC`
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// vs 对手 胜率
router.get('/vs-opponent', auth, async (req, res) => {
  const { opponent, map } = req.query;
  let where = ["division='cs2'"];
  const params = [];
  if (opponent) { where.push('opponent LIKE ?'); params.push(`%${opponent}%`); }
  if (map) { where.push('map_name = ?'); params.push(map); }
  try {
    const [rows] = await db.query(`
      SELECT opponent, map_name,
        COUNT(*) as played,
        SUM(result='win') as wins,
        ROUND(SUM(result='win')/COUNT(*)*100,1) as win_rate
      FROM matches WHERE ${where.join(' AND ')}
      GROUP BY opponent, map_name ORDER BY opponent, map_name`, params
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 半场数据统计
router.get('/halftime', auth, async (req, res) => {
  const { days } = req.query;
  const dayFilter = days ? `AND match_date >= DATE_SUB(CURDATE(), INTERVAL ${parseInt(days)} DAY)` : '';
  try {
    const [rows] = await db.query(`
      SELECT map_name,
        ROUND(AVG(ct_score),2) as avg_ct_score,
        ROUND(AVG(t_score),2) as avg_t_score,
        ROUND(AVG(ct_score/(ct_score+t_score)*100),1) as ct_win_rate,
        ROUND(AVG(t_score/(ct_score+t_score)*100),1) as t_win_rate,
        COUNT(*) as maps_played
      FROM matches WHERE division='cs2' AND map_name IS NOT NULL
        AND (ct_score+t_score) > 0 ${dayFilter}
      GROUP BY map_name ORDER BY maps_played DESC`
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 选手综合数据
router.get('/players', auth, async (req, res) => {
  const { days } = req.query;
  const dayFilter = days ? `AND m.match_date >= DATE_SUB(CURDATE(), INTERVAL ${parseInt(days)} DAY)` : '';
  try {
    const [rows] = await db.query(`
      SELECT p.nickname, p.role, p.in_game_role,
        COUNT(ps.id) as maps_played,
        ROUND(AVG(ps.kills),1) as avg_k,
        ROUND(AVG(ps.deaths),1) as avg_d,
        ROUND(AVG(ps.kills)/NULLIF(AVG(ps.deaths),0),2) as kd,
        ROUND(AVG(ps.adr),1) as avg_adr,
        ROUND(AVG(ps.rating),2) as avg_rating
      FROM players p
      LEFT JOIN player_stats ps ON p.id = ps.player_id
      LEFT JOIN matches m ON ps.match_id = m.id ${dayFilter.replace('AND','WHERE')}
      WHERE p.status='active' AND p.division='cs2'
      GROUP BY p.id ORDER BY avg_rating DESC`
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

module.exports = router;
