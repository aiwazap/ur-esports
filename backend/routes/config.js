const router = require('express').Router();
const { auth, adminAuth } = require('../middleware/auth');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ENV_PATH = path.join(__dirname, '..', '.env');

// 读取 .env 中指定 key 的值
function readEnvKey(key) {
  if (!fs.existsSync(ENV_PATH)) return '';
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const match = content.match(new RegExp('^' + key + '=(.*)', 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

// 写入 .env 中指定 key 的值
function writeEnvKey(key, value) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  }

  const escaped = value.includes(' ') ? '"' + value + '"' : value;
  const regex = new RegExp('^' + key + '=.*', 'm');

  if (content.match(regex)) {
    content = content.replace(regex, key + '=' + escaped);
  } else {
    content = content.trimEnd() + '\n' + key + '=' + escaped + '\n';
  }

  fs.writeFileSync(ENV_PATH, content, 'utf-8');
  // 同时更新 process.env
  process.env[key] = value;
}

// GET 获取配置
router.get('/data-dir', auth, async (req, res) => {
  const dir = readEnvKey('DATA_DIR') || '';
  const exists = dir ? fs.existsSync(dir) : false;
  res.json({ dataDir: dir, exists });
});

// POST 保存配置
router.post('/data-dir', adminAuth, async (req, res) => {
  const { dataDir } = req.body;
  if (!dataDir || typeof dataDir !== 'string') {
    return res.status(400).json({ error: '请提供有效的文件夹路径' });
  }

  const trimmed = dataDir.trim();

  // 检查文件夹是否存在
  if (!fs.existsSync(trimmed)) {
    return res.status(400).json({ error: `文件夹不存在: ${trimmed}` });
  }

  if (!fs.statSync(trimmed).isDirectory()) {
    return res.status(400).json({ error: '路径不是一个文件夹' });
  }

  writeEnvKey('DATA_DIR', trimmed);
  res.json({ dataDir: trimmed, message: '路径已保存' });
});

// ── System Config CRUD ──

// GET /api/config/system — 获取所有系统配置
router.get('/system', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM system_config ORDER BY config_key');
    const config = {};
    rows.forEach(r => { config[r.config_key] = r.config_value; });
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config/system — 批量更新系统配置
router.put('/system', adminAuth, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db.query(
        `INSERT INTO system_config (config_key, config_value, updated_at)
         VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
         updated_at = datetime('now','localtime')`,
        [key, String(value)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VRS Ranking ──

// GET /api/config/vrs-rank — 获取 VRS Asia 排名 (缓存值)
router.get('/vrs-rank', auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT config_value FROM system_config WHERE config_key = 'vrs_rank'");
    const cachedRank = rows[0]?.config_value || '—';
    res.json({ rank: parseInt(cachedRank) || 0, cached: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/config/vrs-rank — 手动更新 VRS 排名
router.post('/vrs-rank', adminAuth, async (req, res) => {
  try {
    const { rank } = req.body;
    await db.query(
      `INSERT INTO system_config (config_key, config_value, updated_at)
       VALUES ('vrs_rank', ?, datetime('now','localtime'))
       ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
       updated_at = datetime('now','localtime')`,
      [String(rank)]
    );
    res.json({ rank: parseInt(rank), success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
