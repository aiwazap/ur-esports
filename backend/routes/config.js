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

// GET /api/config/vrs-rank — 获取 VRS Asia 排名 (尝试抓取 HLTV)
router.get('/vrs-rank', auth, async (req, res) => {
  try {
    const rank = await fetchVRSRank();
    res.json({ rank });
  } catch (err) {
    // 抓取失败时返回缓存值
    const [rows] = await db.query("SELECT config_value FROM system_config WHERE config_key = 'vrs_rank'");
    const cachedRank = rows[0]?.config_value || '—';
    res.json({ rank: parseInt(cachedRank) || 0, cached: true, error: err.message });
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

// 抓取 HLTV VRS Asia 排名
async function fetchVRSRank() {
  return new Promise((resolve, reject) => {
    const url = 'https://www.hltv.org/valve-ranking/teams/2026/june/7/region/Asia';
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
      timeout: 10000,
    };

    https.get(url, options, (response) => {
      // HLTV 通常返回 403 或 Cloudflare 挑战
      if (response.statusCode !== 200) {
        reject(new Error(`HLTV returned ${response.statusCode}`));
        return;
      }

      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        // 尝试从 HTML 中提取 UR 的排名
        // HLTV 排名页面结构: 表格中的行包含队名和排名
        const urRegex = /<span[^>]*class="[^"]*team-name[^"]*"[^>]*>UR<\/span>/i;
        if (urRegex.test(body)) {
          // 如果找到 UR，尝试提取排名数字
          // 简化处理：查找 "#XX" 模式
          const rankRegex = />#(\d+)</;
          // 实际上需要更复杂的解析，暂时从 body 中找 UR 附近的 ranking 数字
          const idx = body.search(/UR/i);
          if (idx > 0) {
            const snippet = body.substring(Math.max(0, idx - 200), idx + 100);
            const rankMatch = snippet.match(/#(\d+)/);
            if (rankMatch) {
              const rank = parseInt(rankMatch[1]);
              // 缓存到数据库
              const db_ = db;
              db_.query(
                `INSERT INTO system_config (config_key, config_value, updated_at)
                 VALUES ('vrs_rank', ?, datetime('now','localtime'))
                 ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value,
                 updated_at = datetime('now','localtime')`,
                [String(rank)]
              ).catch(() => {});
              resolve(rank);
              return;
            }
          }
        }
        reject(new Error('Could not find UR in HLTV ranking page'));
      });
    }).on('error', reject).on('timeout', () => {
      reject(new Error('HLTV request timeout'));
    });
  });
}

module.exports = router;
