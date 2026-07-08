import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';

// 状态颜色映射
const STATUS_COLORS = {
  '报名中': 'text-ur-amber border-ur-amber/40 bg-ur-amber/10',
  '进行中': 'text-ur-cyan border-ur-cyan/40 bg-ur-cyan/10',
  '已结束': 'text-ur-muted border-ur-muted/40 bg-ur-muted/10',
};
const STAGE_STATUS_COLORS = {
  '未开始': 'text-ur-muted bg-ur-muted/10',
  '进行中': 'text-ur-cyan bg-ur-cyan/10',
  '已结束': 'text-ur-emerald bg-ur-emerald/10',
};
const MAP_POOL = ['Mirage', 'Ancient', 'Overpass', 'Nuke', 'Inferno', 'Anubis', 'Dust2', 'Vertigo', 'Train'];

// 派生赛事是否已结束
function isTournamentEnded(t, stages) {
  if (!t) return false;
  if (t.is_finished === 1 || t.status === '已结束') return true;
  if (t.placement && String(t.placement).trim()) return true;
  if (Array.isArray(stages) && stages.length > 0 && stages.every(s => s.status === '已结束')) return true;
  return false;
}

const EMPTY_FORM = {
  name: '', status: '报名中', current_stage_id: '', start_date: '', end_date: '',
  prize: '', organizer: '', logo_url: '', result: '', placement: '', is_finished: 0,
  notes: '', bo_format: 'BO1', next_opponent: '', next_match_date: '', next_match_time: '', has_vrs: 0,
};

function formFromTournament(t) {
  return {
    name: t?.name || '', status: t?.status || '报名中',
    current_stage_id: t?.current_stage_id || '',
    start_date: t?.start_date || '', end_date: t?.end_date || '',
    prize: t?.prize || '', organizer: t?.organizer || '', logo_url: t?.logo_url || '',
    result: t?.result || '', placement: t?.placement || '', is_finished: t?.is_finished || 0,
    notes: t?.notes || '', bo_format: t?.bo_format || 'BO1',
    next_opponent: t?.next_opponent || '', next_match_date: t?.next_match_date || '',
    next_match_time: t?.next_match_time || '', has_vrs: t?.has_vrs || 0,
  };
}

