const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

// 内联 normalizeOpponent：trim + 小写，合并同队不同写法
const normalizeOpponent = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// ============================================================
// 统一 rating 计算：HLTV Rating2.0 简化版（纯个人表现，不看胜负）
// 注意：HLTV原式第4项是Impact(多杀/首杀)，本库无Impact/KAST数据，
// 故用提高KPR权重的方式补偿，避免死亡被重复惩罚。
// rating = 2.2*0.3591*KPR - 0.5329*DPR + 0.0042*ADR + 0.55
// ============================================================
function calcRating(kills, deaths, adr, rounds) {
  const k = Number(kills) || 0;
  const d = Number(deaths) || 0;
  const a = Number(adr) || 0;
  const r = Number(rounds) > 0 ? Number(rounds) : 1;
  const kpr = k / r;
  const dpr = d / r;
  const rating = 0.79002 * kpr - 0.5329 * dpr + 0.0042 * a + 0.55;
  return Math.max(0, parseFloat(rating.toFixed(2)));
}


// ============================================================
// 工具函数：构建日期过滤条件
// ============================================================
function buildDateRange(start, end, alias = 'm') {
  const conditions = [];
  if (start) conditions.push(`${alias}.match_date >= '${start}'`);
  if (end)   conditions.push(`${alias}.match_date <= '${end}'`);
  return conditions.length ? 'AND ' + conditions.join(' AND ') : '';
}

