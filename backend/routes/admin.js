const router = require('express').Router();
const db = require('../config/db');
const { adminAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// 待审核用户列表
router.get('/pending-users', adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, steam_id, created_at FROM users WHERE role="pending" ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch { res.status(500).json({ error: '获取失败' }); }
});

// 审核通过
router.post('/approve-user/:id', adminAuth, async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET role="player", approved_at=NOW(), approved_by=? WHERE id=?',
      [req.user.id, req.params.id]
    );
    res.json({ message: '用户已审核通过' });
  } catch { res.status(500).json({ error: '操作失败' }); }
});

// 拒绝/删除用户
router.delete('/user/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id=? AND role!="admin"', [req.params.id]);
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

// 添加即将赛事
router.post('/upcoming', adminAuth, async (req, res) => {
  const { match_date, match_time, opponent, event_name, match_type, bo_format, notes } = req.body;
  try {
    await db.query(
      'INSERT INTO upcoming_matches (match_date,match_time,opponent,event_name,match_type,bo_format,notes,division) VALUES (?,?,?,?,?,?,?,?)',
      [match_date, match_time, opponent, event_name, match_type||'official', bo_format, notes, 'cs2']
    );
    res.json({ message: '赛事已添加' });
  } catch { res.status(500).json({ error: '添加失败' }); }
});

// 删除赛事
router.delete('/match/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM matches WHERE id=?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch { res.status(500).json({ error: '删除失败' }); }
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
