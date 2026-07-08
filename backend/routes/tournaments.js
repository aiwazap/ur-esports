// ============================================================
// 赛事系统路由:赛事(tournaments) + 阶段(tournament_stages)
// 写法与 matches.js 一致:db.query 返回 [rows],SQLite 语法,adminAuth 认证
// ============================================================
const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────
// 赛事列表(所有人可看)
// 返回每个赛事 + 当前阶段名 + 该赛事比赛场次统计
// ─────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [tournaments] = await db.query(
      `SELECT * FROM tournaments ORDER BY 
         CASE WHEN is_finished = 0 THEN 0 ELSE 1 END,
         COALESCE(start_date, '9999') DESC, id DESC`
    );

    // 为每个赛事补充:当前阶段名、阶段数、比赛场次
    for (const t of tournaments) {
      // 当前阶段名
      let currentStageName = null;
      if (t.current_stage_id) {
        const [cs] = await db.query(
          'SELECT stage_name FROM tournament_stages WHERE id = ?', [t.current_stage_id]
        );
        currentStageName = cs.length ? cs[0].stage_name : null;
      }
      t.current_stage_name = currentStageName;

      // 阶段数
      const [stageCnt] = await db.query(
        'SELECT COUNT(*) c FROM tournament_stages WHERE tournament_id = ?', [t.id]
      );
      t.stage_count = stageCnt[0].c;

      // 该赛事正赛场次(按 日期+对手 算"场",这里简单给地图数)
      const [matchCnt] = await db.query(
        "SELECT COUNT(*) c FROM matches WHERE tournament_id = ? AND match_type = 'official'", [t.id]
      );
      t.match_map_count = matchCnt[0].c;
    }

    res.json(tournaments);
  } catch (e) {
    res.status(500).json({ error: '获取赛事列表失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 单个赛事详情:赛事信息 + 所有阶段 + 每阶段下的比赛(按阶段分组)
// ─────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  const tid = req.params.id;
  try {
    const [trows] = await db.query('SELECT * FROM tournaments WHERE id = ?', [tid]);
    if (!trows.length) return res.status(404).json({ error: '赛事不存在' });
    const tournament = trows[0];

    // 当前阶段名
    if (tournament.current_stage_id) {
      const [cs] = await db.query(
        'SELECT stage_name FROM tournament_stages WHERE id = ?', [tournament.current_stage_id]
      );
      tournament.current_stage_name = cs.length ? cs[0].stage_name : null;
    } else {
      tournament.current_stage_name = null;
    }

    // 所有阶段(按顺序)
    const [stages] = await db.query(
      'SELECT * FROM tournament_stages WHERE tournament_id = ? ORDER BY stage_order ASC, id ASC', [tid]
    );

    // 该赛事所有正赛比赛(按 日期+对手 分组成"场",每场含多张图)
    const [matchRows] = await db.query(
      `SELECT id, match_date, match_time, opponent, map_name, our_score, their_score,
              result, bo_format, stage_id, notes, is_walkover
       FROM matches
       WHERE tournament_id = ? AND match_type = 'official'
       ORDER BY match_date DESC, opponent, map_name`, [tid]
    );

    // 把比赛按 stage_id 分组,再在每个阶段内按 日期+对手 聚合成"场"
    const stageMap = {};
    for (const s of stages) stageMap[s.id] = { ...s, matches: [] };
    const noStage = { id: null, stage_name: '未分阶段', matches: [] };

    // 先按 日期+对手 聚合 maps
    const groupedByKey = {};
    for (const m of matchRows) {
      const dateStr = (m.match_date || '').split(' ')[0];
      const key = (m.stage_id || 'none') + '|' + dateStr + '|' + m.opponent;
      if (!groupedByKey[key]) {
        groupedByKey[key] = {
          stage_id: m.stage_id, match_date: dateStr, opponent: m.opponent,
          bo_format: m.bo_format, maps: []
        };
      }
      groupedByKey[key].maps.push({
        id: m.id, map_name: m.map_name, our_score: m.our_score,
        their_score: m.their_score, result: m.result, notes: m.notes,
        is_walkover: m.is_walkover
      });
    }
    // 分配到阶段
    for (const key in groupedByKey) {
      const g = groupedByKey[key];
      // 计算大比分(赢的图数:输的图数)
      const won = g.maps.filter(x => x.result === 'win').length;
      const lost = g.maps.filter(x => x.result === 'loss').length;
      g.series_score = won + ':' + lost;
      g.is_walkover = g.maps.some(x => x.is_walkover === 1 || x.is_walkover === true) ? 1 : 0;
      if (g.stage_id && stageMap[g.stage_id]) {
        stageMap[g.stage_id].matches.push(g);
      } else {
        noStage.matches.push(g);
      }
    }

    const stagesWithMatches = stages.map(s => stageMap[s.id]);
    if (noStage.matches.length) stagesWithMatches.push(noStage);

    res.json({ tournament, stages: stagesWithMatches });
  } catch (e) {
    res.status(500).json({ error: '获取赛事详情失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 新建赛事(管理员)
// ─────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  const { name, status, start_date, end_date, prize, organizer, logo_url, notes,
          bo_format, next_opponent, next_match_date, next_match_time, has_vrs } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '赛事名称必填' });
  try {
    const [result] = await db.query(
      `INSERT INTO tournaments (name, status, start_date, end_date, prize, organizer, logo_url, notes,
                                bo_format, next_opponent, next_match_date, next_match_time, has_vrs)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name.trim(), status || '报名中', start_date || null, end_date || null,
       prize || null, organizer || null, logo_url || null, notes || null,
       bo_format || 'BO1', next_opponent || null, next_match_date || null, next_match_time || null,
       has_vrs ? 1 : 0]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: '创建赛事失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 更新赛事(管理员):状态/赛果/名次/是否结束/当前阶段 等
// ─────────────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  const tid = req.params.id;
  const allowed = ['name','status','start_date','end_date','prize','organizer',
                   'logo_url','result','placement','is_finished','current_stage_id','notes',
                   'bo_format','next_opponent','next_match_date','next_match_time','has_vrs'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key] === '' ? null : req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '没有要更新的字段' });
  params.push(tid);
  try {
    await db.query(`UPDATE tournaments SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '更新赛事失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 删除赛事(管理员):删赛事+其阶段,关联比赛解绑(不删比赛,只清tournament_id/stage_id)
// ─────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  const tid = req.params.id;
  try {
    // 比赛解绑(保留比赛记录,只去掉赛事/阶段关联)
    await db.query(
      'UPDATE matches SET tournament_id = NULL, stage_id = NULL WHERE tournament_id = ?', [tid]
    );
    // 删阶段
    await db.query('DELETE FROM tournament_stages WHERE tournament_id = ?', [tid]);
    // 删赛事
    await db.query('DELETE FROM tournaments WHERE id = ?', [tid]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除赛事失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 给赛事添加阶段(管理员)
// ─────────────────────────────────────────────
router.post('/:id/stages', adminAuth, async (req, res) => {
  const tid = req.params.id;
  const { stage_name, stage_order, status, next_stage_time, notes, bo_format, bracket_type } = req.body;
  if (!stage_name || !stage_name.trim()) return res.status(400).json({ error: '阶段名必填' });
  try {
    // 默认 order = 当前最大 +1
    let order = stage_order;
    if (order == null) {
      const [mx] = await db.query(
        'SELECT COALESCE(MAX(stage_order), 0) m FROM tournament_stages WHERE tournament_id = ?', [tid]
      );
      order = mx[0].m + 1;
    }
    const [result] = await db.query(
      `INSERT INTO tournament_stages (tournament_id, stage_name, stage_order, status, next_stage_time, notes, bo_format, bracket_type)
       VALUES (?,?,?,?,?,?,?,?)`,
      [tid, stage_name.trim(), order, status || '未开始', next_stage_time || null, notes || null, bo_format || 'BO1', bracket_type || 'single']
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: '添加阶段失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 更新阶段(管理员)
// ─────────────────────────────────────────────
router.put('/stages/:stageId', adminAuth, async (req, res) => {
  const sid = req.params.stageId;
  const allowed = ['stage_name','stage_order','status','next_stage_time','notes','bo_format','bracket_type'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key] === '' ? null : req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '没有要更新的字段' });
  params.push(sid);
  try {
    await db.query(`UPDATE tournament_stages SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '更新阶段失败: ' + e.message });
  }
});

// ─────────────────────────────────────────────
// 删除阶段(管理员):该阶段下的比赛解绑 stage_id(保留比赛,仍属赛事)
// ─────────────────────────────────────────────
router.delete('/stages/:stageId', adminAuth, async (req, res) => {
  const sid = req.params.stageId;
  try {
    await db.query('UPDATE matches SET stage_id = NULL WHERE stage_id = ?', [sid]);
    // 如果有赛事把它当 current_stage,清掉
    await db.query('UPDATE tournaments SET current_stage_id = NULL WHERE current_stage_id = ?', [sid]);
    await db.query('DELETE FROM tournament_stages WHERE id = ?', [sid]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除阶段失败: ' + e.message });
  }
});

module.exports = router;
