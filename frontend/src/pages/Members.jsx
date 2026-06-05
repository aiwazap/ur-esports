import { useState, useEffect } from 'react';
import api from '../api';
import PlayerEditModal from '../components/PlayerEditModal';
import { Pencil } from 'lucide-react';

/* ── 计算年龄 ── */
function calcAge(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/* ═══════════════════ 选手/成员卡片（竖版）═══════════════════ */
function PlayerCard({ player, onClick, onEdit, accentClass, borderClass, glowClass, bgClass }) {
  const age = calcAge(player.birth_date);
  const initials = player.nickname?.[0]?.toUpperCase() || '?';
  const isActive = player.team_type !== 'former';

  return (
    <div
      className="relative w-52 cursor-pointer group shrink-0"
      onClick={() => onClick(player)}
    >
      {/* ── 卡片主体 ── */}
      <div className={`
        relative w-full rounded-2xl overflow-hidden flex flex-col
        border-2 ${borderClass}
        ${bgClass || 'bg-gradient-to-b from-[#1a0f2e] to-[#0d0618]'}
        shadow-lg ${glowClass}
        group-hover:scale-105 group-hover:shadow-2xl
        transition-all duration-300
      `}>

        {/* ── 装饰线 ── */}
        <div className={`absolute top-0 left-3 right-3 h-[2px] bg-gradient-to-r from-transparent ${isActive ? 'via-yellow-500/50' : 'via-gray-600/30'} to-transparent z-10`} />
        <div className={`absolute bottom-16 left-3 right-3 h-[1px] bg-gradient-to-r from-transparent ${isActive ? 'via-white/20' : 'via-white/5'} to-transparent z-10`} />

        {/* ── 头像区域 ── */}
        <div className="relative w-full h-48 overflow-hidden">
          {/* 背景渐变 */}
          <div className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-40`} />

          {/* 装饰圆环 */}
          <div className="absolute top-4 right-4 w-10 h-10 rounded-full border border-white/10" />
          <div className="absolute top-6 right-6 w-6 h-6 rounded-full border border-white/5" />

          {/* 头像 */}
          <div className="absolute inset-0 flex items-center justify-center">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-6xl font-display font-black text-white/80 drop-shadow-lg"
                      style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                  {initials}
                </span>
              </div>
            )}
          </div>

          {/* 底部渐变遮罩 */}
          {player.avatar_url && (
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0d0618] to-transparent" />
          )}

          {/* 位置标签 — 左上角 */}
          <div className="absolute top-3 left-3 z-10">
            <span className="text-[10px] tracking-widest uppercase text-yellow-400/80 font-display font-bold">
              {player.team_type === 'staff' ? 'STAFF' : 'PLAYER'}
            </span>
          </div>
        </div>

        {/* ── 信息区 ── */}
        <div className="relative px-3 pt-3 pb-3 text-center h-[82px] flex flex-col justify-start flex-shrink-0">
          {/* ID */}
          <h3 className={`font-display text-lg font-bold tracking-wide truncate ${isActive ? 'text-white' : 'text-gray-400'}`}>
            {player.nickname}
          </h3>

          {/* 位置 */}
          <p className={`text-xs mt-0.5 font-medium truncate leading-tight ${isActive ? 'text-gray-400' : 'text-gray-600'}`}>
            {player.in_game_role || '—'}
          </p>

          {/* 年龄 + 姓名 一行 — 始终显示 */}
          <div className="flex items-center justify-center gap-3 mt-auto">
            <span className={`text-[11px] font-mono font-bold ${isActive ? 'text-yellow-500/70' : 'text-gray-600'}`}>
              {age != null ? `${age} 岁` : '—'}
            </span>
            {player.real_name && (
              <span className="text-[11px] text-gray-600 truncate max-w-[60px]">{player.real_name}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── 编辑按钮 — 卡片外右下角 ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(player); }}
        className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full
                   flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-all duration-200 z-20
                   ${isActive
                     ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400/70 hover:text-yellow-300 hover:bg-yellow-500/30 hover:border-yellow-400/60'
                     : 'bg-gray-700/50 border border-gray-600/40 text-gray-500 hover:text-gray-300 hover:bg-gray-600/50'}`}
        title="编辑"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, count, color, sortInfo }) {
  return (
    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-ur-border">
      <div className={`w-1 h-5 rounded ${color}`} />
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      <span className="text-xs text-gray-600 font-mono">{count}人</span>
      {sortInfo && <span className="text-[10px] text-gray-600 ml-1">{sortInfo}</span>}
    </div>
  );
}

