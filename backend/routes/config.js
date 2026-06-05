const router = require('express').Router();
const { auth, adminAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

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

module.exports = router;
