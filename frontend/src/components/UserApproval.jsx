import { useState, useEffect } from 'react';
import api from '../api';

// 可分配的角色（与后端 admin.js 的白名单、数据库 users.role 的 CHECK 约束保持一致：
// admin/player/coach/team_lead/pending。此处不放 admin——授予管理员权限应走「用户管理」页面手动编辑，不放进快速审批的默认流程）
const ROLE_OPTIONS = [
  { value: 'player',    label: '选手' },
  { value: 'coach',     label: '教练' },
  { value: 'team_lead', label: '领队' },
];

export default function UserApproval() {
  const [pending, setPending] = useState([]);
  const [roleMap, setRoleMap] = useState({});   // { userId: selectedRole }
  const [busy, setBusy] = useState(null);        // 正在处理的 userId

  const load = async () => {
    try {
      const { data } = await api.get('/admin/pending-users');
      setPending(data);
      // 默认预选申请人自己填的身份（applied_identity），管理员仍可在下拉里改选；
      // 申请值缺失或不在合法列表内（如 admin，注册时不可能选到）时兜底为"选手"（最小权限原则）
      const validRoles = ROLE_OPTIONS.map(r => r.value);
      const m = {};
      for (const u of data) {
        m[u.id] = m[u.id] || (validRoles.includes(u.applied_identity) ? u.applied_identity : 'player');
      }
      setRoleMap(m);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const approve = async (user) => {
    const role = roleMap[user.id] || 'player';
    setBusy(user.id);
    try {
      await api.put(`/admin/user/${user.id}`, {
        username: user.username,
        steam_id: user.steam_id,
        role,
      });
      load();
    } catch (e) {
      alert('审核失败: ' + (e.response?.data?.error || e.message));
    }
    setBusy(null);
  };

  const reject = async (user) => {
    if (!confirm(`确定拒绝并删除「${user.username}」的注册申请吗？`)) return;
    setBusy(user.id);
    try {
      await api.delete(`/admin/user/${user.id}`);
      load();
    } catch (e) {
      alert('操作失败: ' + (e.response?.data?.error || e.message));
    }
    setBusy(null);
  };

  if (pending.length === 0) return null; // 没有待审核时不显示

  return (
    <div className="data-card mb-5 border-yellow-500/20">
      <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        待审核账号
        <span className="text-xs font-normal text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/25 px-2 py-0.5 rounded-full">
          {pending.length}
        </span>
      </h3>

      <div className="space-y-2">
        {pending.map(user => (
          <div key={user.id}
            className="flex flex-wrap items-center gap-3 p-3 rounded-xl
                       border border-white/[0.06] bg-white/[0.02]">
            {/* 用户信息 */}
            <div className="flex-1 min-w-[140px]">
              <div className="text-sm font-semibold text-white">{user.username}</div>
              <div className="text-xs text-gray-600 font-mono mt-0.5">
                申请时间: {(user.created_at || '').slice(0, 16)}
                {user.applied_identity && (
                  <span className="ml-2 text-yellow-500/70">
                    · 申请身份: {user.applied_identity === 'coach' ? '教练' : user.applied_identity === 'team_lead' ? '领队' : '选手'}
                  </span>
                )}
              </div>
            </div>

            {/* 角色选择 */}
            <select
              value={roleMap[user.id] || 'player'}
              onChange={e => setRoleMap(prev => ({ ...prev, [user.id]: e.target.value }))}
              className="h-9 px-3 rounded-lg bg-ur-bg border border-ur-border text-sm text-white outline-none focus:border-cyan-400/50">
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {/* 批准 */}
            <button
              onClick={() => approve(user)}
              disabled={busy === user.id}
              className="h-9 px-4 rounded-lg bg-emerald-500/15 border border-emerald-500/30
                         text-emerald-400 text-sm font-semibold hover:bg-emerald-500/25
                         disabled:opacity-50 transition-colors">
              {busy === user.id ? '处理中...' : '✓ 批准'}
            </button>

            {/* 拒绝 */}
            <button
              onClick={() => reject(user)}
              disabled={busy === user.id}
              className="h-9 px-4 rounded-lg bg-rose-500/10 border border-rose-500/25
                         text-rose-400 text-sm hover:bg-rose-500/20
                         disabled:opacity-50 transition-colors">
              拒绝
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
