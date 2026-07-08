import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import { X, UserPlus, Trash2 } from 'lucide-react';

/* ═══════════════ 试训模块配置(全集) ═══════════════ */
const TRIAL_MODULES = [
  { id: 'personal', label: '个人信息', icon: '📋', path: '/trial-modules/试训队员个人信息表.html',   roles: ['admin','coach','team_lead','player'] },
  { id: 'scoring',  label: '考核评分', icon: '📊', path: '/trial-modules/试训考核评分表.html',      roles: ['admin','coach','team_lead','player'] },
  { id: 'contact',  label: '接洽表',   icon: '🤝', path: '/trial-modules/试训队员接洽表.html',      roles: ['admin','coach','team_lead'] },
];

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

/* ── 轻量区块标题 ── */
function SectionHeader({ title, count, color, action }) {
  return (
    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-ur-border">
      <div className={`w-1 h-5 rounded ${color}`} />
      <h3 className="font-sans font-semibold text-lg font-semibold text-white">{title}</h3>
      <span className="text-xs text-gray-600 font-mono">{count}人</span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/* ═══════════════ 试训人员弹窗(70%覆盖) ═══════════════ */
// moduleIds: 本弹窗允许显示哪些模块(按数组顺序排列)；再与登录角色权限取交集
function TrialModal({ player, moduleIds, onClose }) {
  const role = getUser().role || '';
  const modules = moduleIds
    .map(id => TRIAL_MODULES.find(m => m.id === id))
    .filter(m => m && m.roles.includes(role));
  const [activeTab, setActiveTab] = useState(modules[0]?.id || '');
  const currentMod = modules.find(m => m.id === activeTab) || modules[0];

  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const st = player.status === 'active'
    ? { tx: '#34d399', label: '试训中' }
    : player.status === 'completed'
    ? { tx: '#22d3ee', label: '已完成' }
    : { tx: '#9ca3af', label: player.status || '待定' };

  const view = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0a' }}>
      {/* 顶栏：返回 + 队员名 + 标签切换 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 54,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px',
        background: '#12161f', borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
            color: '#e0e0e0', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ← 返回
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{player.name}</span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>{player.ign || '—'}</span>
          <span style={{ fontSize: 11, color: st.tx }}>· {st.label}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {modules.map(m => {
            const on = currentMod?.id === m.id;
            return (
              <button key={m.id} onClick={() => setActiveTab(m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: on ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  background: on ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)',
                  color: on ? '#67e8f9' : '#9ca3af' }}>
                <span>{m.icon}</span><span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* iframe 占满整屏剩余空间 */}
      <div style={{ position: 'absolute', top: 54, left: 0, right: 0, bottom: 0, background: '#fff' }}>
        {currentMod && (
          <iframe
            key={currentMod.id + '-' + player.id}
            src={currentMod.path + '?playerId=' + player.id}
            title={currentMod.label}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        )}
      </div>
    </div>
  );

  return createPortal(view, document.body);
}

/* ═══════════════ 试训人员卡片 ═══════════════ */
function TrialCard({ player, onClick, onDelete }) {
  const statusColor = player.status === 'active' ? 'emerald' : player.status === 'completed' ? 'cyan' : 'gray';
  const statusText = player.status === 'active' ? '试训中' : player.status === 'completed' ? '已完成' : '待定';
  const handleDelete = (e) => {
    e.stopPropagation();
    if (confirm(`确定删除试训人员 "${player.name}"？`)) {
      onDelete(player.id);
    }
  };
  return (
    <div className="relative w-72 shrink-0 group">
      <div onClick={() => onClick(player)}
        className={`relative cursor-pointer rounded-2xl overflow-hidden
          border border-${statusColor}-500/25 bg-gradient-to-b from-${statusColor}-500/8 to-transparent
          hover:border-${statusColor}-400/50 hover:shadow-xl hover:shadow-${statusColor}-500/10
          transition-all duration-300 hover:scale-[1.03]`}>
        <div className="px-6 pt-8 pb-7 text-center">
          <div className={`w-24 h-24 mx-auto rounded-full bg-${statusColor}-500/12 border-2 border-${statusColor}-500/25
            overflow-hidden flex items-center justify-center mb-4`}>
            {player.avatar_url
              ? <img src={player.avatar_url} alt={player.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
              : <img src="/ur-logo.png" alt={player.name} className="w-full h-full" style={{ objectFit: 'contain', padding: '8px', opacity: 0.85 }} />}
          </div>
          <h4 className="text-white text-2xl font-bold truncate">{player.name}</h4>
          <p className="text-gray-400 text-sm truncate mt-1.5">{player.ign || player.nationality || '—'}</p>
          <span className={`inline-block mt-4 text-xs px-3 py-1 rounded-full font-medium
            bg-${statusColor}-500/12 border border-${statusColor}-500/25 text-${statusColor}-400`}>
            {statusText}
          </span>
        </div>
      </div>
      {/* 删除按钮 */}
      <button onClick={handleDelete}
        className="absolute -top-2 -right-2 w-8 h-8 rounded-full
          bg-rose-500/80 hover:bg-rose-500 text-white border border-rose-400/30
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
          flex items-center justify-center shadow-lg">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ═══════════════ 新增试训人员弹窗 ═══════════════ */
function AddTrialModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', ign: '', nationality: '蒙古国', phone: '' });
  const [status, setStatus] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) { setStatus('请填写姓名'); return; }
    setStatus('保存中...');
    try {
      await api.post('/trial/players', form);
      setStatus('✅ 保存成功');
      setTimeout(() => { onSaved(); onClose(); }, 600);
    } catch (e) { setStatus('❌ ' + (e.response?.data?.error || e.message)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md mx-4 rounded-lg p-6 bg-ur-card border border-white/10 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4">+ 新增试训队员</h3>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="姓名 *" autoFocus
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-400/50 placeholder:text-gray-600" />
          <input value={form.ign} onChange={e => setForm({...form, ign: e.target.value})} placeholder="游戏ID / IGN"
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-400/50 placeholder:text-gray-600" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.nationality} onChange={e => setForm({...form, nationality: e.target.value})} placeholder="国籍"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-400/50 placeholder:text-gray-600" />
            <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="联系电话"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-400/50 placeholder:text-gray-600" />
          </div>
        </div>
        {status && <div className={`mt-3 text-sm text-center ${status.startsWith('✅') ? 'text-emerald-400' : status.startsWith('❌') ? 'text-rose-400' : 'text-amber-400'}`}>{status}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-sm hover:bg-white/10">取消</button>
          <button onClick={handleSave} className="flex-1 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30">💾 保存</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ 共享主组件 ═══════════════════════ */
// props:
//   moduleIds  弹窗里显示哪些模块(按顺序)，默认全集
//   title      区块标题
//   card       是否用 data-card 外壳包裹(默认 true)
export default function TrialRoster({
  moduleIds = ['personal', 'scoring', 'contact'],
  title = '试训人员',
  card = true,
}) {
  const [trialPlayers, setTrialPlayers] = useState([]);
  const [trialModal, setTrialModal] = useState(null);
  const [showAddTrial, setShowAddTrial] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { const { data } = await api.get('/trial/players'); setTrialPlayers(Array.isArray(data) ? data : []); } catch { setTrialPlayers([]); }
    setLoading(false);
  };

  const handleDeleteTrial = async (id) => {
    try {
      await api.delete(`/trial/players/${id}`);
      setTrialPlayers(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert('删除失败: ' + (e.response?.data?.error || e.message));
    }
  };

  useEffect(() => { load(); }, []);

  const inner = (
    <>
      <SectionHeader title={title} count={trialPlayers.length} color="bg-emerald-500"
        action={
          <button onClick={() => setShowAddTrial(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all">
            <UserPlus size={13} /> 新增
          </button>
        }
      />
      {loading ? (
        <div className="text-center py-8 text-gray-600 text-sm">加载中...</div>
      ) : trialPlayers.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">暂无试训人员，点击右上角"新增"添加</div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {trialPlayers.map(p => (
            <TrialCard key={p.id} player={p} onClick={setTrialModal} onDelete={handleDeleteTrial} />
          ))}
        </div>
      )}

      {trialModal && (
        <TrialModal player={trialModal} moduleIds={moduleIds} onClose={() => setTrialModal(null)} />
      )}
      {showAddTrial && (
        <AddTrialModal onClose={() => setShowAddTrial(false)} onSaved={load} />
      )}
    </>
  );

  return card ? <div className="data-card">{inner}</div> : inner;
}
