const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// ============================================================
// GET /api/dashboard/overview — 数据总览聚合端点
// ============================================================
router.get('/overview', auth, async (req, res) => {
  try {
    // --------------------------------------------------------
    // 1. KPI — 近十场比赛统计
    // --------------------------------------------------------
    const [kpiRows] = await db.query(
      `SELECT result FROM matches
       WHERE match_type = 'scrim'
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent NOT LIKE '%\_%' ESCAPE '\\'
         AND opponent != '0525_match'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score > 0
       ORDER BY match_date DESC, id DESC
       LIMIT 10`
    );
    const totalMatches = kpiRows.length;
    const wins = kpiRows.filter(r => r.result === 'win').length;
    const recentWinRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';

    // --------------------------------------------------------
    // 2. KPI — 训练质量（基于训练日志回合数据）
    // --------------------------------------------------------
    const [qualityRows] = await db.query(
      `SELECT
        COUNT(*) as total_rounds,
        SUM(CASE WHEN issue_grenade = 1 OR issue_position = 1 OR issue_aim = 1
                  OR issue_comms = 1 OR issue_tactics = 1 THEN 1 ELSE 0 END) as issue_rounds
       FROM training_rounds`
    );
    const totalRounds = qualityRows[0]?.total_rounds || 0;
    const issueRounds = qualityRows[0]?.issue_rounds || 0;
    const trainingQuality = totalRounds > 0
      ? ((1 - issueRounds / totalRounds) * 100).toFixed(1)
      : '0.0';

    // --------------------------------------------------------
    // 3. 即将赛事
    // --------------------------------------------------------
    const [upcomingRows] = await db.query(
      `SELECT * FROM upcoming_matches
       WHERE match_date >= date('now','localtime')
         AND match_type = 'official'
       ORDER BY match_date ASC, match_time ASC
       LIMIT 1`
    );
    const upcomingMatch = upcomingRows[0] || null;

    // --------------------------------------------------------
    // 4. 近五场赛事记录（详细）
    // --------------------------------------------------------
    const [recentMatches] = await db.query(
      `SELECT id, match_date, opponent, map_name, our_score, their_score, result
       FROM matches
       WHERE match_type = 'scrim'
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent NOT LIKE '%\_%' ESCAPE '\\'
         AND opponent != '0525_match'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score > 0
       ORDER BY match_date DESC, id DESC
       LIMIT 5`
    );

    // --------------------------------------------------------
    // 5. 选手综合数据（近30天聚合）
    // --------------------------------------------------------
    const [playerStats] = await db.query(
      `SELECT
        p.nickname,
        p.in_game_role,
        COUNT(DISTINCT ps.match_id) as maps_played,
        SUM(ps.kills) as total_kills,
        SUM(ps.deaths) as total_deaths,
        ROUND(AVG(ps.rating), 2) as avg_rating,
        ROUND(AVG(ps.adr), 1) as avg_adr,
        ROUND(AVG(ps.kast), 1) as avg_kast
       FROM players p
       JOIN player_stats ps ON ps.player_id = p.id
       JOIN matches m ON m.id = ps.match_id
       WHERE p.status = 'active'
         AND p.team_type = 'roster'
         AND m.match_date >= date('now','localtime','-30 days')
       GROUP BY p.id, p.nickname, p.in_game_role
       ORDER BY avg_rating DESC`
    );

    // Also get total rating across all time
    const [allTimeStats] = await db.query(
      `SELECT
        p.nickname,
        ROUND(AVG(ps.rating), 2) as avg_rating,
        SUM(ps.kills) as total_kills,
        SUM(ps.deaths) as total_deaths,
        ROUND(AVG(ps.adr), 1) as avg_adr,
        ROUND(AVG(ps.kast), 1) as avg_kast
       FROM players p
       JOIN player_stats ps ON ps.player_id = p.id
       WHERE p.status = 'active'
         AND p.team_type = 'roster'
       GROUP BY p.id, p.nickname
       ORDER BY avg_rating DESC`
    );

    // Merge: prefer 30-day stats, fall back to all-time
    const allTimeMap = {};
    allTimeStats.forEach(s => { allTimeMap[s.nickname] = s; });

    const mergedPlayerStats = allTimeStats.map(s => {
      const recent = playerStats.find(r => r.nickname === s.nickname);
      return {
        nickname: s.nickname,
        in_game_role: recent?.in_game_role || '',
        maps_played: recent?.maps_played || 0,
        total_kills: recent?.total_kills || s.total_kills || 0,
        total_deaths: recent?.total_deaths || s.total_deaths || 0,
        avg_rating: recent?.avg_rating || s.avg_rating || 0,
        avg_adr: recent?.avg_adr || s.avg_adr || 0,
        avg_kast: recent?.avg_kast || s.avg_kast || 0,
      };
    });

    // Calculate team averages
    const teamRating = mergedPlayerStats.length > 0
      ? (mergedPlayerStats.reduce((sum, p) => sum + (p.avg_rating || 0), 0) / mergedPlayerStats.length).toFixed(2)
      : '0.00';
    const teamADR = mergedPlayerStats.length > 0
      ? (mergedPlayerStats.reduce((sum, p) => sum + (p.avg_adr || 0), 0) / mergedPlayerStats.length).toFixed(1)
      : '0.0';

    // --------------------------------------------------------
    // 6. 地图统计
    // --------------------------------------------------------
    const [mapStats] = await db.query(
      `SELECT
        map_name,
        COUNT(*) as played,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
        ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS FLOAT) /
              NULLIF(COUNT(*), 0) * 100, 1) as win_rate
       FROM matches
       WHERE map_name IS NOT NULL AND map_name != ''
         AND our_score > 0
       GROUP BY map_name
       ORDER BY played DESC, win_rate DESC`
    );

    // Map name to image file mapping
    const mapImageMap = {
      'Inferno': 'inferno.png',
      'Mirage': 'mirage.png',
      'Nuke': 'nuke.png',
      'Ancient': 'ancient.png',
      'Anubis': 'anubis.png',
      'Overpass': 'overpass.png',
      'Dust2': 'dust2.png',
      'Train': 'train.png',
      'Vertigo': 'vertigo.png',
      'inferno': 'inferno.png',
      'mirage': 'mirage.png',
      'nuke': 'nuke.png',
      'ancient': 'ancient.png',
      'anubis': 'anubis.png',
      'overpass': 'overpass.png',
      'dust2': 'dust2.png',
      'train': 'train.png',
      'vertigo': 'vertigo.png',
    };

    // Add recent match details per map (last 5 per map)
    const [mapRecentMatches] = await db.query(
      `SELECT id, match_date, opponent, map_name, our_score, their_score, result
       FROM matches
       WHERE map_name IS NOT NULL AND map_name != ''
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent NOT LIKE '%\_%' ESCAPE '\\'
         AND opponent != '0525_match'
         AND our_score > 0
       ORDER BY match_date DESC, id DESC`
    );

    // Group recent matches by map (take last 5 per map)
    const mapMatches = {};
    mapRecentMatches.forEach(m => {
      if (!mapMatches[m.map_name]) mapMatches[m.map_name] = [];
      if (mapMatches[m.map_name].length < 5) {
        mapMatches[m.map_name].push({
          date: m.match_date,
          opponent: m.opponent,
          score: `${m.our_score}:${m.their_score}`,
          result: m.result,
        });
      }
    });

    const enrichedMapStats = mapStats.map(m => ({
      ...m,
      imageFile: mapImageMap[m.map_name] || null,
      recentMatches: mapMatches[m.map_name] || [],
    }));

    // --------------------------------------------------------
    // 7. 各场比赛的选手详情（用于弹窗）
    // --------------------------------------------------------
    const [matchDetails] = await db.query(
      `SELECT
        m.id as match_id,
        m.match_date,
        m.opponent,
        m.map_name,
        m.our_score,
        m.their_score,
        m.result,
        m.notes,
        p.nickname,
        p.in_game_role,
        ps.kills,
        ps.deaths,
        ROUND(ps.rating, 2) as rating,
        ROUND(ps.adr, 1) as adr,
        ROUND(ps.kast, 1) as kast,
        ps.hs as hs
       FROM matches m
       JOIN player_stats ps ON ps.match_id = m.id
       JOIN players p ON p.id = ps.player_id
       WHERE m.opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND m.opponent NOT LIKE '%\_%' ESCAPE '\\'
         AND m.opponent != '0525_match'
         AND m.map_name IS NOT NULL AND m.map_name != ''
         AND m.our_score > 0
       ORDER BY m.match_date DESC, m.id DESC, ps.rating DESC
       LIMIT 200`
    );

    // Group by match_id
    const matchDetailsMap = {};
    matchDetails.forEach(r => {
      if (!matchDetailsMap[r.match_id]) {
        matchDetailsMap[r.match_id] = {
          id: r.match_id,
          date: r.match_date,
          opponent: r.opponent,
          map: r.map_name,
          score: `${r.our_score}:${r.their_score}`,
          result: r.result,
          notes: r.notes,
          players: [],
        };
      }
      matchDetailsMap[r.match_id].players.push({
        name: r.nickname,
        role: r.in_game_role || '',
        rating: r.rating,
        kd: `${r.kills}-${r.deaths}`,
        adr: r.adr,
        kast: r.kast,
        hs: r.hs || 0,
      });
    });

    // --------------------------------------------------------
    // 7. HS% — 近3天训练赛选手爆头率 (training rounds data)
    // --------------------------------------------------------
    const [hsStats] = await db.query(
      `SELECT
        p.nickname,
        p.in_game_role,
        SUM(ps.hs) as total_hs,
        SUM(ps.kills) as total_kills,
        COUNT(DISTINCT ps.match_id) as maps_played
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       JOIN matches m ON m.id = ps.match_id
       WHERE p.status = 'active' AND p.team_type = 'roster'
         AND m.match_date >= date('now','localtime','-3 days')
         AND m.match_type = 'scrim'
       GROUP BY p.id, p.nickname, p.in_game_role
       ORDER BY total_kills DESC`
    );

    const hsStatsFormatted = hsStats.map(s => ({
      nickname: s.nickname,
      in_game_role: s.in_game_role,
      total_hs: s.total_hs || 0,
      total_kills: s.total_kills || 0,
      hs_pct: s.total_kills > 0 ? ((s.total_hs / s.total_kills) * 100).toFixed(1) : '0.0',
      maps_played: s.maps_played || 0,
    }));

    // --------------------------------------------------------
    // 8. 系统配置 (VRS排名, 成立日期)
    // --------------------------------------------------------
    const [configRows] = await db.query('SELECT config_key, config_value FROM system_config');
    const systemConfig = {};
    configRows.forEach(r => { systemConfig[r.config_key] = r.config_value; });

    // --------------------------------------------------------
    // 9. 选手外设
    // --------------------------------------------------------
    const [peripherals] = await db.query(
      `SELECT pe.*, p.nickname, p.in_game_role
       FROM peripherals pe
       JOIN players p ON p.id = pe.player_id
       WHERE p.status = 'active' AND p.team_type = 'roster'
       ORDER BY p.sort_order ASC`
    );

    // --------------------------------------------------------
    // 10. 库存
    // --------------------------------------------------------
    const [inventory] = await db.query('SELECT * FROM inventory ORDER BY id ASC');

    // --------------------------------------------------------
    // 11. 今日训练计划
    // --------------------------------------------------------
    const [trainingPlan] = await db.query(
      "SELECT * FROM training_plans WHERE plan_date = date('now','localtime') ORDER BY sort_order ASC"
    );

    // --------------------------------------------------------
    // 12. 对手情报 (与即将赛事联动)
    // --------------------------------------------------------
    let opponentIntel = null;
    if (upcomingMatch) {
      const [intelRows] = await db.query(
        'SELECT * FROM opponent_intel WHERE opponent_name = ?',
        [upcomingMatch.opponent]
      );
      opponentIntel = intelRows[0] || null;

      // 如果没找到对手情报，尝试模糊匹配
      if (!opponentIntel) {
        const [fuzzyRows] = await db.query(
          'SELECT * FROM opponent_intel WHERE opponent_name LIKE ? LIMIT 1',
          [`%${upcomingMatch.opponent}%`]
        );
        opponentIntel = fuzzyRows[0] || null;
      }
    }

    // Also compute h2h from matches table for upcoming opponent
    let h2hFromDb = { wins: 0, losses: 0, draws: 0 };
    if (upcomingMatch) {
      const [h2hRows] = await db.query(
        `SELECT result, COUNT(*) as cnt FROM matches
         WHERE opponent = ?
           AND result IS NOT NULL
         GROUP BY result`,
        [upcomingMatch.opponent]
      );
      h2hRows.forEach(r => {
        if (r.result === 'win') h2hFromDb.wins = r.cnt;
        else if (r.result === 'loss') h2hFromDb.losses = r.cnt;
        else h2hFromDb.draws = (h2hFromDb.draws || 0) + r.cnt;
      });
    }

    // --------------------------------------------------------
    // 13. 上周失误TOP3 (周环比数据)
    // --------------------------------------------------------
    const [weeklyIssues] = await db.query(
      `SELECT
        CASE
          WHEN issue_grenade = 1 THEN '道具配合'
          WHEN issue_position = 1 THEN '走位站位'
          WHEN issue_aim = 1 THEN '枪法瞄准'
          WHEN issue_comms = 1 THEN '沟通交流'
          WHEN issue_tactics = 1 THEN '战术执行'
        END as issue_type,
        COUNT(*) as cnt
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-7 days')
         AND (issue_grenade=1 OR issue_position=1 OR issue_aim=1 OR issue_comms=1 OR issue_tactics=1)
       GROUP BY issue_type
       ORDER BY cnt DESC
       LIMIT 3`
    );

    const [weeklyWinLoss] = await db.query(
      `SELECT
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-7 days')
         AND round_result IN ('win','loss')`
    );

    // 上周数据 (用于环比)
    const [lastWeekIssues] = await db.query(
      `SELECT COUNT(*) as total_issue_rounds
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-14 days')
         AND created_at < date('now','localtime','-7 days')
         AND (issue_grenade=1 OR issue_position=1 OR issue_aim=1 OR issue_comms=1 OR issue_tactics=1)`
    );
    const [thisWeekIssues] = await db.query(
      `SELECT COUNT(*) as total_issue_rounds
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-7 days')
         AND (issue_grenade=1 OR issue_position=1 OR issue_aim=1 OR issue_comms=1 OR issue_tactics=1)`
    );

    const [lastWeekRounds] = await db.query(
      `SELECT COUNT(*) as total FROM training_rounds
       WHERE created_at >= date('now','localtime','-14 days')
         AND created_at < date('now','localtime','-7 days')`
    );
    const [thisWeekRounds] = await db.query(
      `SELECT COUNT(*) as total FROM training_rounds
       WHERE created_at >= date('now','localtime','-7 days')`
    );

    const weeklyComparison = {
      topIssues: weeklyIssues,
      thisWeekWins: weeklyWinLoss[0]?.wins || 0,
      thisWeekLosses: weeklyWinLoss[0]?.losses || 0,
      thisWeekTotalRounds: thisWeekRounds[0]?.total || 0,
      lastWeekTotalRounds: lastWeekRounds[0]?.total || 0,
      thisWeekIssueRounds: thisWeekIssues[0]?.total_issue_rounds || 0,
      lastWeekIssueRounds: lastWeekIssues[0]?.total_issue_rounds || 0,
    };

    // --------------------------------------------------------
    // 14. 教练评语
    // --------------------------------------------------------
    const [coachNotes] = await db.query(
      `SELECT id, match_date, opponent, map_name, notes
       FROM matches
       WHERE notes IS NOT NULL AND notes != ''
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent != '0525_match'
       ORDER BY match_date DESC
       LIMIT 10`
    );

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------
    res.json({
      kpi: {
        recentWinRate: parseFloat(recentWinRate),
        totalRecentMatches: totalMatches,
        recentWins: wins,
        trainingQuality: parseFloat(trainingQuality),
        totalRounds,
        issueRounds,
        vrsRank: parseInt(systemConfig.vrs_rank) || null,
        foundedDate: systemConfig.founded_date || null,
      },
      upcomingMatch,
      opponentIntel,
      h2hFromDb,
      recentMatches: recentMatches.map(m => ({
        id: m.id,
        date: m.match_date,
        opponent: m.opponent,
        map: m.map_name,
        score: `${m.our_score}:${m.their_score}`,
        result: m.result,
      })),
      playerStats: mergedPlayerStats,
      hsStats: hsStatsFormatted,
      teamAverages: {
        rating: parseFloat(teamRating),
        adr: parseFloat(teamADR),
      },
      mapStats: enrichedMapStats,
      matchDetails: Object.values(matchDetailsMap).slice(0, 5),
      peripherals: peripherals,
      inventory: inventory,
      trainingPlan: trainingPlan,
      coachNotes: coachNotes.map(n => ({
        id: n.id,
        date: n.match_date,
        opponent: n.opponent,
        map: n.map_name,
        notes: n.notes,
      })),
      systemConfig,
      weeklyComparison,
      missingData: {
        vrsRank: systemConfig.vrs_rank ? null : 'VRS排名未配置 — 管理员可在配置中手动输入',
        foundedDate: systemConfig.founded_date ? null : '成立日期未配置',
        upcomingMatch: upcomingMatch ? null : '暂无即将赛事',
        headshotPercent: hsStats.length > 0 ? null : '近3天无训练赛爆头数据',
        peripherals: peripherals.length > 0 ? null : '外设数据未录入',
        inventory: inventory.length > 0 ? null : '库存数据未录入',
        trainingPlan: trainingPlan.length > 0 ? null : '今日无训练计划',
      },
    });
  } catch (err) {
    console.error('Dashboard overview error:', err);
    res.status(500).json({ error: '数据查询失败', detail: err.message });
  }
});

module.exports = router;
