const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 编辑权限：管理层(admin) + 领队(team_lead) 可编辑即将开始赛事
const editorAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'team_lead')) return next();
    return res.status(403).json({ error: '需要管理员或领队权限' });
  });
};

// ── 启动自动补列：upcoming_matches 增加 报名方式/报名截止/对手排名 三字段（仅缺失时添加）──
(async () => {
  try {
    const [cols] = await db.query("PRAGMA table_info(upcoming_matches)");
    const have = (cols || []).map(c => c.name);
    for (const col of ['signup_method', 'signup_deadline', 'opponent_rank']) {
      if (!have.includes(col)) {
        await db.query(`ALTER TABLE upcoming_matches ADD COLUMN ${col} TEXT DEFAULT ''`);
        console.log(`[upcoming_matches] 已补列 ${col}`);
      }
    }
  } catch (e) { /* 表未就绪则忽略，下次启动重试 */ }
})();

// ── 图片上传配置 ──────────────────────────────────
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'match-images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `match_${ts}_${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

// 待审核用户列表
router.get('/pending-users', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, steam_id, division, applied_identity, created_at FROM users WHERE role='pending' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});


// 拒绝/删除用户
router.delete('/user/:id', adminAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id=? AND role!='admin'", [req.params.id]);
    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user.id, 'delete_user', `删除用户 ID=${req.params.id}`]
    );
    res.json({ message: '用户已删除' });
  } catch { res.status(500).json({ error: '操作失败' }); }
});

// 所有用户列表
router.get('/users', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, steam_id, role, division, created_at, approved_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 创建用户（管理员直接创建，可指定角色，steam_id 可选）
router.post('/create-user', adminAuth, async (req, res) => {
  const { username, password, steam_id, role, division } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: '请填写用户名、密码和职位' });
  if (!['admin', 'player', 'coach', 'team_lead', 'pending'].includes(role))
    return res.status(400).json({ error: '无效的职位' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const crypto = require('crypto');
    const finalSteamId = steam_id?.trim() || 'auto_' + crypto.randomUUID();
    await db.query(
      "INSERT INTO users (username, password_hash, steam_id, role, division, approved_at, approved_by) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?)",
      [username, hash, finalSteamId, role, division || 'cs2', req.user.id]
    );
    // 记录操作日志
    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user.id, 'create_user', `创建用户: ${username} | 职位: ${role}`]
    );
    res.json({ message: '用户创建成功' });
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: '创建失败' });
  }
});

// 编辑用户
router.put('/user/:id', adminAuth, async (req, res) => {
  const { username, steam_id, role, division, password } = req.body;
  if (!username || !role)
    return res.status(400).json({ error: '用户名和职位为必填项' });
  if (!['admin', 'player', 'coach', 'team_lead', 'pending'].includes(role))
    return res.status(400).json({ error: '无效的职位' });
  try {
    const finalSteamId = steam_id?.trim() || undefined;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE users SET username=?, steam_id=COALESCE(?, steam_id), role=?, division=?, password_hash=? WHERE id=?',
        [username, finalSteamId, role, division || 'cs2', hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET username=?, steam_id=COALESCE(?, steam_id), role=?, division=? WHERE id=?',
        [username, finalSteamId, role, division || 'cs2', req.params.id]
      );
    }
    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user.id, 'update_user', `编辑用户 ID=${req.params.id} → ${username} | 职位: ${role}`]
    );
    res.json({ message: '用户更新成功' });
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return res.status(400).json({ error: '用户名或 Steam64 ID 已被其他账号使用' });
    res.status(500).json({ error: '更新失败' });
  }
});

// ============================================================
// 即将赛事 — 完整 CRUD
// ============================================================

