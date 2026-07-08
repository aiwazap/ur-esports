import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

/* ════════════════════════════════════════════════════════════
   赛事详情弹窗 EventDetailModal
   - event：upcoming_matches 行（event_name/opponent/match_date/match_time/
            bo_format/division/opponent_rank/signup_method/signup_deadline/notes）
   - canEdit：admin / team_lead 可编辑保存
   - onClose：关闭回调
   富内容（基本信息/时间轴/规则/清单）来自 /admin/event-details/:id，
   均以 JSON 存储；本组件负责展示、编辑、保存(PUT)、导出整份 PDF。
   ════════════════════════════════════════════════════════════ */

const STATUS_OPTS = [
  { v: 'active', t: '进行中' },
  { v: 'idle',   t: '待进行' },
  { v: 'gold',   t: '总决赛/待定' },
];
const PRIO_OPTS = [
  { v: 'p0', t: 'P0 紧急' },
  { v: 'p1', t: 'P1 重要' },
  { v: 'p2', t: 'P2 一般' },
];
const PRIO_LABEL = { p0: '🔴 紧急（P0）', p1: '🟡 重要（P1）', p2: '🟢 一般（P2）' };

// 富内容为空时的默认骨架（方便首次编辑填充）
const defaultBasic = () => ({
  items: [
    { label: '赛制格式', value: '' },
    { label: '比赛方式', value: '' },
    { label: '地图池',   value: '' },
    { label: '总奖金池', value: '' },
  ],
  warn: '',
});
// 新赛事默认框架：阶段/规则/清单骨架（字段固定，打开即有，按需改值）
const defaultTimeline = () => ([
  { name: '大区赛 / 海选', date: '', detail: '🌐 线上赛 | 🗺️ Bo1', status: 'active' },
  { name: '全国 16 进 8', date: '', detail: '🌐 线上赛 | 🗺️ Bo1', status: 'idle' },
  { name: '全国 8 进 2', date: '', detail: '🌐 线上赛 | 🎥 有直播', status: 'idle' },
  { name: '🏆 总决赛', date: '', detail: '🏟️ 线下 | Bo3 | 🎥 直播', status: 'gold' },
]);
const defaultRules = () => ([
  { title: '🎮 比赛形式与设备要求', items: ['线上赛地点不限，可在家或网吧参赛', '⚠️ 必须开启第三视角漏屏（供裁判监督）', '⚠️ 必须录制第一视角 Demo（赛后提交审核）', '具体技术细则以赛事官方群通知为准'] },
  { title: '👥 阵容与换人规则', items: ['每队上场 5 名选手，无替补（比赛中不能换人）', '换人上限与需保留的原阵容人数以赛事规则为准', '换人需提前报备新队员游戏ID（Steam / 完美平台ID）'] },
  { title: '🗺️ 地图池与赛制', items: ['8 强前 Bo1，8 强后 Bo3 + 直播', '地图池：（按本赛事填写）', 'Bo1 双方各 Ban 2 张裁判随机，Bo3 标准 Veto'] },
  { title: '💰 奖金分配', items: ['冠军 / 亚军 / 三四名 奖金（按本赛事填写）'] },
  { title: '🔗 参考来源', items: ['赛事官方公告链接', '详细规则以赛事群内最终通知为准'] },
]);
const defaultChecklist = () => ([
  { text: '📷 准备第三视角摄像头 / 录屏：能漏出选手完整屏幕画面供裁判监控，赛前测角度画质', priority: 'p0', checked: false },
  { text: '🎥 测试第一视角录制：每名选手确认 OBS 或游戏内置录像正常，画质清晰、存储充足', priority: 'p0', checked: false },
  { text: '🔋 检查所有选手外设电量：鼠标 / 耳机 / 键盘充满电或换新电池，备好备用电池', priority: 'p0', checked: false },
  { text: '🖥️ 测试比赛用电脑：游戏启动正常、网络稳定（推荐有线）、关闭无关后台、确认游戏设置', priority: 'p0', checked: false },
  { text: '📡 测试网络稳定性：用有线网络测延迟和丢包，确保比赛期间不会因网络问题被判负', priority: 'p0', checked: false },
  { text: '🔍 了解竞争对手：确认同区参赛队伍名单，收集对手近期比赛数据和战术倾向', priority: 'p1', checked: false },
  { text: '📋 确认 5 人最终名单，如需换人提前报备', priority: 'p1', checked: false },
  { text: '🆔 收集选手游戏ID：整理全部 5 人的 Steam ID / 完美平台ID 成表格，发给赛事方报备', priority: 'p1', checked: false },
  { text: '🗺️ 安排地图针对性训练：重点练习本赛事地图池', priority: 'p1', checked: false },
  { text: '💬 加入赛事官方群，关注开赛时间、对阵通知和技术细则', priority: 'p2', checked: false },
  { text: '📦 准备备用外设：备用鼠标 / 耳机 / 鼠标垫，防止外设突发故障', priority: 'p2', checked: false },
  { text: '📝 确认赛事群内细则，了解裁判联系方式、比赛房间进入方式等', priority: 'p2', checked: false },
]);
const safeParse = (v, fallback) => {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try { const o = JSON.parse(v); return (o == null) ? fallback : o; } catch { return fallback; }
};