// ============ 赛事字段表单（新建弹窗 + 工作台「赛事介绍」标签复用） ============
function TournamentFields({ f, set, stages = [] }) {
  const field = (label, key, opts = {}) => (
    <div className={opts.full ? 'col-span-2' : ''}>
      <label className="text-xs text-ur-muted mb-1 block">{label}{opts.req && <span className="text-ur-rose"> *</span>}</label>
      <input
        type={opts.type || 'text'}
        value={f[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={opts.ph || ''}
        className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none"
      />
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {field('赛事名称', 'name', { req: true, full: true, ph: '如 极限之地城市对抗赛' })}
      <div>
        <label className="text-xs text-ur-muted mb-1 block">状态</label>
        <select value={f.status} onChange={e => set('status', e.target.value)}
          className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none">
          <option>报名中</option><option>进行中</option><option>已结束</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-ur-muted mb-1 block">是否结束</label>
        <select value={f.is_finished} onChange={e => set('is_finished', parseInt(e.target.value))}
          className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none">
          <option value={0}>进行中</option><option value={1}>已结束</option>
        </select>
      </div>
      {field('开始日期', 'start_date', { type: 'date' })}
      {field('结束日期', 'end_date', { type: 'date' })}
      {field('奖金', 'prize', { ph: '如 5万元' })}
      {field('主办方', 'organizer', { ph: '如 完美世界' })}
      {field('赛事 Logo 链接', 'logo_url', { full: true, ph: '/uploads/... 或图片URL' })}
      <div>
        <label className="text-xs text-ur-muted mb-1 block">VRS 积分赛</label>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ur-bg border border-ur-border cursor-pointer">
          <input type="checkbox" checked={!!f.has_vrs} onChange={e => set('has_vrs', e.target.checked ? 1 : 0)} className="accent-ur-amber" />
          <span className="text-sm text-ur-text">{f.has_vrs ? '计入 VRS' : '不计入'}</span>
        </label>
      </div>
      <div className="flex items-end pb-2">
        <span className="text-[11px] text-ur-muted leading-snug">赛制 BO 已改为在每个阶段单独设置</span>
      </div>

      <div className="col-span-2 mt-1 p-3 rounded-lg bg-ur-cyan/[0.05] border border-ur-cyan/20">
        <div className="text-xs font-semibold text-ur-cyan mb-2">下一场比赛（填了才会显示在首页"即将开始赛事"）</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-ur-muted mb-1 block">下一场对手</label>
            <input type="text" value={f.next_opponent} onChange={e => set('next_opponent', e.target.value)} placeholder="如 TYLOO（留空显示 TBD）"
              className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-ur-muted mb-1 block">下一场日期</label>
            <input type="date" value={f.next_match_date} onChange={e => set('next_match_date', e.target.value)}
              className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-ur-muted mb-1 block">下一场时间</label>
            <input type="time" value={f.next_match_time} onChange={e => set('next_match_time', e.target.value)}
              className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none" />
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-ur-muted mb-1 block">最终停留阶段</label>
        <select value={f.current_stage_id} onChange={e => set('current_stage_id', e.target.value ? parseInt(e.target.value) : '')}
          className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none">
          <option value="">— 未指定 —</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
        </select>
      </div>
      {field('最终成绩', 'placement', { ph: '如 冠军 / 第3名 / 八强' })}
      {field('赛果说明', 'result', { full: true, ph: '如 夺冠 / 小组未出线' })}
      {field('备注', 'notes', { full: true })}
    </div>
  );
}

// ============ 新建赛事弹窗 ============
function TournamentFormModal({ onClose, onSave }) {
  const [f, setF] = useState({ ...EMPTY_FORM });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) { setErr('赛事名称必填'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave(f);
    } catch (e) {
      setErr(e.response?.data?.error || '保存失败');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-ur-card border border-ur-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-white mb-4">新建赛事</h3>
        {err && <div className="mb-3 px-3 py-2 rounded-lg bg-ur-rose/10 border border-ur-rose/30 text-ur-rose text-sm">{err}</div>}
        <TournamentFields f={f} set={set} stages={[]} />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-ur-border text-ur-muted hover:text-ur-text text-sm">取消</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-lg bg-ur-cyan/90 hover:bg-ur-cyan text-ur-bg font-semibold text-sm disabled:opacity-50">
            {saving ? '保存中...' : '创建赛事'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 比赛录入表单（锁定赛事 · 嵌入赛事详情） ============
// 赛事已锁定为 tournamentId，match_type 固定 official；只需选阶段。
// editId 非空=编辑模式（回填该场、保存走 PUT）；为空=新录入（POST）。
function MatchEntryForm({ tournamentId, tournamentName, stages, rosterPlayers, editId, onDone, onCancelEdit }) {
  const emptyUrRow = () => ({ player_id: '', kills: '', deaths: '', assists: '', adr: '', rating: '' });
  const emptyOppRow = () => ({ name: '', kills: '', deaths: '', assists: '', adr: '', rating: '' });
  const [form, setForm] = useState({ match_date: '', opponent: '', map_name: '', our_score: '', their_score: '', stage_id: '', is_walkover: false, walkover_winner: 'us' });
  const [urRows, setUrRows] = useState([emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()]);
  const [oppRows, setOppRows] = useState([emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()]);
  const [bpSteps, setBpSteps] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState(null);
  const loadedEditRef = useRef(null);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setUrRow = (i, key, val) => setUrRows(rows => rows.map((r, j) => j === i ? { ...r, [key]: val } : r));
  const setOppRow = (i, key, val) => setOppRows(rows => rows.map((r, j) => j === i ? { ...r, [key]: val } : r));

  const resetForm = () => {
    setForm({ match_date: '', opponent: '', map_name: '', our_score: '', their_score: '', stage_id: '', is_walkover: false, walkover_winner: 'us' });
    setUrRows([emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()]);
    setOppRows([emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()]);
    setBpSteps([]);
  };

  // 选阶段后按该阶段 BO 初始化 BP 模板（BO1 无 BP；编辑模式不重置）
  useEffect(() => {
    if (editId) return;
    if (!form.stage_id) { setBpSteps([]); return; }
    const stage = stages.find(s => String(s.id) === String(form.stage_id));
    const bo = (stage?.bo_format || 'BO1').toUpperCase();
    const TPL = {
      BO3: [['ur', 'ban'], ['opp', 'ban'], ['ur', 'pick'], ['opp', 'pick'], ['ur', 'ban'], ['opp', 'ban'], ['', 'decider']],
      BO5: [['ur', 'ban'], ['opp', 'ban'], ['ur', 'pick'], ['opp', 'pick'], ['ur', 'pick'], ['opp', 'pick'], ['', 'decider']],
    };
    if (!TPL[bo]) { setBpSteps([]); return; }
    setBpSteps(TPL[bo].map(([team, action]) => ({ team, action, map: '' })));
  }, [form.stage_id, stages, editId]);

  // 编辑模式：拉取该场回填
  useEffect(() => {
    if (!editId) { if (loadedEditRef.current !== null) { loadedEditRef.current = null; resetForm(); setResult(null); } return; }
    if (loadedEditRef.current === editId) return;
    loadedEditRef.current = editId;
    setResult(null);
    api.get(`/training/manual-match/${editId}`).then(({ data }) => {
      setForm({
        match_date: data.match_date || '', opponent: data.opponent || '', map_name: data.map_name || '',
        our_score: data.our_score != null ? String(data.our_score) : '',
        their_score: data.their_score != null ? String(data.their_score) : '',
        stage_id: data.stage_id != null ? String(data.stage_id) : '',
        is_walkover: !!data.is_walkover,
        walkover_winner: (Number(data.our_score) > Number(data.their_score)) ? 'us' : 'them',
      });
      try { setBpSteps(data.bp_json ? JSON.parse(data.bp_json) : []); } catch { setBpSteps([]); }
      const ur = [emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()];
      (data.ur_players || []).slice(0, 5).forEach((p, i) => {
        ur[i] = { player_id: p.player_id ? String(p.player_id) : '', kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '', adr: p.adr ?? '', rating: p.rating ?? '' };
      });
      setUrRows(ur);
      const opp = [emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()];
      (data.opp_players || []).slice(0, 5).forEach((p, i) => {
        opp[i] = { name: p.name || '', kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '', adr: p.adr ?? '', rating: p.rating ?? '' };
      });
      setOppRows(opp);
    }).catch(e => setResult({ success: false, message: e.response?.data?.error || '加载比赛数据失败' }));
  }, [editId]);

  // 截图 OCR 识别
  const handleOcrFile = async (file) => {
    if (!file) return;
    setOcrMsg(null); setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/admin/ocr-match-image', fd);
      if (Array.isArray(data.ur_players) && data.ur_players.length) {
        const rows = [emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()];
        data.ur_players.slice(0, 5).forEach((p, i) => {
          rows[i] = { player_id: p.player_id ? String(p.player_id) : '', kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '', adr: p.adr ?? '', rating: p.rating ?? '' };
        });
        setUrRows(rows);
      }
      if (Array.isArray(data.opp_players) && data.opp_players.length) {
        const rows = [emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()];
        data.opp_players.slice(0, 5).forEach((p, i) => {
          rows[i] = { name: p.name ?? '', kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '', adr: p.adr ?? '', rating: p.rating ?? '' };
        });
        setOppRows(rows);
      }
      setForm(f => ({ ...f, our_score: data.our_score != null ? String(data.our_score) : f.our_score, their_score: data.their_score != null ? String(data.their_score) : f.their_score }));
      setOcrMsg({ success: true, message: `识别完成：比分 ${data.our_score ?? '?'} : ${data.their_score ?? '?'}，我方 ${(data.ur_players || []).length} 人（匹配花名册 ${data.matched || 0} 人）、对方 ${(data.opp_players || []).length} 人。请核对后录入。` });
    } catch (e) {
      setOcrMsg({ success: false, message: e.response?.data?.error || '识别失败，请重试或换张更清晰的截图' });
    }
    setOcrLoading(false);
  };

  const submit = async () => {
    setResult(null);
    const f = form;
    if (!f.match_date || !f.opponent.trim()) { setResult({ success: false, message: '请填写比赛日期和对手名称' }); return; }
    if (!f.is_walkover) {
      if (!f.map_name) { setResult({ success: false, message: '请先选择本场是第几张图（地图）' }); return; }
      if (f.our_score === '' || f.their_score === '') { setResult({ success: false, message: '比分为空——请先上传该图记分板截图，由识别自动填入比分' }); return; }
      const filled = urRows.filter(r => r.player_id && r.kills !== '' && r.deaths !== '' && r.adr !== '');
      if (filled.length < 5) { setResult({ success: false, message: `UR 选手数据不全（${filled.length}/5），需填满 5 名` }); return; }
      if (new Set(filled.map(r => r.player_id)).size < 5) { setResult({ success: false, message: '5 名选手有重复，请检查下拉选择' }); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        match_date: f.match_date, opponent: f.opponent.trim(), map_name: f.map_name,
        our_score: f.our_score, their_score: f.their_score,
        match_type: 'official',
        tournament_id: tournamentId,
        stage_id: f.stage_id || null,
        is_walkover: f.is_walkover,
        walkover_winner: f.walkover_winner,
        ur_players: urRows,
        opp_players: oppRows.filter(r => r.name.trim()),
        bp_json: bpSteps.length ? JSON.stringify(bpSteps) : null,
      };
      const { data } = editId
        ? await api.put(`/training/manual-match/${editId}`, payload)
        : await api.post('/training/manual-match', payload);
      setResult({ success: true, message: data.message });
      if (editId) {
        onDone && onDone();
      } else {
        resetForm();
        onDone && onDone(true); // 保留表单大部分,仅刷新列表
      }
    } catch (e) {
      setResult({ success: false, message: e.response?.data?.error || (editId ? '更新失败' : '录入失败') });
    }
    setSubmitting(false);
  };

  const rowCls = "grid grid-cols-[1fr_42px_42px_42px_50px_52px] gap-1.5";
  const numCls = "bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-cyan/50 focus:outline-none";

  return (
    <div className={`rounded-xl border p-4 ${editId ? 'border-ur-amber/50 bg-ur-amber/[0.04]' : 'border-ur-emerald/30 bg-ur-emerald/[0.03]'}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-1 h-4 rounded" style={{ background: editId ? '#D4AF37' : '#34d399' }} />
        <span className="font-semibold text-sm text-white">{editId ? '编辑比赛数据' : '录入本赛事比赛'}</span>
        {editId && <span className="text-xs font-normal px-2 py-0.5 rounded bg-ur-amber/15 text-ur-amber border border-ur-amber/30">编辑中 · #{editId}</span>}
      </div>

      {/* 赛事已锁定提示 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ur-amber/10 mb-3">
        <span className="text-ur-amber text-sm">🔒</span>
        <span className="text-xs text-ur-amber">所属赛事已锁定：{tournamentName}（无需再选，正赛录入）</span>
      </div>

      {/* 选阶段 + 比赛日期 */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div>
          <label className="block text-xs text-ur-amber mb-1">所属阶段 <span className="text-ur-muted">(可选)</span></label>
          <select value={form.stage_id} onChange={e => setF('stage_id', e.target.value)}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-amber focus:outline-none">
            <option value="">选择阶段</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ur-muted mb-1">比赛日期 <span className="text-ur-rose">*</span></label>
          <input type="date" value={form.match_date} onChange={e => setF('match_date', e.target.value)}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan/50 focus:outline-none" />
        </div>
      </div>

      {/* 对手名称 */}
      <div className="mb-3">
        <label className="block text-xs text-ur-muted mb-1">对手名称 <span className="text-ur-rose">*</span></label>
        <input type="text" value={form.opponent} onChange={e => setF('opponent', e.target.value)} placeholder="如 TYLOO"
          className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan/50 focus:outline-none placeholder:text-gray-600" />
      </div>

      {/* 弃权开关 */}
      <div className="mb-3 p-3 rounded-lg bg-ur-bg border border-ur-border">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_walkover} onChange={e => setF('is_walkover', e.target.checked)} className="w-4 h-4 accent-ur-amber" />
          <span className="text-xs font-semibold text-ur-amber">弃权场次</span>
          <span className="text-[11px] text-ur-muted">（对手或我方弃权 · 无需填比分和选手）</span>
        </label>
        {form.is_walkover && (
          <div className="mt-3">
            <label className="block text-xs text-ur-muted mb-1.5">弃权结果 <span className="text-ur-rose">*</span></label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setF('walkover_winner', 'us')}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${form.walkover_winner === 'us' ? 'bg-ur-emerald/15 border-ur-emerald/40 text-ur-emerald' : 'bg-ur-bg border-ur-border text-ur-muted hover:text-ur-text'}`}>
                我方胜（对手弃权）
              </button>
              <button type="button" onClick={() => setF('walkover_winner', 'them')}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${form.walkover_winner === 'them' ? 'bg-ur-rose/15 border-ur-rose/40 text-ur-rose' : 'bg-ur-bg border-ur-border text-ur-muted hover:text-ur-text'}`}>
                对方胜（我方弃权）
              </button>
            </div>
          </div>
        )}
      </div>

      {!form.is_walkover && (<>
        {/* BP 流程 */}
        {bpSteps.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-ur-amber/[0.06] border border-ur-amber/20">
            <div className="text-xs font-semibold text-ur-amber mb-2">本场 BP 流程 <span className="text-ur-muted font-normal">（一次定下打哪几张图 · Pick/决胜即 Map1/2/3）</span></div>
            <div className="space-y-1.5">
              {bpSteps.map((step, i) => {
                const mapIdx = bpSteps.slice(0, i + 1).filter(s => s.action === 'pick' || s.action === 'decider').length;
                const isMap = step.action === 'pick' || step.action === 'decider';
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-ur-muted w-4 text-right shrink-0">{i + 1}</span>
                    <select value={step.team} onChange={e => setBpSteps(s => s.map((x, j) => j === i ? { ...x, team: e.target.value } : x))}
                      className="bg-ur-bg border border-ur-border rounded px-1.5 py-1 text-white text-[11px] focus:outline-none shrink-0">
                      <option value="ur">我方</option><option value="opp">对方</option><option value="">—</option>
                    </select>
                    <select value={step.action} onChange={e => setBpSteps(s => s.map((x, j) => j === i ? { ...x, action: e.target.value } : x))}
                      className="bg-ur-bg border border-ur-border rounded px-1.5 py-1 text-white text-[11px] focus:outline-none shrink-0">
                      <option value="ban">Ban</option><option value="pick">Pick</option><option value="decider">决胜图</option>
                    </select>
                    <select value={step.map} onChange={e => setBpSteps(s => s.map((x, j) => j === i ? { ...x, map: e.target.value } : x))}
                      className="flex-1 min-w-0 bg-ur-bg border border-ur-border rounded px-2 py-1 text-white text-[11px] focus:outline-none">
                      <option value="">选地图</option>
                      {MAP_POOL.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {isMap && <span className="text-[10px] text-ur-amber w-10 shrink-0 text-right">Map{mapIdx}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 地图 + 本图比分 */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className="block text-xs text-ur-muted mb-1">这次录第几张图 <span className="text-ur-rose">*</span></label>
            {(() => {
              const hasBP = bpSteps.length > 0;
              const picks = bpSteps.filter(s => s.action === 'pick' || s.action === 'decider');
              const named = picks.map((s, i) => ({ idx: i + 1, map: s.map })).filter(x => x.map);
              if (hasBP && named.length === 0) {
                return <div className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-[11px] text-gray-600">请先在上方 BP 里选好各图地图</div>;
              }
              return (
                <select value={form.map_name} onChange={e => setF('map_name', e.target.value)}
                  className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan/50 focus:outline-none">
                  <option value="">{hasBP ? '选第几张图' : '选择地图'}</option>
                  {hasBP
                    ? named.map(x => <option key={x.map} value={x.map}>Map{x.idx} · {x.map}</option>)
                    : MAP_POOL.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              );
            })()}
          </div>
          <div>
            <label className="block text-xs text-ur-muted mb-1">本图比分 <span className="text-[10px] text-gray-600">(截图识别填)</span></label>
            <div className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-xs flex items-center justify-center min-h-[34px]">
              {(form.our_score !== '' && form.their_score !== '')
                ? <span className="font-mono text-white text-sm">{form.our_score} : {form.their_score}</span>
                : <span className="text-gray-600">上传记分板截图后自动识别</span>}
            </div>
          </div>
        </div>

        {/* 截图自动识别 */}
        <div className="mb-3 p-3 rounded-lg bg-ur-purple/[0.06] border border-ur-purple/25">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ur-purple">📷 截图自动识别</div>
              <div className="text-[11px] text-ur-muted mt-0.5">上传记分板结算截图，AI 自动填入选手数据与比分，识别后请核对</div>
            </div>
            <label className={`px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer whitespace-nowrap flex-shrink-0 ${ocrLoading ? 'opacity-50 pointer-events-none' : ''} bg-ur-purple/15 border-ur-purple/40 text-ur-purple hover:bg-ur-purple/25`}>
              {ocrLoading ? '识别中…' : '选择截图'}
              <input type="file" accept="image/*" className="hidden" disabled={ocrLoading}
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; handleOcrFile(file); }} />
            </label>
          </div>
          {ocrMsg && <div className={`mt-2 text-[11px] leading-relaxed ${ocrMsg.success ? 'text-ur-emerald' : 'text-ur-rose'}`}>{ocrMsg.success ? '✓ ' : '✗ '}{ocrMsg.message}</div>}
        </div>

        {/* UR 选手数据 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-ur-emerald">UR 选手数据（5 名）<span className="text-ur-rose">*</span></label>
          </div>
          <div className={`${rowCls} text-[10px] text-gray-600 px-1 mb-1`}>
            <span>选手</span><span className="text-center">杀</span><span className="text-center">死</span><span className="text-center">助攻</span><span className="text-center">ADR</span><span className="text-center">Rating</span>
          </div>
          <div className="space-y-1.5">
            {urRows.map((r, i) => (
              <div key={i} className={rowCls}>
                <select value={r.player_id} onChange={e => setUrRow(i, 'player_id', e.target.value)}
                  className="bg-ur-bg border border-ur-border rounded px-2 py-1.5 text-white text-xs focus:border-ur-cyan/50 focus:outline-none">
                  <option value="">选择选手</option>
                  {rosterPlayers.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                </select>
                <input type="number" min="0" value={r.kills} onChange={e => setUrRow(i, 'kills', e.target.value)} className={numCls} />
                <input type="number" min="0" value={r.deaths} onChange={e => setUrRow(i, 'deaths', e.target.value)} className={numCls} />
                <input type="number" min="0" value={r.assists} onChange={e => setUrRow(i, 'assists', e.target.value)} className={numCls} />
                <input type="number" min="0" step="0.1" value={r.adr} onChange={e => setUrRow(i, 'adr', e.target.value)} className={numCls} />
                <input type="number" min="0" step="0.01" value={r.rating} onChange={e => setUrRow(i, 'rating', e.target.value)} className={numCls} />
              </div>
            ))}
          </div>
        </div>

        {/* 对手选手数据（可选） */}
        <details className="mb-3 group">
          <summary className="text-xs text-ur-muted cursor-pointer select-none hover:text-ur-text mb-1">对手选手数据（可选，点击展开）</summary>
          <div className={`${rowCls} text-[10px] text-gray-600 px-1 mb-1 mt-2`}>
            <span>对手名</span><span className="text-center">杀</span><span className="text-center">死</span><span className="text-center">助攻</span><span className="text-center">ADR</span><span className="text-center">Rating</span>
          </div>
          <div className="space-y-1.5">
            {oppRows.map((r, i) => (
              <div key={i} className={rowCls}>
                <input type="text" value={r.name} onChange={e => setOppRow(i, 'name', e.target.value)} placeholder={`对手 ${i + 1}`}
                  className="bg-ur-bg border border-ur-border rounded px-2 py-1.5 text-white text-xs focus:border-ur-cyan/50 focus:outline-none placeholder:text-gray-600" />
                <input type="number" min="0" value={r.kills} onChange={e => setOppRow(i, 'kills', e.target.value)} className={numCls} />
                <input type="number" min="0" value={r.deaths} onChange={e => setOppRow(i, 'deaths', e.target.value)} className={numCls} />
                <input type="number" min="0" value={r.assists} onChange={e => setOppRow(i, 'assists', e.target.value)} className={numCls} />
                <input type="number" min="0" step="0.1" value={r.adr} onChange={e => setOppRow(i, 'adr', e.target.value)} className={numCls} />
                <input type="number" min="0" step="0.01" value={r.rating} onChange={e => setOppRow(i, 'rating', e.target.value)} className={numCls} />
              </div>
            ))}
          </div>
        </details>
      </>)}

      {result && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${result.success ? 'bg-ur-emerald/10 border-ur-emerald/30 text-ur-emerald' : 'bg-ur-rose/10 border-ur-rose/30 text-ur-rose'}`}>
          {result.success ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting}
          className={`flex-1 px-6 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50 transition-all ${editId ? 'bg-ur-amber text-black hover:bg-ur-amber/80' : 'bg-ur-emerald text-white hover:bg-ur-emerald/80'}`}>
          {submitting ? (editId ? '保存中...' : '录入中...') : (editId ? '保存修改' : '录入到数据库')}
        </button>
        {editId && (
          <button type="button" onClick={() => onCancelEdit && onCancelEdit()} disabled={submitting}
            className="px-5 py-2.5 text-sm font-semibold bg-white/5 text-ur-muted border border-ur-border rounded-lg hover:bg-white/10 disabled:opacity-50 transition-all">
            取消编辑
          </button>
        )}
      </div>
    </div>
  );
}

// ============ 赛事工作台弹窗（三标签：赛事介绍 / 赛事详情 / 比赛记录） ============
function TournamentWorkspaceModal({ tournamentId, onClose, onChanged }) {
  const [tab, setTab] = useState('info');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [newStageName, setNewStageName] = useState('');
  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [editMatchId, setEditMatchId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [delMsg, setDelMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tournaments/${tournamentId}`);
      setDetail(data);
      setForm(formFromTournament(data.tournament || {}));
    } catch (e) {
      setDetail({ error: e.response?.data?.error || '加载失败' });
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  // 现役花名册（录入选手下拉用）
  useEffect(() => {
    api.get('/players?division=cs2&status=active&team_type=roster')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setRosterPlayers(list.filter(p => (p.status === 'active' || p.status === undefined) && (p.team_type === 'roster' || p.team_type === undefined)));
      })
      .catch(() => setRosterPlayers([]));
  }, []);

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const saveTournament = async () => {
    if (!form.name.trim()) { setSavedMsg({ ok: false, text: '赛事名称必填' }); return; }
    setSaving(true); setSavedMsg(null);
    try {
      await api.put(`/tournaments/${tournamentId}`, form);
      setSavedMsg({ ok: true, text: '已保存赛事信息' });
      load();
      onChanged && onChanged();
    } catch (e) {
      setSavedMsg({ ok: false, text: e.response?.data?.error || '保存失败' });
    }
    setSaving(false);
  };

  const addStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await api.post(`/tournaments/${tournamentId}/stages`, { stage_name: newStageName.trim() });
      setNewStageName('');
      load();
      onChanged && onChanged();
    } catch (e) { alert(e.response?.data?.error || '添加阶段失败'); }
  };

  const updateStage = async (stageId, patch) => {
    try {
      await api.put(`/tournaments/stages/${stageId}`, patch);
      load();
    } catch (e) { alert(e.response?.data?.error || '更新阶段失败'); }
  };

  const deleteStage = async (stageId) => {
    if (!window.confirm('确认删除此阶段？该阶段下的比赛会解除阶段绑定（比赛记录保留）。')) return;
    try {
      await api.delete(`/tournaments/stages/${stageId}`);
      load();
      onChanged && onChanged();
    } catch (e) { alert(e.response?.data?.error || '删除阶段失败'); }
  };

  const setCurrentStage = async (stageId) => {
    try {
      await api.put(`/tournaments/${tournamentId}`, { current_stage_id: stageId });
      load();
      onChanged && onChanged();
    } catch (e) { alert(e.response?.data?.error || '设置失败'); }
  };

  // 录入/编辑完成回调：刷新赛事详情(含比赛列表)，退出编辑态
  const onEntryDone = () => {
    setEditMatchId(null);
    load();
    onChanged && onChanged();
  };

  // 比赛记录：编辑→切到赛事详情并加载该场；删除→DELETE
  const startEdit = (matchId) => {
    setDelMsg(null);
    setEditMatchId(matchId);
    setTab('detail');
    setTimeout(() => { document.getElementById('match-entry-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  };

  const deleteMatch = async (matchId) => {
    if (!window.confirm('确定删除这场比赛？该场的选手数据会一并删除，且不可恢复。')) return;
    setDeletingId(matchId);
    try {
      const { data } = await api.delete(`/training/manual-match/${matchId}`);
      setDelMsg({ ok: true, text: data.message || '已删除' });
      if (editMatchId === matchId) setEditMatchId(null);
      load();
      onChanged && onChanged();
    } catch (e) {
      setDelMsg({ ok: false, text: e.response?.data?.error || '删除失败' });
    }
    setDeletingId(null);
  };

  // 比赛记录列表：从各阶段 matches 拍平成场级
  const matchGroups = [];
  (detail?.stages || []).forEach(s => {
    (s.matches || []).forEach(m => matchGroups.push({ ...m, stage_name: s.stage_name }));
  });

  const TABS = [
    ['info', '赛事介绍'],
    ['detail', '赛事详情'],
    ['matches', '比赛记录'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-ur-card border border-ur-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {loading && <div className="text-center py-12 text-ur-muted">加载中...</div>}
        {detail && detail.error && <div className="text-center py-12 text-ur-rose">{detail.error}</div>}
        {detail && !detail.error && form && (
          <>
            <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-ur-border">
              <div className="min-w-0">
                <h3 className="font-display text-xl font-bold text-white truncate">{detail.tournament.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-ur-muted flex-wrap">
                  {(() => { const ended = isTournamentEnded(detail.tournament, detail.stages); return (
                    <span className={`px-2 py-0.5 rounded border ${STATUS_COLORS[ended ? '已结束' : detail.tournament.status] || ''}`}>{ended ? '已结束' : detail.tournament.status}</span>
                  ); })()}
                  {detail.tournament.start_date && <span>{detail.tournament.start_date} ~ {detail.tournament.end_date || '?'}</span>}
                  {detail.tournament.placement && <span className="text-ur-amber">· {detail.tournament.placement}</span>}
                </div>
              </div>
              <button onClick={onClose} className="text-ur-muted hover:text-white text-xl leading-none px-2 flex-shrink-0">×</button>
            </div>

            <div className="flex gap-1 px-6 pt-3 border-b border-ur-border">
              {TABS.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${tab === key ? 'text-ur-cyan border-ur-cyan' : 'text-ur-muted border-transparent hover:text-ur-text'}`}>
                  {label}
                  {key === 'detail' && <span className="ml-1 text-[10px] text-ur-muted">({detail.stages.length})</span>}
                  {key === 'matches' && <span className="ml-1 text-[10px] text-ur-muted">({matchGroups.length})</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {tab === 'info' && (
                <div>
                  <TournamentFields f={form} set={setField} stages={detail.stages} />
                  {savedMsg && (
                    <div className={`mt-3 px-3 py-2 rounded-lg text-sm border ${savedMsg.ok ? 'bg-ur-emerald/10 border-ur-emerald/30 text-ur-emerald' : 'bg-ur-rose/10 border-ur-rose/30 text-ur-rose'}`}>
                      {savedMsg.ok ? '✓ ' : '✗ '}{savedMsg.text}
                    </div>
                  )}
                  <button onClick={saveTournament} disabled={saving}
                    className="mt-4 w-full py-2.5 rounded-lg bg-ur-cyan/90 hover:bg-ur-cyan text-ur-bg font-semibold text-sm disabled:opacity-50">
                    {saving ? '保存中...' : '保存赛事信息'}
                  </button>
                </div>
              )}

              {tab === 'detail' && (
                <div>
                  <div className="mb-4 p-3 rounded-xl bg-ur-bg border border-ur-border">
                    <div className="flex items-center gap-2">
                      <input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addStage()}
                        placeholder="输入阶段名（如 海选 / 封选 / 淘汰赛）"
                        className="flex-1 bg-ur-card border border-ur-border rounded-lg px-3 py-2 text-sm text-ur-text focus:border-ur-cyan/50 focus:outline-none" />
                      <button onClick={addStage} className="px-4 py-2 rounded-lg bg-ur-indigo/90 hover:bg-ur-indigo text-white text-sm font-semibold whitespace-nowrap">+ 添加阶段</button>
                    </div>
                  </div>

                  {detail.stages.length === 0 && (
                    <div className="text-center py-8 text-ur-muted text-sm">还没有阶段，点上方"+ 添加阶段"创建</div>
                  )}
                  <div className="space-y-3">
                    {detail.stages.map(stage => (
                      <div key={stage.id || 'none'} className="rounded-xl border border-ur-border overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-ur-bg">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm">{stage.stage_name}</span>
                            {stage.id && (
                              <span className={`text-xs px-2 py-0.5 rounded ${STAGE_STATUS_COLORS[stage.status] || ''}`}>{stage.status}</span>
                            )}
                            {detail.tournament.current_stage_id === stage.id && stage.id && (
                              <span className="text-xs px-2 py-0.5 rounded bg-ur-purple/15 text-ur-purple">当前阶段</span>
                            )}
                            <span className="text-xs text-ur-muted">· {(stage.matches || []).length} 场比赛</span>
                          </div>
                          {stage.id && (
                            <div className="flex items-center gap-1">
                              <select value={stage.bo_format || 'BO1'} onChange={e => updateStage(stage.id, { bo_format: e.target.value })}
                                className="text-xs bg-ur-card border border-ur-border rounded px-2 py-1 text-ur-amber focus:outline-none" title="本阶段赛制">
                                <option>BO1</option><option>BO3</option><option>BO5</option>
                              </select>
                              <select value={stage.status} onChange={e => updateStage(stage.id, { status: e.target.value })}
                                className="text-xs bg-ur-card border border-ur-border rounded px-2 py-1 text-ur-text focus:outline-none">
                                <option>未开始</option><option>进行中</option><option>已结束</option>
                              </select>
                              {detail.tournament.current_stage_id !== stage.id && (
                                <button onClick={() => setCurrentStage(stage.id)} className="text-xs px-2 py-1 rounded border border-ur-border text-ur-purple hover:bg-ur-purple/10" title="设为当前阶段">设当前</button>
                              )}
                              <button onClick={() => deleteStage(stage.id)} className="text-xs px-2 py-1 rounded border border-ur-rose/30 text-ur-rose hover:bg-ur-rose/10">删除</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 数据录入区（锁定本赛事） */}
                  <div id="match-entry-anchor" className="mt-5">
                    <div className="text-[11px] text-ur-muted tracking-wide mb-2">📝 数据录入区（录入本赛事比赛 · 赛事已锁定）</div>
                    <MatchEntryForm
                      tournamentId={tournamentId}
                      tournamentName={detail.tournament.name}
                      stages={detail.stages.filter(s => s.id)}
                      rosterPlayers={rosterPlayers}
                      editId={editMatchId}
                      onDone={onEntryDone}
                      onCancelEdit={() => setEditMatchId(null)}
                    />
                  </div>
                </div>
              )}

              {tab === 'matches' && (
                <div>
                  {delMsg && (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${delMsg.ok ? 'bg-ur-emerald/10 border-ur-emerald/30 text-ur-emerald' : 'bg-ur-rose/10 border-ur-rose/30 text-ur-rose'}`}>
                      {delMsg.ok ? '✓ ' : '✗ '}{delMsg.text}
                    </div>
                  )}
                  {matchGroups.length === 0 ? (
                    <div className="text-center py-10 text-ur-muted text-sm">本赛事还没有比赛记录</div>
                  ) : (
                    <div className="space-y-2">
                      {matchGroups.map((m, idx) => {
                        const parts = (m.series_score || '0:0').split(':').map(Number);
                        const a = parts[0] || 0; const b = parts[1] || 0;
                        const won = a > b;
                        const firstMapId = (m.maps && m.maps[0] && m.maps[0].id) ? m.maps[0].id : m.id;
                        return (
                          <div key={idx} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-ur-bg border border-ur-border">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-ur-muted text-xs whitespace-nowrap">{m.match_date}</span>
                              {m.stage_name && <span className="text-[11px] px-1.5 py-0.5 rounded bg-ur-cyan/10 text-ur-cyan whitespace-nowrap">{m.stage_name}</span>}
                              <span className="text-white text-sm truncate">vs {m.opponent}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {m.is_walkover ? (
                                <span className={`text-sm font-mono ${won ? 'text-ur-emerald' : 'text-ur-rose'}`}>弃权{won ? '胜' : '负'}</span>
                              ) : (
                                <span className={`text-sm font-mono font-bold ${won ? 'text-ur-emerald' : a < b ? 'text-ur-rose' : 'text-ur-amber'}`}>{m.series_score}</span>
                              )}
                              <span className="text-xs text-ur-muted">{m.is_walkover ? '弃权场次' : `${(m.maps || []).length} 张图`}</span>
                              <div className="flex items-center gap-1.5">
                                {(m.maps || []).length > 1 ? (
                                  <span className="text-[10px] text-ur-muted" title="多图系列赛请在赛事详情按图逐张编辑">多图</span>
                                ) : (
                                  <button onClick={() => startEdit(firstMapId)} className="text-ur-amber hover:text-ur-amber/70 p-1" title="编辑这场">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                )}
                                <button onClick={() => deleteMatch(firstMapId)} disabled={deletingId === firstMapId} className="text-ur-rose hover:text-ur-rose/70 p-1 disabled:opacity-40" title="删除这场">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-4 text-[11px] text-ur-muted text-center">编辑会跳到「赛事详情」的录入表单回填该场 · 多图系列赛按图逐张编辑</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ 主组件：赛事管理 ============
export default function TournamentManager() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tournaments');
      setTournaments(Array.isArray(data) ? data : []);
    } catch (e) {
      setTournaments([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTournament = async (form) => {
    await api.post('/tournaments', form);
    setShowCreate(false);
    load();
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/tournaments/${deleteId}`);
      setDeleteId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || '删除失败'); }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-end mb-3">
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-ur-cyan/90 hover:bg-ur-cyan text-ur-bg font-semibold text-sm">+ 新建赛事</button>
      </div>

      {loading && <div className="text-center py-8 text-ur-muted text-sm">加载中...</div>}
      {!loading && tournaments.length === 0 && (
        <div className="text-center py-8 text-ur-muted text-sm">暂无赛事，点"+ 新建赛事"创建第一个正式赛事</div>
      )}

      {/* 六列对齐表格：赛事 220 / 日期 170 / 奖金 90 / 阶段 90 / 赛制 - / 操作 150 */}
      {!loading && tournaments.length > 0 && (
        <div className="tm-table">
          <div className="grid items-center px-3 py-2 text-[11px] text-ur-muted font-semibold"
            style={{ gridTemplateColumns: '72px minmax(150px,1fr) 148px 76px minmax(110px,150px) 132px', gap: 8 }}>
            <span className="whitespace-nowrap">状态</span><span className="whitespace-nowrap">赛事</span><span className="whitespace-nowrap">日期</span><span className="whitespace-nowrap">VRS积分</span><span className="whitespace-nowrap">当前阶段</span><span className="text-right pr-1 whitespace-nowrap">操作</span>
          </div>
          <div className="space-y-2">
            {tournaments.map(t => {
              const ended = isTournamentEnded(t);
              const stTag = ended ? '已结束' : t.status;
              const rowBorder = ended ? 'rgba(114,136,189,.28)' : stTag === '进行中' ? 'rgba(56,189,248,.45)' : 'rgba(255,215,106,.45)';
              const badge = ended
                ? { background: 'rgba(114,136,189,.35)', color: '#1a2340', border: '1px solid transparent', fontWeight: 700 }
                : stTag === '进行中'
                  ? { border: '1px solid rgba(56,189,248,.55)', color: '#38bdf8', background: 'rgba(56,189,248,.08)' }
                  : { border: '1px solid rgba(255,215,106,.55)', color: '#ffd76a', background: 'rgba(255,215,106,.08)' };
              return (
                <div key={t.id}
                  className="grid items-center px-3 py-3 rounded-xl bg-ur-bg transition-colors hover:bg-white/[0.03]"
                  style={{ gridTemplateColumns: '72px minmax(150px,1fr) 148px 76px minmax(110px,150px) 132px', gap: 8, border: `1px solid ${rowBorder}`, opacity: ended ? 0.6 : 1 }}>
                  <span><span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={badge}>{stTag}</span></span>
                  <span className="min-w-0">
                    <span className={`font-display font-bold truncate block ${ended ? 'text-ur-muted' : 'text-white'}`} title={t.name}>{t.name}</span>
                  </span>
                  <span className="text-xs text-ur-muted whitespace-nowrap">{t.start_date ? `${t.start_date} ~ ${t.end_date || '?'}` : '—'}</span>
                  <span className="text-xs">
                    {t.has_vrs
                      ? <span className="px-1.5 py-0.5 rounded bg-ur-amber/15 text-ur-amber whitespace-nowrap">计入</span>
                      : <span className="text-ur-muted">不计入</span>}
                  </span>
                  <span className="text-xs min-w-0 truncate">
                    {ended && t.placement && <span className="px-1.5 py-0.5 rounded bg-ur-amber/15 text-ur-amber">{t.placement}</span>}
                    {!ended && t.current_stage_name && <span className="px-1.5 py-0.5 rounded bg-ur-cyan/10 text-ur-cyan">{t.current_stage_name} · 进行中</span>}
                    {!ended && !t.current_stage_name && <span className="text-ur-muted">—</span>}
                    {ended && !t.placement && <span className="text-ur-muted">—</span>}
                  </span>
                  <span className="flex items-center gap-2 justify-end">
                    <button onClick={() => setWorkspaceId(t.id)} className="text-xs px-3 py-1.5 rounded-lg border border-ur-cyan/40 text-ur-cyan hover:bg-ur-cyan/10">管理</button>
                    <button onClick={() => setDeleteId(t.id)} className="text-xs px-3 py-1.5 rounded-lg border border-ur-rose/30 text-ur-rose hover:bg-ur-rose/10">删除</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <TournamentFormModal onClose={() => setShowCreate(false)} onSave={createTournament} />
      )}

      {workspaceId && (
        <TournamentWorkspaceModal tournamentId={workspaceId} onClose={() => setWorkspaceId(null)} onChanged={load} />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-ur-card border border-ur-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white mb-2">删除赛事</h3>
            <p className="text-ur-muted text-sm mb-5">确认删除此赛事？阶段会一并删除，关联的比赛记录会解除绑定（比赛本身保留）。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg border border-ur-border text-ur-muted hover:text-ur-text text-sm">取消</button>
              <button onClick={confirmDelete} className="flex-1 py-2 rounded-lg bg-ur-rose/90 hover:bg-ur-rose text-white font-semibold text-sm">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