// ============================================================
// GET /api/dashboard/overview
//
// 查询参数：
//   start    YYYY-MM-DD  范围起始（默认30天前）
//   end      YYYY-MM-DD  范围结束（默认今天）
//   mapDays  number      已废弃，统一由 start/end 控制（兼容旧调用保留）
// ============================================================
router.get('/overview', auth, async (req, res) => {
  try {
    // ── 解析日期范围 ──────────────────────────────────────────
    let { start, end, mapDays } = req.query;

    // 兼容旧 mapDays 参数：若只传了 mapDays 没有 start/end
    if (!start && !end && mapDays) {
      const days = Math.max(1, Math.min(365, parseInt(mapDays) || 30));
      // 用 JS 计算，避免 SQLite 日期函数拼接
      const endDate  = new Date();
      const startDate = new Date(endDate.getTime() - days * 86400000);
      start = startDate.toISOString().slice(0, 10);
      end   = endDate.toISOString().slice(0, 10);
    }

    // 默认：近 30 天
    if (!end) {
      end = new Date().toISOString().slice(0, 10);
    }
    if (!start) {
      const d = new Date(end);
      d.setDate(d.getDate() - 30);
      start = d.toISOString().slice(0, 10);
    }

    // 基础过滤（防注入：只允许 YYYY-MM-DD 格式）
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(start) || !dateRe.test(end)) {
      return res.status(400).json({ error: '日期格式错误，需为 YYYY-MM-DD' });
    }

    // 通用条件片段（直接拼入 SQL，值已校验安全）
    const dateFilter      = `AND m.match_date >= '${start}' AND m.match_date <= '${end}'`;
    const dateFilterNoAlias = `AND match_date >= '${start}' AND match_date <= '${end}'`;

    // 垃圾数据过滤片段
    const junkFilter = `
      AND m.opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
      AND m.opponent NOT LIKE '%\\_%' ESCAPE '\\'
      AND m.map_name IS NOT NULL AND m.map_name != ''
      AND m.our_score IS NOT NULL
    `;

    // ── 1. KPI — 范围内训练赛地图胜负（每张地图独立计算）────
    const [kpiRows] = await db.query(
      `SELECT
         CASE WHEN our_score > their_score THEN 'win'
              WHEN our_score < their_score THEN 'loss'
              ELSE 'draw' END as result,
         COUNT(*) as cnt
       FROM matches
       WHERE match_type = 'scrim'
         AND match_date >= ? AND match_date <= ?
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
       GROUP BY result`,
      [start, end]
    );

    // 每张地图独立一场：wins/losses/draws 均为地图数
    let wins = 0, losses = 0, draws = 0;
    kpiRows.forEach(r => {
      if (r.result === 'win')       wins   = r.cnt;
      else if (r.result === 'loss') losses = r.cnt;
      else                          draws  = r.cnt;
    });
    const totalMatches = wins + losses + draws;
    const recentWinRate = totalMatches > 0
      ? ((wins / totalMatches) * 100).toFixed(1)
      : '0.0';

    // ── 2. KPI — 训练质量（全量，不受日期范围影响，反映整体水平）──
    const [qualityRows] = await db.query(
      `SELECT
         COUNT(*) as total_rounds,
         SUM(CASE WHEN issue_grenade=1 OR issue_position=1 OR issue_aim=1
                       OR issue_comms=1 OR issue_tactics=1 THEN 1 ELSE 0 END) as issue_rounds
       FROM training_rounds`
    );
    const totalRounds   = qualityRows[0]?.total_rounds  || 0;
    const issueRounds   = qualityRows[0]?.issue_rounds  || 0;
    const trainingQuality = totalRounds > 0
      ? ((1 - issueRounds / totalRounds) * 100).toFixed(1)
      : '0.0';

    // ── 2b. KPI — 场均失误（口径③，2026-06-23）──
    //   卡片显示「最近 N 场」场均失误数(会变动)；颜色基准用「全部历史」(固定标尺)
    //   历史场均 = 全部失误事件(排除教练点赞) ÷ 全部训练场次；及格线 = 历史场均 × 0.7
    //   【说明】最近N场用 id DESC 排序(id自增=录入顺序≈比赛顺序)，规避日期列名不确定，绝不报错
    const ERR_RECENT_N = 5;
    const [[errBase]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM round_errors WHERE COALESCE(category,'')!='教练点赞') AS total_err,
         (SELECT COUNT(*) FROM training_logs_v2) AS total_logs`
    );
    const errTotal  = errBase?.total_err  || 0;
    const logTotal2 = errBase?.total_logs || 0;
    const errAvgAll = logTotal2 > 0 ? +(errTotal / logTotal2).toFixed(1) : 0;
    const errPass   = +(errAvgAll * 0.7).toFixed(1);
    const [errRecentLogs] = await db.query(
      `SELECT id FROM training_logs_v2 ORDER BY id DESC LIMIT ${ERR_RECENT_N}`
    );
    const errRecentIds = (errRecentLogs || []).map(l => l.id);
    let errRecentAvg = 0;
    const errRecentCount = errRecentIds.length;
    if (errRecentCount > 0) {
      const phErr = errRecentIds.map(() => '?').join(',');
      const [[rrErr]] = await db.query(
        `SELECT COUNT(*) AS n FROM round_errors re
           JOIN training_log_rounds r ON r.id = re.round_id
          WHERE r.log_id IN (${phErr}) AND COALESCE(re.category,'') != '教练点赞'`,
        errRecentIds
      );
      errRecentAvg = +(((rrErr?.n || 0)) / errRecentCount).toFixed(1);
    }

    // ── 2c. 场均失误「按当前选中日期范围」(2026-06-24，卡片主数字改用此值，随日期联动)──
    //   范围内失误总数 ÷ 范围内训练场次；范围内无训练场次则为 0
    const [[errRangeBase]] = await db.query(
      `SELECT COUNT(DISTINCT tl.id) AS logs_in_range
         FROM training_logs_v2 tl
        WHERE tl.log_date >= ? AND tl.log_date <= ?`,
      [start, end]
    );
    const logsInRange = errRangeBase?.logs_in_range || 0;
    let errRangeAvg = 0;
    if (logsInRange > 0) {
      const [[rrRange]] = await db.query(
        `SELECT COUNT(*) AS n
           FROM round_errors re
           JOIN training_log_rounds r ON r.id = re.round_id
           JOIN training_logs_v2 tl ON tl.id = r.log_id
          WHERE tl.log_date >= ? AND tl.log_date <= ?
            AND COALESCE(re.category,'') != '教练点赞'`,
        [start, end]
      );
      errRangeAvg = +(((rrRange?.n || 0)) / logsInRange).toFixed(1);
    }

    // ── 3. 即将赛事：从 tournaments 赛事管理读取（不受日期范围影响）──
    //   取未结束、且填了"下一场比赛日期"的赛事，按下一场日期升序
    const [tourRows] = await db.query(
      `SELECT t.*,
              (SELECT stage_name FROM tournament_stages WHERE id = t.current_stage_id) AS current_stage_name,
              (SELECT bo_format FROM tournament_stages WHERE id = t.current_stage_id) AS current_stage_bo
       FROM tournaments t
       WHERE t.is_finished = 0 OR t.is_finished = 1
       ORDER BY t.is_finished ASC,
                CASE WHEN t.is_finished = 0 THEN t.next_match_date END ASC,
                CASE WHEN t.is_finished = 1 THEN t.end_date END DESC,
                COALESCE(t.next_match_time,'00:00') ASC`
    );
    // 映射成前端"即将开始赛事"卡片期望的字段格式
    const upcomingMatches = (tourRows || []).map(t => ({
      id: t.id,
      tournament_id: t.id,
      event_name: t.name,                       // 赛事完整名称
      opponent: t.next_opponent || 'TBD',       // 下一场对手
      match_date: t.next_match_date,            // 下一场日期
      match_time: t.next_match_time || '',      // 下一场时间
      bo_format: t.bo_format || 'BO1',          // 赛制（赛事级）
      stage_bo: t.current_stage_bo || t.bo_format || 'BO1', // 当前阶段赛制（回退赛事级）
      stage: t.current_stage_name || '',        // 当前阶段名
      opponent_rank: null,
      match_type: 'official',
      is_finished: t.is_finished || 0,          // 是否已结束
      status: t.status || '',                   // 赛事状态(报名中/进行中/已结束)
      placement: t.placement || '',             // 最终名次
      result: t.result || '',                   // 赛果说明
      end_date: t.end_date || '',               // 结束日期
      notes: t.notes || '',                     // 赛事备注（未开始赛事卡作"赛制说明"显示）
    }));
    // 默认选中第一个"未结束"的赛事（已结束的排后面，仍可在标签里点开）
    let upcomingMatch = upcomingMatches.find(u => u.is_finished !== 1) || upcomingMatches[0] || null;
    let upcomingIsFallback = false;

    // ── 4. 范围内赛事记录（全部，不再 LIMIT 5）────────────────
    const [recentMatches] = await db.query(
      `SELECT id, match_date, opponent, map_name, our_score, their_score,
              t_score, ct_score, notes,
              CASE WHEN our_score > their_score THEN 'win'
                   WHEN our_score < their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches
       WHERE match_type = 'scrim'
         AND match_date >= ? AND match_date <= ?
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
       ORDER BY match_date DESC, id DESC
       LIMIT 50`,
      [start, end]
    );

    // 最近正赛（official）— 给「即将开始赛事」卡底部"近期赛事记录"用
    const [recentOfficialRows] = await db.query(
      `SELECT id, match_date, opponent, map_name, our_score, their_score,
              CASE WHEN our_score > their_score THEN 'win'
                   WHEN our_score < their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches
       WHERE match_type = 'official'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
       ORDER BY match_date DESC, id DESC
       LIMIT 2`
    );

    // ── 5. 选手数据（范围内）──────────────────────────────────
    const [playerStats] = await db.query(
      `SELECT
         p.nickname, p.in_game_role, p.avatar_url,
         COUNT(DISTINCT ps.match_id)                                       as maps_played,
         SUM(ps.kills)                                                      as total_kills,
         SUM(ps.deaths)                                                     as total_deaths,
         SUM(m.our_score + m.their_score)                                   as total_rounds,
         ROUND(0.5 + (CASE WHEN SUM(ps.deaths) > 0 THEN SUM(ps.kills)*1.0/SUM(ps.deaths) ELSE SUM(ps.kills) END) * 0.5, 2) as avg_rating,
         ROUND(AVG(CASE WHEN ps.adr    > 0 THEN ps.adr    END), 1)         as avg_adr,
         ROUND(AVG(CASE WHEN ps.kast   > 0 THEN ps.kast   END), 1)         as avg_kast
       FROM players p
       JOIN player_stats ps ON ps.player_id = p.id
       JOIN matches m ON m.id = ps.match_id
       WHERE p.status = 'active' AND p.team_type = 'roster'
         AND m.match_date >= ? AND m.match_date <= ?
       GROUP BY p.id, p.nickname, p.in_game_role
       ORDER BY avg_rating DESC`,
      [start, end]
    );

    // 如果范围内无 player_stats，回退到全量
    const [allTimeStats] = await db.query(
      `SELECT
         p.nickname, p.in_game_role, p.avatar_url,
         COUNT(DISTINCT ps.match_id)                                       as maps_played,
         SUM(ps.kills)                                                      as total_kills,
         SUM(ps.deaths)                                                     as total_deaths,
         ROUND(0.5 + (CASE WHEN SUM(ps.deaths) > 0 THEN SUM(ps.kills)*1.0/SUM(ps.deaths) ELSE SUM(ps.kills) END) * 0.5, 2) as avg_rating,
         ROUND(AVG(CASE WHEN ps.adr    > 0 THEN ps.adr    END), 1)         as avg_adr,
         ROUND(AVG(CASE WHEN ps.kast   > 0 THEN ps.kast   END), 1)         as avg_kast
       FROM players p
       JOIN player_stats ps ON ps.player_id = p.id
       WHERE p.status = 'active' AND p.team_type = 'roster'
       GROUP BY p.id, p.nickname, p.in_game_role
       ORDER BY avg_rating DESC`
    );

    const mergedPlayerStats = allTimeStats.map(s => {
      const r = playerStats.find(x => x.nickname === s.nickname);
      const tk = r?.total_kills  ?? s.total_kills  ?? 0;
      const td = r?.total_deaths ?? s.total_deaths ?? 0;
      const tr = r?.total_rounds ?? 0;          // 总回合（仅范围内查询有）
      const aadr = r?.avg_adr ?? s.avg_adr ?? 0;
      // 有回合数据则用新公式重算；否则退回旧的汇总 rating（全量回退场景）
      const newAvg = tr > 0 ? calcRating(tk, td, aadr, tr) : (r?.avg_rating || s.avg_rating || 0);
      return {
        nickname:     s.nickname,
        in_game_role: s.in_game_role || '',
        avatar_url:   s.avatar_url   || null,
        maps_played:  r?.maps_played  || 0,
        total_kills:  tk,
        total_deaths: td,
        avg_rating:   newAvg,
        avg_adr:      aadr,
        avg_kast:     r?.avg_kast     || s.avg_kast     || 0,
      };
    });

    const withRating = mergedPlayerStats.filter(p => p.avg_rating > 0);
    const withADR    = mergedPlayerStats.filter(p => p.avg_adr    > 0);
    const teamRating = withRating.length
      ? (withRating.reduce((s, p) => s + p.avg_rating, 0) / withRating.length).toFixed(2)
      : '0.00';
    const teamADR = withADR.length
      ? (withADR.reduce((s, p) => s + p.avg_adr, 0) / withADR.length).toFixed(1)
      : '0.0';

    // ── 6. 地图统计（范围内）──────────────────────────────────
    const [rawMapStats] = await db.query(
      `SELECT
         map_name,
         COUNT(*)                                                                 as played,
         SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END)                as wins,
         SUM(CASE WHEN our_score < their_score THEN 1 ELSE 0 END)                as losses,
         ROUND(CAST(SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) AS FLOAT)
               / NULLIF(COUNT(*), 0) * 100, 1)                                   as win_rate
       FROM matches
       WHERE map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
         AND match_date >= ? AND match_date <= ?
       GROUP BY map_name
       ORDER BY win_rate DESC, played DESC`,
      [start, end]
    );

    // 补齐核心地图
    const CORE_MAPS = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Overpass', 'Train'];
    const existingMaps = new Set(rawMapStats.map(m => m.map_name));
    for (const mapName of CORE_MAPS) {
      if (!existingMaps.has(mapName)) {
        rawMapStats.push({ map_name: mapName, played: 0, wins: 0, losses: 0, win_rate: 0 });
      }
    }

    // 每张地图全部战绩（范围内·去重·排除脏数据，前端弹窗用滚动条显示）
    const [mapRecent] = await db.query(
      `SELECT m.id, m.match_date, m.opponent, m.map_name, m.our_score, m.their_score, m.match_type,
              t.name AS tournament_name, ts.stage_name AS stage_name,
              CASE WHEN m.our_score > m.their_score THEN 'win'
                   WHEN m.our_score < m.their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches m
       LEFT JOIN tournaments t ON t.id = m.tournament_id
       LEFT JOIN tournament_stages ts ON ts.id = m.stage_id
       WHERE m.map_name IS NOT NULL AND m.map_name != ''
         AND m.opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND m.opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND m.our_score IS NOT NULL
         AND m.match_date >= ? AND m.match_date <= ?
       ORDER BY m.match_date DESC, m.id DESC`,
      [start, end]
    );
    const mapMatchesMap = {};
    const mapMatchesSeen = {};
    mapRecent.forEach(m => {
      if (!mapMatchesMap[m.map_name]) mapMatchesMap[m.map_name] = [];
      // 去重 key 只用日期前10位（YYYY-MM-DD）+ 标准化对手名 + 比分
      const dateOnly = (m.match_date || '').slice(0, 10);
      const oppNorm  = normalizeOpponent(m.opponent);
      const dedupeKey = `${m.map_name}_${dateOnly}_${oppNorm}_${m.our_score}_${m.their_score}`;
      if (!mapMatchesSeen[dedupeKey]) {
        mapMatchesSeen[dedupeKey] = true;
        mapMatchesMap[m.map_name].push({
          id:       m.id,
          date:     dateOnly,
          opponent: oppNorm,
          score:    `${m.our_score}:${m.their_score}`,
          result:   m.result,
          match_type:      m.match_type || 'scrim',
          tournament_name: m.tournament_name || null,
          stage_name:      m.stage_name || null,
        });
      }
    });

    // 用"清洗后的战绩列表"重算每张图的场次/胜负/胜率，保证弹窗头部数字与下方列表完全一致
    const enrichedMapStats = rawMapStats.map(m => {
      const rm = mapMatchesMap[m.map_name] || [];
      const wins   = rm.filter(x => x.result === 'win').length;
      const losses = rm.filter(x => x.result === 'loss').length;
      const draws  = rm.filter(x => x.result === 'draw').length;
      const played = rm.length;
      const win_rate = played > 0 ? Math.round((wins / played) * 1000) / 10 : 0;
      return { ...m, played, wins, losses, draws, win_rate, recentMatches: rm };
    }).sort((a, b) => b.win_rate - a.win_rate || b.played - a.played);

    // ── 6b. 对手统计（范围内，按地图数排序，取前7）─────────────
    const [rawOpponentStats] = await db.query(
      `SELECT
         opponent,
         COUNT(*)                                                                  as maps_played,
         SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END)                 as wins,
         SUM(CASE WHEN our_score < their_score THEN 1 ELSE 0 END)                 as losses,
         SUM(CASE WHEN our_score = their_score THEN 1 ELSE 0 END)                 as draws,
         MAX(match_date)                                                           as last_match_date
       FROM matches
       WHERE match_type = 'scrim'
         AND match_date >= ? AND match_date <= ?
         AND opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
       GROUP BY opponent`,
      [start, end]
    );

    // 标准化对手名并合并同名数据
    const opponentMerged = {};
    for (const row of rawOpponentStats) {
      const stdName = normalizeOpponent(row.opponent);
      if (!opponentMerged[stdName]) {
        opponentMerged[stdName] = {
          opponent: stdName,
          maps_played: 0, wins: 0, losses: 0, draws: 0,
          last_match_date: row.last_match_date,
        };
      }
      const m = opponentMerged[stdName];
      m.maps_played += row.maps_played;
      m.wins        += row.wins;
      m.losses      += row.losses;
      m.draws       += row.draws;
      // 取最近日期
      if (row.last_match_date > m.last_match_date) m.last_match_date = row.last_match_date;
    }

    const opponentStats = Object.values(opponentMerged)
      .map(o => ({
        ...o,
        win_rate: o.maps_played > 0
          ? Math.round((o.wins / o.maps_played) * 100)
          : 0,
      }))
      .sort((a, b) => b.maps_played - a.maps_played || b.win_rate - a.win_rate)
      .slice(0, 7);

    // 为每个对手查询近期地图记录（带 match_id，供弹窗用）
    for (const opp of opponentStats) {
      // 找出所有原始名称（可能有多种写法）
      const rawNames = rawOpponentStats
        .filter(r => normalizeOpponent(r.opponent) === opp.opponent)
        .map(r => r.opponent);

      if (rawNames.length === 0) { opp.recentMaps = []; continue; }

      const placeholders = rawNames.map(() => '?').join(',');
      const [oppMaps] = await db.query(
        `SELECT id, match_date, map_name, our_score, their_score,
                CASE WHEN our_score > their_score THEN 'win'
                     WHEN our_score < their_score THEN 'loss'
                     ELSE 'draw' END as result
         FROM matches
         WHERE opponent IN (${placeholders})
           AND match_date >= ? AND match_date <= ?
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score IS NOT NULL
         ORDER BY match_date DESC, id DESC
         LIMIT 8`,
        [...rawNames, start, end]
      );
      opp.recentMaps = oppMaps.map(m => ({
        id:     m.id,
        date:   m.match_date.slice(0, 10),
        map:    m.map_name,
        score:  `${m.our_score}:${m.their_score}`,
        result: m.result,
      }));
    }

    // ── 7. 比赛详情（弹窗用，范围内）──────────────────────────
    // 先检查 player_stats 是否有 hs 列
    let hsColExists = false;
    try {
      const [pragma] = await db.query(`PRAGMA table_info(player_stats)`);
      hsColExists = pragma.some(c => c.name === 'hs');
    } catch {}

    const hsSelect = hsColExists ? ', ps.hs as hs' : ', 0 as hs';

    const [matchDetailsRaw] = await db.query(
      `SELECT
         m.id as match_id, m.match_date, m.opponent, m.map_name,
         m.our_score, m.their_score, m.notes,
         m.opponent_players,
         m.match_type, tt.name as event_name, ts.stage_name as stage_name,
         CASE WHEN m.our_score > m.their_score THEN 'win'
              WHEN m.our_score < m.their_score THEN 'loss'
              ELSE 'draw' END as result,
         p.nickname, p.in_game_role,
         ps.kills, ps.deaths,
         ps.kills*1.0 as _k_raw, ps.deaths*1.0 as _d_raw,
         (m.our_score + m.their_score) as _rounds,
         ROUND(0.5 + (CASE WHEN ps.deaths > 0 THEN ps.kills*1.0/ps.deaths ELSE ps.kills END) * 0.5, 2) as rating,
         ROUND(ps.adr, 1)    as adr,
         ROUND(ps.kast, 1)   as kast
         ${hsSelect}
       FROM matches m
       JOIN player_stats ps ON ps.match_id = m.id
       JOIN players p       ON p.id = ps.player_id
       LEFT JOIN tournaments tt ON tt.id = m.tournament_id
       LEFT JOIN tournament_stages ts ON ts.id = m.stage_id
       WHERE m.match_date >= ? AND m.match_date <= ?
         AND m.opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND m.opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND m.map_name IS NOT NULL AND m.map_name != ''
         AND m.our_score IS NOT NULL
       ORDER BY m.match_date DESC, m.id DESC, ps.kills DESC
       LIMIT 500`,
      [start, end]
    );

    const matchDetailsMap = {};
    matchDetailsRaw.forEach(r => {
      if (!matchDetailsMap[r.match_id]) {
        let oppPlayers = [];
        try { oppPlayers = JSON.parse(r.opponent_players || '[]'); } catch {}
        matchDetailsMap[r.match_id] = {
          id: r.match_id, date: r.match_date,
          opponent: normalizeOpponent(r.opponent),
          map: r.map_name, score: `${r.our_score}:${r.their_score}`,
          result: r.result, notes: r.notes || '',
          match_type: r.match_type, event_name: r.event_name || '', stage_name: r.stage_name || '',
          players: [],
          oppPlayers: oppPlayers.map(p => ({
            name:   p.name,
            rating: calcRating(p.kills, p.deaths, p.adr, (r.our_score || 0) + (r.their_score || 0)),
            kd:     `${p.kills}-${p.deaths}`,
            adr:    p.adr   || 0,
            hs:     p.hs    || 0,
          })),
        };
      }
      matchDetailsMap[r.match_id].players.push({
        name: r.nickname, role: r.in_game_role || '',
        rating: calcRating(r._k_raw, r._d_raw, r.adr, r._rounds),
        kd: `${r.kills}-${r.deaths}`,
        adr: r.adr, kast: r.kast, hs: r.hs || 0,
      });
    });

    // 过滤非战斗选手（kills=0 且 deaths=0，即教练/领队）
    Object.values(matchDetailsMap).forEach(m => {
      m.players = m.players.filter(p => {
        const [k, d] = (p.kd || '0-0').split('-').map(Number);
        return !(k === 0 && d === 0 && (p.adr || 0) === 0);
      });
      // oppPlayers 同样过滤
      m.oppPlayers = (m.oppPlayers || []).filter(p => {
        const [k, d] = (p.kd || '0-0').split('-').map(Number);
        return !(k === 0 && d === 0);
      });
    });

    // ── 8. HS%（范围内）──────────────────────────────────────
    let hsStats = [];
    if (hsColExists) {
      const [hsRows] = await db.query(
        `SELECT p.nickname, p.in_game_role,
                SUM(ps.hs)    as total_hs,
                SUM(ps.kills) as total_kills
         FROM player_stats ps
         JOIN players p ON p.id = ps.player_id
         JOIN matches m  ON m.id = ps.match_id
         WHERE p.status = 'active' AND p.team_type = 'roster'
           AND m.match_date >= ? AND m.match_date <= ?
           AND m.match_type = 'scrim'
         GROUP BY p.id, p.nickname, p.in_game_role
         ORDER BY total_kills DESC`,
        [start, end]
      );
      hsStats = hsRows.map(s => ({
        nickname:    s.nickname,
        in_game_role: s.in_game_role,
        total_hs:    s.total_hs    || 0,
        total_kills: s.total_kills || 0,
        hs_pct: s.total_kills > 0
          ? ((s.total_hs / s.total_kills) * 100).toFixed(1)
          : '0.0',
      }));
    }

    // ── 9. 系统配置 ──────────────────────────────────────────
    const [configRows] = await db.query('SELECT config_key, config_value FROM system_config');
    const systemConfig = {};
    configRows.forEach(r => { systemConfig[r.config_key] = r.config_value; });

    // ── 10. 外设（修复 sort_order 缺失）──────────────────────
    let peripherals = [];
    try {
      const [periRows] = await db.query(
        `SELECT pe.*, p.nickname, p.in_game_role
         FROM peripherals pe
         JOIN players p ON p.id = pe.player_id
         WHERE p.status = 'active' AND p.team_type = 'roster'
         ORDER BY pe.player_id ASC`  // 改用 player_id 排序，避免 sort_order 不存在
      );
      peripherals = periRows;
    } catch (e) {
      console.warn('peripherals query failed:', e.message);
    }

    // ── 11. 库存 ─────────────────────────────────────────────
    const [inventory] = await db.query('SELECT * FROM inventory ORDER BY id ASC');

    // ── 12. 今日训练计划 ──────────────────────────────────────
    const [trainingPlan] = await db.query(
      `SELECT * FROM training_plans
       WHERE plan_date = date('now','localtime')
       ORDER BY sort_order ASC`
    );

    // ── 13. 对手情报 ──────────────────────────────────────────
    let opponentIntel = null;
    if (upcomingMatch) {
      const [intelRows] = await db.query(
        'SELECT * FROM opponent_intel WHERE opponent_name = ? LIMIT 1',
        [upcomingMatch.opponent]
      );
      if (intelRows[0]) {
        opponentIntel = intelRows[0];
      } else {
        const [fuzzyRows] = await db.query(
          'SELECT * FROM opponent_intel WHERE opponent_name LIKE ? LIMIT 1',
          [`%${upcomingMatch.opponent}%`]
        );
        opponentIntel = fuzzyRows[0] || null;
      }
    }

    // ── 14. 近期交手记录（按时间倒序最近6场，不绑定对手）──────
    let h2hFromDb = { wins: 0, losses: 0, draws: 0 };
    const [recentH2HRows] = await db.query(
      `SELECT match_date, opponent, map_name, our_score, their_score,
              CASE WHEN our_score > their_score THEN 'win'
                   WHEN our_score < their_score THEN 'loss'
                   ELSE 'draw' END as result
       FROM matches
       WHERE opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
         AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
         AND map_name IS NOT NULL AND map_name != ''
         AND our_score IS NOT NULL
       ORDER BY match_date DESC, id DESC LIMIT 6`
    );
    const recentH2H = recentH2HRows.map(r => ({
      date: r.match_date, opponent: normalizeOpponent(r.opponent),
      map: r.map_name, score: `${r.our_score}:${r.their_score}`, result: r.result,
    }));
    // 兼容旧字段：h2hFromDb 仍统计（基于最近交手对手汇总，前端若用到不报错）
    recentH2HRows.forEach(r => {
      if (r.result === 'win') h2hFromDb.wins++;
      else if (r.result === 'loss') h2hFromDb.losses++;
      else h2hFromDb.draws++;
    });

    // ── 14b. 历史交手展示对象（对手确定→真实交手 / 待定→近期战绩）──
    const oppRaw = (upcomingMatch?.opponent || '').trim();
    const isTBD = !oppRaw || /^(TBA|TBD|待定|未定|未知|tba|tbd)$/i.test(oppRaw);
    let h2hDisplay;
    if (upcomingMatch && !isTBD) {
      // 对手已确定：去 matches 表查 UR vs 该对手 的真实交手（用 normalizeOpponent 归一化匹配）
      const target = normalizeOpponent(oppRaw);
      const [allOppRows] = await db.query(
        `SELECT opponent,
                CASE WHEN our_score > their_score THEN 'win'
                     WHEN our_score < their_score THEN 'loss'
                     ELSE 'draw' END as result
         FROM matches
         WHERE opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
           AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score IS NOT NULL`
      );
      let rw = 0, rl = 0, rd = 0;
      (allOppRows || []).forEach(r => {
        if (normalizeOpponent(r.opponent) === target) {
          if (r.result === 'win') rw++;
          else if (r.result === 'loss') rl++;
          else rd++;
        }
      });
      h2hDisplay = { type: 'h2h', opponent: oppRaw, wins: rw, losses: rl, draws: rd };
    } else {
      // 对手待定：展示最近战绩（沿用 h2hFromDb 的最近6场汇总）
      h2hDisplay = { type: 'recent', wins: h2hFromDb.wins, losses: h2hFromDb.losses, draws: h2hFromDb.draws };
    }

    // ── 15. 环比数据（多维度预设）────────────────────────────
    // 每个维度：{ label, curStart, curEnd, prevStart, prevEnd }
    const todayLocal = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const d = (n) => {
      const dt = new Date(todayLocal);
      dt.setDate(dt.getDate() + n);
      return dt.toISOString().slice(0, 10);
    };

    // 本周一（周一为第一天）
    const todayDow = new Date(todayLocal).getDay(); // 0=周日
    const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
    const thisMonday = d(mondayOffset);
    const lastMonday = d(mondayOffset - 7);
    const lastSunday = d(mondayOffset - 1);

    const COMPARE_PRESETS = [
      { key: 'today',   label: '今天',  curStart: todayLocal,  curEnd: todayLocal,  prevStart: d(-1),           prevEnd: d(-1) },
      { key: 'week3',   label: '近3天', curStart: d(-2),       curEnd: todayLocal,  prevStart: d(-5),           prevEnd: d(-3) },
      { key: 'week7',   label: '近7天', curStart: d(-6),       curEnd: todayLocal,  prevStart: d(-13),          prevEnd: d(-7) },
      { key: 'thisweek',label: '本周',  curStart: thisMonday,  curEnd: todayLocal,  prevStart: lastMonday,      prevEnd: lastSunday },
    ];

    const ISSUE_TYPES = [
      { key: 'grenade',  label: '道具', col: 'issue_grenade'  },
      { key: 'position', label: '走位', col: 'issue_position' },
      { key: 'aim',      label: '枪法', col: 'issue_aim'      },
      { key: 'comms',    label: '沟通', col: 'issue_comms'    },
      { key: 'tactics',  label: '战术', col: 'issue_tactics'  },
    ];

    async function getIssueStats(s, e) {
      // 【迁移 2026-06-23】旧表 training_rounds(已停更) → 新表 round_errors + training_log_rounds + training_logs_v2
      //   失误按 round_errors.category(中文大类) 统计;total_rounds 取该日期范围的回合总数
      const [errRows] = await db.query(
        `SELECT re.category AS category, COUNT(*) AS cnt
           FROM round_errors re
           JOIN training_log_rounds r ON r.id = re.round_id
           JOIN training_logs_v2 tl ON tl.id = r.log_id
          WHERE tl.log_date >= ? AND tl.log_date <= ?
            AND COALESCE(re.category,'') != '教练点赞'
          GROUP BY re.category`,
        [s, e]
      );
      const [rcRows] = await db.query(
        `SELECT COUNT(*) AS total_rounds
           FROM training_log_rounds r
           JOIN training_logs_v2 tl ON tl.id = r.log_id
          WHERE tl.log_date >= ? AND tl.log_date <= ?`,
        [s, e]
      );
      // 中文大类 → 旧字段 key 映射
      const catMap = { '道具':'grenade', '走位':'position', '枪法':'aim', '沟通':'comms', '战术':'tactics' };
      const out = { grenade:0, position:0, aim:0, comms:0, tactics:0,
                    total_rounds: rcRows[0]?.total_rounds || 0 };
      for (const row of errRows) {
        const k = catMap[row.category];
        if (k) out[k] += parseInt(row.cnt) || 0;
      }
      return out;
    }

    async function getExecRate(s, e) {
      // 【迁移 2026-06-23】旧表 training_rounds.execution_text → 新表 training_log_rounds.execution
      const [rows] = await db.query(
        `SELECT r.execution AS execution_text, COUNT(*) as cnt
           FROM training_log_rounds r
           JOIN training_logs_v2 tl ON tl.id = r.log_id
          WHERE tl.log_date >= ? AND tl.log_date <= ?
            AND r.execution IS NOT NULL AND r.execution != ''
          GROUP BY r.execution`,
        [s, e]
      );
      let score = 0, total = 0;
      for (const r of rows) {
        const t = (r.execution_text || '').trim();
        const w = t.includes('成功') && !t.includes('失败') ? 100
                : t.includes('部分') ? 50
                : t.includes('失败') ? 0 : null;
        if (w !== null) { score += w * r.cnt; total += r.cnt; }
      }
      return total > 0 ? Math.round(score / total) : null;
    }

    // 计算所有维度
    const periodCompareAll = {};
    for (const preset of COMPARE_PRESETS) {
      const [curStats, prevStats] = await Promise.all([
        getIssueStats(preset.curStart, preset.curEnd),
        getIssueStats(preset.prevStart, preset.prevEnd),
      ]);
      const [curExec, prevExec] = await Promise.all([
        getExecRate(preset.curStart, preset.curEnd),
        getExecRate(preset.prevStart, preset.prevEnd),
      ]);
      periodCompareAll[preset.key] = {
        label:     preset.label,
        period:    { start: preset.curStart,  end: preset.curEnd  },
        prevPeriod:{ start: preset.prevStart, end: preset.prevEnd },
        totalRoundsCur:  parseInt(curStats.total_rounds)  || 0,
        totalRoundsPrev: parseInt(prevStats.total_rounds) || 0,
        issues: ISSUE_TYPES.map(({ key, label }) => ({
          label,
          cur:   parseInt(curStats[key])  || 0,
          prev:  parseInt(prevStats[key]) || 0,
          delta: (parseInt(curStats[key]) || 0) - (parseInt(prevStats[key]) || 0),
        })),
        executionRate: {
          cur:   curExec,
          prev:  prevExec,
          delta: curExec != null && prevExec != null ? curExec - prevExec : null,
        },
      };
    }

    // 同时保留旧的 periodComparison（基于当前选择范围）供兼容
    const curIssueRows2 = await getIssueStats(start, end);
    const curExecRate2  = await getExecRate(start, end);
    const startMs   = new Date(start).getTime();
    const endMs     = new Date(end).getTime();
    const rangeMs   = endMs - startMs + 86400000;
    const prevEnd2   = new Date(startMs - 86400000).toISOString().slice(0, 10);
    const prevStart2 = new Date(startMs - rangeMs).toISOString().slice(0, 10);
    const prevIssueRows2 = await getIssueStats(prevStart2, prevEnd2);
    const prevExecRate2  = await getExecRate(prevStart2, prevEnd2);

    const periodComparison = {
      period:    { start, end },
      prevPeriod:{ start: prevStart2, end: prevEnd2 },
      totalRoundsCur:  parseInt(curIssueRows2.total_rounds)  || 0,
      totalRoundsPrev: parseInt(prevIssueRows2.total_rounds) || 0,
      issues: ISSUE_TYPES.map(({ key, label }) => ({
        label,
        cur:   parseInt(curIssueRows2[key])  || 0,
        prev:  parseInt(prevIssueRows2[key]) || 0,
        delta: (parseInt(curIssueRows2[key]) || 0) - (parseInt(prevIssueRows2[key]) || 0),
      })),
      executionRate: {
        cur:   curExecRate2,
        prev:  prevExecRate2,
        delta: curExecRate2 != null && prevExecRate2 != null ? curExecRate2 - prevExecRate2 : null,
      },
    };

    // ── 15b. 今日训练对象（从 training_sessions + briefing_items）──
    const todayStr = new Date().toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-'); // YYYY-MM-DD

    // 今日 session
    const [todaySession] = await db.query(
      `SELECT ts.*, GROUP_CONCAT(DISTINCT bi.map_name) as maps
       FROM training_sessions ts
       LEFT JOIN briefing_items bi ON bi.session_id = ts.id
       WHERE ts.match_date = ?
         AND ts.opponent NOT IN ('OPPONENT','未知','___','')
       GROUP BY ts.id
       ORDER BY ts.id DESC
       LIMIT 1`,
      [todayStr]
    );

    let todayScrim = null;
    if (todaySession[0]) {
      const sess = todaySession[0];
      const oppStd = normalizeOpponent(sess.opponent);

      // 与该对手最近4张地图比分（训练赛）
      const [recentVsOpp] = await db.query(
        `SELECT match_date, map_name, our_score, their_score,
                CASE WHEN our_score > their_score THEN 'win'
                     WHEN our_score < their_score THEN 'loss'
                     ELSE 'draw' END as result
         FROM matches
         WHERE match_type = 'scrim'
           AND LOWER(opponent) = LOWER(?)
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score IS NOT NULL
         ORDER BY match_date DESC, id DESC
         LIMIT 4`,
        [sess.opponent]
      );

      todayScrim = {
        opponent:   oppStd,
        maps:       sess.maps ? sess.maps.split(',').filter(Boolean) : [],
        recentMaps: recentVsOpp.map(r => ({
          date:   r.match_date,
          map:    r.map_name,
          score:  `${r.our_score}:${r.their_score}`,
          result: r.result,
        })),
      };
    }

    // 昨日（最近一场已打）训练赛对象：日期早于今天的最近一场 scrim 的对手 + 比赛记录
    let yesterdayScrim = null;
    {
      const [prevMatch] = await db.query(
        `SELECT match_date, opponent FROM matches
         WHERE match_type = 'scrim'
           AND opponent NOT IN ('OPPONENT','未知','___','','match_data','0525_match')
           AND opponent NOT LIKE '%\\_%' ESCAPE '\\'
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score IS NOT NULL
           AND match_date < ?
         ORDER BY match_date DESC, id DESC LIMIT 1`,
        [todayStr]
      );
      if (prevMatch[0]) {
        const oppStd = normalizeOpponent(prevMatch[0].opponent);
        // 该对手最近4图比赛记录
        const [recentVsOpp] = await db.query(
          `SELECT match_date, map_name, our_score, their_score,
                  CASE WHEN our_score > their_score THEN 'win'
                       WHEN our_score < their_score THEN 'loss'
                       ELSE 'draw' END as result
           FROM matches
           WHERE match_type = 'scrim' AND LOWER(opponent) = LOWER(?)
             AND map_name IS NOT NULL AND map_name != '' AND our_score IS NOT NULL
           ORDER BY match_date DESC, id DESC LIMIT 4`,
          [prevMatch[0].opponent]
        );
        yesterdayScrim = {
          opponent: oppStd,
          date: prevMatch[0].match_date,
          recentMaps: recentVsOpp.map(r => ({
            date: r.match_date, map: r.map_name,
            score: `${r.our_score}:${r.their_score}`, result: r.result,
          })),
        };
      }
    }

    // 旧 weeklyComparison 保留（兼容前端其他地方可能用到）
    const weeklyComparison = { topIssues: [], thisWeekWins: 0, thisWeekLosses: 0,
      thisWeekTotalRounds: 0, lastWeekTotalRounds: 0,
      thisWeekIssueRounds: 0, lastWeekIssueRounds: 0 };

    // ── 16. 雷达图数据 ────────────────────────────────────────
    const [rosterCount] = await db.query(
      `SELECT COUNT(*) as cnt FROM players
       WHERE status='active' AND team_type='roster'`
    );
    const activeRoster      = rosterCount[0]?.cnt || 0;
    const rosterCompleteness = Math.min(Math.round((activeRoster / 5) * 100), 100);

    // 状态趋势：范围内近10场 vs 其前10场
    const recentWinRateVal = totalMatches > 0 ? wins / totalMatches : 0.5;
    const [trendOlder] = await db.query(
      `SELECT
         SUM(CASE WHEN our_score > their_score THEN 1 ELSE 0 END) as wins,
         COUNT(*) as total
       FROM (
         SELECT our_score, their_score FROM matches
         WHERE match_type = 'scrim'
           AND match_date < ?
           AND opponent NOT IN ('', 'OPPONENT', '__', '未知', 'match_data', '0525_match')
           AND map_name IS NOT NULL AND map_name != ''
           AND our_score IS NOT NULL
         ORDER BY match_date DESC, id DESC
         LIMIT 10
       )`,
      [start]
    );
    const olderWinRateVal = trendOlder[0]?.total > 0
      ? (trendOlder[0].wins / trendOlder[0].total) : 0.5;
    const trendDelta  = (recentWinRateVal - olderWinRateVal) * 100;
    const formTrend   = Math.min(Math.max(Math.round(50 + trendDelta), 0), 100);

    const [scheduleCount] = await db.query(
      `SELECT COUNT(*) as cnt FROM tournaments
       WHERE is_finished = 0
         AND next_match_date IS NOT NULL AND next_match_date != ''
         AND next_match_date >= date('now','localtime')
         AND next_match_date <  date('now','localtime','+30 days')`
    );
    const upcomingCount = scheduleCount[0]?.cnt || 0;
    const schedulePressure = upcomingCount <= 0 ? 80
      : upcomingCount <= 5  ? 70
      : upcomingCount <= 8  ? 60
      : upcomingCount <= 12 ? 50
      : upcomingCount <= 16 ? 30 : 20;

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
        `范围内胜率 ${recentWinRate}%`,
        `训练质量 ${trainingQuality}%`,
        `${activeRoster}/5 主力可用`,
        `${trendDelta >= 0 ? '↑上升' : '↓下滑'} ${Math.abs(trendDelta).toFixed(0)}%`,
        `${upcomingCount}场/近30天`,
      ],
    };

    // ── 17. 昨日任务 ──────────────────────────────────────────
    const [yesterdayPlans] = await db.query(
      `SELECT * FROM training_plans
       WHERE plan_date = date('now','localtime','-1 day')
       ORDER BY sort_order ASC`
    );
    const [yesterdayStats] = await db.query(
      `SELECT COUNT(*) as total_rounds,
              SUM(CASE WHEN round_result='win' THEN 1 ELSE 0 END) as win_rounds
       FROM training_rounds
       WHERE created_at >= date('now','localtime','-1 day')
         AND created_at <  date('now','localtime')`
    );
    const yesterdayTasks = {
      tasks: yesterdayPlans.map(p => ({
        title:    p.title,
        subtitle: p.subtitle || '',
        timeRange: `${p.start_time || ''} - ${p.end_time || ''}`,
        tags:     p.tags ? p.tags.split(/[,，]/).filter(Boolean) : [],
        completed: true,
      })),
      completionRate: yesterdayStats[0]?.total_rounds > 0
        ? Math.round(yesterdayStats[0].win_rounds / yesterdayStats[0].total_rounds * 100)
        : yesterdayPlans.length > 0 ? 100 : 0,
      totalWinRounds: yesterdayStats[0]?.win_rounds || 0,
      totalRounds:    yesterdayStats[0]?.total_rounds || 0,
    };

    // ── 18-20. 预算/审批/成本（模拟数据）────────────────────
    const budgetData = {
      weeklyBudget: 1500, weeklyUsed: 800, weeklyRemaining: 700,
      currency: '¥', percentUsed: 53, lastWeekUsed: 920,
      categories: [
        { name: '饮料',   spent: 450, budget: 700 },
        { name: '零食',   spent: 250, budget: 500 },
        { name: '日用品', spent: 100, budget: 300 },
      ],
    };
    const approvalItems = [
      { id: 1, type: '合同', title: '选手 0z 合同续签',        urgency: 'high',   date: '2026-06-08' },
      { id: 2, type: '采购', title: '外设采购申请（耳机×5）',  urgency: 'medium', date: '2026-06-07' },
      { id: 3, type: '预算', title: '下月赛训预算审批',         urgency: 'medium', date: '2026-06-06' },
      { id: 4, type: '转会', title: '试训选手评估报告审核',     urgency: 'low',    date: '2026-06-05' },
    ];
    const monthlyCosts = {
      month: new Date().toISOString().slice(0, 7),
      total: 285000,
      categories: [
        { name: '人员薪资', amount: 180000, percentage: 63, lastMonth: 175000 },
        { name: '赛事支出', amount:  55000, percentage: 19, lastMonth:  42000 },
        { name: '装备采购', amount:  30000, percentage: 11, lastMonth:  28000 },
        { name: '日常运营', amount:  20000, percentage:  7, lastMonth:  18000 },
      ],
    };

    // ── 响应 ─────────────────────────────────────────────────
    res.json({
      // 把实际使用的日期范围回传给前端（方便 UI 显示）
      dateRange: { start, end },

      kpi: {
        recentWinRate:      parseFloat(recentWinRate),
        totalRecentMatches: totalMatches,
        recentWins:         wins,
        recentLosses:       losses,
        recentDraws:        draws,
        trainingQuality:    parseFloat(trainingQuality),
        totalRounds,
        issueRounds,
        // 场均失误(口径③) — 卡片主数字 + 两条基准线
        avgErrorsRecent:  errRecentAvg,    // 最近N场场均(底部小字用)
        avgErrorsAll:     errAvgAll,       // 历史场均(平均线/红线，固定标尺)
        avgErrorsPass:    errPass,         // 及格线 = 历史场均×0.7(绿线)
        avgErrorsRecentN: errRecentCount,  // 实际取了几场
        avgErrorsRange:   errRangeAvg,     // 【新】当前日期范围的场均失误(卡片主数字，随日期联动)
        avgErrorsRangeLogs: logsInRange,   // 【新】当前日期范围内的训练场次
        vrsRank:     parseInt(systemConfig.vrs_rank) || null,
        foundedDate: systemConfig.founded_date       || null,
      },

      upcomingMatch,
      upcomingMatches,
      h2hDisplay,
      upcomingIsFallback,
      opponentIntel,
      h2hFromDb,
      recentH2H,

      recentMatches: recentMatches.map(m => ({
        id:          m.id,
        date:        m.match_date,
        opponent:    normalizeOpponent(m.opponent),
        map:         m.map_name,
        score:       `${m.our_score}:${m.their_score}`,
        result:      m.result,
        our_score:   m.our_score,
        their_score: m.their_score,
        t_score:     m.t_score  || 0,
        ct_score:    m.ct_score || 0,
        notes:       m.notes   || '',
      })),

      // 最近2场正赛 — 即将开始赛事卡底部用
      recentOfficial: (recentOfficialRows || []).map(m => ({
        id:          m.id,
        match_date:  m.match_date,
        opponent:    m.opponent,
        map_name:    m.map_name,
        our_score:   m.our_score,
        their_score: m.their_score,
        result:      m.result,
      })),

      playerStats:   mergedPlayerStats.filter(p => (p.maps_played || 0) > 0 && !((p.total_kills||0) === 0 && (p.total_deaths||0) === 0)),
      hsStats,
      teamAverages:  { rating: parseFloat(teamRating), adr: parseFloat(teamADR) },
      mapStats:      enrichedMapStats,
      opponentStats,
      matchDetails:  Object.values(matchDetailsMap),

      peripherals,
      inventory,
      trainingPlan,
      systemConfig,
      weeklyComparison,
      periodComparison,
      periodCompareAll,
      todayScrim,
      yesterdayScrim,
      radarChart,
      yesterdayTasks,
      budgetData,
      approvalItems,
      monthlyCosts,

      missingData: {
        vrsRank:       systemConfig.vrs_rank    ? null : 'VRS排名未配置',
        foundedDate:   systemConfig.founded_date ? null : '成立日期未配置',
        upcomingMatch: upcomingMatch             ? null : '暂无即将赛事',
        peripherals:   peripherals.length > 0   ? null : '外设数据未录入',
        inventory:     inventory.length > 0     ? null : '库存数据未录入',
        trainingPlan:  trainingPlan.length > 0  ? null : '今日无训练计划',
      },
    });

  } catch (err) {
    console.error('Dashboard overview error:', err);
    res.status(500).json({ error: '数据查询失败', detail: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 赛事详情弹窗用：查某个赛事(tournament)对应录入的正赛比赛记录
//   GET /dashboard/tournament-matches/:tournamentId
//   返回该 tournament 下 match_type='official' 的所有场次(按日期倒序)
// ════════════════════════════════════════════════════════════
router.get('/tournament-matches/:tournamentId', auth, async (req, res) => {
  try {
    const tid = parseInt(req.params.tournamentId, 10);
    if (!tid) return res.json({ matches: [] });
    const [rows] = await db.query(
      `SELECT m.id, m.match_date, m.match_time, m.opponent, m.map_name,
              m.our_score, m.their_score, m.stage_id, m.bo_format, m.is_walkover,
              (SELECT stage_name FROM tournament_stages WHERE id = m.stage_id) AS stage_name,
              CASE WHEN m.our_score > m.their_score THEN 'win'
                   WHEN m.our_score < m.their_score THEN 'loss'
                   ELSE 'draw' END AS result
         FROM matches m
        WHERE m.match_type = 'official'
          AND m.tournament_id = ?
        ORDER BY m.match_date DESC, m.id DESC`,
      [tid]
    );
    res.json({ matches: rows || [] });
  } catch (err) {
    console.error('tournament-matches error:', err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

module.exports = router;
