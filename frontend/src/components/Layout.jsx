import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Target,
  Settings,
  UserPlus,
} from 'lucide-react';
import ParticleBackground from './ParticleBackground';

const links = [
  { to: '/overview', label: '赛训总览', icon: LayoutDashboard },
  { to: '/members', label: '分部成员', icon: Users },
  { to: '/training-report', label: '赛训报告', icon: ClipboardList },
  { to: '/tactics', label: '战术总表', icon: Target },
  { to: '/trial-players', label: '试训人员', icon: UserPlus },
  { to: '/admin', label: '数据管理', icon: Settings },
];

export default function Layout() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    nav('/login');
  };

  return (
    <>
      <ParticleBackground />
      <div className="min-h-screen flex relative z-[2]">
        {/* Sidebar — glass style */}
        <aside className="w-56 min-h-screen glass-sidebar flex flex-col relative z-10">
          <div className="p-5 border-b border-white/[0.08]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center
                              bg-gradient-to-br from-white/18 to-cyan-400/8
                              border border-white/20
                              shadow-[0_0_28px_rgba(104,232,255,0.18)]">
                <img src="/logo.png" alt="UR Logo" className="w-7 h-7 object-contain drop-shadow-[0_0_10px_rgba(104,232,255,0.52)]" />
              </div>
              <div>
                <p className="text-[11px] text-ur-muted leading-tight">UR Esports</p>
                <h1 className="text-sm font-bold text-white leading-tight">CS2 Data Center</h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1.5">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-[42px] px-3.5 rounded-xl text-sm transition-all duration-200
                     ${isActive
                       ? 'text-white border border-cyan-400/25 bg-gradient-to-r from-cyan-400/13 to-blue-500/5'
                       : 'text-gray-400 border border-transparent hover:text-white hover:bg-white/5'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        isActive
                          ? 'bg-cyan-400 shadow-[0_0_16px_rgba(104,232,255,1)]'
                          : 'bg-gray-500/40'
                      }`} />
                      <span>{l.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/[0.08]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-500/20
                              flex items-center justify-center text-sm font-bold text-white
                              border border-cyan-400/20">
                {user.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-sm text-white">{user.username}</p>
                <p className="text-xs text-ur-muted">{user.role}</p>
              </div>
            </div>
            <button onClick={logout} className="btn-primary w-full text-xs">
              退出登录
            </button>
            <p className="text-center text-[10px] text-gray-600 mt-3 leading-relaxed">
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
                 className="hover:text-gray-400 transition-colors">
                沪ICP备2026023847号
              </a>
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-screen overflow-auto relative z-10">
          <Outlet />
        </main>
      </div>
    </>
  );
}
