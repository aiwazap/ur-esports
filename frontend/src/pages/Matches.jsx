import { useState, useEffect } from 'react';
import api from '../api';

const DATE_TABS = [
  { label: '3天', days: 3 },
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
];

const MAP_COLORS = {
  Mirage: '#f59e0b', Dust2: '#ef4444', Inferno: '#22d3ee', Nuke: '#10b981',
  Ancient: '#6366f1', Anubis: '#a855f7', Overpass: '#fb923c', Vertigo: '#84cc16', Train: '#ec4899'
};

export default function Matches() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(3);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/matches/grouped?days=${days}`);
      setGroups(data);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, [days]);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-white mb-1">近期比赛</h2>
      <p className="text-gray-500 text-sm mb-4">训练赛 · 点击展开地图详情</p>

      {/* Date Tabs */}
      <div className="flex gap-2 mb-5">
        {DATE_TABS.map(t => (
          <button key={t.days}
                  onClick={() => setDays(t.days)}
                  className={`px-4 py-1.5 text-sm font-display rounded-lg transition-all
                    ${days === t.days
                      ? 'bg-ur-cyan text-ur-bg'
                      : 'bg-ur-card text-gray-400 border border-ur-border hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-12">加载中...</p>
      ) : groups.length === 0 ? (
        <p className="text-gray-500 text-center py-12">暂无训练赛数据</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <MatchCard key={gi} group={g} selected={selected?.key === g.key}
                       onClick={() => setSelected(selected?.key === g.key ? null : g)}
                       onSaved={() => load()} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Match Card ── */
function MatchCard({ group, selected, onClick, onSaved }) {
  const maps = group.maps || [];
  const totalW = maps.filter(m => m.result === 'win').length;
  const totalL = maps.filter(m => m.result === 'loss').length;

  return (
    <div className="bg-ur-card border border-ur-border rounded-lg overflow-hidden">
      {/* Header - click to toggle */}
      <div onClick={onClick}
           className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/3 transition-all">
        <span className="tag text-xs bg-ur-indigo/20 text-ur-cyan">训练赛</span>
        <div className="flex-1 min-w-0">
          <span className="font-display text-base font-semibold text-white">{group.opponent}</span>
          <span className="text-gray-500 text-sm ml-3">{group.match_date}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {maps.map((m, i) => (
            <span key={i} className={`tag text-xs ${
              m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'
            }`}>
              {m.map_name?.substring(0,4)} {m.our_score}-{m.their_score}
            </span>
          ))}
        </div>
        <span className="text-gray-600 text-xs">{maps.length}图</span>
        {totalW + totalL > 0 && (
          <span className={`text-sm font-mono ${totalW >= totalL ? 'text-emerald-400' : 'text-ur-rose'}`}>
            {totalW}W {totalL}L
          </span>
        )}
      </div>

      {/* Expanded Detail */}
      {selected && (
        <MatchDetail group={group} onSaved={onSaved} />
      )}
    </div>
  );
}

/* ── Match Detail Panel ── */
function MatchDetail({ group, onSaved }) {
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ t_score: 0, ct_score: 0, pistol_rounds: '' });
  const [saving, setSaving] = useState(false);
  const maps = group.maps || [];

  const startEdit = (m) => {
    setEditId(m.id);
    setEditForm({
      t_score: m.t_score || 0,
      ct_score: m.ct_score || 0,
      pistol_rounds: m.pistol_rounds || '',
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await api.put(`/matches/${editId}`, editForm);
      setEditId(null);
      onSaved();
    } catch { }
    setSaving(false);
  };

  return (
    <div className="border-t border-ur-border px-4 py-3 text-sm">
      <h4 className="font-display text-sm font-semibold text-gray-400 mb-3">地图数据</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-ur-border/40">
              <th className="text-left py-2 font-medium">地图</th>
              <th className="text-center py-2 font-medium">比分</th>
              <th className="text-center py-2 font-medium">T得分</th>
              <th className="text-center py-2 font-medium">CT得分</th>
              <th className="text-center py-2 font-medium">手枪局</th>
              <th className="text-center py-2 font-medium">结果</th>
              <th className="text-right py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {maps.map(m => (
              editId === m.id ? (
                <tr key={m.id} className="border-b border-ur-border/20 bg-ur-bg">
                  <td className="py-2 pl-3">
                    <span className="text-white">{m.map_name}</span>
                  </td>
                  <td className="py-2 text-center font-mono text-gray-300">{m.our_score}-{m.their_score}</td>
                  <td className="py-2 text-center">
                    <input type="number" min="0" value={editForm.t_score}
                           onChange={e => setEditForm({...editForm, t_score: Number(e.target.value)})}
                           className="w-14 bg-ur-card border border-ur-border text-white text-center rounded px-1 py-0.5 text-sm" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="number" min="0" value={editForm.ct_score}
                           onChange={e => setEditForm({...editForm, ct_score: Number(e.target.value)})}
                           className="w-14 bg-ur-card border border-ur-border text-white text-center rounded px-1 py-0.5 text-sm" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="text" value={editForm.pistol_rounds}
                           onChange={e => setEditForm({...editForm, pistol_rounds: e.target.value})}
                           placeholder="W/L"
                           className="w-16 bg-ur-card border border-ur-border text-white text-center rounded px-1 py-0.5 text-sm" />
                  </td>
                  <td className="py-2 text-center">
                    <span className={`tag text-xs ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                      {m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}
                    </span>
                  </td>
                  <td className="py-2 text-right pr-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={saveEdit} disabled={saving}
                              className="px-2 py-0.5 text-xs bg-ur-cyan text-ur-bg rounded hover:bg-ur-cyan/80">
                        保存
                      </button>
                      <button onClick={() => setEditId(null)}
                              className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                        取消
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-b border-ur-border/20 hover:bg-white/3 cursor-pointer"
                    onClick={() => startEdit(m)}>
                  <td className="py-2.5 pl-3">
                    <span className="font-display text-white">{m.map_name}</span>
                  </td>
                  <td className="py-2.5 text-center font-mono text-gray-300">{m.our_score}-{m.their_score}</td>
                  <td className="py-2.5 text-center font-mono text-gray-500">{m.t_score || '-'}</td>
                  <td className="py-2.5 text-center font-mono text-gray-500">{m.ct_score || '-'}</td>
                  <td className="py-2.5 text-center text-gray-500 text-xs">{m.pistol_rounds || '-'}</td>
                  <td className="py-2.5 text-center">
                    <span className={`tag text-xs ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                      {m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right pr-3">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                            className="px-2 py-0.5 text-xs text-gray-600 hover:text-ur-cyan transition-colors">
                      编辑
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
