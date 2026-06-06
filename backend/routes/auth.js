const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// 注册
router.post('/register', async (req, res) => {
  const { username, password, steam_id } = req.body;
  if (!username || !password || !steam_id)
    return res.status(400).json({ error: '请填写所有字段' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password_hash, steam_id, role) VALUES (?, ?, ?, "pending")',
      [username, hash, steam_id]
    );
    res.json({ message: '注册成功，等待管理员审核' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '用户名或Steam ID已存在' });
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录 — 用户名 + 密码
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: '请输入用户名和密码' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).json({ error: '用户名或密码错误' });

    const user = rows[0];

    // 待审核账号禁止登录
    if (user.role === 'pending') return res.status(403).json({ error: '账号待审核，请联系管理员' });

    // 密码校验
    const validPwd = await bcrypt.compare(password, user.password_hash);
    if (!validPwd) return res.status(401).json({ error: '用户名或密码错误' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, division: user.division, steam_id: user.steam_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        steam_id: user.steam_id,
        role: user.role,
        division: user.division
      }
    });
  } catch {
    res.status(500).json({ error: '登录失败' });
  }
});

module.exports = router;
