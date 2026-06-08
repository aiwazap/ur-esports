import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const n = (v) => (v != null ? v : '—');

export default function TrainingPlans() {
  const [plans, setPlans] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genMsg, setGenMsg] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ plan_date: '', start_time: '', end_time: '', title: '', subtitle: '', tags: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: s }] = await Promise.all([
        api.get('/training-plans'),
        api.get('/training-plans/sessions'),
      ]);
      setPlans(p || []);
      setSessions(s || []);
    } catch { /* silently handle */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 从简报 session 生成训练计划
  const generate = async (sessionId) => {
    setGenMsg({ id: sessionId, status: 'generating' });
    try {
      const { data } = await api.post('/training-plans/generate', { session_id: sessionId });
      setGenMsg({ id: sessionId, status: 'ok', count: data.count });
      load();
    } catch (e) {
      setGenMsg({ id: sessionId, status: 'error', msg: e.message });
    }
    setTimeout(() => setGenMsg(null), 3000);
  };

  // 开始编辑
  const startEdit = (p) => {
    setEditId(p.id);
    setEditForm({
      plan_date: p.plan_date || '',
      start_time: p.start_time || '',
      end_time: p.end_time || '',
      title: p.title || '',
      subtitle: p.subtitle || '',
      tags: p.tags || '',
    });
  };

  // 保存编辑
  const saveEdit = async () => {
    if (!editId) return;
    try {
      await api.put(`/training-plans/${editId}`, editForm);
      setEditId(null);
      load();
    } catch { /* silently handle */ }
  };

  // 删除
  const del = async (id) => {
    if (!confirm('确定删除该训练计划？')) return;
    try { await api.delete(`/training-plans/${id}`); load(); } catch {}
  };

  // 按日期分组
  const grouped = {};
  for (const p of plans) {
    const d = p.plan_date || '未定';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(p);
  }

  // 已生成计划的日期
  const plannedDates = new Set(plans.map(p => p.plan_date));

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-white mb-1">训练计划</h2>
      <p className="text-gray-500 text-sm mb-5">从每日简报自动生成 · 支持编辑和调整</p>

      {/* ── 简报 Session 列表（未生成计划的） ── */}
      {sessions.filter(s => !plannedDates.has(s.match_date)).length > 0 && (
        <div className="mb-6">
          <h3 className="font-display text-xs font-semibold text-gray-500 mb-3 tracking-wide uppercase">
            待生成 · 简报训练赛次
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {sessions.filter(s => !plannedDates.has(s.match_date)).map(s => (
              <div key={s.session_id}
                className="relative rounded-lg p-3 border border-[#D4AF37]/20 bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-all">
                <div className="text-white font-display text-xs">{s.match_date}</div>
                <div className="text-gray-400 text-[10px]">{s.opponent}</div>
                <div className="text-gray-600 text-[10px] mt-0.5">{s.maps || '—'}</div>
                <button onClick={() => generate(s.session_id)}
                  disabled={genMsg?.id === s.session_id && genMsg.status === 'generating'}
                  className="mt-2 w-full px-2 py-1 text-[10px] font-display font-semibold rounded
                             bg-[#D4AF37] text-black hover:bg-[#D4AF37]/80 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed">
                  {genMsg?.id === s.session_id && genMsg.status === 'generating' ? '生成中...' :
                   genMsg?.id === s.session_id && genMsg.status === 'ok' ? `已生成 ${genMsg.count} 项` :
                   genMsg?.id === s.session_id && genMsg.status === 'error' ? '失败' : '生成计划'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 训练计划列表 ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-gray-500 text-sm">暂无训练计划</p>
          <p className="text-gray-600 text-xs mt-1">点击上方简报会话生成训练计划</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="rounded-xl overflow-hidden"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)), rgba(11,17,28,0.85)', border: '1px solid var(--glass-border)' }}>
              {/* 日期头 */}
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-3"
                style={{ background: 'rgba(212,175,55,0.06)' }}>
                <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                <span className="font-display text-sm font-bold text-white">{date}</span>
                <span className="text-gray-600 text-xs">{items.length} 项</span>
              </div>

              <div className="px-4 py-2">
                {items.map(p => (
                  editId === p.id ? (
                    /* ── 编辑模式 ── */
                    <div key={p.id} className="py-2.5 border-b border-white/3 last:border-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                        <div>
                          <label className="text-gray-600 text-[10px]">日期</label>
                          <input type="date" value={editForm.plan_date}
                            onChange={e => setEditForm({...editForm, plan_date: e.target.value})}
                            className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2 py-1 [color-scheme:dark]" />
                        </div>
                        <div>
                          <label className="text-gray-600 text-[10px]">开始</label>
                          <input type="time" value={editForm.start_time}
                            onChange={e => setEditForm({...editForm, start_time: e.target.value})}
                            className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2 py-1 [color-scheme:dark]" />
                        </div>
                        <div>
                          <label className="text-gray-600 text-[10px]">结束</label>
                          <input type="time" value={editForm.end_time}
                            onChange={e => setEditForm({...editForm, end_time: e.target.value})}
                            className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2 py-1 [color-scheme:dark]" />
                        </div>
                        <div>
                          <label className="text-gray-600 text-[10px]">标签</label>
                          <input type="text" value={editForm.tags} placeholder="T,CT,Dust2"
                            onChange={e => setEditForm({...editForm, tags: e.target.value})}
                            className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2 py-1" />
                        </div>
                      </div>
                      <div className="mb-2">
                        <label className="text-gray-600 text-[10px]">标题</label>
                        <input type="text" value={editForm.title}
                          onChange={e => setEditForm({...editForm, title: e.target.value})}
                          className="w-full bg-ur-card border border-ur-border text-white text-xs rounded px-2 py-1" />
                      </div>
                      <div className="mb-2">
                        <label className="text-gray-600 text-[10px]">副标题</label>
                        <input type="text" value={editForm.subtitle}
                          onChange={e => setEditForm({...editForm, subtitle: e.target.value})}
                          className="w-full bg-ur-card border border-ur-border text-gray-400 text-xs rounded px-2 py-1" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit}
                          className="px-3 py-1 text-xs bg-[#D4AF37] text-black rounded hover:bg-[#D4AF37]/80 font-display font-semibold">保存</button>
                        <button onClick={() => setEditId(null)}
                          className="px-3 py-1 text-xs bg-white/5 text-gray-400 rounded hover:bg-white/10">取消</button>
                      </div>
                    </div>
                  ) : (
                    /* ── 查看模式 ── */
                    <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-white/3 last:border-0 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-white text-sm">{p.title}</span>
                          {p.tags && p.tags.split(',').slice(0, 2).map((t, i) => (
                            <span key={i} className="px-1.5 py-0.5 text-[10px] rounded bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 font-display">
                              {t.trim()}
                            </span>
                          ))}
                        </div>
                        <div className="text-gray-600 text-xs mt-0.5">{p.subtitle}</div>
                        <div className="text-gray-500 text-[10px] mt-0.5">
                          {p.start_time || '—'} → {p.end_time || '—'}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => startEdit(p)}
                          className="px-2 py-0.5 text-xs text-gray-400 hover:text-[#D4AF37] transition-colors">编辑</button>
                        <button onClick={() => del(p.id)}
                          className="px-2 py-0.5 text-xs text-gray-600 hover:text-red-400 transition-colors">删除</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
