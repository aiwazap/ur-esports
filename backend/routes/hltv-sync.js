/** HLTV 数据同步路由 — 调用 Python 爬虫同步 UR 战队比赛数据 */
const router = require('express').Router();
const { auth, adminAuth } = require('../middleware/auth');
const { execFile } = require('child_process');
const path = require('path');

// Python 可执行文件路径（使用 WorkBuddy 隔离环境）
const PYTHON = process.env.PYTHON_PATH || 'python';

router.post('/', adminAuth, async (req, res) => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'sync_hltv.py');
  
  const child = execFile(PYTHON, ['-u', scriptPath], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 5 * 60 * 1000, // 5分钟超时
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    if (code === 0) {
      try {
        const result = JSON.parse(stdout.split('\n').filter(l => l.trim().startsWith('{')).pop() || '{}');
        res.json({ ok: true, ...result });
      } catch {
        res.json({ ok: true, output: stdout.slice(-2000) });
      }
    } else {
      res.status(500).json({
        error: '同步失败',
        exitCode: code,
        stderr: stderr.slice(-1000),
        stdout: stdout.slice(-1000)
      });
    }
  });

  child.on('error', (err) => {
    res.status(500).json({ error: '启动 Python 失败: ' + err.message });
  });
});

// GET 查询上次同步状态
router.get('/status', auth, async (req, res) => {
  const db = require('../config/db');
  try {
    const [rows] = await db.query(
      "SELECT match_date, COUNT(*) as cnt FROM matches WHERE match_type='official' GROUP BY match_date ORDER BY match_date DESC LIMIT 5"
    );
    const [total] = await db.query(
      "SELECT COUNT(*) as cnt FROM matches WHERE match_type='official'"
    );
    res.json({
      official_matches: total[0]?.cnt || 0,
      recent: rows || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