/* ── 赛训团队角色排序权重 ── */
const STAFF_RANK = {
  ceo: 0, '首席执行官': 0,
  总经理: 1, 'general manager': 1,
  经理: 2, manager: 2,
  主教练: 3, 教练: 3, coach: 3, 'head coach': 3, '助理教练': 3,
  分析师: 4, 领队: 4, analyst: 4, 'team manager': 4,
};

function staffRank(p) {
  const role = (p.in_game_role || '').toLowerCase();
  for (const [key, rank] of Object.entries(STAFF_RANK)) {
    if (role.includes(key.toLowerCase()) || key.toLowerCase().includes(role)) return rank;
  }
  return 99; // 未知排最后
}

/* ═══════════════════════ MAIN ═══════════════════════ */
export default function Members() {
  const [staff, setStaff] = useState([]);
  const [roster, setRoster] = useState([]);
  const [former, setFormer] = useState([]);
  const [editPlayer, setEditPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/players');
      const s = data.filter(p => p.team_type === 'staff');
      s.sort((a, b) => staffRank(a) - staffRank(b));
      setStaff(s);
      setRoster(data.filter(p => p.team_type === 'roster'));
      setFormer(data.filter(p => p.team_type === 'former'));
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-center text-gray-500 mt-20">加载中...</div>;

  return (
    <div className="w-full">
      <h2 className="font-display text-2xl font-bold text-white mb-1">队员阵容</h2>
      <p className="text-gray-500 text-sm mb-6">UR CS2 分部 · 按入队日期排序 · 悬停卡片显示编辑按钮</p>

      <div className="flex flex-col gap-6">
        {/* ── Staff ── */}
        <div className="data-card">
          <SectionHeader title="赛训团队" count={staff.length} color="bg-ur-cyan" />
          <div className="flex flex-wrap gap-6">
            {staff.map(p => (
              <PlayerCard key={p.id} player={p} onClick={setEditPlayer} onEdit={setEditPlayer}
                accentClass="from-cyan-500/20 to-cyan-900/10"
                borderClass="border-cyan-500/30"
                glowClass="hover:shadow-cyan-500/10"
              />
            ))}
          </div>
        </div>

        {/* ── Roster ── */}
        <div className="data-card">
          <SectionHeader title="现役选手" count={roster.length} color="bg-ur-purple" />
          <div className="flex flex-wrap gap-6">
            {roster.map(p => (
              <PlayerCard key={p.id} player={p} onClick={setEditPlayer} onEdit={setEditPlayer}
                accentClass="from-purple-500/20 to-purple-900/10"
                borderClass="border-purple-500/30"
                glowClass="hover:shadow-purple-500/10"
              />
            ))}
          </div>
        </div>

        {/* ── Former ── */}
        <div className="data-card">
          <SectionHeader title="离队选手" count={former.length} color="bg-gray-600" sortInfo="按离队日期" />
          <div className="flex flex-wrap gap-6 max-h-[440px] overflow-y-auto">
            {former.map(p => (
              <PlayerCard key={p.id} player={p} onClick={setEditPlayer} onEdit={setEditPlayer}
                accentClass="from-gray-800/30 to-gray-950/40"
                borderClass="border-gray-700/30"
                bgClass="bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a]"
                glowClass=""
              />
            ))}
          </div>
        </div>
      </div>

      {editPlayer && (
        <PlayerEditModal
          player={editPlayer}
          onClose={() => setEditPlayer(null)}
          onSaved={() => { setEditPlayer(null); load(); }}
        />
      )}
    </div>
  );
}
