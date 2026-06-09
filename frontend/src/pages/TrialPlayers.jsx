import { useState, useEffect } from 'react';

// ============================================================
// 模块配置
// ============================================================
const ALL_MODULES = [
  { id: 'contact',   label: '接洽表',     icon: '🤝', desc: '接机准备清单、沟通记录',            path: '/trial-modules/试训队员接洽表.html' },
  { id: 'personal',  label: '个人信息表',  icon: '📋', desc: '选手基本信息、账号、外设偏好',        path: '/trial-modules/试训队员个人信息表.html' },
  { id: 'scoring',   label: '考核评分表',  icon: '📊', desc: '五维度评分、周期统计',               path: '/trial-modules/试训考核评分表.html' },
  { id: 'plan',      label: '入队方案',    icon: '📄', desc: '入队流程、时间规划',                 path: '/trial-modules/试训选手入队方案.html' },
  { id: 'cost',      label: '成本支出表',  icon: '💰', desc: '试训成本录入与汇总',                 path: '/trial-modules/试训选手成本支出表.html' },
];

function getRole() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.role || '';
  } catch { return ''; }
}

function filterModulesByRole(role) {
  if (role === 'CEO' || role === '经理') return ALL_MODULES;
  if (role === '教练' || role === '领队') return ALL_MODULES.filter(m => m.id !== 'cost');
  if (role === '队员') return ALL_MODULES.filter(m => m.id === 'personal');
  return ALL_MODULES;
}

export default function TrialPlayers() {
  const role = getRole();
  const modules = filterModulesByRole(role);
  const [active, setActive] = useState(modules[0]?.id || 'personal');
  const [frames, setFrames] = useState({});

  useEffect(() => {
    if (!modules.find(m => m.id === active)) {
      setActive(modules[0]?.id || 'personal');
    }
  }, [role]);

  const currentModule = modules.find(m => m.id === active);

  return (
    <div className="min-h-screen" style={{ background: '#060b14', padding: '20px 28px' }}>
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🧪</span> 试训人员管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            全流程管理：接洽 → 信息登记 → 考核评分 → 入队方案 → 成本核算
            <span className="ml-3 text-[11px] text-cyan-600">
              当前角色：{role || '未登录'}
              {role === '队员' && <span className="ml-2 text-yellow-500">（仅查看个人信息）</span>}
            </span>
          </p>
        </div>
      </div>

      {/* 功能标签 - 权限过滤 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {modules.map(mod => {
          const isActive = active === mod.id;
          return (
            <button key={mod.id} onClick={() => setActive(mod.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 border whitespace-nowrap
                ${isActive
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06]'}`}>
              <span>{mod.icon}</span>
              <span>{mod.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs text-gray-500">
        <span className="text-cyan-400 font-medium">{currentModule?.label}</span>
        ：{currentModule?.desc}
      </div>

      {/* iframe 内容 */}
      <div className="relative rounded-lg overflow-hidden border border-white/[0.08]">
        <iframe
          key={active}
          src={currentModule?.path}
          className="w-full border-0"
          style={{ minHeight: 'calc(100vh - 230px)' }}
          title={currentModule?.label}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
}
