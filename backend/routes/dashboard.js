const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// ============================================================
// GET /api/dashboard/overview — 数据总览聚合端点
// ============================================================
router.get('/overview', auth, async (req, res) => {
  const mapDays = parseInt(req.query.mapDays) || 30;
  const mapDateFilter = `AND match_date >= date('now','localtime','-${mapDays} days')`;
  try {
    // --------------------------------------------------------
    // 1. KPI — 近十场训练赛（三表联动：training_sessions ∩ matches）
    // --------------------------------------------------------
    // 一场训练赛 = 同一天同对手（大小写合并），按各图胜负数判定场次结果
    const [kpiRows] = await db.query(
      `SELECT
         SUM(CASE WHEN m.our_score > m.their_score THEN 1 ELSE 0 END) as map_wins,
         SUM(CASE WHEN m.our_score < m.their_score THEN 1 ELSE 0 END) as map_losses
       FROM matches m
       JOIN training_sessions ts
         ON date(ts.match_date) = date(m.match_date)
        AND LOWER(ts.opponent) = LOWER(m.opponent)
       WHERE m.match_type = 'scrim'
         AND m.our_score > 0
         AND m.map_name IS NOT NULL AND m.map_name != ''
         AND ts.opponent NOT IN ('OPPONENT', '未知', '___', '')
         AND ts.opponent NOT LIKE '%放%'
         AND ts.opponent != 'VRS亚洲排名'
         AND m.opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND m.opponent NOT LIKE '%\\_%' ESCAPE '\\'
       GROUP BY date(m.match_date), LOWER(m.opponent)
       ORDER BY date(m.match_date) DESC
       LIMIT 10`
    );

    // 回退：无 matches 数据时按 training_sessions 天数计
    let wins = 0, totalMatches = 0;

    if (kpiRows.length > 0) {
      totalMatches = kpiRows.length;
      kpiRows.forEach(r => {
        if (r.map_wins > r.map_losses) wins++;
      });
    } else {
      const [sessionRows] = await db.query(
        `SELECT match_date FROM training_sessions
         WHERE match_date IS NOT NULL
           AND opponent NOT IN ('OPPONENT', '未知', '___', '')
           AND opponent NOT LIKE '%放%'
           AND opponent != 'VRS亚洲排名'
         ORDER BY match_date DESC LIMIT 10`
      );
      totalMatches = sessionRows.length;
      wins = 0;
    }

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
      `SELECT id, match_date, opponent, map_name, our_score, their_score, t_score, ct_score, notes,
              CASE WHEN our_score > their_score THEN 'win'
                   WHEN our_score < their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches
       WHERE match_type = 'scrim'
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
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
        p.avatar_url,
        COUNT(DISTINCT ps.match_id) as maps_played,
        SUM(ps.kills) as total_kills,
        SUM(ps.deaths) as total_deaths,
        ROUND(AVG(CASE WHEN ps.rating > 0 THEN ps.rating END), 2) as avg_rating,
        ROUND(AVG(CASE WHEN ps.adr > 0 THEN ps.adr END), 1) as avg_adr,
        ROUND(AVG(CASE WHEN ps.kast > 0 THEN ps.kast END), 1) as avg_kast
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
        p.avatar_url,
        ROUND(AVG(CASE WHEN ps.rating > 0 THEN ps.rating END), 2) as avg_rating,
        SUM(ps.kills) as total_kills,
        SUM(ps.deaths) as total_deaths,
        ROUND(AVG(CASE WHEN ps.adr > 0 THEN ps.adr END), 1) as avg_adr,
        ROUND(AVG(CASE WHEN ps.kast > 0 THEN ps.kast END), 1) as avg_kast
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
        avatar_url: recent?.avatar_url || s.avatar_url || null,
        maps_played: recent?.maps_played || 0,
        total_kills: recent?.total_kills || s.total_kills || 0,
        total_deaths: recent?.total_deaths || s.total_deaths || 0,
        avg_rating: recent?.avg_rating || s.avg_rating || 0,
        avg_adr: recent?.avg_adr || s.avg_adr || 0,
        avg_kast: recent?.avg_kast || s.avg_kast || 0,
      };
    });

    // Calculate team averages (only count players with valid rating data)
    const playersWithRating = mergedPlayerStats.filter(p => p.avg_rating > 0);
    const playersWithADR = mergedPlayerStats.filter(p => p.avg_adr > 0);
    const teamRating = playersWithRating.length > 0
      ? (playersWithRating.reduce((sum, p) => sum + p.avg_rating, 0) / playersWithRating.length).toFixed(2)
      : '0.00';
    const teamADR = playersWithADR.length > 0
      ? (playersWithADR.reduce((sum, p) => sum + p.avg_adr, 0) / playersWithADR.length).toFixed(1)
      : '0.0';

    // --------------------------------------------------------
    // 6. 地图统计
    // --------------------------------------------------------
    const [mapStats] = await db.query(
      `SELECT
        map_name,
        COUNT(*) as played,
        SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN our_score < their_score THEN 1 ELSE 0 END) as losses,
        ROUND(CAST(SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) AS FLOAT) /
              NULLIF(COUNT(*), 0) * 100, 1) as win_rate
       FROM matches
       WHERE map_name IS NOT NULL AND map_name != ''
         AND our_score > 0
         ${mapDateFilter}
       GROUP BY map_name
       ORDER BY win_rate DESC, played DESC`
    );

    // 补齐 7 张核心地图（无数据的地图填充0值）
    const CORE_MAPS = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Overpass'];
    const existingMaps = new Set(mapStats.map(m => m.map_name));
    for (const mapName of CORE_MAPS) {
      if (!existingMaps.has(mapName)) {
        mapStats.push({
          map_name: mapName, played: 0, wins: 0, losses: 0, win_rate: 0,
        });
      }
    }

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
      `SELECT id, match_date, opponent, map_name, our_score, their_score,
              CASE WHEN our_score > their_score THEN 'win'
                   WHEN our_score < their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches
       WHERE map_name IS NOT NULL AND map_name != ''
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND opponent != '0525_match'
         AND our_score > 0
         ${mapDateFilter}
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
        CASE WHEN m.our_score > m.their_score THEN 'win'
             WHEN m.our_score < m.their_score THEN 'loss'
             ELSE 'draw' END as result,
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
         AND m.opponent NOT LIKE '%\\_%' ESCAPE '\\'
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
    // 9. 教练组 / 管理层
    // --------------------------------------------------------
    const [staff] = await db.query(
      `SELECT nickname, real_name, in_game_role, role, avatar_url,
              birth_date,
              CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
       FROM players
       WHERE status = 'active' AND team_type = 'staff'
         AND nickname IN ('aiwazap', 'HZ', 'smokky')
       ORDER BY
         CASE nickname WHEN 'aiwazap' THEN 1 WHEN 'HZ' THEN 2 WHEN 'smokky' THEN 3 ELSE 4 END`
    );

    // --------------------------------------------------------
    // 10. 选手外设
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
        `SELECT CASE WHEN our_score > their_score THEN 'win'
                      WHEN our_score < their_score THEN 'loss'
                      ELSE 'draw' END as result,
                COUNT(*) as cnt FROM matches
         WHERE opponent = ?
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
        SUM(CASE WHEN round_result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN round_result = 'loss' THEN 1 ELSE 0 END) as losses
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

    // ================================================================
    // 14. 比赛记录（替代教练评语，含完整上下半场比分+训练日志）
    // recentMatches already contains t_score/ct_score/notes from query above
    // ================================================================

    // ================================================================
    // 15. 雷达图 - 队伍健康度 5 维度
    // ================================================================
    // 近期战绩: winRate (已有的 kpi.recentWinRate)
    // 训练完成度: 已有 trainingQuality，补充为 0-100
    // 阵容完整度: 当前主力人数 / 5
    const [rosterCount] = await db.query(
      `SELECT COUNT(*) as cnt FROM players
       WHERE status = 'active' AND team_type = 'roster'`
    );
    const activeRoster = rosterCount[0]?.cnt || 0;
    const rosterCompleteness = Math.min(Math.round((activeRoster / 5) * 100), 100);

    // 状态趋势: 近10场 vs 其前10场胜率差值 → 归一化到 0-100
    const [trendRecent] = await db.query(
      `SELECT
         SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) as wins,
         COUNT(*) as total
       FROM (
         SELECT our_score, their_score FROM matches
         WHERE match_type = 'scrim'
           AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
           AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score > 0
         ORDER BY match_date DESC, id DESC
         LIMIT 10
       )`
    );
    const [trendOlder] = await db.query(
      `SELECT
         SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) as wins,
         COUNT(*) as total
       FROM (
         SELECT our_score, their_score FROM matches
         WHERE match_type = 'scrim'
           AND opponent NOT IN ('', 'OPPONENT', '__', '未知')
           AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score > 0
         ORDER BY match_date DESC, id DESC
         LIMIT 10 OFFSET 10
       )`
    );
    const recentWinRateVal = trendRecent[0]?.total > 0 ? (trendRecent[0].wins / trendRecent[0].total) : 0.5;
    const olderWinRateVal = trendOlder[0]?.total > 0 ? (trendOlder[0].wins / trendOlder[0].total) : 0.5;
    const trendDelta = (recentWinRateVal - olderWinRateVal) * 100; // -100 to 100
    const formTrend = Math.min(Math.max(Math.round(50 + trendDelta), 0), 100);

    // 赛程压力: 近30天比赛数，适中为高分
    const [scheduleCount] = await db.query(
      `SELECT COUNT(*) as cnt FROM matches
       WHERE match_date >= date('now','localtime')
         AND match_date < date('now','localtime','+30 days')
         AND our_score > 0`
    );
    const upcomingCount = scheduleCount[0]?.cnt || 0;
    // 理想比赛密度约 8-12 场/月 → 映射为压力分数（太高或太低都扣分）
    const schedulePressure = Math.max(0, Math.min(100,
      upcomingCount <= 0 ? 80
        : upcomingCount <= 5 ? 70
        : upcomingCount <= 8 ? 60
        : upcomingCount <= 12 ? 50
        : upcomingCount <= 16 ? 30
        : 20
    ));

    const radarChart = {
      labels: ['近期战绩', '训练完成度', '阵容完整度', '状态趋势', '赛程压力'],
      values: [
        Math.min(parseFloat(recentWinRate) || 50, 100),
        Math.min(parseFloat(trainingQuality) || 70, 100),
        rosterCompleteness,
        formTrend,
        schedulePressure,
      ],
      descriptions: [
        '近10场胜率 ' + recentWinRate + '%',
        '训练任务执行率 ' + trainingQuality + '%',
        activeRoster + '/5 主力可用',
        (trendDelta >= 0 ? '↑上升' : '↓下滑') + ' ' + Math.abs(trendDelta).toFixed(0) + '%',
        upcomingCount + '场/近30天',
      ],
    };

    // ================================================================
    // 16. 人员变动动态（从 players 表推断）
    // ================================================================
    const [personnelChanges] = await db.query(
      `SELECT nickname, real_name, status, team_type, join_date, leave_date,
              role, in_game_role
       FROM players
       WHERE (join_date >= date('now','localtime','-90 days')
              OR leave_date >= date('now','localtime','-90 days')
              OR (updated_at >= date('now','localtime','-90 days')
                  AND updated_at IS NOT NULL))
         AND team_type = 'roster'
       ORDER BY COALESCE(join_date, leave_date, updated_at) DESC
       LIMIT 10`
    );
    const personnelTimeline = personnelChanges.map(p => {
      let changeType = 'unknown';
      let desc = '';
      let dateStr = '';
      if (p.join_date && p.join_date >= (new Date(Date.now() - 90*86400000).toISOString().slice(0,10))) {
        changeType = '转入';
        desc = `${p.nickname} 加入首发阵容`;
        dateStr = p.join_date;
      } else if (p.leave_date && p.leave_date >= (new Date(Date.now() - 90*86400000).toISOString().slice(0,10))) {
        changeType = '转出';
        desc = `${p.nickname} 离开阵容`;
        dateStr = p.leave_date;
      } else if (p.status === 'inactive') {
        changeType = '伤病/禁赛';
        desc = `${p.nickname} 状态变更为非活跃`;
        dateStr = p.leave_date || p.join_date || '';
      } else {
        changeType = '调整';
        desc = `${p.nickname} 角色调整为 ${p.in_game_role || p.role || '选手'}`;
        dateStr = p.join_date || '';
      }
      return { date: dateStr, type: changeType, description: desc, avatar: p.nickname?.[0] || '?' };
    }).filter(p => p.date);

    // 如果 players 表推断不足，补充 operation_logs 中的相关操作
    const [opChanges] = await db.query(
      `SELECT created_at, action, details FROM operation_logs
       WHERE action LIKE '%player%' OR action LIKE '%transfer%' OR action LIKE '%roster%'
          OR action LIKE '%转会%' OR action LIKE '%选手%'
       ORDER BY created_at DESC
       LIMIT 5`
    );
    opChanges.forEach(op => {
      if (op.created_at) {
        personnelTimeline.push({
          date: op.created_at.slice(0,10),
          type: op.action.includes('转会') || op.action.includes('transfer') ? '转入' : '调整',
          description: op.details || op.action,
          avatar: '📋',
        });
      }
    });

    // ================================================================
    // 17. 昨日任务结果
    // ================================================================
    const [yesterdayPlans] = await db.query(
      `SELECT * FROM training_plans
       WHERE plan_date = date('now','localtime','-1 day')
       ORDER BY sort_order ASC`
    );
    const [yesterdayStats] = await db.query(
      `SELECT
         COUNT(*) as total_rounds,
         SUM(CASE WHEN round_result = 'win' THEN 1 ELSE 0 END) as win_rounds
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-1 day')
         AND created_at < date('now','localtime')`
    );
    const yesterdayTasks = {
      tasks: yesterdayPlans.map(p => ({
        title: p.title,
        subtitle: p.subtitle || '',
        timeRange: (p.start_time || '') + ' - ' + (p.end_time || ''),
        tags: p.tags ? p.tags.split(/[,，]/).filter(Boolean) : [],
        completed: true, // 默认昨日任务已完成（有 training_rounds 数据则算完成）
      })),
      completionRate: yesterdayStats[0]?.total_rounds > 0
        ? Math.round((yesterdayStats[0].win_rounds / yesterdayStats[0].total_rounds) * 100)
        : yesterdayPlans.length > 0 ? 100 : 0,
      totalWinRounds: yesterdayStats[0]?.win_rounds || 0,
      totalRounds: yesterdayStats[0]?.total_rounds || 0,
    };

    // ================================================================
    // 18. 补给预算（模拟数据，后续接真实数据源）
    // ================================================================
    const budgetData = {
      weeklyBudget: 1500,
      weeklyUsed: 800,
      weeklyRemaining: 700,
      currency: '¥',
      percentUsed: 53,
      lastWeekUsed: 920,
      categories: [
        { name: '饮料', spent: 450, budget: 700 },
        { name: '零食', spent: 250, budget: 500 },
        { name: '日用品', spent: 100, budget: 300 },
      ],
    };

    // ================================================================
    // 19. 待办审批（模拟数据，后续接审批流程表）
    // ================================================================
    const approvalItems = [
      { id: 1, type: '合同', title: '选手 0z 合同续签', urgency: 'high', date: '2026-06-08' },
      { id: 2, type: '采购', title: '外设采购申请（耳机×5）', urgency: 'medium', date: '2026-06-07' },
      { id: 3, type: '预算', title: '下月赛训预算审批', urgency: 'medium', date: '2026-06-06' },
      { id: 4, type: '转会', title: '试训选手评估报告审核', urgency: 'low', date: '2026-06-05' },
    ];

    // ================================================================
    // 20. 月度成本概览（模拟数据，后续接财务表）
    // ================================================================
    const monthlyCosts = {
      month: '2026-06',
      total: 285000,
      categories: [
        { name: '人员薪资', amount: 180000, percentage: 63, lastMonth: 175000 },
        { name: '赛事支出', amount: 55000, percentage: 19, lastMonth: 42000 },
        { name: '装备采购', amount: 30000, percentage: 11, lastMonth: 28000 },
        { name: '日常运营', amount: 20000, percentage: 7, lastMonth: 18000 },
      ],
    };

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
        our_score: m.our_score,
        their_score: m.their_score,
        t_score: m.t_score || 0,
        ct_score: m.ct_score || 0,
        notes: m.notes || '',
      })),
      playerStats: mergedPlayerStats,
      staff: staff,
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
      systemConfig,
      weeklyComparison,
      radarChart,
      personnelTimeline: personnelTimeline.slice(0, 8),
      yesterdayTasks,
      budgetData,
      approvalItems,
      monthlyCosts,
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
