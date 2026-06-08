import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const REGIONS = ['Asia', 'Europe', 'CIS', 'Americas', 'Oceania', 'China', 'Other'];

export default function OpponentIntel() {
  const [opponents, setOpponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type:'add'|'edit', opponent_name, data }
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/opponent-intel/extract/from-data');
      setOpponents(data || []);
    } catch { /* silently handle */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 打开编辑弹框
  const openEdit = (opp) => {
    const d = opp.intel || {};
    setForm({
      opponent_name: opp.opponent_name,
      display_name: d.display_name || opp.opponent_name,
      hltv_url: d.hltv_url || '',
      vrs_rank: d.vrs_rank ?? '',
      region: d.region || 'Asia',
      map_preference: d.map_preference || '',
      core_players: d.core_players || '',
      h2h_wins: d.h2h_wins ?? 0,
      h2h_losses: d.h2h_losses ?? 0,
      h2h_draws: d.h2h_draws ?? 0,
      last_match_date: d.last_match_date || '',
      last_match_score: d.last_match_score || '',
      last_match_result: d.last_match_result || '',
      notes: d.notes || '',
    });
    setModal({ type: 'edit', opponent_name: opp.opponent_name });
  };

  // 保存
  const save = async () => {
    try {
      if (modal.type === 'edit') {
        await api.put(`/opponent-intel/${modal.opponent_name}`, form);
      }
      setModal(null);
      load();
    } catch { /* silently handle */ }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-white mb-1">对手情报</h2>
      <p className="text-gray-500 text-sm mb-5">从简报 & 比赛记录自动提取对手 · 点击补充详细情报</p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
        </div>
      ) : opponents.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">🔍</div>
          <p className="text-gray-500 text-sm">暂无交战对手数据</p>
          <p className="text-gray-600 text-xs mt-1">导入比赛数据后将自动提取对手列表</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs border-b border-white/5">
                <th className="text-left py-3 px-3 font-medium">对手</th>
                <th className="text-center py-3 px-2 font-medium hidden sm:table-cell">交战天数</th>
                <th className="text-center py-3 px-2 font-medium hidden md:table-cell">最近交战</th>
                <th className="text-center py-3 px-2 font-medium">VRS</th>
                <th className="text-left py-3 px-2 font-medium hidden lg:table-cell">地图倾向</th>
                <th className="text-left py-3 px-2 font-medium hidden lg:table-cell">核心选手</th>
                <th className="text-center py-3 px-2 font-medium">H2H</th>
                <th className="text-right py-3 px-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {opponents.map(o => {
                const d = o.intel || {};
                return (
                  <tr key={o.opponent_name} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${o.has_intel ? 'bg-[#35e59d]' : 'bg-gray-600'}`}
                          title={o.has_intel ? '已录入' : '待录入'} />
                        <span className="font-display text-white text-sm">{o.opponent_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center text-gray-400 hidden sm:table-cell">{o.match_days}</td>
                    <td className="py-3 px-2 text-center text-gray-500 text-xs hidden md:table-cell">{o.last_date}</td>
                    <td className="py-3 px-2 text-center">
                      {d.vrs_rank ? (
                        <span className="px-1.5 py-0.5 text-xs rounded font-mono bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                          #{d.vrs_rank}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-gray-400 text-xs hidden lg:table-cell">{d.map_preference || '—'}</td>
                    <td className="py-3 px-2 text-gray-400 text-xs hidden lg:table-cell">{d.core_players || '—'}</td>
                    <td className="py-3 px-2 text-center">
                      {d.h2h_wins > 0 || d.h2h_losses > 0 ? (
                        <span className="font-mono text-xs">
                          <span className="text-[#35e59d]">{d.h2h_wins}W</span>
                          <span className="text-gray-600"> / </span>
                          <span className="text-[#ff597d]">{d.h2h_losses}L</span>
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button onClick={() => openEdit(o)}
                        className="px-3 py-1 text-xs font-display rounded
                                   bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20
                                   hover:bg-[#D4AF37]/20 transition-colors">
                        {o.has_intel ? '编辑' : '录入'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 编辑/录入弹框 ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModal(null)}>
          <div className="rounded-xl p-5 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto animate-fade-up"
            style={{ background: 'linear-gradient(180deg, rgba(20,25,40,0.98), rgba(11,17,28,0.98))', border: '1px solid rgba(212,175,55,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white mb-4">
              {modal.type === 'edit' ? '编辑对手情报' : '录入对手情报'}
            </h3>

            {/* 对手名（只读） */}
            <div className="mb-3">
              <label className="text-gray-500 text-xs mb-1 block">对手名称</label>
              <div className="px-3 py-2 bg-white/5 rounded text-white font-display text-sm">{form.opponent_name}</div>
            </div>

            {/* 双列布局 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-500 text-xs mb-1 block">显示名称</label>
                <input type="text" value={form.display_name || ''}
                  onChange={e => setForm({...form, display_name: e.target.value})}
                  className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1 block">VRS 排名</label>
                <input type="number" value={form.vrs_rank || ''}
                  onChange={e => setForm({...form, vrs_rank: e.target.value ? Number(e.target.value) : ''})}
                  placeholder="例：43"
                  className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-gray-500 text-xs mb-1 block">地区</label>
                <select value={form.region || 'Asia'}
                  onChange={e => setForm({...form, region: e.target.value})}
                  className="w-full bg-ur-card border border-ur-border text-gray-300 text-xs rounded px-2.5 py-1.5">
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1 block">HLTV 链接</label>
                <input type="text" value={form.hltv_url || ''}
                  onChange={e => setForm({...form, hltv_url: e.target.value})}
                  placeholder="https://hltv.org/team/..."
                  className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none" />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-gray-500 text-xs mb-1 block">地图倾向</label>
              <input type="text" value={form.map_preference || ''}
                onChange={e => setForm({...form, map_preference: e.target.value})}
                placeholder="Dust2, Mirage, Inferno..."
                className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none" />
            </div>

            <div className="mt-3">
              <label className="text-gray-500 text-xs mb-1 block">核心选手</label>
              <input type="text" value={form.core_players || ''}
                onChange={e => setForm({...form, core_players: e.target.value})}
                placeholder="选手1, 选手2, 选手3..."
                className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none" />
            </div>

            {/* H2H */}
            <div className="mt-3">
              <label className="text-gray-500 text-xs mb-1 block">H2H 战绩</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <span className="text-[10px] text-gray-600">胜</span>
                  <input type="number" min="0" value={form.h2h_wins || 0}
                    onChange={e => setForm({...form, h2h_wins: Number(e.target.value)})}
                    className="w-full bg-ur-card border border-ur-border text-[#35e59d] text-xs rounded px-2 py-1 mt-0.5" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-gray-600">负</span>
                  <input type="number" min="0" value={form.h2h_losses || 0}
                    onChange={e => setForm({...form, h2h_losses: Number(e.target.value)})}
                    className="w-full bg-ur-card border border-ur-border text-[#ff597d] text-xs rounded px-2 py-1 mt-0.5" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-gray-600">平</span>
                  <input type="number" min="0" value={form.h2h_draws || 0}
                    onChange={e => setForm({...form, h2h_draws: Number(e.target.value)})}
                    className="w-full bg-ur-card border border-ur-border text-[#f59e0b] text-xs rounded px-2 py-1 mt-0.5" />
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-gray-500 text-xs mb-1 block">备注</label>
              <textarea value={form.notes || ''}
                onChange={e => setForm({...form, notes: e.target.value})}
                rows={3}
                className="w-full bg-ur-card border border-ur-border text-gray-400 text-xs rounded px-2.5 py-1.5 focus:border-[#D4AF37]/40 focus:outline-none resize-none" />
            </div>

            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setModal(null)}
                className="px-4 py-1.5 text-xs bg-white/5 text-gray-400 rounded hover:bg-white/10 transition-colors">
                取消
              </button>
              <button onClick={save}
                className="px-4 py-1.5 text-xs bg-[#D4AF37] text-black rounded hover:bg-[#D4AF37]/80 font-display font-semibold transition-colors">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