export default function EventDetailModal({ event, canEdit = false, onClose }) {
  const [tab, setTab] = useState('schedule');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(Date.now());

  // 富内容状态
  const [basic, setBasic] = useState(defaultBasic());
  const [timeline, setTimeline] = useState([]);
  const [rules, setRules] = useState([]);
  const [checklist, setChecklist] = useState([]);

  // ── 拉取富内容 ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/admin/event-details/' + event.id);
        if (!alive) return;
        const b = safeParse(data.basic_info, null);
        setBasic(b && b.items ? { items: b.items, warn: b.warn || '' } : defaultBasic());
        setTimeline(safeParse(data.timeline, null) || defaultTimeline());
        setRules(safeParse(data.rules, null) || defaultRules());
        setChecklist(safeParse(data.checklist, null) || defaultChecklist());
      } catch (e) {
        if (alive) setStatus('载入失败：' + (e.response?.data?.error || e.message));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [event.id]);

  // ── 倒计时 ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const cd = (() => {
    if (!event.match_date) return null;
    const target = new Date(event.match_date + 'T' + (event.match_time || '00:00:00') + '+08:00');
    const diff = target - now;
    if (isNaN(target.getTime())) return null;
    if (diff <= 0) return { over: true };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  })();

  // ── ESC 关闭 ──
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── 保存 ──
  const save = async () => {
    setSaving(true);
    setStatus('保存中…');
    try {
      await api.put('/admin/event-details/' + event.id, {
        basic_info: JSON.stringify(basic),
        timeline: JSON.stringify(timeline),
        rules: JSON.stringify(rules),
        checklist: JSON.stringify(checklist),
      });
      setStatus('✅ 已保存');
      setEditMode(false);
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus('❌ 保存失败：' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  // ── 清单：勾选（非编辑模式也可勾，立即本地更新；需点保存入库）──
  const toggleCheck = (i) => {
    setChecklist(cl => cl.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c));
  };
  const doneCount = checklist.filter(c => c.checked).length;

  // ── 导出整份赛事详情为可打印页（新窗口 → 另存为 PDF）──
  const exportPDF = useCallback(() => {
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rankClean = String(event.opponent_rank ?? '').replace(/[#\s]/g, '');
    const cdLine = cd
      ? (cd.over ? '比赛已开始' : `距开赛 ${cd.d} 天 ${cd.h} 时 ${cd.m} 分`)
      : '';
    const biRows = (basic.items || []).filter(it => it.label || it.value)
      .map(it => `<tr><td class="k">${esc(it.label)}</td><td class="v">${esc(it.value)}</td></tr>`).join('');
    const tlRows = (timeline || []).map(t => `
      <div class="tl">
        <div class="tl-h">${esc(t.name)} <span class="tl-st">${esc((STATUS_OPTS.find(s=>s.v===t.status)||{}).t||'')}</span></div>
        <div class="tl-d">${esc(t.date)}　${esc(t.detail)}</div>
      </div>`).join('');
    const ruleBlocks = (rules || []).map(g => `
      <div class="rg"><div class="rg-t">${esc(g.title)}</div>
        <ul>${(g.items || []).filter(Boolean).map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
    const ckByP = ['p0', 'p1', 'p2'].map(p => {
      const items = (checklist || []).filter(c => (c.priority || 'p2') === p);
      if (!items.length) return '';
      return `<div class="ck-cat"><div class="ck-l">${PRIO_LABEL[p]}</div>${
        items.map(c => `<div class="ck-i">${c.checked ? '☑' : '☐'} ${esc(c.text)}</div>`).join('')
      }</div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(event.event_name || '赛事详情')}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1a1a1a;padding:28px 32px;line-height:1.7;}
  h1{font-size:22px;border-bottom:3px double #1a1a1a;padding-bottom:10px;margin-bottom:6px;}
  .meta{color:#666;font-size:13px;margin-bottom:18px;}
  h2{font-size:15px;color:#1a1a1a;border-left:4px solid #B8960F;padding-left:9px;margin:20px 0 10px;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px;}
  td{padding:7px 9px;border-bottom:1px solid #eee;vertical-align:top;}
  td.k{width:130px;color:#666;font-weight:600;}
  .warn{background:#fff8e6;border:1px solid #e8c84a;border-radius:6px;padding:9px 12px;color:#7a5c00;font-size:12.5px;margin-top:8px;}
  .tl{border:1px solid #e0e0e0;border-radius:8px;padding:10px 13px;margin-bottom:8px;}
  .tl-h{font-weight:600;font-size:13.5px;}
  .tl-st{font-size:11px;color:#888;font-weight:400;margin-left:6px;}
  .tl-d{font-size:12.5px;color:#555;margin-top:3px;}
  .rg{margin-bottom:13px;}
  .rg-t{font-weight:600;font-size:14px;margin-bottom:6px;}
  .rg ul{padding-left:20px;} .rg li{font-size:13px;color:#333;margin:3px 0;}
  .ck-cat{margin-bottom:12px;} .ck-l{font-weight:600;font-size:13px;margin-bottom:5px;}
  .ck-i{font-size:13px;color:#333;padding:3px 0;}
  @media print{body{padding:0;}}
</style></head><body>
  <h1>${esc(event.event_name || '赛事详情')}</h1>
  <div class="meta">UR vs ${esc(event.opponent || '—')}${rankClean && rankClean!=='0' && rankClean!=='-' ? '（#'+esc(rankClean)+'）' : ''}　·　${esc(event.match_date || '')} ${esc(event.match_time || '')}　·　${esc(event.division || '')}　${cdLine ? '·　'+cdLine : ''}</div>
  <h2>赛事基本信息</h2>
  <table>${biRows || '<tr><td colspan="2" style="color:#999;">（未填写）</td></tr>'}</table>
  ${basic.warn ? `<div class="warn">⚠️ ${esc(basic.warn)}</div>` : ''}
  <h2>各阶段时间安排</h2>
  ${tlRows || '<div style="color:#999;font-size:13px;">（未填写）</div>'}
  <h2>赛制详情 &amp; 规则</h2>
  ${ruleBlocks || '<div style="color:#999;font-size:13px;">（未填写）</div>'}
  <h2>领队准备清单（${doneCount}/${checklist.length} 完成）</h2>
  ${ckByP || '<div style="color:#999;font-size:13px;">（未填写）</div>'}
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { setStatus('⚠️ 浏览器拦截了弹窗，请允许后再试'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  }, [event, basic, timeline, rules, checklist, cd, doneCount]);

  const rankClean = String(event.opponent_rank ?? '').replace(/[#\s]/g, '');

  const view = (
    <div className="em-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="em-modal">

        {/* 头部 */}
        <div className="em-header">
          <div className="em-badge">
            <img src="/extremesland-logo.png" alt="极限之地城市对抗赛" />
          </div>
          <div className="em-title-area">
            <div className="em-event-name">{event.event_name || '赛事'}</div>
            <div className="em-tags">
              {event.division && <span className="em-tag em-tag-cyan">{event.division}</span>}
              {event.bo_format && <span className="em-tag em-tag-gold">{event.bo_format}</span>}
              {event.match_type === 'official' && <span className="em-tag em-tag-gray">正式赛</span>}
            </div>
          </div>
          <button className="em-close" onClick={onClose}>✕</button>
        </div>

        {/* 倒计时 */}
        <div className="em-cd-bar">
          <div className="em-cd-row">
            <span className="em-cd-label">⏰ 距开赛</span>
            <div className="em-cd-units">
              {!cd ? <span className="em-cd-none">日期待定</span>
                : cd.over ? <span className="em-cd-over">🔴 比赛已开始</span>
                : [['天', cd.d], ['时', cd.h], ['分', cd.m], ['秒', cd.s]].map(([l, v], i) => (
                  <div key={i} className="em-cd-unit">
                    <div className="em-cd-num"><span className="em-cd-val">{String(v).padStart(2, '0')}</span></div>
                    <p className="em-cd-sub">{l}</p>
                  </div>
                ))}
            </div>
          </div>
          <p className="em-cd-meta">
            📅 {event.match_date || '待定'} {event.match_time || ''} 北京时间
            {event.opponent ? ` · vs ${event.opponent}${rankClean && rankClean !== '0' && rankClean !== '-' ? `（#${rankClean}）` : ''}` : ''}
          </p>
        </div>

        {/* Tab栏 */}
        <div className="em-tabs">
          {[['schedule', '📋 赛制 & 时间表'], ['rules', '📜 赛制详情 & 规则'], ['checks', '✅ 领队准备清单']].map(([k, t]) => (
            <div key={k} className={'em-tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><p>{t}</p></div>
          ))}
        </div>

        {/* 内容区 */}
        <div className="em-body">
          {loading ? <div className="em-empty">加载中…</div> : (
            <>
              {tab === 'schedule' && <ScheduleTab {...{ editMode, basic, setBasic, timeline, setTimeline }} />}
              {tab === 'rules'    && <RulesTab {...{ editMode, rules, setRules }} />}
              {tab === 'checks'   && <ChecksTab {...{ editMode, checklist, setChecklist, toggleCheck, doneCount }} />}
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="em-footer">
          {status && <span className="em-status">{status}</span>}
          <div className="em-footer-btns">
            <button className="em-btn em-btn-secondary" onClick={exportPDF}>📤 导出整份 PDF</button>
            {canEdit && !editMode && <button className="em-btn em-btn-ghost" onClick={() => setEditMode(true)}>✏️ 编辑</button>}
            {canEdit && editMode && (
              <>
                <button className="em-btn em-btn-ghost" onClick={() => setEditMode(false)}>取消</button>
                <button className="em-btn em-btn-primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '💾 保存'}</button>
              </>
            )}
            {(!canEdit || !editMode) && checklist.length > 0 && canEdit && (
              <button className="em-btn em-btn-primary" onClick={save} disabled={saving} title="保存清单勾选状态">💾 存勾选</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(view, document.body);
}

/* ───────────────── Tab1：赛制 & 时间表 ───────────────── */
function ScheduleTab({ editMode, basic, setBasic, timeline, setTimeline }) {
  const setItem = (i, key, val) => setBasic(b => ({ ...b, items: b.items.map((it, idx) => idx === i ? { ...it, [key]: val } : it) }));
  const addItem = () => setBasic(b => ({ ...b, items: [...b.items, { label: '新字段', value: '' }] }));
  const delItem = (i) => setBasic(b => ({ ...b, items: b.items.filter((_, idx) => idx !== i) }));
  const setTl = (i, key, val) => setTimeline(tl => tl.map((t, idx) => idx === i ? { ...t, [key]: val } : t));
  const addTl = () => setTimeline(tl => [...tl, { name: '新阶段', date: '', detail: '', status: 'idle' }]);
  const delTl = (i) => setTimeline(tl => tl.filter((_, idx) => idx !== i));

  return (
    <>
      <div className="em-card">
        <p className="em-sec-title">📌 赛事基本信息</p>
        {editMode ? (
          <div className="em-edit-list">
            {basic.items.map((it, i) => (
              <div key={i} className="em-edit-row">
                <input className="em-inp em-inp-k" value={it.label} onChange={e => setItem(i, 'label', e.target.value)} placeholder="字段名" />
                <input className="em-inp" value={it.value} onChange={e => setItem(i, 'value', e.target.value)} placeholder="内容" />
                <button className="em-del" onClick={() => delItem(i)}>×</button>
              </div>
            ))}
            <button className="em-add" onClick={addItem}>+ 加一项</button>
            <textarea className="em-inp em-ta" value={basic.warn} onChange={e => setBasic(b => ({ ...b, warn: e.target.value }))} placeholder="⚠️ 重点提示（如换人规则，可留空）" />
          </div>
        ) : (
          <>
            <div className="em-grid">
              {basic.items.filter(it => it.label || it.value).map((it, i) => (
                <div key={i} className="em-grid-item">
                  <p className="em-label">{it.label}</p>
                  <p className="em-value">{it.value || '—'}</p>
                </div>
              ))}
              {basic.items.filter(it => it.label || it.value).length === 0 && <p className="em-empty-inline">（未填写）</p>}
            </div>
            {basic.warn && <div className="em-warn">⚠️ {basic.warn}</div>}
          </>
        )}
      </div>

      <p className="em-sec-title">🗓️ 各阶段时间安排</p>
      <div className="em-timeline">
        {(timeline || []).map((t, i) => (
          <div key={i} className="em-tl-row">
            <div className="em-tl-line">
              <div className={'em-tl-dot ' + (t.status === 'active' ? 'active' : t.status === 'gold' ? 'gold' : 'idle')} />
              {i < timeline.length - 1 && <div className="em-tl-bar" />}
            </div>
            <div className={'em-tl-card ' + (t.status === 'active' ? 'active' : t.status === 'gold' ? 'gold' : 'idle')}>
              {editMode ? (
                <>
                  <div className="em-edit-row">
                    <input className="em-inp" value={t.name} onChange={e => setTl(i, 'name', e.target.value)} placeholder="阶段名称" />
                    <select className="em-inp em-sel" value={t.status} onChange={e => setTl(i, 'status', e.target.value)}>
                      {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </select>
                    <button className="em-del" onClick={() => delTl(i)}>×</button>
                  </div>
                  <input className="em-inp" style={{ marginTop: 6 }} value={t.date} onChange={e => setTl(i, 'date', e.target.value)} placeholder="日期，如 6月20日-21日" />
                  <input className="em-inp" style={{ marginTop: 6 }} value={t.detail} onChange={e => setTl(i, 'detail', e.target.value)} placeholder="详情，如 线上 | Bo1 | 无直播" />
                </>
              ) : (
                <>
                  <div className="em-tl-head">
                    <span className="em-tl-name">{t.name}</span>
                    <span className="em-tl-status">{(STATUS_OPTS.find(s => s.v === t.status) || {}).t || ''}</span>
                  </div>
                  {(t.date || t.detail) && <p className="em-tl-detail">{t.date}{t.date && t.detail ? '　|　' : ''}{t.detail}</p>}
                </>
              )}
            </div>
          </div>
        ))}
        {editMode && <button className="em-add" onClick={addTl}>+ 加阶段</button>}
        {!editMode && (!timeline || timeline.length === 0) && <p className="em-empty-inline">（未填写）</p>}
      </div>
    </>
  );
}

/* ───────────────── Tab2：规则 ───────────────── */
function RulesTab({ editMode, rules, setRules }) {
  const setG = (i, key, val) => setRules(r => r.map((g, idx) => idx === i ? { ...g, [key]: val } : g));
  const setItems = (i, text) => setRules(r => r.map((g, idx) => idx === i ? { ...g, items: text.split('\n') } : g));
  const addG = () => setRules(r => [...r, { title: '新规则组', items: [''] }]);
  const delG = (i) => setRules(r => r.filter((_, idx) => idx !== i));

  return (
    <>
      {(rules || []).map((g, i) => (
        <div key={i} className="em-rule-group">
          {editMode ? (
            <>
              <div className="em-edit-row">
                <input className="em-inp" value={g.title} onChange={e => setG(i, 'title', e.target.value)} placeholder="规则组标题" />
                <button className="em-del" onClick={() => delG(i)}>×</button>
              </div>
              <textarea className="em-inp em-ta" style={{ marginTop: 6 }} value={(g.items || []).join('\n')} onChange={e => setItems(i, e.target.value)} placeholder="每行一条规则" />
            </>
          ) : (
            <>
              <p className="em-rule-title">{g.title}</p>
              <ul className="em-rule-list">
                {(g.items || []).filter(Boolean).map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            </>
          )}
        </div>
      ))}
      {editMode && <button className="em-add" onClick={addG}>+ 加规则组</button>}
      {!editMode && (!rules || rules.length === 0) && <p className="em-empty-inline">（未填写）</p>}
    </>
  );
}

/* ───────────────── Tab3：领队清单 ───────────────── */
function ChecksTab({ editMode, checklist, setChecklist, toggleCheck, doneCount }) {
  const setC = (i, key, val) => setChecklist(cl => cl.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  const addC = () => setChecklist(cl => [...cl, { text: '新准备项', priority: 'p2', checked: false }]);
  const delC = (i) => setChecklist(cl => cl.filter((_, idx) => idx !== i));

  return (
    <>
      <div className="em-ck-progress">
        <p className="em-ck-title">✅ 领队赛前准备检查清单</p>
        <p className="em-ck-count">{doneCount}/{checklist.length} 已完成</p>
      </div>

      {editMode ? (
        <div className="em-edit-list">
          {checklist.map((c, i) => (
            <div key={i} className="em-edit-row">
              <select className="em-inp em-sel" style={{ maxWidth: 110 }} value={c.priority || 'p2'} onChange={e => setC(i, 'priority', e.target.value)}>
                {PRIO_OPTS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
              <input className="em-inp" value={c.text} onChange={e => setC(i, 'text', e.target.value)} placeholder="准备项内容" />
              <button className="em-del" onClick={() => delC(i)}>×</button>
            </div>
          ))}
          <button className="em-add" onClick={addC}>+ 加准备项</button>
        </div>
      ) : (
        ['p0', 'p1', 'p2'].map(p => {
          const items = checklist.map((c, idx) => ({ ...c, _i: idx })).filter(c => (c.priority || 'p2') === p);
          if (!items.length) return null;
          return (
            <div key={p} className="em-ck-cat">
              <p className={'em-ck-cat-label ' + p}>{PRIO_LABEL[p]}</p>
              {items.map(c => (
                <label key={c._i} className={'em-ck-item ' + p}>
                  <input type="checkbox" className="em-ck-box" checked={!!c.checked} onChange={() => toggleCheck(c._i)} />
                  <span className={'em-ck-text' + (c.checked ? ' done' : '')}>{c.text}</span>
                </label>
              ))}
            </div>
          );
        })
      )}
      {!editMode && checklist.length === 0 && <p className="em-empty-inline">（未填写）</p>}
    </>
  );
}

/* ───────────────── 样式（scope 在 .em-overlay 下，避免污染全站）───────────────── */
const CSS = `
.em-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10000;}
.em-overlay *{box-sizing:border-box;}
.em-modal{width:640px;max-width:94vw;max-height:92vh;border-radius:14px;overflow:hidden;background:#0d1420;border:1px solid rgba(0,200,255,0.18);box-shadow:0 24px 80px rgba(0,0,0,0.65),0 0 40px rgba(0,200,255,0.05);display:flex;flex-direction:column;}
.em-header{display:flex;align-items:flex-start;gap:12px;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg,rgba(0,200,255,0.04),transparent);}
.em-badge{width:50px;height:50px;background:linear-gradient(135deg,#0d1420,#1a1e2a,#0d1420);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;border:1.5px solid rgba(212,175,55,0.35);box-shadow:0 4px 20px rgba(212,175,55,0.2);flex-shrink:0;overflow:hidden;}
.em-badge img{width:100%;height:100%;object-fit:contain;border-radius:10px;display:block;}
.em-title-area{flex:1;min-width:0;}
.em-event-name{font-size:18px;font-weight:600;color:#fff;line-height:1.3;}
.em-tags{display:flex;gap:7px;margin-top:6px;flex-wrap:wrap;}
.em-tag{font-size:11px;padding:2px 9px;border-radius:3px;font-weight:500;}
.em-tag-cyan{color:#00c8ff;background:rgba(0,200,255,0.12);border:1px solid rgba(0,200,255,0.2);}
.em-tag-gold{color:#D4AF37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.2);}
.em-tag-gray{color:#999;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);}
.em-close{width:34px;height:34px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:7px;color:#778;font-size:16px;cursor:pointer;flex-shrink:0;transition:all .15s;}
.em-close:hover{background:rgba(255,60,60,0.12);color:#f55;border-color:rgba(255,60,60,0.25);}
.em-cd-bar{padding:14px 22px;border-bottom:1px solid rgba(255,255,255,0.05);background:linear-gradient(90deg,rgba(212,175,55,0.06),transparent);}
.em-cd-row{display:flex;align-items:center;gap:14px;}
.em-cd-label{font-size:14px;color:#D4AF37;font-weight:600;white-space:nowrap;}
.em-cd-units{display:flex;gap:8px;flex:1;align-items:center;}
.em-cd-unit{text-align:center;flex:1;max-width:64px;}
.em-cd-num{background:rgba(0,0,0,0.4);border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:8px 4px;}
.em-cd-val{font-size:24px;font-weight:700;color:#D4AF37;line-height:1;}
.em-cd-sub{font-size:10px;color:#667;margin-top:4px;}
.em-cd-none,.em-cd-over{font-size:15px;font-weight:700;color:#D4AF37;}
.em-cd-meta{font-size:12px;color:#889;margin-top:9px;}
.em-tabs{display:flex;padding:0 22px;border-bottom:1px solid rgba(255,255,255,0.05);}
.em-tab{flex:1;text-align:center;padding:12px 0;cursor:pointer;border-bottom:2px solid transparent;transition:all .18s;}
.em-tab p{font-size:13px;margin:0;color:#667;transition:all .18s;}
.em-tab.active{border-bottom-color:#00c8ff;}
.em-tab.active p{color:#00c8ff;font-weight:600;}
.em-tab:not(.active):hover p{color:#aab;}
.em-body{padding:16px 22px;max-height:46vh;overflow-y:auto;flex:1;}
.em-body::-webkit-scrollbar{width:5px;}
.em-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px;}
.em-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:15px;margin-bottom:14px;}
.em-sec-title{font-size:14px;color:#99a;font-weight:600;margin-bottom:11px;}
.em-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;}
.em-grid-item .em-label{font-size:11.5px;color:#667;margin-bottom:4px;}
.em-grid-item .em-value{font-size:14px;color:#ccd;line-height:1.5;font-weight:500;white-space:pre-wrap;}
.em-warn{margin-top:13px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.25);border-radius:8px;padding:10px 13px;font-size:12.5px;color:#e8c84a;}
.em-timeline{display:flex;flex-direction:column;}
.em-tl-row{display:flex;gap:12px;}
.em-tl-line{display:flex;flex-direction:column;align-items:center;width:18px;flex-shrink:0;}
.em-tl-dot{width:10px;height:10px;border-radius:50%;margin-top:7px;flex-shrink:0;}
.em-tl-dot.active{background:#00c8ff;box-shadow:0 0 12px rgba(0,200,255,0.6);}
.em-tl-dot.idle{background:#333;}
.em-tl-dot.gold{background:#D4AF37;box-shadow:0 0 8px rgba(212,175,55,0.3);}
.em-tl-bar{width:2px;flex:1;min-height:14px;margin:4px 0;background:rgba(255,255,255,0.08);}
.em-tl-card{flex:1;border-radius:10px;padding:11px 14px;margin-bottom:10px;}
.em-tl-card.active{background:rgba(0,200,255,0.04);border:1px solid rgba(0,200,255,0.22);}
.em-tl-card.idle{background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.06);}
.em-tl-card.gold{background:linear-gradient(135deg,rgba(212,175,55,0.06),rgba(184,134,11,0.03));border:1px solid rgba(212,175,55,0.22);}
.em-tl-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.em-tl-name{font-size:14px;font-weight:600;color:#dde;}
.em-tl-status{font-size:10.5px;color:#778;}
.em-tl-detail{font-size:12.5px;color:#889;line-height:1.6;}
.em-rule-group{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:15px;margin-bottom:13px;}
.em-rule-title{font-size:14px;color:#fff;font-weight:600;margin-bottom:10px;}
.em-rule-list{list-style:none;padding:0;margin:0;}
.em-rule-list li{font-size:13px;color:#bbb;line-height:1.7;padding:5px 0 5px 18px;position:relative;border-bottom:1px solid rgba(255,255,255,0.035);}
.em-rule-list li:last-child{border-bottom:none;}
.em-rule-list li::before{content:'•';position:absolute;left:0;color:#00c8ff;font-size:15px;top:5px;}
.em-ck-progress{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:10px 13px;background:rgba(0,200,255,0.04);border:1px solid rgba(0,200,255,0.15);border-radius:8px;}
.em-ck-title{font-size:14px;color:#fff;font-weight:600;}
.em-ck-count{font-size:13px;color:#00c8ff;font-weight:600;}
.em-ck-cat{margin-bottom:14px;}
.em-ck-cat-label{font-size:12.5px;margin-bottom:7px;font-weight:600;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);}
.em-ck-cat-label.p0{color:#ff6666;}
.em-ck-cat-label.p1{color:#e8c84a;}
.em-ck-cat-label.p2{color:#00c8ff;}
.em-ck-item{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;border-radius:8px;cursor:pointer;margin-bottom:5px;border:1px solid transparent;}
.em-ck-item.p0{background:rgba(255,60,60,0.04);border-color:rgba(255,80,80,0.2);border-left:3px solid #ff5555;}
.em-ck-item.p1{background:rgba(234,179,8,0.03);border-color:rgba(234,179,8,0.15);border-left:3px solid #e8b920;}
.em-ck-item:hover{background:rgba(0,200,255,0.03);}
.em-ck-box{accent-color:#00c8ff;width:17px;height:17px;flex-shrink:0;margin-top:1px;cursor:pointer;}
.em-ck-text{font-size:13px;color:#9ab;line-height:1.55;flex:1;}
.em-ck-text.done{color:#889;text-decoration:line-through;text-decoration-color:rgba(255,255,255,0.2);}
.em-footer{display:flex;align-items:center;gap:10px;padding:13px 22px;border-top:1px solid rgba(255,255,255,0.05);}
.em-status{font-size:12.5px;color:#9ab;flex:1;}
.em-footer-btns{display:flex;gap:9px;margin-left:auto;}
.em-btn{border-radius:8px;font-size:13px;cursor:pointer;border:none;padding:10px 16px;font-weight:500;transition:all .15s;}
.em-btn-primary{background:linear-gradient(135deg,#D4AF37,#c9952e);color:#0a0e17;font-weight:600;}
.em-btn-primary:hover{filter:brightness(1.1);}
.em-btn-primary:disabled{opacity:.5;cursor:default;}
.em-btn-secondary{background:transparent;color:#00c8ff;border:1px solid rgba(0,200,255,0.3);}
.em-btn-ghost{background:transparent;color:#889;border:1px solid rgba(255,255,255,0.1);}
.em-empty,.em-empty-inline{color:#667;font-size:13px;text-align:center;padding:16px 0;}
.em-empty-inline{padding:8px 0;}
.em-edit-list{display:flex;flex-direction:column;gap:8px;}
.em-edit-row{display:flex;gap:7px;align-items:center;}
.em-inp{flex:1;min-width:0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#fff;font-size:13px;padding:7px 9px;outline:none;font-family:inherit;}
.em-inp:focus{border-color:rgba(0,200,255,0.5);}
.em-inp-k{max-width:130px;}
.em-sel{flex:0 0 auto;max-width:130px;}
.em-ta{width:100%;min-height:64px;resize:vertical;line-height:1.6;}
.em-del{width:26px;height:26px;flex-shrink:0;border-radius:6px;border:1px solid rgba(255,60,60,0.3);background:rgba(255,60,60,0.1);color:#f66;font-size:15px;cursor:pointer;line-height:1;}
.em-del:hover{background:#f55;color:#fff;}
.em-add{align-self:flex-start;margin-top:4px;padding:6px 14px;border-radius:7px;border:1px dashed rgba(0,200,255,0.4);background:transparent;color:#00c8ff;font-size:12.5px;cursor:pointer;}
.em-add:hover{background:rgba(0,200,255,0.08);}
`;
