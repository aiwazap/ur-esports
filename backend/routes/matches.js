const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: 'uploads/tmp/' });

// ─── 推断 BO 格式 ───
function detectBoFormat(count) {
  if (count >= 4) return 'BO5';
  if (count >= 2) return 'BO3';
  return 'BO1';
}

// 获取赛果列表 - 按比赛分组（支持训练赛/正式赛/全部 + 搜索 + 地图筛选 + 日期范围）
router.get('/grouped', auth, async (req, res) => {
  const { days, matchType, search, map, dateFrom, dateTo } = req.query;

  // 构建动态 WHERE
  const baseWhere = [
    "m.division = 'cs2'",
    "m.opponent NOT IN ('match_data', 'OPPONENT', '___')",
    "m.match_date IS NOT NULL AND m.match_date != '' AND length(m.match_date) >= 8",
    "m.map_name IS NOT NULL AND m.map_name != ''"
  ];
  const params = [];

  // 比赛类型筛选（默认训练赛）
  const mt = matchType || 'scrim';
  if (mt !== 'all') {
    baseWhere.push('m.match_type = ?');
    params.push(mt);
  }

  // 日期筛选
  if (dateFrom) {
    baseWhere.push('m.match_date >= ?');
    params.push(dateFrom);
  } else if (days) {
    baseWhere.push(`m.match_date >= DATE('now', '-${parseInt(days)} days')`);
  }
  if (dateTo) {
    baseWhere.push('m.match_date <= ?');
    params.push(dateTo);
  }

  // 对手搜索
  if (search) {
    baseWhere.push('m.opponent LIKE ?');
    params.push(`%${search}%`);
  }

  // 地图筛选
  if (map) {
    baseWhere.push('m.map_name = ?');
    params.push(map);
  }

  try {
    const [rows] = await db.query(`
      SELECT m.id, m.match_date, m.opponent, m.map_name, m.our_score, m.their_score,
             m.t_score, m.ct_score, m.pistol_rounds, m.result, m.notes, m.match_type,
             m.bo_format
      FROM matches m
      WHERE ${baseWhere.join(' AND ')}
      ORDER BY m.match_date DESC, m.opponent, m.map_name
    `, params);

    // 按 日期+对手 分组
    const groups = [];
    let current = null;
    for (const r of rows) {
      const dateStr = (r.match_date || '').split(' ')[0];
      const key = dateStr + '|' + r.opponent;
      if (!current || current.key !== key) {
        if (current) {
          current.bo = current.bo_format || detectBoFormat(current.maps.length);
          groups.push(current);
        }
        current = { match_date: dateStr, opponent: r.opponent, key, maps: [], match_type: r.match_type, bo_format: r.bo_format };
      }
      current.maps.push({
        id: r.id, map_name: r.map_name, our_score: r.our_score, their_score: r.their_score,
        t_score: r.t_score || 0, ct_score: r.ct_score || 0,
        pistol_rounds: r.pistol_rounds || '', result: r.result, notes: r.notes
      });
    }
    if (current) {
      current.bo = current.bo_format || detectBoFormat(current.maps.length);
      groups.push(current);
    }

    // ── 统计摘要 ──
    const allMaps = groups.flatMap(g => g.maps);
    const totalMaps = allMaps.length;
    const totalWins = allMaps.filter(m => m.result === 'win').length;
    const totalLosses = allMaps.filter(m => m.result === 'loss').length;
    const totalDraws = allMaps.filter(m => m.result === 'draw').length;
    const totalMatches = groups.length;
    const matchWins = groups.filter(g => {
      const w = g.maps.filter(m => m.result === 'win').length;
      const l = g.maps.filter(m => m.result === 'loss').length;
      return w > l;
    }).length;
    const matchLosses = groups.filter(g => {
      const w = g.maps.filter(m => m.result === 'win').length;
      const l = g.maps.filter(m => m.result === 'loss').length;
      return l > w;
    }).length;
    const uniqueOpponents = [...new Set(groups.map(g => g.opponent))].length;

    const stats = {
      totalMaps, totalWins, totalLosses, totalDraws,
      totalMatches, matchWins, matchLosses,
      winRate: totalMaps > 0 ? Math.round((totalWins / totalMaps) * 100) : 0,
      matchWinRate: totalMatches > 0 ? Math.round((matchWins / totalMatches) * 100) : 0,
      uniqueOpponents,
      periodDays: days ? parseInt(days) : (dateFrom ? null : 0),
    };

    res.json({ groups, stats });
  } catch (e) {
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// 获取可选地图列表（去重）
router.get('/maps', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT map_name FROM matches WHERE division='cs2' AND map_name IS NOT NULL AND map_name != '' ORDER BY map_name"
    );
    res.json(rows.map(r => r.map_name));
  } catch (e) {
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// 更新单场比赛（半场数据 + 手枪局）
router.put('/:id', adminAuth, async (req, res) => {
  const { t_score, ct_score, pistol_rounds } = req.body;
  try {
    await db.query(
      'UPDATE matches SET t_score = ?, ct_score = ?, pistol_rounds = ? WHERE id = ?',
      [t_score ?? 0, ct_score ?? 0, pistol_rounds || '', req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '更新失败: ' + e.message });
  }
});

// 获取赛果列表
router.get('/', auth, async (req, res) => {
  const { type, days, map } = req.query;
  let where = ['division = "cs2"'];
  const params = [];
  if (type) { where.push('match_type = ?'); params.push(type); }
  if (days) { where.push('match_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'); params.push(parseInt(days)); }
  if (map) { where.push('map_name = ?'); params.push(map); }
  try {
    const [rows] = await db.query(
      `SELECT * FROM matches WHERE ${where.join(' AND ')} ORDER BY match_date DESC, id DESC`,
      params
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 近期赛事（即将开始/已结束）
router.get('/upcoming', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM upcoming_matches WHERE division="cs2" ORDER BY match_date ASC'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 数据总览统计
router.get('/overview', auth, async (req, res) => {
  const { days } = req.query;
  const dayFilter = days ? `AND match_date >= DATE_SUB(CURDATE(), INTERVAL ${parseInt(days)} DAY)` : '';
  try {
    const [[totals]] = await db.query(`
      SELECT
        COUNT(*) as total_maps,
        SUM(result='win') as wins,
        ROUND(AVG(ct_score/(ct_score+t_score)*100),1) as ct_rate,
        ROUND(AVG(t_score/(ct_score+t_score)*100),1) as t_rate,
        ROUND(SUM(result='win')/COUNT(*)*100,1) as win_rate
      FROM matches WHERE division='cs2' AND match_type='official' ${dayFilter}
    `);
    res.json(totals);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// Excel导入
router.post('/import', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const results = { success: 0, errors: [] };

    // Code version marker
    results.version = '2026-06-02-v2';

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (rows.length === 0) continue;

      // 检测 CS2 Match Data 格式（每个 Sheet 一场比赛，元数据在固定行，选手数据在12+行）
      const isMatchDataFormat = rows[0] && String(rows[0][0] || '').trim() === 'CS2 比赛数据';

      if (isMatchDataFormat) {
        // === ETL-style 解析: CS2_Match_Data_May2026.xlsx 格式 ===
        try {
          // Row 1: 日期 (r[1] = "2026-05-08 17:58")
          const dateRaw = rows[1] && rows[1][1] ? String(rows[1][1]).trim() : '';
          let dateVal = '';
          if (dateRaw) {
            // 尝试解析日期时间字符串
            const datePart = dateRaw.replace(/\//g, '-').split(' ')[0];
            if (/\d{4}-\d{2}-\d{2}/.test(datePart)) {
              dateVal = datePart;
            }
          }

          // Row 2: 地图
          const mapRaw = rows[2] && rows[2][1] ? String(rows[2][1]).trim() : '';
          const mapName = mapRaw;

          // Row 4: 时长/时间
          const timeRaw = rows[4] && rows[4][1] ? String(rows[4][1]).trim() : '';

          // Row 6: UR得分
          const ourScore = rows[6] && rows[6][1] != null ? parseInt(rows[6][1]) || 0 : 0;
          // Row 7: 对手得分
          const theirScore = rows[7] && rows[7][1] != null ? parseInt(rows[7][1]) || 0 : 0;

          // 从 sheet 名解析对手: 0508_Mongolz.A_M1 → Mongolz.A
          const oppMatch = sheetName.match(/^\d{4}_(.+?)_M\d+$/);
          let opponent = oppMatch ? oppMatch[1].replace(/_/g, ' ') : sheetName;
          // 处理特殊 sheet 名（如 0525_overpass, 0519_Oasis Gaming）
          if (!oppMatch) {
            const altMatch = sheetName.match(/^\d{4}_(.+)$/);
            opponent = altMatch ? altMatch[1].replace(/_/g, ' ') : sheetName;
          }

          // 跳过没有有效日期或对手的 sheet
          if (!dateVal || !opponent) {
            results.errors.push(`${sheetName}: 缺少日期或对手信息，跳过`);
            continue;
          }
          // 数据完整性：跳过占位符对手名 / 无效地图名
          const BLOCKED_OPPONENTS = ['OPPONENT', 'match_data', 'MATCH_DATA', '未知', '___'];
          const BLOCKED_MAPS = ['', '地图', 'UR 队员统计'];
          if (BLOCKED_OPPONENTS.includes(opponent)) {
            results.errors.push(`${sheetName}: 对手名"${opponent}"为占位符，跳过`);
            continue;
          }
          if (!mapName || BLOCKED_MAPS.includes(mapName)) {
            results.errors.push(`${sheetName}: 地图名"${mapName}"无效，跳过`);
            continue;
          }

          // 检查是否已存在（UPSERT 逻辑）
          const [existing] = await db.query(
            "SELECT id FROM matches WHERE match_date = ? AND opponent = ? AND map_name = ? AND match_type = 'scrim'",
            [dateVal, opponent, mapName]
          );

          let matchId;
          if (existing.length > 0) {
            matchId = existing[0].id;
            await db.query(
              'UPDATE matches SET our_score = ?, their_score = ?, match_time = ? WHERE id = ?',
              [ourScore, theirScore, timeRaw || null, matchId]
            );
          } else {
            const [result] = await db.query(`
              INSERT INTO matches (match_date, match_time, opponent, map_name,
                our_score, their_score, match_type, bo_format, division)
              VALUES (?,?,?,?,?,?,'scrim',NULL,'cs2')`,
              [dateVal, timeRaw || null, opponent, mapName, ourScore, theirScore]
            );
            matchId = result.insertId;
          }

          // 选手统计解析
          const parsePlayerBlock = async (startRow, endRow) => {
            for (let ri = startRow; ri <= Math.min(endRow, rows.length - 1); ri++) {
              const r = rows[ri];
              if (!r || !r[1]) continue;
              const playerName = String(r[1]).trim();
              // 跳过合计、标题、空行、特殊标记
              if (!playerName || playerName === 'NaN' || playerName === '玩家ID' || playerName === '#') continue;
              if (String(r[0] || '').trim() === '合计') continue;

              const kills = parseInt(r[2]) || 0;
              const deaths = parseInt(r[3]) || 0;
              const adr = parseFloat(r[6]) || 0;
              const rating = parseFloat(r[7]) || 0;

              // 跳过无效选手名（纯数字等）
              if (/^\d+$/.test(playerName)) continue;

              // 查找选手（不自动创建，只匹配已在players表中的选手）
              let [players] = await db.query(
                "SELECT id FROM players WHERE nickname = ? AND division = 'cs2'", [playerName]
              );
              if (!players.length) {
                console.log(`[import-xlsx] 跳过未知选手: ${playerName}（不在players表中）`);
                continue;
              }
              const playerId = players[0].id;

              // 插入/更新选手统计
              const [existStat] = await db.query(
                'SELECT id FROM player_stats WHERE match_id = ? AND player_id = ?',
                [matchId, playerId]
              );
              if (existStat.length > 0) {
                await db.query(
                  'UPDATE player_stats SET kills = ?, deaths = ?, adr = ?, rating = ? WHERE id = ?',
                  [kills, deaths, adr, rating, existStat[0].id]
                );
              } else {
                await db.query(
                  'INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, rating) VALUES (?,?,?,?,?,?)',
                  [matchId, playerId, kills, deaths, adr, rating]
                );
              }
            }
          };

          // UR 选手: rows 12-16
          await parsePlayerBlock(12, 16);

          // 对手选手: 找到 "对手队员统计" 行后，下一行开始解析
          for (let ri = 18; ri < Math.min(rows.length, 27); ri++) {
            const r = rows[ri];
            if (r && r[0] && String(r[0]).includes('对手')) {
              await parsePlayerBlock(ri + 1, ri + 5);
              break;
            }
          }

          results.success++;
        } catch (e) {
          results.errors.push(`${sheetName}: ${e.message}`);
        }
      } else {
        // === 原始逐行解析（兼容旧格式） ===
        const matchType = sheetName.includes('训练') ? 'scrim' : 'official';

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[0] || !r[2]) continue;

          const dateStr = String(r[0]).trim();
          if (dateStr === '日期' || dateStr === '地图' || dateStr === 'UR位置' || dateStr === 'UR得分' || dateStr === '对手得分' || dateStr === '比赛ID' || dateStr === '时长') continue;
          if (dateStr.startsWith('#') || dateStr === '合计' || !/\d/.test(dateStr)) continue;
          if (r[1] && String(r[1]).trim() === 'NaN') continue;

          try {
            let dateVal = r[0];
            if (typeof dateVal === 'number') {
              dateVal = new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            } else {
              dateVal = String(dateVal).replace(/\//g, '-').split(' ')[0];
            }

            const [result] = await db.query(`
              INSERT INTO matches (match_date, match_time, opponent, event_name, map_name,
                our_score, their_score, t_score, ct_score, pistol_rounds, match_type, bo_format, division)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [dateVal, r[1]||null, r[2], r[3]||null, r[4]||null,
               parseInt(r[5])||0, parseInt(r[6])||0, parseInt(r[7])||0,
               parseInt(r[8])||0, r[9]||null, matchType, null, 'cs2']
            );
            const matchId = result.insertId;

            const playerCols = [
              { name: '0Z', start: 10 }, { name: 'doomer', start: 14 },
              { name: 'gLong', start: 18 }, { name: 'drace', start: 22 }, { name: '4ever', start: 26 }
            ];
            for (const p of playerCols) {
              if (r[p.start] == null) continue;
              const [players] = await db.query('SELECT id FROM players WHERE nickname = ?', [p.name]);
              if (!players.length) continue;
              await db.query(
                'INSERT INTO player_stats (match_id, player_id, kills, deaths, adr, rating) VALUES (?,?,?,?,?,?)',
                [matchId, players[0].id, parseInt(r[p.start])||0, parseInt(r[p.start+1])||0,
                 parseFloat(r[p.start+2])||0, parseFloat(r[p.start+3])||0]
              );
            }
            results.success++;
          } catch (e) { results.errors.push(`第${i+1}行: ${e.message}`); }
        }
      }
    }
    fs.unlinkSync(req.file.path);
    res.json({ message: `导入完成`, ...results });
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

module.exports = router;