// 列表
router.get('/upcoming', editorAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM upcoming_matches ORDER BY match_date ASC'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 创建
router.post('/upcoming', editorAuth, async (req, res) => {
  const { match_date, match_time, opponent, event_name, match_type, bo_format, notes, division, location_type, source_link, stage, region, signup_method, signup_deadline, opponent_rank } = req.body;
  if (!match_date || !opponent) return res.status(400).json({ error: '日期和对手为必填项' });
  try {
    await db.query(
      'INSERT INTO upcoming_matches (match_date,match_time,opponent,event_name,match_type,bo_format,notes,division,signup_method,signup_deadline,opponent_rank) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [match_date, match_time || null, opponent, event_name || null, match_type || 'official', bo_format || null, notes || null, division || 'cs2', signup_method || null, signup_deadline || null, opponent_rank || null]
    );
    await db.query(
      "INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'add_upcoming', ?)",
      [req.user.id, `添加赛事: ${opponent} | ${event_name || '未命名'}`]
    );
    res.json({ message: '赛事已添加' });
  } catch { res.status(500).json({ error: '添加失败' }); }
});

// 编辑
router.put('/upcoming/:id', editorAuth, async (req, res) => {
  const { match_date, match_time, opponent, event_name, match_type, bo_format, notes, division, location_type, source_link, stage, region, signup_method, signup_deadline, opponent_rank } = req.body;
  if (!match_date || !opponent) return res.status(400).json({ error: '日期和对手为必填项' });
  try {
    await db.query(
      'UPDATE upcoming_matches SET match_date=?,match_time=?,opponent=?,event_name=?,match_type=?,bo_format=?,notes=?,division=?,signup_method=?,signup_deadline=?,opponent_rank=? WHERE id=?',
      [match_date, match_time || null, opponent, event_name || null, match_type || 'official', bo_format || null, notes || null, division || 'cs2', signup_method || null, signup_deadline || null, opponent_rank || null, req.params.id]
    );
    await db.query(
      "INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'edit_upcoming', ?)",
      [req.user.id, `编辑赛事: ${opponent} | ${event_name || '未命名'}`]
    );
    res.json({ message: '赛事已更新' });
  } catch { res.status(500).json({ error: '更新失败' }); }
});

// 删除
router.delete('/upcoming/:id', editorAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM upcoming_matches WHERE id=?', [req.params.id]);
    await db.query(
      "INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'delete_upcoming', ?)",
      [req.user.id, `删除赛事 ID=${req.params.id}`]
    );
    res.json({ message: '赛事已删除' });
  } catch { res.status(500).json({ error: '删除失败' }); }
});

// 赛事信息查询（从链接抓取）
router.post('/lookup-tournament', adminAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '请提供赛事链接' });
  try {
    const https = require('https');
    const http = require('http');
    const lib = url.startsWith('https') ? https : http;
    
    const result = await new Promise((resolve, reject) => {
      lib.get(url, { headers: { 'User-Agent': 'UR-Esports/2.0' }, timeout: 10000 }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          const titleMatch = data.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : '';
          // Extract og:title or other metadata
          const ogTitle = data.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
          const desc = data.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
          resolve({ title, ogTitle: ogTitle ? ogTitle[1] : null, description: desc ? desc[1] : null });
        });
        response.on('error', reject);
      }).on('error', reject).on('timeout', () => { reject(new Error('请求超时')); });
    });
    
    res.json({ 
      url,
      pageTitle: result.title,
      ogTitle: result.ogTitle,
      description: result.description,
      note: '请手动确认赛事名称、阶段和区域信息'
    });
  } catch (e) {
    res.status(500).json({ error: '抓取失败: ' + e.message });
  }
});

