/**
 * 私有档案页（任职事实记录）
 * - 路径不可猜、不入导航、不进前端公开包（页面文件在 backend/vault/，由本路由鉴权后吐出）
 * - 独立口令：与 admin 账号无关；口令哈希存 .env 的 VAULT_PASS_HASH
 * - 全程 noindex，且失败限流
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const PAGE = path.join(__dirname, '..', 'vault', 'index.html');
const COOKIE = 'vault_tk';

router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Cache-Control', 'no-store');
  next();
});

const gate = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, message: '尝试过于频繁，请 15 分钟后再试' });

function ok(req) {
  var raw = req.headers.cookie || '';
  var m = raw.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  try {
    var p = jwt.verify(decodeURIComponent(m[1]), process.env.JWT_SECRET);
    return p && p.scope === 'vault';
  } catch (e) { return false; }
}

const LOGIN_HTML = (err) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>·</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0C0B0A;color:#EDE7DD;font-family:"Microsoft YaHei",sans-serif;height:100vh;display:flex;align-items:center;justify-content:center}
form{display:flex;flex-direction:column;gap:14px;width:min(88vw,300px)}
input{background:transparent;border:1px solid #231F1A;color:#EDE7DD;padding:12px 14px;font-size:14px;outline:none;font-family:inherit}
input:focus{border-color:#E9A94D}
button{background:transparent;border:1px solid #E9A94D;color:#E9A94D;padding:11px;font-size:13px;letter-spacing:3px;cursor:pointer;font-family:inherit}
button:hover{background:rgba(233,169,77,.08)}
p{font-size:12px;color:#C9553D;min-height:16px}
</style></head><body>
<form method="POST" action="">
  <input type="password" name="pass" placeholder="口令" autofocus autocomplete="off">
  <button type="submit">进入</button>
  <p>${err || ''}</p>
</form></body></html>`;

router.get('/', (req, res) => {
  if (!ok(req)) return res.status(401).send(LOGIN_HTML(''));
  fs.readFile(PAGE, 'utf8', (e, html) => {
    if (e) return res.status(500).send('页面缺失');
    res.type('html').send(html);
  });
});

router.post('/', gate, express.urlencoded({ extended: false }), async (req, res) => {
  const hash = process.env.VAULT_PASS_HASH;
  if (!hash) return res.status(500).send(LOGIN_HTML('未配置口令'));
  const pass = (req.body && req.body.pass) || '';
  const pass_ok = await bcrypt.compare(pass, hash).catch(() => false);
  if (!pass_ok) return res.status(401).send(LOGIN_HTML('口令错误'));
  const tk = jwt.sign({ scope: 'vault' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.set('Set-Cookie', `${COOKIE}=${encodeURIComponent(tk)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`);
  res.redirect(req.originalUrl);
});

module.exports = router;
