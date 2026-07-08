import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import './users-v2.css';

/* ════════════════════════════════════════════════════════════════
   用户管理 v2（r53）· design 高保真
   接口与载荷与原版逐字一致：GET /admin/users + /admin/pending-users
   POST /admin/create-user · PUT /admin/user/:id · DELETE /admin/user/:id
   角色口径：admin / player / coach / team_lead / pending（无 staff）
   待审核统一走「编辑」弹窗选角色（无一键审核）
   ════════════════════════════════════════════════════════════════ */

const ROLE_MAP = { admin: '管理员', player: '选手', coach: '教练', team_lead: '领队', pending: '待审核' };
const ROLE_CLS = { admin: 'uv2-role-admin', player: 'uv2-role-player', coach: 'uv2-role-coach', team_lead: 'uv2-role-lead', pending: 'uv2-role-pending' };
const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a855f7', '#38bdf8'];
const avatarColor = (name) => AVATAR_COLORS[(String(name).charCodeAt(0) || 0) % AVATAR_COLORS.length];

const EMPTY_FORM = { username: '', password: '', steam_id: '', role: 'player', division: 'cs2' };

function UserFormModal({ mode, init, onClose, onSave, error }) {
  const isCreate = mode === 'create';
  const [f, setF] = useState(
    !isCreate && init
      ? { username: init.username, steam_id: init.steam_id, role: init.role, division: init.division || 'cs2', password: '' }
      : { ...EMPTY_FORM }
  );
  const submit = () => {
    if (!f.username || !f.steam_id || !f.role) return;
    if (isCreate && !f.password) return;
    onSave({
      username: f.username.trim(),
      steam_id: f.steam_id.trim(),
      role: f.role,
      division: f.division,
      password: f.password || undefined,
    });
  };
  return (
    <div className="uv2-mask" onClick={onClose}>
      <div className="uv2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="uv2-modal-head">
          <span>{isCreate ? '创建用户' : `编辑用户 · ${init?.username}`}</span>
          <span className="uv2-close" onClick={onClose}>✕</span>
        </div>
        <div className="uv2-form">
          <label>用户名 *</label>
          <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="登录用户名" />
          <label>{isCreate ? '密码 *' : '密码（留空则不修改）'}</label>
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder={isCreate ? '初始密码' : '不改请留空'} />
          <label>Steam ID *</label>
          <input value={f.steam_id} onChange={(e) => setF({ ...f, steam_id: e.target.value })} placeholder="Steam ID" />
          <div className="uv2-form-row">
            <div>
              <label>职位 *</label>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="player">选手</option>
                <option value="coach">教练</option>
                <option value="team_lead">领队</option>
                <option value="admin">管理员</option>
                <option value="pending">待审核</option>
              </select>
            </div>
            <div>
              <label>分部</label>
              <select value={f.division} onChange={(e) => setF({ ...f, division: e.target.value })}>
                <option value="cs2">CS2</option>
              </select>
            </div>
          </div>
          {error && <div className="uv2-err">✗ {error}</div>}
          <div className="uv2-form-foot">
            <span className="uv2-btn-ghost" onClick={onClose}>取消</span>
            <span className="uv2-btn-main" onClick={submit}>{isCreate ? '创建' : '保存'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [modal, setModal] = useState(null);           // {mode:'create'} | {mode:'edit', user}
  const [modalError, setModalError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filter, setFilter] = useState('all');        // all | admin | player | team_lead | coach
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [u, p] = await Promise.all([api.get('/admin/users'), api.get('/admin/pending-users')]);
      setUsers(Array.isArray(u.data) ? u.data : []);
      setPendingUsers(Array.isArray(p.data) ? p.data : []);
    } catch (e) {
      setPageError(e.response?.data?.error || '加载失败');
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const createUser = async (form) => {
    setModalError(null);
    try {
      await api.post('/admin/create-user', form);
      setModal(null);
      load();
    } catch (e) { setModalError(e.response?.data?.error || '创建失败'); }
  };
  const updateUser = async (form) => {
    setModalError(null);
    try {
      await api.put(`/admin/user/${modal.user.id}`, form);
      setModal(null);
      load();
    } catch (e) { setModalError(e.response?.data?.error || '保存失败'); }
  };
  const deleteUser = async (id) => {
    try {
      await api.delete(`/admin/user/${id}`);
      setDeleteConfirm(null);
      load();
    } catch (e) { alert(e.response?.data?.error || '删除失败'); setDeleteConfirm(null); }
  };

  const stats = {
    total: users.length,
    player: users.filter((u) => u.role === 'player').length,
    admin: users.filter((u) => u.role === 'admin').length,
    cl: users.filter((u) => u.role === 'coach' || u.role === 'team_lead').length,
  };
  const q = query.trim().toLowerCase();
  const rows = users
    .filter((u) => filter === 'all' || u.role === filter)
    .filter((u) => !q || String(u.username || '').toLowerCase().includes(q) || String(u.steam_id || '').toLowerCase().includes(q));

  const STAT_CARDS = [
    { label: '总用户', n: stats.total, icon: 'hub' },
    { label: '选手', n: stats.player, icon: 'versus' },
    { label: '管理员', n: stats.admin, icon: 'dashboard' },
    { label: '教练 / 领队', n: stats.cl, icon: 'trophy' },
  ];
  const PILLS = [['all', '全部'], ['admin', '管理员'], ['player', '选手'], ['team_lead', '领队'], ['coach', '教练']];

  return (
    <div className="uv2-root">
      <div className="uv2-head">
        <div>
          <div className="uv2-eyebrow">USER &amp; ACCESS</div>
          <div className="uv2-title">用户管理</div>
        </div>
        <span className="uv2-create" onClick={() => { setModalError(null); setModal({ mode: 'create' }); }}>+ 创建用户</span>
      </div>

      {/* ══ 统计卡 ══ */}
      <div className="uv2-stats">
        {STAT_CARDS.map((c) => (
          <div key={c.label} className="uv2-stat">
            <span className="uv2-stat-icon"><img src={`/reshape/home/icons/icon-${c.icon}.png`} alt="" /></span>
            <div>
              <div className="uv2-stat-n">{c.n}</div>
              <div className="uv2-stat-l">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ══ 工具栏：职位筛选 + 搜索 ══ */}
      <div className="uv2-toolbar">
        <div className="uv2-pills">
          {PILLS.map(([k, label]) => (
            <span key={k} className={'uv2-pill ' + (filter === k ? 'uv2-pill-on' : '')} onClick={() => setFilter(k)}>{label}</span>
          ))}
          {pendingUsers.length > 0 && <span className="uv2-pending-tip">待审核 {pendingUsers.length} 人 · 点行内"编辑"分配角色</span>}
        </div>
        <input className="uv2-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="按用户名 / Steam ID 搜索…" />
      </div>

      {/* ══ 用户表 ══ */}
      <div className="uv2-table">
        <div className="uv2-tr uv2-th">
          <span>用户</span><span>Steam ID</span><span>职位</span><span>分部</span><span>创建时间</span><span className="uv2-right">操作</span>
        </div>
        {loading && <div className="uv2-empty">加载中…</div>}
        {pageError && <div className="uv2-empty uv2-err">{pageError}</div>}
        {!loading && !pageError && rows.length === 0 && <div className="uv2-empty">没有匹配的用户</div>}
        {!loading && rows.map((u) => (
          <div key={u.id} className="uv2-tr">
            <span className="uv2-user">
              <span className="uv2-avatar" style={{ background: avatarColor(u.username) }}>{String(u.username || '?')[0].toUpperCase()}</span>
              <span className="uv2-user-meta">
                <b>{u.username}</b>
                <i>{ROLE_MAP[u.role] || u.role}{u.applied_identity ? ` · 申请:${u.applied_identity}` : ''}</i>
              </span>
            </span>
            <span className="uv2-mono">{u.steam_id || '—'}</span>
            <span><span className={'uv2-role ' + (ROLE_CLS[u.role] || ROLE_CLS.pending)}>{ROLE_MAP[u.role] || u.role}</span></span>
            <span><span className="uv2-div">{String(u.division || 'cs2').toUpperCase()}</span></span>
            <span className="uv2-mono uv2-dim">{String(u.created_at || '').slice(0, 16).replace('T', ' ') || '—'}</span>
            <span className="uv2-right">
              <span className="uv2-op" onClick={() => { setModalError(null); setModal({ mode: 'edit', user: u }); }}>编辑</span>
              {u.role !== 'admin' && (
                <span className="uv2-op uv2-op-del" onClick={() => setDeleteConfirm(u)}>删除</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* ══ 删除确认 ══ */}
      {deleteConfirm && (
        <div className="uv2-mask" onClick={() => setDeleteConfirm(null)}>
          <div className="uv2-modal uv2-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="uv2-modal-head"><span>确认删除</span><span className="uv2-close" onClick={() => setDeleteConfirm(null)}>✕</span></div>
            <p className="uv2-del-text">将永久删除用户「{deleteConfirm.username}」的账号，无法恢复。确定继续？</p>
            <div className="uv2-form-foot">
              <span className="uv2-btn-ghost" onClick={() => setDeleteConfirm(null)}>取消</span>
              <span className="uv2-btn-danger" onClick={() => deleteUser(deleteConfirm.id)}>确认删除</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ 创建 / 编辑弹窗 ══ */}
      {modal && (
        <UserFormModal
          mode={modal.mode}
          init={modal.user}
          error={modalError}
          onClose={() => setModal(null)}
          onSave={modal.mode === 'create' ? createUser : updateUser}
        />
      )}
    </div>
  );
}