// 操作日志
router.get('/logs', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT l.*, u.username FROM operation_logs l LEFT JOIN users u ON l.user_id=u.id ORDER BY l.created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// ── 选手 ID 映射管理 ──
router.get('/player-id-mappings', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.id, m.game_id, m.player_id, m.created_at, p.nickname, p.steam_id
       FROM player_id_mappings m
       JOIN players p ON m.player_id = p.id
       ORDER BY p.nickname, m.game_id`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '获取映射列表失败: ' + e.message });
  }
});

router.post('/player-id-mappings', adminAuth, async (req, res) => {
  try {
    const { player_id, game_id } = req.body;
    if (!player_id || !game_id) return res.status(400).json({ error: 'player_id 和 game_id 为必填' });

    const [existing] = await db.query(
      'SELECT id FROM player_id_mappings WHERE player_id = ? AND game_id = ?',
      [player_id, game_id.trim()]
    );
    if (existing.length > 0) return res.status(409).json({ error: '该映射已存在' });

    const result = await db.query(
      'INSERT INTO player_id_mappings (player_id, game_id) VALUES (?, ?)',
      [player_id, game_id.trim()]
    );

    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user?.id || 0, 'add_player_mapping', `player_id=${player_id}, game_id=${game_id}`]
    );

    res.status(201).json({ id: result[0].insertId, message: '映射添加成功' });
  } catch (e) {
    res.status(500).json({ error: '添加映射失败: ' + e.message });
  }
});

router.delete('/player-id-mappings/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM player_id_mappings WHERE id = ?', [id]);

    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user?.id || 0, 'delete_player_mapping', `id=${id}`]
    );

    res.json({ message: '映射已删除' });
  } catch (e) {
    res.status(500).json({ error: '删除映射失败: ' + e.message });
  }
});

router.post('/player-id-mappings/seed', adminAuth, async (req, res) => {
  try {
    const [players] = await db.query('SELECT id, nickname, steam_id FROM players WHERE steam_id IS NOT NULL AND steam_id != \'\'');
    let count = 0;
    for (const p of players) {
      try {
        await db.query(
          'INSERT OR IGNORE INTO player_id_mappings (player_id, game_id) VALUES (?, ?)',
          [p.id, p.steam_id]
        );
        count++;
      } catch { /* skip duplicates */ }
    }
    res.json({ message: `已从 ${players.length} 名选手初始化 ${count} 条映射` });
  } catch (e) {
    res.status(500).json({ error: '初始化失败: ' + e.message });
  }
});

// ════════════════════════════════════════════════════════════
// event_details：赛事详情富内容（基本信息/时间轴/规则/领队清单），一个赛事一行
// 富内容字段均以 JSON 字符串存储，前端读时 JSON.parse、存时 JSON.stringify
// ════════════════════════════════════════════════════════════
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_details (
        event_id   INTEGER PRIMARY KEY,
        basic_info TEXT DEFAULT '',
        timeline   TEXT DEFAULT '',
        rules      TEXT DEFAULT '',
        checklist  TEXT DEFAULT '',
        updated_by TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
  } catch (e) { console.error('[event_details] 建表失败:', e.message); }
})();

// 取某赛事的详情富内容（登录即可查看；无记录则返回空结构）
router.get('/event-details/:eventId', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM event_details WHERE event_id = ?', [req.params.eventId]);
    if (!rows.length) {
      return res.json({ event_id: Number(req.params.eventId), basic_info: '', timeline: '', rules: '', checklist: '', updated_by: '', updated_at: null });
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 保存某赛事的详情富内容（admin + team_lead）—— 不存在则插入，存在则更新
router.put('/event-details/:eventId', editorAuth, async (req, res) => {
  try {
    const eid = Number(req.params.eventId);
    const toStr = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
    const basic_info = toStr(req.body.basic_info);
    const timeline   = toStr(req.body.timeline);
    const rules      = toStr(req.body.rules);
    const checklist  = toStr(req.body.checklist);
    const by = (req.user && (req.user.username || req.user.name)) || '';
    const [exist] = await db.query('SELECT event_id FROM event_details WHERE event_id = ?', [eid]);
    if (exist.length) {
      await db.query(
        `UPDATE event_details SET basic_info=?, timeline=?, rules=?, checklist=?, updated_by=?, updated_at=datetime('now','localtime') WHERE event_id=?`,
        [basic_info, timeline, rules, checklist, by, eid]
      );
    } else {
      await db.query(
        `INSERT INTO event_details (event_id, basic_info, timeline, rules, checklist, updated_by) VALUES (?,?,?,?,?,?)`,
        [eid, basic_info, timeline, rules, checklist, by]
      );
    }
    res.json({ message: '赛事详情已保存' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
// 赛事信息「智能分拣」：粘贴一段杂乱文本 → Claude 解析为结构化字段 →
// 直接创建赛事(upcoming_matches) + 富内容(event_details)，返回新赛事 id。
// 依赖后端环境变量 ANTHROPIC_API_KEY（console.anthropic.com 的 API Key，sk-ant-...）
// ════════════════════════════════════════════════════════════
router.post('/parse-and-create-event', editorAuth, async (req, res) => {
  const text = ((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: '请粘贴赛事信息文本' });
  const KEY  = process.env.QWEN_VL_KEY;
  const BASE = process.env.QWEN_VL_BASE;
  const MODEL = process.env.QWEN_VL_MODEL || 'qwen3.7-plus';
  if (!KEY || !BASE) return res.status(400).json({ error: '后端未配置 QWEN_VL_KEY / QWEN_VL_BASE，请在 backend/.env 里配置后重启后端' });
  if (typeof fetch !== 'function') return res.status(500).json({ error: '当前 Node 版本过低（需 18+）不支持 fetch，请升级 Node' });

  const PROMPT = '你是赛事信息整理助手。下面是一段关于某 CS2 电竞赛事的杂乱文本，请整理成结构化 JSON。\n' +
    '严格只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块标记。结构如下：\n' +
    '{\n' +
    '  "basic": {\n' +
    '    "event_name": "赛事名称",\n' +
    '    "opponent": "对手战队名，未知填 TBA",\n' +
    '    "match_date": "YYYY-MM-DD，找不到留空字符串",\n' +
    '    "match_time": "HH:MM 24小时制，找不到留空字符串",\n' +
    '    "bo_format": "BO1/BO3/BO5 之一，找不到填 BO1",\n' +
    '    "division": "cs2",\n' +
    '    "opponent_rank": "对手排名数字，找不到留空字符串",\n' +
    '    "signup_method": "报名方式，找不到留空字符串",\n' +
    '    "signup_deadline": "报名截止 YYYY-MM-DD，找不到留空字符串",\n' +
    '    "notes": "其它备注一句话，找不到留空字符串"\n' +
    '  },\n' +
    '  "detail": {\n' +
    '    "basic_info": { "items": [{"label":"赛制格式","value":""},{"label":"比赛方式","value":""},{"label":"地图池","value":""},{"label":"总奖金池","value":""}], "warn": "" },\n' +
    '    "timeline": [{"name":"阶段名","date":"日期","detail":"线上/线下、赛制等","status":"idle"}],\n' +
    '    "rules": [{"title":"规则分组标题","items":["规则条目1","规则条目2"]}],\n' +
    '    "checklist": [{"text":"准备项","priority":"p1","checked":false}]\n' +
    '  }\n' +
    '}\n' +
    '规则：timeline 的 status 一律填 "idle"；checklist 的 priority 用 p0(紧急)/p1(重要)/p2(一般)、checked 一律 false；' +
    '找不到的字段留空字符串或空数组，不要编造；只输出 JSON。\n文本：\n---\n' + text;

  try {
    const resp = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: PROMPT }] }),
    });
    if (!resp.ok) {
      const errTxt = await resp.text();
      return res.status(502).json({ error: 'Claude API 调用失败（HTTP ' + resp.status + '）：' + errTxt.slice(0, 300) });
    }
    const data = await resp.json();
    let out = (data.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('').trim();
    out = out.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(out); }
    catch (pe) { return res.status(422).json({ error: 'AI 返回内容无法解析为 JSON，请重试', raw: out.slice(0, 500) }); }

    const b = parsed.basic || {};
    const d = parsed.detail || {};
    const by = (req.user && (req.user.username || req.user.name)) || 'AI分拣';
    const detailVals = (eid) => [eid, JSON.stringify(d.basic_info || {}), JSON.stringify(d.timeline || []), JSON.stringify(d.rules || []), JSON.stringify(d.checklist || []), by];
    const targetId = req.body && req.body.targetId ? Number(req.body.targetId) : null;

    // 模式一：填充到已存在的赛事 —— 只写富内容，不动赛事基本字段
    if (targetId) {
      const [ex] = await db.query('SELECT event_id FROM event_details WHERE event_id = ?', [targetId]);
      if (ex.length) {
        await db.query("UPDATE event_details SET basic_info=?, timeline=?, rules=?, checklist=?, updated_by=?, updated_at=datetime('now','localtime') WHERE event_id=?",
          [JSON.stringify(d.basic_info || {}), JSON.stringify(d.timeline || []), JSON.stringify(d.rules || []), JSON.stringify(d.checklist || []), by, targetId]);
      } else {
        await db.query('INSERT INTO event_details (event_id, basic_info, timeline, rules, checklist, updated_by) VALUES (?,?,?,?,?,?)', detailVals(targetId));
      }
      await db.query("INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'ai_parse_event', ?)", [req.user.id, 'AI分拣填充赛事详情 #' + targetId]);
      return res.json({ created: false, filled: true, id: targetId });
    }

    // 模式二：创建为新赛事 + 富内容
    if (!b.match_date && !b.opponent) {
      return res.json({ created: false, parsed, note: '未识别到日期/对手，未自动创建（可改用"填充到现有赛事"）' });
    }
    await db.query(
      'INSERT INTO upcoming_matches (match_date,match_time,opponent,event_name,match_type,bo_format,notes,division,signup_method,signup_deadline,opponent_rank) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [b.match_date || null, b.match_time || null, b.opponent || 'TBA', b.event_name || null, 'official', b.bo_format || 'BO1', b.notes || null, b.division || 'cs2', b.signup_method || null, b.signup_deadline || null, b.opponent_rank || null]
    );
    const [idRows] = await db.query('SELECT last_insert_rowid() AS id');
    const newId = (idRows && idRows[0] && idRows[0].id) || null;
    await db.query('INSERT INTO event_details (event_id, basic_info, timeline, rules, checklist, updated_by) VALUES (?,?,?,?,?,?)', detailVals(newId));
    await db.query("INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'ai_parse_event', ?)",
      [req.user.id, 'AI分拣创建赛事: ' + (b.opponent || 'TBA') + ' | ' + (b.event_name || '未命名')]);
    res.json({ created: true, id: newId, event_name: b.event_name || '未命名', opponent: b.opponent || 'TBA' });
  } catch (e) {
    res.status(500).json({ error: '分拣失败：' + e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  POST /ocr-match-image — AI视觉识别记分板截图，提取选手数据
//  仅返回结构化数据供前端填入手动录入表单（不直接写库，用户核对后再录入）
// ════════════════════════════════════════════════════════════
router.post('/ocr-match-image', adminAuth, imageUpload.single('image'), async (req, res) => {
  const KEY  = process.env.QWEN_VL_KEY;
  const BASE = process.env.QWEN_VL_BASE;
  const MODEL = process.env.QWEN_VL_MODEL || 'qwen3.7-plus';
  if (!KEY || !BASE) return res.status(400).json({ error: '后端未配置 QWEN_VL_KEY / QWEN_VL_BASE，请在 backend/.env 里配置后重启后端' });
  if (typeof fetch !== 'function') return res.status(500).json({ error: '当前 Node 版本过低（需 18+）不支持 fetch' });
  if (!req.file) return res.status(400).json({ error: '请上传记分板截图' });

  try {
    // 现役花名册昵称，辅助 AI 判断哪队是 UR（我方）
    const [roster] = await db.query(
      "SELECT id, nickname, id_5e, id_pw, id_faceit_sea, id_faceit_eu FROM players WHERE division='cs2' AND status='active' AND team_type='roster'"
    );
    const rosterNames = roster.flatMap(r => [r.nickname, r.id_5e, r.id_pw, r.id_faceit_sea, r.id_faceit_eu]).filter(n => n && String(n).trim());

    const imgBuffer = fs.readFileSync(req.file.path);
    const base64 = imgBuffer.toString('base64');
    let mediaType = (req.file.mimetype || 'image/png').toLowerCase();
    if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mediaType)) mediaType = 'image/png';

    const PROMPT =
      '这是一张 CS2（CS:GO）比赛结算记分板截图。请识别截图中两支队伍每名选手的数据。\n' +
      '我方战队 UR 的选手游戏名通常在以下列表中（大小写或细节可能略有差异）：' + (rosterNames.join('、') || '（未知）') + '。\n' +
      '请判断哪一队是 UR（我方）、哪一队是对手，并提取每名选手的：击杀(kills)、死亡(deaths)、助攻(assists)、ADR(adr)、Rating(rating，结算页评分小数)。\n' +
      '严格只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块标记。结构：\n' +
      '{\n' +
      '  "our_score": 我方总比分数字或 null,\n' +
      '  "their_score": 对方总比分数字或 null,\n' +
      '  "ur_players": [{"name":"游戏名","kills":数字,"deaths":数字,"assists":数字,"adr":数字,"rating":数字}],\n' +
      '  "opp_players": [{"name":"游戏名","kills":数字,"deaths":数字,"assists":数字,"adr":数字,"rating":数字}]\n' +
      '}\n' +
      '某项识别不到则填 null。ur_players 为我方选手（通常 5 人），opp_players 为对方选手。只输出 JSON。';

    const resp = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const errTxt = await resp.text();
      return res.status(502).json({ error: 'AI 识别失败（HTTP ' + resp.status + '）：' + errTxt.slice(0, 300) });
    }
    const data = await resp.json();
    let out = (data.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('').trim();
    out = out.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(out); }
    catch (pe) { return res.status(422).json({ error: 'AI 返回内容无法解析，请重试或换张更清晰的截图', raw: out.slice(0, 400) }); }

    const norm = s => String(s || '').toLowerCase().replace(/[\s_]/g, '');
    const byNick = {};
    roster.forEach(r => { [r.nickname, r.id_5e, r.id_pw, r.id_faceit_sea, r.id_faceit_eu].forEach(n => { const k = norm(n); if (k) byNick[k] = r.id; }); });
    const cell = v => (v === null || v === undefined || v === '') ? '' : v;
    const ur = (parsed.ur_players || []).map(p => ({
      player_id: byNick[norm(p.name)] ? String(byNick[norm(p.name)]) : '',
      name: p.name || '',
      kills: cell(p.kills), deaths: cell(p.deaths), assists: cell(p.assists),
      adr: cell(p.adr), rating: cell(p.rating),
    }));
    const opp = (parsed.opp_players || []).map(p => ({
      name: p.name || '',
      kills: cell(p.kills), deaths: cell(p.deaths), assists: cell(p.assists),
      adr: cell(p.adr), rating: cell(p.rating),
    }));

    await db.query("INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'ocr_match_image', ?)",
      [req.user?.id || 0, `识别截图：我方${ur.length}人/对方${opp.length}人`]).catch(() => {});

    res.json({
      success: true,
      our_score: parsed.our_score ?? null,
      their_score: parsed.their_score ?? null,
      ur_players: ur,
      opp_players: opp,
      matched: ur.filter(p => p.player_id).length,
    });
  } catch (e) {
    res.status(500).json({ error: '识别失败：' + e.message });
  } finally {
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
  }
});

// ═══ 地图池配置 (r37): settings 表存储 {active:[], firstBan} ═══
async function ensureSettings() {
  await db.query("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now','localtime')))");
}
router.get('/map-pool', auth, async (req, res) => {
  try {
    await ensureSettings();
    const [[row]] = await db.query("SELECT value FROM settings WHERE key='map_pool'");
    res.json(row ? JSON.parse(row.value) : { active: null, firstBan: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/map-pool', adminAuth, async (req, res) => {
  try {
    await ensureSettings();
    const active = Array.isArray(req.body.active) ? req.body.active : [];
    const firstBan = req.body.firstBan || null;
    await db.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ('map_pool',?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      [JSON.stringify({ active, firstBan })]
    );
    await db.query("INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'map_pool_update', ?)",
      [req.user?.id || 0, `服役${active.length}图, 首Ban:${firstBan || '无'}`]).catch(() => {});
    res.json({ message: '已保存' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ 岗位职责 (r55): settings 表存储 {items:[...]}，教练/领队/管理员可写 ═══
router.get('/duties', auth, async (req, res) => {
  try {
    await ensureSettings();
    const [[row]] = await db.query("SELECT value, updated_at FROM settings WHERE key='duties'");
    if (!row) return res.json(null);
    const parsed = JSON.parse(row.value);
    res.json({ items: Array.isArray(parsed.items) ? parsed.items : [], updated_at: row.updated_at });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/duties', auth, async (req, res) => {
  try {
    if (!['admin', 'coach', 'team_lead'].includes(req.user?.role)) {
      return res.status(403).json({ error: '仅教练/领队/管理员可编辑岗位职责' });
    }
    await ensureSettings();
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    await db.query(
      "INSERT INTO settings (key,value,updated_at) VALUES ('duties',?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      [JSON.stringify({ items })]
    );
    const [[row]] = await db.query("SELECT updated_at FROM settings WHERE key='duties'");
    res.json({ message: '已保存', updated_at: row ? row.updated_at : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
