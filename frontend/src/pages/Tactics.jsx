import { useState, useEffect } from 'react';
import api from '../api';

const MAP_LIST = ['Mirage', 'Dust2', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Overpass', 'Vertigo', 'Train'];
const MAP_COLORS = {
  Mirage: '#ffc45c', Dust2: '#ff597d', Inferno: '#68e8ff', Nuke: '#35e59d',
  Ancient: '#5379ff', Anubis: '#8b5cff', Overpass: '#fb923c', Vertigo: '#84cc16', Train: '#ec4899',
};

export default function Tactics() {
  const [tactics, setTactics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMap, setFilterMap] = useState('');
  const [filterSide, setFilterSide] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterMap) params.map = filterMap;
      if (filterSide) params.side = filterSide;
      const { data } = await api.get('/training/tactics', { params });
      setTactics(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterMap, filterSide]);

  const filtered = search.trim()
    ? tactics.filter(t =>
        (t.tactic_id || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : tactics;

  const mapCounts = {};
  const sideCounts = { T: 0, CT: 0 };
  tactics.forEach(t => {
    mapCounts[t.map_name] = (mapCounts[t.map_name] || 0) + 1;
    if (t.team_side) sideCounts[t.team_side] = (sideCounts[t.team_side] || 0) + 1;
  });
  const activeMaps = MAP_LIST.filter(m => mapCounts[m]);

  return (
    <div className="p-6 md:p-8 lg:px-10">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <p className="text-xs text-ur-muted mb-1 font-mono tracking-wider">Tactics master</p>
          <h1 className="text-[clamp(34px,4.4vw,62px)] leading-[0.95] font-extrabold text-white">
            战术总表
          </h1>
          <p className="text-sm text-[#9eb0c4] mt-1">
            {tactics.length > 0
              ? `共 ${tactics.length} 条战术 · ${activeMaps.length} 张地图 · 版本 v${tactics[0]?.version || 1}`
              : '暂无数据，请通过管理页导入战术 Excel'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="chip">
            <span className="text-amber-400 font-mono mr-1">T</span>
            {sideCounts.T || 0}
          </span>
          <span className="chip">
            <span className="text-blue-400 font-mono mr-1">CT</span>
            {sideCounts.CT || 0}
          </span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={filterMap}
          onChange={e => setFilterMap(e.target.value)}
          className="h-10 px-4 rounded-full border border-white/[0.12] bg-white/[0.04]
                     text-sm text-gray-300 backdrop-blur-lg cursor-pointer
                     outline-none focus:border-cyan-400/30
                     appearance-none bg-no-repeat bg-[right_12px_center]
                     [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22%236b7d95%22><path d=%22M6 8L1 3h10z%22/></svg>')]
                     pr-9"
        >
          <option value="">全部地图</option>
          {MAP_LIST.map(m => (
            <option key={m} value={m}>
              {m}{mapCounts[m] ? ` (${mapCounts[m]})` : ''}
            </option>
          ))}
        </select>

        <div className="flex rounded-full border border-white/[0.12] overflow-hidden">
          {[
            { label: '全部', side: '', activeBg: 'bg-white/[0.08]', activeText: 'text-white' },
            { label: '进攻 T', side: 'T', activeBg: 'bg-amber-500/20', activeText: 'text-amber-400' },
            { label: '防守 CT', side: 'CT', activeBg: 'bg-blue-500/20', activeText: 'text-blue-400' },
          ].map((opt, i) => (
            <button
              key={opt.side}
              onClick={() => setFilterSide(opt.side)}
              className={`h-10 px-4 text-sm font-medium transition-all
                ${i > 0 ? 'border-l border-white/[0.08]' : ''}
                ${filterSide === opt.side
                  ? `${opt.activeBg} ${opt.activeText}`
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索战术编号 / 名称 / 描述..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-full border border-white/[0.12] bg-white/[0.04]
                       text-sm text-gray-300 placeholder:text-gray-600 backdrop-blur-lg
                       outline-none focus:border-cyan-400/30"
          />
        </div>

        {search && (
          <span className="text-xs text-ur-muted">
            匹配 {filtered.length} / {tactics.length} 条
          </span>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-ur-muted text-lg animate-pulse">加载中...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="glass-panel rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#7f91a7] font-semibold bg-white/[0.035]">
                  <th className="text-left py-3.5 px-4 font-medium whitespace-nowrap">战术编号</th>
                  <th className="text-left py-3.5 px-4 font-medium whitespace-nowrap">地图</th>
                  <th className="text-center py-3.5 px-3 font-medium whitespace-nowrap w-[64px]">阵营</th>
                  <th className="text-center py-3.5 px-3 font-medium whitespace-nowrap w-[64px]">局型</th>
                  <th className="text-left py-3.5 px-4 font-medium whitespace-nowrap">战术名</th>
                  <th className="text-left py-3.5 px-4 font-medium">默认目标</th>
                  <th className="text-left py-3.5 px-4 font-medium hidden lg:table-cell">备注</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="border-b border-white/[0.06] hover:bg-white/[0.045] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <code className="text-xs font-mono px-2 py-0.5 rounded
                                      bg-white/[0.06] text-ur-cyan whitespace-nowrap">
                        {t.tactic_id}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: MAP_COLORS[t.map_name] || '#666' }}
                        />
                        <span className="text-[#c4d1df] whitespace-nowrap">{t.map_name}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold
                          ${t.team_side === 'T'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                          }`}
                      >
                        {t.team_side}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300">
                        {t.round_type || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-white font-semibold">{t.name || '-'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[#9eb0c4] text-xs line-clamp-2 max-w-[260px]">
                        {t.description || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-[#6b7d95] text-xs line-clamp-1 max-w-[200px]">
                        {t.details || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl text-center py-20">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-ur-muted text-sm">
            {tactics.length === 0
              ? '战术总表暂无数据。请前往管理页上传战术 Excel 文件导入数据。'
              : '未找到匹配的战术，尝试调整筛选条件。'
            }
          </p>
          {tactics.length === 0 && (
            <button
              onClick={() => window.location.href = '/admin'}
              className="mt-4 btn-glass btn-glass-primary"
            >
              前往管理页导入
            </button>
          )}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && <TacticDetail tactic={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ── Tactic Detail Modal ── */
function TacticDetail({ tactic, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-2xl p-8 max-w-lg w-full animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs text-ur-muted font-mono tracking-wider mb-1.5">Tactic detail</p>
            <code className="text-sm font-mono px-3 py-1 rounded-lg bg-white/[0.06] text-ur-cyan">
              {tactic.tactic_id}
            </code>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                       text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-5">
          {/* Meta row */}
          <div className="grid grid-cols-3 gap-3">
            <DetailBlock
              label="地图"
              value={tactic.map_name}
              dotColor={MAP_COLORS[tactic.map_name]}
            />
            <DetailBlock label="阵营">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold
                ${tactic.team_side === 'T' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {tactic.team_side === 'T' ? '进攻方' : '防守方'}
              </span>
            </DetailBlock>
            <DetailBlock label="局型" value={tactic.round_type || '-'} />
          </div>

          {/* Name */}
          <div>
            <p className="text-xs text-ur-muted mb-1.5">战术名称</p>
            <p className="text-lg font-bold text-white">{tactic.name || '未命名'}</p>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs text-ur-muted mb-1.5">默认目标 / 描述</p>
            <p className="text-sm text-[#b7c6d7] leading-relaxed">
              {tactic.description || '暂无描述'}
            </p>
          </div>

          {/* Notes */}
          {tactic.details && (
            <div>
              <p className="text-xs text-ur-muted mb-1.5">备注</p>
              <p className="text-sm text-[#7f91a7] leading-relaxed">
                {tactic.details}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-white/[0.08] flex items-center gap-4 text-xs text-gray-500">
            <span>版本 v{tactic.version || 1}</span>
            <span className="text-gray-700">|</span>
            <span>更新于 {tactic.updated_at || tactic.created_at || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({ label, value, dotColor, children }) {
  return (
    <div>
      <p className="text-xs text-ur-muted mb-1.5">{label}</p>
      {children || (
        <p className="text-sm text-white font-semibold inline-flex items-center gap-1.5">
          {dotColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />}
          {value}
        </p>
      )}
    </div>
  );
}
