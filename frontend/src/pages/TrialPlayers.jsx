import { useState } from 'react';

// 功能子模块配置：标题、图标 emoji、HTML 文件路径、简要说明
const MODULES = [
  {
    id: 'contact',
    label: '接洽表',
    icon: '🤝',
    path: '/trial-modules/试训队员接洽表.html',
    desc: '试训前接机准备、住宿安排、沟通记录',
  },
  {
    id: 'personal',
    label: '个人信息表',
    icon: '📋',
    path: '/trial-modules/试训队员个人信息表.html',
    desc: '选手基本信息、教育背景、健康、账号、外设偏好',
  },
  {
    id: 'scoring',
    label: '考核评分表',
    icon: '📊',
    path: '/trial-modules/试训考核评分表.html',
    desc: '五维度每日评分、评分历史、周期统计',
  },
  {
    id: 'onboarding',
    label: '入队方案',
    icon: '📄',
    path: '/trial-modules/蒙古选手入队方案.html',
    desc: '入队流程、时间规划、资源配置',
  },
  {
    id: 'cost',
    label: '成本支出表',
    icon: '💰',
    path: '/trial-modules/蒙古选手成本支出表.html',
    desc: '试训期成本预算与支出明细',
  },
];

export default function TrialPlayers() {
  const [activeModule, setActiveModule] = useState('contact');
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const currentModule = MODULES.find((m) => m.id === activeModule);

  const handleTabChange = (id) => {
    setActiveModule(id);
    setIframeLoaded(false);
  };

  return (
    <div className="min-h-screen p-5" style={{ background: '#060b14' }}>
      {/* 页面标题 */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🧪</span>
          试训人员管理
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          试训队员全流程管理 —— 接洽 → 信息登记 → 考核评分 → 入队方案 → 成本核算
        </p>
      </div>

      {/* 功能标签栏 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {MODULES.map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => handleTabChange(mod.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 border
                ${isActive
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12]'
                }
              `}
            >
              <span className="text-base">{mod.icon}</span>
              <span>{mod.label}</span>
              {!isActive && (
                <span className="text-[10px] text-gray-600 ml-1 max-w-[120px] truncate hidden lg:inline">
                  {mod.desc}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 当前模块说明条 */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs text-gray-500">
        <span className="text-cyan-400 font-medium">{currentModule?.label}</span>
        ：{currentModule?.desc}
      </div>

      {/* Iframe 内容区 */}
      <div className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.01]">
        {/* 加载提示 */}
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060b14] z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-sm text-gray-500">加载中...</span>
            </div>
          </div>
        )}
        <iframe
          key={activeModule}
          src={currentModule?.path}
          className="w-full border-0"
          style={{ minHeight: 'calc(100vh - 260px)', height: 'auto' }}
          title={currentModule?.label}
          onLoad={() => setIframeLoaded(true)}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
}
