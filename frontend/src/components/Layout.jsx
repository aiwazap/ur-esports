import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import ParticleBackground from './ParticleBackground';
import { Activity, Bell, Briefcase, Database, FileLock2, Home, LogOut, ScrollText, Search, Shield, Target, UserCog, Users } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/overview',        icon: Home,      key: 'nav.overview' },
  { to: '/members',         icon: Users,     key: 'nav.members' },
  { to: '/matches',         icon: Database,  key: 'nav.matches' },
  { to: '/training-report', icon: Activity,  key: 'nav.analytics' },
  { to: '/workstation',     icon: Briefcase, key: 'nav.workstation' },
  { to: '/faceit-sea',      icon: Target,    key: 'nav.faceitSea' },
  { to: '/admin',           icon: Shield,    key: 'nav.admin' },
  // 仅 admin 可见；后端另有强制鉴权，前端隐藏只是第一层
  { to: '/codex-made',      icon: FileLock2, label: 'codex made',  adminOnly: true },
  { to: '/vault',           icon: ScrollText, label: '任职记录',    adminOnly: true, external: true }, // 后端口令页
];

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

// 游客不可见的模块（后端另有只读强制，此处仅为界面隐藏）
const GUEST_HIDDEN = ['/admin', '/workstation', '/training-report'];

export default function Layout() {
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const user = getUser();
  const isGuest = user.role === 'guest';
  const navItems = NAV_ITEMS
    .filter(i => !i.adminOnly || user.role === 'admin')
    .filter(i => !(isGuest && GUEST_HIDDEN.includes(i.to)));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const langs = [
    { code: 'zh', label: '中' },
    { code: 'en', label: 'EN' },
  ];

  return (
    <div className="ur-app-shell min-h-screen text-white">
      <ParticleBackground />
      <header className="ur-topbar fixed top-0 left-0 right-0 z-40 h-[72px]">
        <div className="ur-topbar__inner h-full max-w-screen-2xl mx-auto px-5 flex items-center justify-between">
          <div className="ur-brand">
            <div className="ur-brand__mark">
              <img src="/images/ur-logo-transparent.png" alt="UR Esports" />
            </div>
            <div className="ur-brand__text">
              <strong>UR Esports</strong>
              <span>赛训数据中心</span>
            </div>
          </div>

          <nav className={'ur-nav hidden md:flex items-center' + (navItems.length >= 8 ? ' is-dense' : '')}>
            {navItems.map(item => {
              const Icon = item.icon;
              const text = item.label || t(item.key);
              // external：由后端直接渲染的页面（非 SPA 路由），走整页跳转
              if (item.external) return (
                <a key={item.to} href={item.to} target="_blank" rel="noreferrer" className="ur-nav__item">
                  <Icon size={15} strokeWidth={1.8} />
                  {text}
                </a>
              );
              return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  'ur-nav__item' + (isActive ? ' is-active' : '')
                }
              >
                <Icon size={15} strokeWidth={1.8} />
                {text}
              </NavLink>
            );})}
          </nav>

          <div className="ur-actions">
            <button className="ur-icon-btn" type="button" aria-label="搜索">
              <Search size={18} />
            </button>

            <div className="ur-lang-switch">
              {langs.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={lang === l.code ? 'is-active' : ''}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <button className="ur-icon-btn ur-bell" type="button" aria-label="通知">
              <Bell size={18} />
            </button>

            <div className="ur-user">
              <div className="ur-user__avatar">
                {(user.username || 'UR').slice(0, 1).toUpperCase()}
              </div>
              <div className="ur-user__meta hidden sm:flex">
                <strong>{user.username || 'UR'}</strong>
                <span>{t(`role.${user.role}`) || user.role || '在线'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="ur-logout"
                title={t('nav.logout')}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="ur-mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-2 flex justify-around">
          {navItems.slice(0, 5).map(item => {
            const Icon = item.icon;
            return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                'ur-mobile-nav__item' + (isActive ? ' is-active' : '')
              }
            >
              <Icon size={18} />
              <span>{t(item.key)}</span>
            </NavLink>
          );})}
        </div>
      </header>

      <main className="ur-main pt-[72px] pb-16 md:pb-0">
        <div className="max-w-screen-2xl mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
