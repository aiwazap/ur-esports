import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import TournamentManager from './TournamentManager';
import Users from './Users';
import './workstation-v2.css';

/* ================================================================
   主组件
   ================================================================ */
/* ── 可折叠栏（数据管理 v2：赛事管理默认展开，其余默认收起） ── */
function AdminSection({ title, sub, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="mb-5 rounded-2xl border border-ur-border bg-ur-card">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-white/[0.02]"
        onClick={() => setOpen(o => !o)}>
        <h3 className="font-sans font-semibold text-base text-white flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-ur-amber" />{title}
          {sub && <span className="text-xs font-normal text-gray-500">{sub}</span>}
        </h3>
        <span className="text-ur-muted text-sm">{open ? '▾ 收起' : '› 展开'}</span>
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

export default function Admin() {
  const DM_NAV = [
    { id: 'tour',     label: '赛事管理',   icon: 'trophy' },
    { id: 'maintain', label: '数据维护',   icon: 'log' },
    { id: 'json',     label: '训练赛JSON', icon: 'quick' },
    { id: 'dict',     label: '字段库维护', icon: 'mistakes' },
    { id: 'users',    label: '用户与权限', icon: 'hub' },
  ];
  const [sec, setSec] = useState('tour');
  const { t } = useLang();

  /* ── JSON Import State ── */
  const [jsonFiles, setJsonFiles] = useState([]);
  const [opponent, setOpponent] = useState('');
  const [importing, setImporting] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [importError, setImportError] = useState(null);

  /* ── Image Import State (旧, 保留兼容) ── */
  const [imageFiles, setImageFiles] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageResult, setImageResult] = useState(null);
  const [imageOpponent, setImageOpponent] = useState('');
  const [imageMatchDate, setImageMatchDate] = useState('');

  /* ── 手动录入 State ── */
  const emptyUrRow = () => ({ player_id: '', kills: '', deaths: '', assists: '', adr: '', rating: '' });
  const emptyOppRow = () => ({ name: '', kills: '', deaths: '', assists: '', adr: '', rating: '' });
  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [manualForm, setManualForm] = useState({ match_date: '', opponent: '', map_name: '', our_score: '', their_score: '', match_type: 'official', tournament_id: '', stage_id: '', is_walkover: false, walkover_winner: 'us' });
  // 正赛录入用：赛事列表 + 选中赛事的阶段列表
  const [tournamentOpts, setTournamentOpts] = useState([]);
  const [stageOpts, setStageOpts] = useState([]);
  const [urRows, setUrRows] = useState([emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()]);
  const [urOpen, setUrOpen] = useState(false); // UR 选手数据默认收起（OCR 为主）
  const [oppRows, setOppRows] = useState([emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()]);
  const [bpSteps, setBpSteps] = useState([]); // 本场 BP 流程 [{team,action,map}]
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState(null);

  /* ── 已录入比赛列表 / 编辑 / 删除 State ── */
  const [matchList, setMatchList] = useState([]);
  const [matchListLoading, setMatchListLoading] = useState(false);
  const [matchListType, setMatchListType] = useState('all'); // all | scrim | official
  const [matchListSearch, setMatchListSearch] = useState('');
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── Logs State ── */
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);


  /* ── Error Types State ── */
  const [errTypes, setErrTypes] = useState([]);
  const [errTypesLoading, setErrTypesLoading] = useState(false);
  const [errTypeEdit, setErrTypeEdit] = useState(null); // null | {editing object}
  const [errTypeForm, setErrTypeForm] = useState({ category: '', name: '', keywords: '', description: '', severity: 'mid' });
  const [errTypeFilter, setErrTypeFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await api.get('/admin/logs');
      setLogs(data);
    } catch { /* ignore */ }
    setLogsLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  /* ── 手动录入逻辑 ── */
  useEffect(() => {
    api.get('/players?division=cs2&status=active&team_type=roster')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        // 前端兜底过滤：只保留现役正式队员(active+roster)，排除离队(former/left)等
        const filtered = list.filter(p =>
          (p.status === 'active' || p.status === undefined) &&
          (p.team_type === 'roster' || p.team_type === undefined)
        );
        setRosterPlayers(filtered);
      })
      .catch(() => {});
  }, []);

  // 加载赛事列表（供正赛录入的"选赛事"下拉）
  useEffect(() => {
    api.get('/tournaments')
      .then(({ data }) => setTournamentOpts(Array.isArray(data) ? data : []))
      .catch(() => setTournamentOpts([]));
  }, []);

  // 选中赛事后，拉取该赛事的阶段列表（供"选阶段"下拉）
  useEffect(() => {
    if (manualForm.match_type !== 'official' || !manualForm.tournament_id) {
      setStageOpts([]);
      return;
    }
    api.get(`/tournaments/${manualForm.tournament_id}`)
      .then(({ data }) => setStageOpts(Array.isArray(data?.stages) ? data.stages : []))
      .catch(() => setStageOpts([]));
  }, [manualForm.match_type, manualForm.tournament_id]);

  // 选了正赛阶段后，按该阶段 BO 初始化 BP 流程模板（BO1 单图无 BP；编辑模式不重置）
  useEffect(() => {
    if (editingMatchId) return;
    if (manualForm.match_type !== 'official' || !manualForm.stage_id) { setBpSteps([]); return; }
    const stage = stageOpts.find(s => String(s.id) === String(manualForm.stage_id));
    const bo = (stage?.bo_format || 'BO1').toUpperCase();
    const TPL = {
      BO3: [['ur','ban'],['opp','ban'],['ur','pick'],['opp','pick'],['ur','ban'],['opp','ban'],['','decider']],
      BO5: [['ur','ban'],['opp','ban'],['ur','pick'],['opp','pick'],['ur','pick'],['opp','pick'],['','decider']],
    };
    if (!TPL[bo]) { setBpSteps([]); return; }
    setBpSteps(TPL[bo].map(([team, action]) => ({ team, action, map: '' })));
  }, [manualForm.match_type, manualForm.stage_id, stageOpts, editingMatchId]);

  const setUrRow = (i, key, val) => setUrRows(rows => rows.map((r, j) => j === i ? { ...r, [key]: val } : r));
  const setOppRow = (i, key, val) => setOppRows(rows => rows.map((r, j) => j === i ? { ...r, [key]: val } : r));

  /* ── 已录入比赛：加载列表（按类型，近 120 天） ── */
  const loadMatchList = useCallback(async () => {
    setMatchListLoading(true);
    try {
      const { data } = await api.get('/matches/grouped', { params: { matchType: 'official', days: 120 } });
      const flat = [];
      (data.groups || []).forEach(g => {
        (g.maps || []).forEach(m => {
          flat.push({
            id: m.id,
            match_date: g.match_date,
            opponent: g.opponent,
            map_name: m.map_name,
            our_score: m.our_score,
            their_score: m.their_score,
            result: m.result,
            is_walkover: m.is_walkover,
            match_type: g.match_type,
            tournament_name: g.tournament_name,
          });
        });
      });
      flat.sort((a, b) => (b.id || 0) - (a.id || 0)); // 按录入时间倒序（id 为自增录入序，不受比赛日期编辑影响）
      setMatchList(flat);
    } catch { setMatchList([]); }
    setMatchListLoading(false);
  }, [matchListType]);

  useEffect(() => { loadMatchList(); }, [loadMatchList]);

  /* ── 编辑：拉取整场数据回填表单，进入编辑模式 ── */
  const startEditMatch = async (id) => {
    setManualResult(null);
    try {
      const { data } = await api.get(`/training/manual-match/${id}`);
      setManualForm({
        match_date: data.match_date || '',
        opponent: data.opponent || '',
        map_name: data.map_name || '',
        our_score: data.our_score != null ? String(data.our_score) : '',
        their_score: data.their_score != null ? String(data.their_score) : '',
        match_type: data.match_type || 'scrim',
        tournament_id: data.tournament_id != null ? String(data.tournament_id) : '',
        stage_id: data.stage_id != null ? String(data.stage_id) : '',
        is_walkover: !!data.is_walkover,
        walkover_winner: (Number(data.our_score) > Number(data.their_score)) ? 'us' : 'them',
      });
      try { setBpSteps(data.bp_json ? JSON.parse(data.bp_json) : []); } catch { setBpSteps([]); }
      const ur = [emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()];
      (data.ur_players || []).slice(0, 5).forEach((p, i) => {
        ur[i] = {
          player_id: p.player_id ? String(p.player_id) : '',
          kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '',
          adr: p.adr ?? '', rating: p.rating ?? '',
        };
      });
      setUrRows(ur);
      const opp = [emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()];
      (data.opp_players || []).slice(0, 5).forEach((p, i) => {
        opp[i] = {
          name: p.name || '',
          kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '',
          adr: p.adr ?? '', rating: p.rating ?? '',
        };
      });
      setOppRows(opp);
      setEditingMatchId(id);
      setUrOpen(true); // 编辑回填后展开核对
      document.getElementById('manual-entry-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setManualResult({ success: false, message: e.response?.data?.error || '加载比赛数据失败' });
    }
  };

  /* ── 退出编辑模式，清空表单（keepMsg=true 时保留结果提示） ── */
  const cancelEditMatch = (keepMsg = false) => {
    setEditingMatchId(null);
    setManualForm({ match_date: '', opponent: '', map_name: '', our_score: '', their_score: '', match_type: 'official', tournament_id: '', stage_id: '', is_walkover: false, walkover_winner: 'us' });
    setUrRows([emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()]);
    setOppRows([emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()]);
    if (!keepMsg) setManualResult(null);
  };

  /* ── 删除整场（含选手数据，不可恢复，先确认） ── */
  const deleteMatch = async (id) => {
    if (!window.confirm('确定删除这场比赛？该场的选手数据会一并删除，且不可恢复。')) return;
    setDeletingId(id);
    try {
      const { data } = await api.delete(`/training/manual-match/${id}`);
      setManualResult({ success: true, message: data.message || '已删除' });
      if (editingMatchId === id) cancelEditMatch(true);
      loadMatchList();
    } catch (e) {
      setManualResult({ success: false, message: e.response?.data?.error || '删除失败' });
    }
    setDeletingId(null);
  };

  // 从近期赛事页「编辑」跳转而来：URL ?edit=<id> → 自动回填该场进入编辑模式
  useEffect(() => {
    const eid = searchParams.get('edit');
    if (eid) {
      startEditMatch(Number(eid));
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleManualSubmit = async () => {
    setManualResult(null);
    const f = manualForm;
    if (!f.match_date || !f.opponent.trim()) {
      setManualResult({ success: false, message: '请填写比赛日期和对手名称' }); return;
    }
    // 正赛必须选赛事（阶段可选）
    if (f.match_type === 'official' && !f.tournament_id) {
      setManualResult({ success: false, message: '正赛录入需先选择所属赛事' }); return;
    }
    // 弃权场次：免填比分与选手；正常场次才校验
    if (!f.is_walkover) {
      if (!f.map_name) {
        setManualResult({ success: false, message: '请先选择本场是第几张图（地图）' }); return;
      }
      if (f.our_score === '' || f.their_score === '') {
        setManualResult({ success: false, message: '比分为空——请先上传该图记分板截图，由识别自动填入比分' }); return;
      }
      const filled = urRows.filter(r => r.player_id && r.kills !== '' && r.deaths !== '' && r.adr !== '');
      if (filled.length < 5) { setManualResult({ success: false, message: `UR 选手数据不全（${filled.length}/5），需填满 5 名` }); return; }
      if (new Set(filled.map(r => r.player_id)).size < 5) { setManualResult({ success: false, message: '5 名选手有重复，请检查下拉选择' }); return; }
    }

    setManualSubmitting(true);
    try {
      const payload = {
        match_date: f.match_date, opponent: f.opponent.trim(), map_name: f.map_name,
        our_score: f.our_score, their_score: f.their_score,
        match_type: f.match_type,
        tournament_id: f.match_type === 'official' ? f.tournament_id : null,
        stage_id: f.match_type === 'official' ? (f.stage_id || null) : null,
        is_walkover: f.is_walkover,
        walkover_winner: f.walkover_winner,
        ur_players: urRows,
        opp_players: oppRows.filter(r => r.name.trim()),
        bp_json: (f.match_type === 'official' && bpSteps.length) ? JSON.stringify(bpSteps) : null,
      };
      const { data } = editingMatchId
        ? await api.put(`/training/manual-match/${editingMatchId}`, payload)
        : await api.post('/training/manual-match', payload);
      setManualResult({ success: true, message: data.message });
      loadMatchList();
      if (editingMatchId) {
        cancelEditMatch(true);
      } else {
        setUrRows([emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()]);
        setOppRows([emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()]);
        setManualForm(prev => ({ ...prev, our_score: '', their_score: '', is_walkover: false }));
      }
    } catch (e) {
      setManualResult({ success: false, message: e.response?.data?.error || (editingMatchId ? '更新失败' : '录入失败') });
    }
    setManualSubmitting(false);
  };

  // 截图自动识别：上传记分板 → AI 提取 → 填入表单（用户核对后再录入）
  const handleOcrFile = async (file) => {
    if (!file) return;
    setOcrMsg(null);
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/admin/ocr-match-image', fd);
      if (Array.isArray(data.ur_players) && data.ur_players.length) {
        const rows = [emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow(), emptyUrRow()];
        data.ur_players.slice(0, 5).forEach((p, i) => {
          rows[i] = {
            player_id: p.player_id ? String(p.player_id) : '',
            kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '',
            adr: p.adr ?? '', rating: p.rating ?? '',
          };
        });
        setUrRows(rows);
      }
      if (Array.isArray(data.opp_players) && data.opp_players.length) {
        const rows = [emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow(), emptyOppRow()];
        data.opp_players.slice(0, 5).forEach((p, i) => {
          rows[i] = {
            name: p.name ?? '',
            kills: p.kills ?? '', deaths: p.deaths ?? '', assists: p.assists ?? '',
            adr: p.adr ?? '', rating: p.rating ?? '',
          };
        });
        setOppRows(rows);
      }
      setManualForm(f => ({
        ...f,
        our_score: data.our_score != null ? String(data.our_score) : f.our_score,
        their_score: data.their_score != null ? String(data.their_score) : f.their_score,
      }));
      setUrOpen(true); // 识别完成自动展开核对
      setOcrMsg({ success: true, message: `识别完成：比分 ${data.our_score ?? '?'} : ${data.their_score ?? '?'}，我方 ${(data.ur_players || []).length} 人（自动匹配花名册 ${data.matched || 0} 人）、对方 ${(data.opp_players || []).length} 人。请核对后录入。` });
    } catch (e) {
      setOcrMsg({ success: false, message: e.response?.data?.error || '识别失败，请重试或换张更清晰的截图' });
    }
    setOcrLoading(false);
  };

  /* ── 犯错类型管理 ── */
  const loadErrTypes = useCallback(async () => {
    setErrTypesLoading(true);
    try { const { data } = await api.get('/training-plans/error-types'); setErrTypes(data); } catch {}
    setErrTypesLoading(false);
  }, []);
  useEffect(() => { loadErrTypes(); }, [loadErrTypes]);

  const handleErrTypeSave = async () => {
    try {
      if (errTypeEdit?.id) {
        await api.put(`/training-plans/error-types/${errTypeEdit.id}`, errTypeForm);
      } else {
        await api.post('/training-plans/error-types', errTypeForm);
      }
      setErrTypeEdit(null);
      setErrTypeForm({ category: '', name: '', keywords: '', description: '', severity: 'mid' });
      loadErrTypes();
    } catch (e) { alert('保存失败: ' + (e.response?.data?.error || e.message)); }
  };

  const handleErrTypeDelete = async (id) => {
    if (!confirm('确定删除此犯错类型？')) return;
    try { await api.delete(`/training-plans/error-types/${id}`); loadErrTypes(); } catch {}
  };

  const handleErrTypeSeed = async () => {
    try {
      const { data } = await api.post('/training-plans/error-types/seed');
      alert(data.message + (data.count ? ` (${data.count}条)` : ''));
      loadErrTypes();
    } catch (e) { alert('初始化失败: ' + (e.response?.data?.error || e.message)); }
  };


  /* ── JSON 导入逻辑 ── */
  const extractOpponentFromFilename = (filename) => {
    const m = filename.match(/^\d{4}[_-](.+?)_[Mm]\d+/);
    return m ? m[1] : '';
  };

  const removeFile = (idx) => {
    const newFiles = jsonFiles.filter((_, i) => i !== idx);
    setJsonFiles(newFiles);
    if (newFiles.length > 0 && !opponent) {
      const inferred = extractOpponentFromFilename(newFiles[0].name);
      if (inferred) setOpponent(inferred);
    }
    setImportError(null);
    setBatchResults(null);
  };

  const handleJsonImport = async () => {
    if (jsonFiles.length === 0) { setImportError('请选择至少一个 JSON 文件'); return; }
    setImporting(true);
    setImportError(null);
    setBatchResults(null);
    try {
      const form = new FormData();
      jsonFiles.forEach(f => form.append('files', f));
      form.append('opponent', opponent.trim());
      const { data } = await api.post('/training/import-match-json-batch', form);
      setBatchResults(data.results);
      if (data.results.every(r => r.success)) {
        setJsonFiles([]);
        setOpponent('');
        const input = document.getElementById('json-file-input');
        if (input) input.value = '';
      }
    } catch (e) {
      setImportError(e.response?.data?.error || '批量导入失败');
    }
    setImporting(false);
  };

  /* ── 赛事数据图片解析 ── */
  const handleImageImport = async () => {
    if (imageFiles.length === 0) { setImageResult({ success: false, message: '请选择至少一个图片文件' }); return; }
    if (!imageOpponent.trim()) { setImageResult({ success: false, message: '请输入对手名称' }); return; }
    if (!imageMatchDate) { setImageResult({ success: false, message: '请选择比赛日期' }); return; }
    setImageUploading(true);
    setImageResult(null);
    try {
      const form = new FormData();
      imageFiles.forEach(f => form.append('images', f));
      form.append('opponent', imageOpponent.trim());
      form.append('match_date', imageMatchDate);
      const { data } = await api.post('/admin/parse-match-images', form);
      setImageResult({ success: true, message: data.message, players: data.players, errors: data.errors });
      if (data.players && data.players.length > 0) {
        setImageFiles([]);
        setImageOpponent('');
        setImageMatchDate('');
        const input = document.getElementById('image-file-input');
        if (input) input.value = '';
      }
    } catch (e) {
      setImageResult({ success: false, message: e.response?.data?.error || '解析失败' });
    }
    setImageUploading(false);
  };

  /* ── 渲染 ── */
  return (
    <div className="max-w-[1440px] mx-auto pb-12 px-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-sans font-semibold text-2xl font-bold text-white">{t('admin.title')}</h2>
      </div>
      <p className="text-gray-500 text-sm mb-6">{t('admin.subtitle')}</p>

      <div className="ws2-layout">
        <aside className="ws2-nav">
          <div className="ws2-nav-group">
            <div className="ws2-nav-gname">数据管理</div>
            {DM_NAV.map((it) => (
              <div key={it.id} className={'ws2-nav-item ' + (sec === it.id ? 'ws2-nav-on' : '')} onClick={() => setSec(it.id)}>
                <img src={`/reshape/home/icons/icon-${it.icon}.png`} alt="" />
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </aside>
        <main className="ws2-main">
      {/* ══ ① 赛事管理（默认展开） ══ */}
      {sec === 'tour' && (<div className="mb-5 rounded-2xl border border-ur-border bg-ur-card p-5">
        <TournamentManager />
      </div>)}

      {/* ══ ② 数据维护（默认收起：仅正赛录入 + OCR + 已录入编辑） ══ */}
      {sec === 'maintain' && (<div className="mb-5 rounded-2xl border border-ur-border bg-ur-card p-5">
      <div className="grid grid-cols-1 gap-6 mb-5 items-stretch">

        {/* ── 手动录入比赛数据 ── */}
        <div id="manual-entry-card" className="data-card" style={editingMatchId ? { borderColor: 'rgba(212,175,55,0.5)', boxShadow: '0 0 0 1px rgba(212,175,55,0.25)' } : undefined}>
          <h3 className="font-sans font-semibold text-base font-semibold text-white mb-1 flex items-center gap-2 flex-wrap">
            <span className="w-1 h-4 rounded" style={{ background: editingMatchId ? '#D4AF37' : '#34d399' }} />
            {editingMatchId ? '编辑比赛数据' : '手动录入比赛数据'}
            {editingMatchId && <span className="text-xs font-normal px-2 py-0.5 rounded bg-ur-amber/15 text-ur-amber border border-ur-amber/30">编辑中 · #{editingMatchId}</span>}
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            {editingMatchId
              ? '正在修改这场已录入的比赛，改完点「保存修改」覆盖原记录；点「取消编辑」放弃。'
              : '客场无 JSON 时手动填写，须填满 5 名 UR 选手（击杀/死亡/助攻/ADR/Rating）方可录入。'}
          </p>

          {/* 比赛类型：仅录正赛（训练赛数据走训练日志/JSON 导入；编辑历史训练赛时如实显示其类型） */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1.5">比赛类型</label>
            <div className={`px-3 py-2 rounded-lg text-xs font-medium border ${manualForm.match_type === 'official' ? 'bg-ur-amber/15 border-ur-amber/40 text-ur-amber' : 'bg-ur-accent/15 border-ur-accent/40 text-ur-accent'}`}>
              {manualForm.match_type === 'official' ? '正赛（手动录入仅限正赛）' : '训练赛（历史记录编辑中）'}
            </div>
          </div>

          {/* 正赛：选赛事 + 选阶段 */}
          {manualForm.match_type === 'official' && (
            <div className="grid grid-cols-2 gap-2.5 mb-3 p-3 rounded-lg bg-ur-amber/[0.06] border border-ur-amber/20">
              <div>
                <label className="block text-xs text-ur-amber mb-1">所属赛事 <span className="text-ur-rose">*</span></label>
                <select value={manualForm.tournament_id}
                  onChange={e => setManualForm(f => ({ ...f, tournament_id: e.target.value, stage_id: '' }))}
                  className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-amber focus:outline-none">
                  <option value="">选择赛事</option>
                  {tournamentOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ur-amber mb-1">所属阶段 <span className="text-gray-600">(可选)</span></label>
                <select value={manualForm.stage_id}
                  onChange={e => setManualForm(f => ({ ...f, stage_id: e.target.value }))}
                  disabled={!manualForm.tournament_id}
                  className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-amber focus:outline-none disabled:opacity-40">
                  <option value="">{manualForm.tournament_id ? '选择阶段' : '请先选赛事'}</option>
                  {stageOpts.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 弃权开关 */}
          <div className="mb-4 p-3 rounded-lg bg-ur-bg border border-ur-border">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={manualForm.is_walkover}
                onChange={e => setManualForm(f => ({ ...f, is_walkover: e.target.checked }))}
                className="w-4 h-4 accent-ur-amber" />
              <span className="text-xs font-semibold text-ur-amber">弃权场次</span>
              <span className="text-[11px] text-gray-500">（对手或我方弃权 · 无需填比分和选手）</span>
            </label>
            {manualForm.is_walkover && (
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1.5">弃权结果 <span className="text-ur-rose">*</span></label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setManualForm(f => ({ ...f, walkover_winner: 'us' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${manualForm.walkover_winner === 'us' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-ur-bg border-ur-border text-gray-500 hover:text-gray-300'}`}>
                    我方胜（对手弃权）
                  </button>
                  <button type="button" onClick={() => setManualForm(f => ({ ...f, walkover_winner: 'them' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${manualForm.walkover_winner === 'them' ? 'bg-ur-rose/15 border-ur-rose/40 text-ur-rose' : 'bg-ur-bg border-ur-border text-gray-500 hover:text-gray-300'}`}>
                    对方胜（我方弃权）
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 比赛信息 */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">比赛日期 <span className="text-ur-rose">*</span></label>
              <input type="date" value={manualForm.match_date} onChange={e => setManualForm(f => ({ ...f, match_date: e.target.value }))}
                className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-accent focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">对手名称 <span className="text-ur-rose">*</span></label>
              <input type="text" value={manualForm.opponent} onChange={e => setManualForm(f => ({ ...f, opponent: e.target.value }))}
                placeholder="如 TYLOO" className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-accent focus:outline-none placeholder:text-gray-600" />
            </div>
            {!manualForm.is_walkover && (<>
            {manualForm.match_type === 'official' && bpSteps.length > 0 && (
              <div className="col-span-2 mb-3 p-3 rounded-lg bg-ur-amber/[0.06] border border-ur-amber/20">
                <div className="text-xs font-semibold text-ur-amber mb-2">本场 BP 流程 <span className="text-gray-500 font-normal">（一次定下打哪几张图 · Pick/决胜即 Map1/2/3）</span></div>
                <div className="space-y-1.5">
                  {bpSteps.map((step, i) => {
                    const mapIdx = bpSteps.slice(0, i + 1).filter(s => s.action === 'pick' || s.action === 'decider').length;
                    const isMap = step.action === 'pick' || step.action === 'decider';
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-600 w-4 text-right shrink-0">{i + 1}</span>
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
                          {['Mirage', 'Ancient', 'Overpass', 'Nuke', 'Inferno', 'Anubis', 'Dust2', 'Vertigo', 'Train'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        {isMap && <span className="text-[10px] text-ur-amber w-10 shrink-0 text-right">Map{mapIdx}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">这次录第几张图 <span className="text-ur-rose">*</span></label>
              {(() => {
                const hasBP = manualForm.match_type === 'official' && bpSteps.length > 0;
                const picks = bpSteps.filter(s => s.action === 'pick' || s.action === 'decider');
                const named = picks.map((s, i) => ({ idx: i + 1, map: s.map })).filter(x => x.map);
                if (hasBP && named.length === 0) {
                  return <div className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-[11px] text-gray-600">请先在上方 BP 里选好各图地图</div>;
                }
                return (
                  <select value={manualForm.map_name} onChange={e => setManualForm(f => ({ ...f, map_name: e.target.value }))}
                    className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-accent focus:outline-none">
                    <option value="">{hasBP ? '选第几张图' : '选择地图'}</option>
                    {hasBP
                      ? named.map(x => <option key={x.map} value={x.map}>Map{x.idx} · {x.map}</option>)
                      : ['Mirage', 'Ancient', 'Overpass', 'Nuke', 'Inferno', 'Anubis', 'Dust2', 'Vertigo', 'Train'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                );
              })()}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">本图比分 <span className="text-[10px] text-gray-600">（由下方截图识别自动填入）</span></label>
              <div className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-xs flex items-center justify-center">
                {(manualForm.our_score !== '' && manualForm.their_score !== '')
                  ? <span className="font-mono text-white text-sm">{manualForm.our_score} : {manualForm.their_score}</span>
                  : <span className="text-gray-600">上传记分板截图后自动识别比分</span>}
              </div>
            </div>
            </>)}
          </div>

          {!manualForm.is_walkover && (<>
          {/* 截图自动识别 */}
          <div className="mb-3 p-3 rounded-lg bg-ur-indigo/[0.06] border border-ur-indigo/25">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ur-indigo">📷 截图自动识别</div>
                <div className="text-[11px] text-gray-500 mt-0.5">上传记分板结算截图，AI 自动填入选手数据与比分，识别后请核对</div>
              </div>
              <label className={`px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer whitespace-nowrap flex-shrink-0 ${ocrLoading ? 'opacity-50 pointer-events-none' : ''} bg-ur-indigo/15 border-ur-indigo/40 text-ur-indigo hover:bg-ur-indigo/25`}>
                {ocrLoading ? '识别中…' : '选择截图'}
                <input type="file" accept="image/*" className="hidden" disabled={ocrLoading}
                  onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; handleOcrFile(file); }} />
              </label>
            </div>
            {ocrMsg && (
              <div className={`mt-2 text-[11px] leading-relaxed ${ocrMsg.success ? 'text-emerald-400' : 'text-ur-rose'}`}>{ocrMsg.success ? '✓ ' : '✗ '}{ocrMsg.message}</div>
            )}
          </div>
          {/* UR 选手数据（默认收起：以截图识别为主、手动为辅；识别/编辑后自动展开核对） */}
          <details className="mb-3" open={urOpen} onToggle={e => setUrOpen(e.target.open)}>
            <summary className="text-xs font-sans font-semibold text-emerald-400 cursor-pointer select-none mb-1.5">
              UR 选手数据（5 名）<span className="text-ur-rose">*</span>
              <span className="text-gray-500 font-normal ml-2">以截图识别为主 · 点击展开手动填写/核对</span>
            </summary>
            <div className="grid grid-cols-[1fr_42px_42px_42px_50px_52px] gap-1.5 text-[10px] text-gray-600 px-1 mb-1">
              <span>选手</span><span className="text-center">杀</span><span className="text-center">死</span><span className="text-center">助攻</span><span className="text-center">ADR</span><span className="text-center">Rating</span>
            </div>
            <div className="space-y-1.5">
              {urRows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_42px_42px_42px_50px_52px] gap-1.5">
                  <select value={r.player_id} onChange={e => setUrRow(i, 'player_id', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-2 py-1.5 text-white text-xs focus:border-ur-accent focus:outline-none">
                    <option value="">选择选手</option>
                    {rosterPlayers.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                  </select>
                  <input type="number" min="0" value={r.kills} onChange={e => setUrRow(i, 'kills', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" value={r.deaths} onChange={e => setUrRow(i, 'deaths', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" value={r.assists} onChange={e => setUrRow(i, 'assists', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" step="0.1" value={r.adr} onChange={e => setUrRow(i, 'adr', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" step="0.01" value={r.rating} onChange={e => setUrRow(i, 'rating', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                </div>
              ))}
            </div>
          </details>

          {/* 对手选手数据（可选） */}
          <details className="mb-4 group">
            <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-200 mb-1">对手选手数据（可选，点击展开）</summary>
            <div className="grid grid-cols-[1fr_42px_42px_42px_50px_52px] gap-1.5 text-[10px] text-gray-600 px-1 mb-1 mt-2">
              <span>对手名</span><span className="text-center">杀</span><span className="text-center">死</span><span className="text-center">助攻</span><span className="text-center">ADR</span><span className="text-center">Rating</span>
            </div>
            <div className="space-y-1.5">
              {oppRows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_42px_42px_42px_50px_52px] gap-1.5">
                  <input type="text" value={r.name} onChange={e => setOppRow(i, 'name', e.target.value)} placeholder={`对手 ${i + 1}`}
                    className="bg-ur-bg border border-ur-border rounded px-2 py-1.5 text-white text-xs focus:border-ur-accent focus:outline-none placeholder:text-gray-600" />
                  <input type="number" min="0" value={r.kills} onChange={e => setOppRow(i, 'kills', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" value={r.deaths} onChange={e => setOppRow(i, 'deaths', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" value={r.assists} onChange={e => setOppRow(i, 'assists', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" step="0.1" value={r.adr} onChange={e => setOppRow(i, 'adr', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                  <input type="number" min="0" step="0.01" value={r.rating} onChange={e => setOppRow(i, 'rating', e.target.value)}
                    className="bg-ur-bg border border-ur-border rounded px-1 py-1.5 text-white text-xs text-center focus:border-ur-accent focus:outline-none" />
                </div>
              ))}
            </div>
          </details>
          </>)}

          <div className="flex gap-2">
            <button onClick={handleManualSubmit} disabled={manualSubmitting}
              className={`flex-1 px-6 py-2.5 text-sm font-sans font-semibold rounded-lg disabled:opacity-50 transition-all ${editingMatchId ? 'bg-ur-amber text-black hover:bg-ur-amber/80' : 'bg-emerald-500 text-white hover:bg-emerald-500/80'}`}>
              {manualSubmitting ? (editingMatchId ? '保存中...' : '录入中...') : (editingMatchId ? '保存修改' : '录入到数据库')}
            </button>
            {editingMatchId && (
              <button type="button" onClick={() => cancelEditMatch()} disabled={manualSubmitting}
                className="px-5 py-2.5 text-sm font-sans font-semibold bg-white/5 text-gray-300 border border-ur-border rounded-lg hover:bg-white/10 disabled:opacity-50 transition-all">
                取消编辑
              </button>
            )}
          </div>

          {manualResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm border ${manualResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-ur-rose/10 border-ur-rose/30 text-ur-rose'}`}>
              {manualResult.success ? '✓ ' : '✗ '}{manualResult.message}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          已录入比赛 — 编辑 / 删除
         ════════════════════════════════════════════════════════════ */}
      <div className="data-card mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-sans font-semibold text-base text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-ur-amber" />已录入正赛
            <span className="text-xs font-normal text-gray-500">
              {matchList.filter(m => !matchListSearch || (m.opponent || '').toLowerCase().includes(matchListSearch.toLowerCase())).length} 场 · 按录入时间倒序
            </span>
          </h3>
          <div className="flex gap-1.5 items-center">
            <button onClick={loadMatchList} disabled={matchListLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-ur-border bg-ur-bg text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-all">
              {matchListLoading ? '加载中…' : '刷新'}
            </button>
          </div>
        </div>

        <input value={matchListSearch} onChange={e => setMatchListSearch(e.target.value)}
          placeholder="搜索对手名…"
          className="w-full h-9 px-3 mb-3 rounded-lg bg-ur-bg border border-ur-border text-white text-sm outline-none focus:border-ur-accent/40 placeholder:text-gray-600" />

        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 360 }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs border-b border-ur-border">
                <th className="text-left py-2 pl-2 font-medium whitespace-nowrap">日期</th>
                <th className="text-left py-2 font-medium">类型</th>
                <th className="text-left py-2 font-medium">对手</th>
                <th className="text-left py-2 font-medium">地图</th>
                <th className="text-center py-2 font-medium">比分</th>
                <th className="text-center py-2 font-medium">结果</th>
                <th className="text-right py-2 pr-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = matchList.filter(m => !matchListSearch || (m.opponent || '').toLowerCase().includes(matchListSearch.toLowerCase()));
                if (matchListLoading) return (<tr><td colSpan={7} className="text-center py-6 text-gray-600 text-xs">加载中…</td></tr>);
                if (rows.length === 0) return (<tr><td colSpan={7} className="text-center py-6 text-gray-600 text-xs">近 120 天暂无正赛记录</td></tr>);
                return rows.map(m => {
                  const isEditing = editingMatchId === m.id;
                  const rc = m.result === 'win' ? '#35e59d' : m.result === 'loss' ? '#ff597d' : '#ffc45c';
                  return (
                    <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      style={isEditing ? { background: 'rgba(212,175,55,0.08)' } : undefined}>
                      <td className="py-1.5 pl-2 font-mono text-gray-400 text-xs whitespace-nowrap">{m.match_date}</td>
                      <td className="py-1.5">
                        <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={m.match_type === 'official'
                            ? { background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }
                            : { background: 'rgba(104,232,255,0.12)', color: '#68e8ff' }}>
                          {m.match_type === 'official' ? '正赛' : '训练赛'}
                        </span>
                      </td>
                      <td className="py-1.5 text-white font-display max-w-[160px] truncate" title={m.opponent}>{m.opponent}</td>
                      <td className="py-1.5 text-gray-300 whitespace-nowrap">{m.is_walkover ? '弃权' : (m.map_name || '-')}</td>
                      <td className="py-1.5 text-center font-mono whitespace-nowrap" style={{ color: rc }}>{m.our_score}-{m.their_score}</td>
                      <td className="py-1.5 text-center">
                        <span className={`tag text-xs ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                          {m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                        <button onClick={() => startEditMatch(m.id)}
                          className="px-2 py-0.5 text-xs text-gray-500 hover:text-ur-amber transition-colors">编辑</button>
                        <button onClick={() => deleteMatch(m.id)} disabled={deletingId === m.id}
                          className="px-2 py-0.5 text-xs text-gray-500 hover:text-ur-rose disabled:opacity-50 transition-colors">
                          {deletingId === m.id ? '删除中…' : '删除'}
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600 mt-2">点「编辑」会把整场数据回填到上方表单（自动滚到顶部），改完保存即覆盖原记录；「删除」会连同该场选手数据一并移除，不可恢复。</p>
      </div>

      </div>)}

      {/* ══ ③ 赛事数据 JSON 文件（默认收起） ══ */}
      {sec === 'json' && (<div className="mb-5 rounded-2xl border border-ur-border bg-ur-card p-5">
      <div className="grid grid-cols-1 gap-6 items-stretch">
        {/* ── 左：JSON 数据导入 ── */}
        <div className="data-card flex flex-col">
          <h3 className="font-sans font-semibold text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-ur-accent" />
            训练赛 JSON
          </h3>
          <p className="text-xs text-gray-500 mb-4">主场服务器下载的赛事 JSON 文件，可多选批量导入。选手数据按 Steam ID 自动匹配入库。</p>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">对手名称 <span className="text-gray-600 text-xs">(可选)</span></label>
            <input type="text" value={opponent} onChange={e => setOpponent(e.target.value)}
              placeholder="自动从文件名识别，如 0508_Mongolz.A_M1.json → Mongolz.A"
              className="w-full bg-ur-bg border border-ur-border text-white rounded-lg px-4 py-2.5 text-sm
                         focus:border-ur-accent focus:outline-none placeholder:text-gray-600" />
          </div>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">JSON 数据文件 <span className="text-ur-rose">*</span></label>
            <input id="json-file-input" type="file" accept=".json" multiple
              onChange={e => {
                const selected = Array.from(e.target.files || []);
                setJsonFiles(prev => [...prev, ...selected]);
                if (selected.length > 0 && !opponent) {
                  const inferred = extractOpponentFromFilename(selected[0].name);
                  if (inferred && !opponent) setOpponent(inferred);
                }
                setImportError(null); setBatchResults(null);
              }}
              className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg
                         file:border-0 file:text-sm file:font-sans font-semibold file:bg-ur-accent/20 file:text-ur-accent
                         hover:file:bg-ur-accent/30 file:cursor-pointer" />
          </div>
          {jsonFiles.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">已选 {jsonFiles.length} 个文件</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {jsonFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-ur-bg rounded px-3 py-1.5 text-sm group">
                    <span className="text-gray-300 truncate mr-2">{f.name}</span>
                    <button onClick={() => removeFile(i)} disabled={importing}
                      className="text-gray-600 hover:text-ur-rose transition-colors shrink-0 disabled:opacity-30" title="移除">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-auto pt-2">
            <p className="text-xs text-gray-600 mb-2">{t('admin.importDesc')}</p>
            <button onClick={handleJsonImport} disabled={importing || jsonFiles.length === 0}
              className="w-full px-6 py-2.5 text-sm font-sans font-semibold bg-ur-accent text-white rounded-lg
                         hover:bg-ur-accent-hover disabled:opacity-50 transition-all">
              {importing ? `导入中 (${jsonFiles.length} 文件)...` : `导入到数据库 (${jsonFiles.length > 0 ? jsonFiles.length + ' 文件' : ''})`}
            </button>
          </div>
          {importError && (
            <div className="mt-4 p-3 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-sm text-ur-rose">{importError}</div>
          )}
          {batchResults && (
            <div className="mt-4 space-y-2">
              <div className="p-3 bg-ur-accent/10 border border-ur-indigo/30 rounded-lg text-sm flex items-center gap-3">
                <span className="font-sans font-semibold text-ur-accent">
                  批量导入完成：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
                </span>
              </div>
              {batchResults.map((r, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm border ${r.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-ur-rose/10 border-ur-rose/30'}`}>
                  <p className={`font-sans font-semibold mb-0.5 ${r.success ? 'text-emerald-400' : 'text-ur-rose'}`}>
                    {r.success ? '✓' : '✗'} {r.filename}
                  </p>
                  {r.success ? (
                    <p className="text-gray-400">{r.map} · {r.score} · {r.opponent && `${r.opponent} · `}{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '平'} · {r.players} 名选手数据
                      {r.players === 0 && r.totalEntries > 0 && <span className="text-ur-amber ml-1">({r.totalEntries} 条记录未匹配)</span>}
                    </p>
                  ) : <p className="text-ur-rose/70">{r.error}</p>}
                  {r.success && r.players === 0 && r.skippedReasons?.length > 0 && (
                    <div className="mt-1.5 bg-ur-amber/10 border border-ur-amber/20 rounded p-2 text-xs">
                      <p className="text-ur-amber/80 font-sans font-semibold mb-1">诊断信息：</p>
                      {r.skippedReasons.map((reason, j) => <p key={j} className="text-gray-500 ml-2 leading-relaxed">{reason}</p>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      </div>)}

      {/* ════════════════════════════════════════════════════════════
          犯错类型管理
         ════════════════════════════════════════════════════════════ */}
      {/* ══ ④ 字段库维护（默认收起） ══ */}
      {sec === 'dict' && (<div className="mb-5 rounded-2xl border border-ur-border bg-ur-card p-5">
      <div>
        <div className="flex items-center justify-end mb-4">
          <div className="flex gap-2">
            {errTypes.length === 0 && (
              <button onClick={handleErrTypeSeed}
                className="px-3 py-1.5 text-xs font-sans font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg hover:bg-emerald-500/25 transition-all">
                初始化54条
              </button>
            )}
            <button onClick={() => { setErrTypeEdit({}); setErrTypeForm({ category: '', name: '', keywords: '', description: '', severity: 'mid' }); }}
              className="px-3 py-1.5 text-xs font-sans font-semibold bg-ur-accent/15 text-ur-accent border border-ur-accent/25 rounded-lg hover:bg-ur-accent/25 transition-all">
              + 新增
            </button>
          </div>
        </div>

        <input value={errTypeFilter} onChange={e => setErrTypeFilter(e.target.value)}
          placeholder={t('admin.searchErrors')} className="w-full h-9 px-3 mb-3 rounded-lg bg-ur-bg border border-ur-border text-white text-sm outline-none focus:border-ur-accent/40 placeholder:text-gray-600" />

        {errTypeEdit && (
          <div className="mb-4 p-3 bg-ur-bg rounded-lg border border-ur-accent/20 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input value={errTypeForm.category} onChange={e => setErrTypeForm({...errTypeForm, category: e.target.value})}
                placeholder="大类" className="h-8 px-2 rounded bg-white/5 border border-ur-border text-white text-xs outline-none" />
              <input value={errTypeForm.name} onChange={e => setErrTypeForm({...errTypeForm, name: e.target.value})}
                placeholder="犯错名称 *" className="h-8 px-2 rounded bg-white/5 border border-ur-border text-white text-xs outline-none col-span-2" />
            </div>
            <input value={errTypeForm.keywords} onChange={e => setErrTypeForm({...errTypeForm, keywords: e.target.value})}
              placeholder="关键词(逗号分隔，用于自动匹配教练点评)" className="w-full h-8 px-2 rounded bg-white/5 border border-ur-border text-white text-xs outline-none" />
            <div className="flex gap-2 items-center">
              <select value={errTypeForm.severity} onChange={e => setErrTypeForm({...errTypeForm, severity: e.target.value})}
                className="h-8 px-2 rounded bg-white/5 border border-ur-border text-white text-xs outline-none">
                <option value="high">高</option><option value="mid">中</option><option value="low">低</option>
              </select>
              <button onClick={handleErrTypeSave}
                className="h-8 px-4 rounded bg-ur-accent/20 text-ur-accent text-xs font-semibold border border-ur-accent/30 hover:bg-ur-accent/30">
                {errTypeEdit.id ? '更新' : '添加'}
              </button>
              <button onClick={() => setErrTypeEdit(null)}
                className="h-8 px-3 rounded bg-white/5 text-gray-400 text-xs border border-ur-border hover:bg-white/10">取消</button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          {(() => {
            const filtered = errTypes.filter(e =>
              !errTypeFilter || e.name.toLowerCase().includes(errTypeFilter.toLowerCase()) ||
              e.category.toLowerCase().includes(errTypeFilter.toLowerCase()) ||
              (e.keywords||'').toLowerCase().includes(errTypeFilter.toLowerCase())
            );
            const cats = [...new Set(filtered.map(e => e.category))];
            return cats.map(cat => (
              <div key={cat} className="mb-3">
                <div className="text-xs text-gray-500 font-semibold mb-1.5 sticky top-0 bg-[var(--color-background-primary,#0f1620)] py-1">{cat} ({filtered.filter(e=>e.category===cat).length})</div>
                {filtered.filter(e => e.category === cat).map(e => (
                  <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] group text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.severity==='high'?'bg-ur-rose':e.severity==='mid'?'bg-ur-amber':'bg-emerald-400'}`} />
                    <span className="text-white flex-1 truncate">{e.name}</span>
                    <span className="text-gray-600 truncate max-w-[160px]">{e.keywords}</span>
                    <button onClick={() => { setErrTypeEdit(e); setErrTypeForm({ category: e.category, name: e.name, keywords: e.keywords||'', description: e.description||'', severity: e.severity||'mid' }); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-ur-accent transition-all">✎</button>
                    <button onClick={() => handleErrTypeDelete(e.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-ur-rose transition-all">✕</button>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      </div>
      </div>)}

      {/* ══ ⑤ 用户与权限（v2 页面内嵌） ══ */}
      {sec === 'users' && (<div className="mb-5 rounded-2xl border border-ur-border bg-ur-card p-5">
        <Users />
      </div>)}
        </main>
      </div>

    </div>
  );
}
