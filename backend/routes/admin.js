const router = require('express').Router();
const db = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// 待审核用户列表
router.get('/pending-users', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, steam_id, created_at FROM users WHERE role='pending' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 审核通过
router.post('/approve-user/:id', adminAuth, async (req, res) => {
  try {
    await db.query(
      "UPDATE users SET role='player', approved_at=datetime('now','localtime'), approved_by=? WHERE id=?",
      [req.user.id, req.params.id]
    );
    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user.id, 'approve_user', `审核通过用户 ID=${req.params.id}`]
    );
    res.json({ message: '用户已审核通过' });
  } catch { res.status(500).json({ error: '操作失败' }); }
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

// 创建用户（管理员直接创建，可指定角色）
router.post('/create-user', adminAuth, async (req, res) => {
  const { username, password, steam_id, role, division } = req.body;
  if (!username || !password || !steam_id || !role)
    return res.status(400).json({ error: '请填写用户名、密码、Steam64 ID 和职位' });
  if (!['admin', 'player', 'coach', 'team_lead', 'analyst', 'manager', 'ceo', 'pending'].includes(role))
    return res.status(400).json({ error: '无效的职位' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, password_hash, steam_id, role, division, approved_at, approved_by) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?)",
      [username, hash, steam_id, role, division || 'cs2', req.user.id]
    );
    // 记录操作日志
    await db.query(
      'INSERT INTO operation_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user.id, 'create_user', `创建用户: ${username} | 职位: ${role}`]
    );
    res.json({ message: '用户创建成功' });
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return res.status(400).json({ error: '用户名或 Steam64 ID 已存在' });
    res.status(500).json({ error: '创建失败' });
  }
});

// 编辑用户
router.put('/user/:id', adminAuth, async (req, res) => {
  const { username, steam_id, role, division, password } = req.body;
  if (!username || !steam_id || !role)
    return res.status(400).json({ error: '用户名、Steam64 ID 和职位为必填项' });
  if (!['admin', 'player', 'coach', 'team_lead', 'analyst', 'manager', 'ceo', 'pending'].includes(role))
    return res.status(400).json({ error: '无效的职位' });
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE users SET username=?, steam_id=?, role=?, division=?, password_hash=? WHERE id=?',
        [username, steam_id, role, division || 'cs2', hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET username=?, steam_id=?, role=?, division=? WHERE id=?',
        [username, steam_id, role, division || 'cs2', req.params.id]
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
router.get('/upcoming', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM upcoming_matches ORDER BY match_date ASC'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 创建
router.post('/upcoming', adminAuth, async (req, res) => {
  const { match_date, match_time, opponent, event_name, match_type, bo_format, notes, division, location_type, source_link, stage, region } = req.body;
  if (!match_date || !opponent) return res.status(400).json({ error: '日期和对手为必填项' });
  try {
    await db.query(
      'INSERT INTO upcoming_matches (match_date,match_time,opponent,event_name,match_type,bo_format,notes,division,location_type,source_link,stage,region) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [match_date, match_time || null, opponent, event_name || null, match_type || 'official', bo_format || null, notes || null, division || 'cs2', location_type || 'online', source_link || null, stage || null, region || null]
    );
    await db.query(
      "INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'add_upcoming', ?)",
      [req.user.id, `添加赛事: ${opponent} | ${event_name || '未命名'}`]
    );
    res.json({ message: '赛事已添加' });
  } catch { res.status(500).json({ error: '添加失败' }); }
});

// 编辑
router.put('/upcoming/:id', adminAuth, async (req, res) => {
  const { match_date, match_time, opponent, event_name, match_type, bo_format, notes, division, location_type, source_link, stage, region } = req.body;
  if (!match_date || !opponent) return res.status(400).json({ error: '日期和对手为必填项' });
  try {
    await db.query(
      'UPDATE upcoming_matches SET match_date=?,match_time=?,opponent=?,event_name=?,match_type=?,bo_format=?,notes=?,division=?,location_type=?,source_link=?,stage=?,region=? WHERE id=?',
      [match_date, match_time || null, opponent, event_name || null, match_type || 'official', bo_format || null, notes || null, division || 'cs2', location_type || 'online', source_link || null, stage || null, region || null, req.params.id]
    );
    await db.query(
      "INSERT INTO operation_logs (user_id, action, details) VALUES (?, 'edit_upcoming', ?)",
      [req.user.id, `编辑赛事: ${opponent} | ${event_name || '未命名'}`]
    );
    res.json({ message: '赛事已更新' });
  } catch { res.status(500).json({ error: '更新失败' }); }
});

// 删除
router.delete('/upcoming/:id', adminAuth, async (req, res) => {
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

module.exports = router;
