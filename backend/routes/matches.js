const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: 'uploads/tmp/' });

// 获取赛果列表 - 按训练赛分组
router.get('/grouped', auth, async (req, res) => {
  const { days } = req.query;
  const dayFilter = days ? `AND m.match_date >= DATE('now', '-${parseInt(days)} days')` : '';
  try {
    const [rows] = await db.query(`
      SELECT m.id, m.match_date, m.opponent, m.map_name, m.our_score, m.their_score,
             m.t_score, m.ct_score, m.pistol_rounds, m.result, m.notes, m.match_type
      FROM matches m
      WHERE m.division = 'cs2' AND m.match_type = 'scrim' ${dayFilter}
      ORDER BY m.match_date DESC, m.opponent, m.map_name
    `);
    // Group by opponent + date
    const groups = [];
    let current = null;
    for (const r of rows) {
      const dateStr = (r.match_date || '').split(' ')[0];
      const key = dateStr + '|' + r.opponent;
      if (!current || current.key !== key) {
        if (current) groups.push(current);
        current = { match_date: dateStr, opponent: r.opponent, key, maps: [] };
      }
      current.maps.push({
        id: r.id, map_name: r.map_name, our_score: r.our_score, their_score: r.their_score,
        t_score: r.t_score || 0, ct_score: r.ct_score || 0,
        pistol_rounds: r.pistol_rounds || '', result: r.result, notes: r.notes
      });
    }
    if (current) groups.push(current);
    res.json(groups);
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
