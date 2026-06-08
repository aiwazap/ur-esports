import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TOKEN = process.env.GH_TOKEN || '';
const OWNER = 'aiwazap';
const REPO = 'ur-esports';
const BASE = 'E:/ur-esports/ur-esports-deploy';

// Updated files to push
const CHANGED_FILES = [
  'frontend/src/pages/Login.jsx',
  'backend/routes/auth.js',
];

async function gh(path, method = 'GET', body = null) {
  const opts = { method, headers: {
    'Authorization': `token ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }};
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.github.com${path}`, opts);
  if (!res.ok) { const t = await res.text(); throw new Error(`${method} ${path} → ${res.status}: ${t.slice(0,300)}`); }
  return res.status === 204 ? null : res.json();
}

async function main() {
  if (!TOKEN) throw new Error('GH_TOKEN not set');

  // Get current head commit and tree
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const parentCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${ref.object.sha}`);
  const parentTreeSha = parentCommit.tree.sha;

  // Create blobs for changed files
  const entries = [];
  for (const file of CHANGED_FILES) {
    const content = readFileSync(join(BASE, file));
    const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
      content: content.toString('utf-8'),
      encoding: 'utf-8',
    });
    entries.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  ✓ ${file}`);
  }

  // Create tree (with parent)
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, 'POST', {
    base_tree: parentTreeSha,
    tree: entries,
  });

  // Create commit
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, 'POST', {
    message: '🔧 登录简化：移除 Steam64 ID 和职位字段，只需用户名+密码',
    tree: tree.sha,
    parents: [ref.object.sha],
  });

  // Update ref
  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, 'PATCH', {
    sha: commit.sha,
  });

  console.log(`\n✅ 推送完成: ${commit.sha.slice(0,7)}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
