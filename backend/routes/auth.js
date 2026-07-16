const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

// 注册 — 用户名 + 密码 + 身份类型
// identity: 'player' → 直接生效可登录
// identity: 'coach'/'team_lead' → pending，需管理员审核分配角色
router.post('/register', async (req, res) => {
  return res.status(403).json({ error: '公开注册已关闭，请联系管理员开通账号' });
  const { username, password, identity } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: '请输入用户名和密码' });
  if (username.length < 2)
    return res.status(400).json({ error: '用户名至少2个字符' });
  if (password.length < 6)
    return res.status(400).json({ error: '密码至少6位' });
  const validIdentities = ['player', 'coach', 'team_lead'];
  if (!validIdentities.includes(identity))
    return res.status(400).json({ error: '无效的身份类型' });

  // 选手直接生效，教练/领队需审核
  const isDirect = identity === 'player';
  const role = isDirect ? 'player' : 'pending';

  try {
    const hash = await bcrypt.hash(password, 10);
    const placeholderSteamId = 'auto_' + crypto.randomUUID();
    // division 是"分部"字段（CHECK 只允许 cs2/val/all），此前把 identity 写进这里必然触发
    // CHECK 约束失败、导致注册 INSERT 直接报错。现在 division 固定写 cs2（本站为 CS2 分部），
    // identity（申请身份）改存 applied_identity，供审核时参考。
    await db.query(
      "INSERT INTO users (username, password_hash, steam_id, role, division, applied_identity) VALUES (?, ?, ?, ?, ?, ?)",
      [username, hash, placeholderSteamId, role, 'cs2', identity]
    );
    if (isDirect) {
      res.json({ message: '注册成功，可直接登录', direct: true });
    } else {
      res.json({ message: '注册成功，等待管理员审核分配权限', direct: false });
    }
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
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
  } catch (e) {
    res.status(500).json({ error: '登录失败' });
  }
});

// 【2026-07-15 已移除游客登录】
// 原 POST /guest 会给任何匿名请求签发只读令牌，等同于对全世界敞开只读入口。
// 华哥要求网站转为「仅 admin 与郑蔼平可访问」，故删除该接口。
// 历史 guest 令牌（12 小时有效期内）的拒绝在 middleware/auth.js 统一处理——
// 那里是所有受保护接口的必经关卡，放这里只能拦住 /api/auth/* 会漏。

module.exports = router;
