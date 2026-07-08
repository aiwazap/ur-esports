import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TrainingPlans from './TrainingPlans';
import TrialRoster from '../components/TrialRoster';
import api from '../api';
import './workstation-v2.css';

/* ════════════════════════════════════════════════════════════
   工作站 v2（r49）：金色岗位职责横幅（可收起）+ 左侧 250px 模块导航
   模块：每日赛训（每日简报/训练日志/战术总表 = TrainingPlans embedded）· 管理（赛训档案/试训管理）
   深链兼容：?tab=daily&sub=briefing|log|tactics · ?tab=archives · ?tab=trial · ?tab=duties(展开完整分类表)
   ════════════════════════════════════════════════════════════ */

const NAV_GROUPS = [
  { name: '每日赛训', items: [
    { id: 'briefing', label: '每日简报', icon: 'dashboard' },
    { id: 'log',      label: '训练日志', icon: 'log' },
    { id: 'tactics',  label: '战术总表', icon: 'mistakes' },
  ] },
  { name: '管理', items: [
    { id: 'archives', label: '赛训档案', icon: 'hub' },
  ] },
  { name: '岗位职责', items: [
    { id: 'dutyCoach',  label: '教练职责', icon: 'trophy' },
    { id: 'dutyLeader', label: '领队职责', icon: 'schedule' },
  ] },
];
const DAILY_IDS = ['briefing', 'log', 'tactics'];
const ALL_IDS = ['briefing', 'log', 'tactics', 'archives', 'dutyCoach', 'dutyLeader'];

export default function Workstation() {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const urlSub = searchParams.get('sub');
  const initMod = (() => {
    if (urlTab === 'archives') return 'archives';
    if (urlTab === 'trial') return 'dutyLeader';
    if (urlTab === 'daily' && DAILY_IDS.includes(urlSub)) return urlSub;
    return 'briefing';
  })();
  const [mod, setMod] = useState(initMod);

  // URL 参数变化跟随（保持旧深链行为）
  useEffect(() => {
    const t = searchParams.get('tab');
    const s = searchParams.get('sub');
    if (t === 'archives') setMod(t);
    else if (t === 'trial') setMod('dutyLeader');
    else if (t === 'daily' && DAILY_IDS.includes(s)) setMod(s);
    else if (t === 'duties') setMod('dutyCoach');
  }, [searchParams]);

  // 旧岗位职责 iframe 内卡片 postMessage 跳转兼容
  useEffect(() => {
    const onMsg = (e) => {
      const nav = e?.data?.urNav;
      if (!nav) return;
      if (ALL_IDS.includes(nav)) setMod(nav);
      else if (nav === 'daily') setMod('briefing');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div className="max-w-[1440px] mx-auto pb-12 px-4">
      <div className="mb-4">
        <h2 className="font-sans font-semibold text-2xl font-bold text-white">工作站</h2>
        <p className="text-gray-500 text-sm">每日简报 · 训练日志 · 战术总表 · 赛训档案 · 试训管理</p>
      </div>

      {/* ══ 左侧模块导航 + 内容区 ══ */}
      <div className="ws2-layout">
        <aside className="ws2-nav">
          {NAV_GROUPS.map((g) => (
            <div key={g.name} className="ws2-nav-group">
              <div className="ws2-nav-gname">{g.name}</div>
              {g.items.map((it) => (
                <div key={it.id} className={'ws2-nav-item ' + (mod === it.id ? 'ws2-nav-on' : '')}
                  onClick={() => setMod(it.id)}>
                  <img src={`/reshape/home/icons/icon-${it.icon}.png`} alt="" />
                  <span>{it.label}</span>
                </div>
              ))}
            </div>
          ))}
        </aside>
        <main className="ws2-main">
          {DAILY_IDS.includes(mod) && <TrainingPlans embedded initialTab={mod} key={mod} />}
          {mod === 'archives' && <ArchivesTab />}
          {mod === 'dutyCoach' && (
            <div key="dc">
              <DutyBoard role="coach" />
              <div className="wsd-sub"><TrialRoster moduleIds={['scoring']} title="试训队员 · 考核评分" /></div>
            </div>
          )}
          {mod === 'dutyLeader' && (
            <div key="dl">
              <DutyBoard role="leader" />
              <div className="wsd-sub"><TrialRoster moduleIds={['contact']} title="试训队员 · 接洽" /></div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// 岗位职责：教练（左）/ 领队（右）双栏一页展示，需建档项高亮（无切换标签）
function DutiesTab() {
  return (
    <iframe src="/coach-leader-tasks.html" title="岗位职责"
      style={{ width: '100%', height: 'calc(100vh - 240px)', border: 'none', borderRadius: 12, background: '#0a0a0a', display: 'block' }} />
  );
}

// ════════════════════════════════════════════════════════════
// 赛训档案 · 自由表格（Excel 式：自建表 / 加列改列名 / 加行填数据）
// 教练编辑教练区、领队编辑领队区、对方只读、admin 全权
// ════════════════════════════════════════════════════════════
const SEC_META = {
  coach:  { name: '教练', color: '#9b59b6' },
  leader: { name: '领队', color: '#1abc9c' },
};

function ArchivesTab() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const role = user.role;
  const [section, setSection] = useState('coach');
  const [sheets, setSheets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = role === 'admin' || (section === 'coach' && role === 'coach') || (section === 'leader' && role === 'team_lead');

  const pickDraft = (list, id) => {
    const s = list.find(x => x.id === id);
    setDraft(s ? { ...s, columns: [...(s.columns || [])], rows: (s.rows || []).map(r => [...r]) } : null);
    setDirty(false);
  };

  const loadSheets = (sec, keepId) => {
    api.get(`/training-plans/sheets?section=${sec}`).then(r => {
      const list = r.data || [];
      setSheets(list);
      const pick = (keepId && list.find(s => s.id === keepId)) ? keepId : (list[0]?.id || null);
      setActiveId(pick);
      pickDraft(list, pick);
    }).catch(() => { setSheets([]); setDraft(null); setActiveId(null); });
  };
  useEffect(() => { loadSheets(section); /* eslint-disable-next-line */ }, [section]);

  const selectSheet = (id) => {
    if (dirty && !confirm('当前表有未保存的修改，切换会丢失，继续？')) return;
    setActiveId(id);
    pickDraft(sheets, id);
  };

  // 编辑操作（改 draft + 标记 dirty）
  const up = (fn) => { setDraft(d => { const n = { ...d, columns: [...d.columns], rows: d.rows.map(r => [...r]) }; fn(n); return n; }); setDirty(true); };
  const addCol = () => up(n => { n.columns.push('新列'); n.rows.forEach(r => r.push('')); });
  const delCol = (i) => up(n => { n.columns.splice(i, 1); n.rows.forEach(r => r.splice(i, 1)); });
  const renameCol = (i, v) => up(n => { n.columns[i] = v; });
  const addRow = () => up(n => { n.rows.push(new Array(n.columns.length).fill('')); });
  const delRow = (i) => up(n => { n.rows.splice(i, 1); });
  const setCell = (r, c, v) => up(n => { n.rows[r][c] = v; });
  const setName = (v) => up(n => { n.name = v; });

  const saveSheet = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.put(`/training-plans/sheets/${draft.id}`, { name: draft.name, category: draft.category || '', columns: draft.columns, rows: draft.rows });
      setDirty(false); loadSheets(section, draft.id);
    } catch (e) { alert('保存失败: ' + (e.response?.data?.error || e.message)); }
    finally { setSaving(false); }
  };
  const newSheet = async () => {
    const name = prompt('新表名称：', '新表');
    if (!name) return;
    try { await api.post('/training-plans/sheets', { section, name }); loadSheets(section); }
    catch (e) { alert('新建失败: ' + (e.response?.data?.error || e.message)); }
  };
  const delSheet = async () => {
    if (!draft || !confirm(`确定删除表「${draft.name}」？此表所有数据将一并删除。`)) return;
    try { await api.delete(`/training-plans/sheets/${draft.id}`); loadSheets(section); }
    catch (e) { alert('删除失败: ' + (e.response?.data?.error || e.message)); }
  };
  const seedTemplates = async () => {
    if (!confirm(`将为「${SEC_META[section].name}档案」生成一套预设模板表（短板/考勤/台账等），已存在的同名表会自动跳过。继续？`)) return;
    try {
      const r = await api.post('/training-plans/sheets/seed-templates', { section });
      alert(`已生成 ${r.data.created} 张模板表` + (r.data.skipped ? `，跳过 ${r.data.skipped} 张同名已存在的` : ''));
      loadSheets(section);
    } catch (e) { alert('生成失败: ' + (e.response?.data?.error || e.message)); }
  };

  return (
    <div>
      {/* 分区切换：教练 / 领队 */}
      <div className="flex gap-1 mb-5 p-1 bg-ur-card/40 rounded-xl border border-ur-border w-fit">
        {[['coach', '🟣 教练档案'], ['leader', '🔵 领队档案']].map(([v, label]) => (
          <button key={v} onClick={() => setSection(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-sans font-semibold transition-all duration-200
              ${section === v ? 'bg-ur-accent/15 text-ur-accent border border-ur-accent/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 表列表 + 新建表 / 只读提示 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {sheets.map(s => (
          <button key={s.id} onClick={() => selectSheet(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
              ${activeId === s.id ? 'bg-ur-accent/15 text-ur-accent border-ur-accent/30' : 'text-gray-400 border-ur-border hover:text-gray-200'}`}>
            {s.name}
          </button>
        ))}
        {canEdit ? (
          <>
            <button onClick={newSheet} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-ur-border text-gray-400 hover:text-ur-accent hover:border-ur-accent/40 transition-colors">+ 新建表</button>
            <button onClick={seedTemplates} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-ur-accent/40 text-ur-accent hover:bg-ur-accent/10 transition-colors">✨ 一键生成模板</button>
          </>
        ) : (
          <span className="text-xs text-gray-500 ml-1">👁 只读 · {SEC_META[section].name}档案区,可查看不可编辑</span>
        )}
      </div>

      {/* 表格编辑器 */}
      {!draft ? (
        <div className="data-card text-center py-12">
          <p className="text-4xl mb-3 opacity-30">📊</p>
          <p className="text-gray-400 text-sm">
            {sheets.length === 0 ? (canEdit ? '还没有表，点「+ 新建表」开始（建完可自己加列、填行）' : '该区暂无表') : '选择上方一张表查看'}
          </p>
        </div>
      ) : (
        <div className="data-card">
          {/* 表名 + 保存/删表 */}
          <div className="flex items-center justify-between mb-3 gap-3">
            {canEdit ? (
              <input value={draft.name} onChange={e => setName(e.target.value)}
                className="bg-transparent text-white font-semibold text-base border-b border-transparent hover:border-ur-border focus:border-ur-accent/60 outline-none pb-0.5 flex-1 min-w-0" />
            ) : (
              <div className="text-white font-semibold text-base flex items-center gap-2">
                <span className="w-1 h-4 rounded" style={{ background: SEC_META[section].color }} />{draft.name}
              </div>
            )}
            {canEdit && (
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={saveSheet} disabled={!dirty || saving}
                  className="px-4 py-1.5 rounded-lg bg-ur-accent/15 border border-ur-accent/30 text-ur-accent text-xs font-semibold hover:bg-ur-accent/25 disabled:opacity-40 transition-colors">
                  {saving ? '保存中…' : dirty ? '保存' : '已保存'}
                </button>
                <button onClick={delSheet} className="px-3 py-1.5 rounded-lg border border-ur-border text-gray-500 text-xs hover:text-ur-rose hover:border-ur-rose/40 transition-colors">删表</button>
              </div>
            )}
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm" style={{ minWidth: 'min-content' }}>
              <thead>
                <tr>
                  {canEdit && <th className="w-8 border border-ur-border bg-ur-bg/50 p-0"></th>}
                  {draft.columns.map((col, ci) => (
                    <th key={ci} className="border border-ur-border bg-ur-bg/50 px-1 py-1" style={{ minWidth: 130 }}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <input value={col} onChange={e => renameCol(ci, e.target.value)}
                            className="w-full bg-transparent text-gray-200 font-semibold text-xs outline-none focus:text-white px-1" />
                          <button onClick={() => delCol(ci)} title="删除此列" className="text-gray-600 hover:text-ur-rose text-xs flex-shrink-0">×</button>
                        </div>
                      ) : (
                        <span className="text-gray-200 font-semibold text-xs px-1">{col}</span>
                      )}
                    </th>
                  ))}
                  {canEdit && (
                    <th className="border border-ur-border bg-ur-bg/50 px-2 py-1">
                      <button onClick={addCol} title="新增一列" className="text-ur-accent text-xs whitespace-nowrap hover:underline">+ 列</button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-white/[0.02]">
                    {canEdit && (
                      <td className="border border-ur-border text-center p-0">
                        <button onClick={() => delRow(ri)} title="删除此行" className="text-gray-600 hover:text-ur-rose text-xs w-full py-1">×</button>
                      </td>
                    )}
                    {draft.columns.map((_, ci) => (
                      <td key={ci} className="border border-ur-border p-0" style={{ minWidth: 130 }}>
                        {canEdit ? (
                          <input value={row[ci] || ''} onChange={e => setCell(ri, ci, e.target.value)}
                            className="w-full bg-transparent text-gray-200 text-xs outline-none focus:bg-ur-accent/5 px-2 py-1" />
                        ) : (
                          <span className="text-gray-300 text-xs px-2 py-1 block">{row[ci] || ''}</span>
                        )}
                      </td>
                    ))}
                    {canEdit && <td className="border border-ur-border bg-ur-bg/20"></td>}
                  </tr>
                ))}
                {draft.rows.length === 0 && (
                  <tr>
                    <td colSpan={draft.columns.length + (canEdit ? 2 : 0) || 1} className="border border-ur-border text-center text-gray-600 text-xs py-3">
                      {draft.columns.length === 0 ? '先点右上「+ 列」加列' : (canEdit ? '点下方「+ 行」加数据' : '暂无数据')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {canEdit && draft.columns.length > 0 && (
            <button onClick={addRow} className="mt-2 px-3 py-1 rounded-lg border border-dashed border-ur-border text-gray-400 text-xs hover:text-ur-accent hover:border-ur-accent/40 transition-colors">+ 行</button>
          )}
          {dirty && <div className="text-[11px] text-yellow-400 mt-2">● 有未保存修改,记得点「保存」</div>}
        </div>
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   岗位职责板（r55·design 高保真）：摘要条 + P0/P1/P2 职责表 + 场景标签 + 频次 + 图例
   数据：GET/PUT /admin/duties（settings 表）；空库用分类表解析的真实种子（32 条）
   权限：admin/coach/team_lead 可编辑，其余只读
   ════════════════════════════════════════════════════════════ */
const DUTY_SEED = [{"code": "C-01", "title": "战术风格与体系设计", "pri": "P0", "freq": "每月", "desc": "根据选手特点确定队伍战术风格，制定赛季战术路线图，明确每张地图战术核心理念，每月评估适配性", "scene": "train", "role": "coach"}, {"code": "C-02", "title": "选手角色手册编写", "pri": "P0", "freq": "每季度", "desc": "为每个位置编写角色手册：IGL→指挥节奏/信息整合；狙击手→关键局打开/区域封锁；步枪手→执行/补枪；自由人→信息/非常规", "scene": "train", "role": "coach"}, {"code": "C-03", "title": "战术本维护与更新", "pri": "P0", "freq": "每次新增", "desc": "命名规则：完成战术本基建后，新增的战术：地图缩写名_T/CT.docx，24小时内更新完毕，领队检查与战术总表完全匹配", "scene": "train", "role": "coach"}, {"code": "C-04", "title": "选手短板识别与教导", "pri": "P0", "freq": "每日", "desc": "识别薄弱环节（枪法/道具/走位/决策/信息），制定训练计划，跟踪改善进度", "scene": "train", "role": "coach"}, {"code": "C-05", "title": "低级失误识别与纠正", "pri": "P0", "freq": "每场", "desc": "6类失误分类（交流/道具/走位/战术素养/经济/时间管理），分级处理（A致命/B严重/C一般）", "scene": "train", "role": "coach"}, {"code": "C-06", "title": "训练赛战术安排", "pri": "P0", "freq": "每日", "desc": "明确每局训练目标，安排战术执行方案，赛中指挥与调整", "scene": "train", "role": "coach"}, {"code": "C-07", "title": "Demo 复盘分析", "pri": "P1", "freq": "每场", "desc": "训练赛后复盘≥30分钟，重点复盘执行失败的战术、个人失误、关键回合逐帧分析", "scene": "train", "role": "coach"}, {"code": "C-08", "title": "对手情报收集与分析", "pri": "P1", "freq": "每周", "desc": "跟踪主要对手近期比赛结果和战术变化，赛前情报简报，对手Demo分析", "scene": "train", "role": "coach"}, {"code": "C-10", "title": "地图池规划", "pri": "P1", "freq": "每赛季", "desc": "维持5张主力地图+1-2张备选，评估地图池适配性，根据版本调整", "scene": "train", "role": "coach"}, {"code": "C-11", "title": "经济管理策略制定", "pri": "P1", "freq": "每月", "desc": "明确各经济情况下的购买策略（全购/半购/ECO/强起），连败止损方案", "scene": "train", "role": "coach"}, {"code": "C-13", "title": "一对一沟通与选手管理", "pri": "P0", "freq": "每周", "desc": "对问题选手面对面聊天，给出警告和建议，记录沟通内容，连续未改善→书面警告→改善不理想→下方+换人", "scene": "train", "role": "coach"}, {"code": "C-14", "title": "选手综合评估打分", "pri": "P0", "freq": "每周/每月", "desc": "周度7维度评分+月度5维度百分制，作为末位淘汰依据", "scene": "train", "role": "coach"}, {"code": "M-01", "title": "训练简报填写", "pri": "P0", "freq": "每日", "desc": "训练结束后30分钟内完成腾讯文档「UR_CS2_训练日志」的更新", "scene": "train", "role": "leader"}, {"code": "M-02", "title": "训练赛数据维护", "pri": "P0", "freq": "每日", "desc": "训练赛结束后30分钟内完成JSON文件上传，同时查看每日简报/训练日志在网页端的赛训汇总报告的准确性", "scene": "train", "role": "leader"}, {"code": "M-03", "title": "训练考勤与纪律管理", "pri": "P0", "freq": "每日", "desc": "训练时段出勤监控，迟到/缺席记录，训练期间纪律监督", "scene": "train", "role": "leader"}, {"code": "M-04", "title": "录像命名与归档", "pri": "P1", "freq": "每场", "desc": "按命名规则（日期_对手_地图.FLV）重命名并归档至局域网 02_录像/", "scene": "train", "role": "leader"}, {"code": "M-05", "title": "队员个人信息表维护", "pri": "P1", "freq": "人员变动时", "desc": "20列字段维护（含多Steam账号、Faceit/5E ID、手机号、紧急联系人等）", "scene": "train", "role": "leader"}, {"code": "M-07", "title": "外设库存管理", "pri": "P1", "freq": "每周", "desc": "外设库存表维护（型号/数量/在用/备件），损坏登记与返修流程", "scene": "train", "role": "leader"}, {"code": "M-08", "title": "生活保障", "pri": "P1", "freq": "每日", "desc": "基地餐饮/饮水/零食补给，住宿问题响应，办公区域整洁维护", "scene": "train", "role": "leader"}, {"code": "M-10", "title": "财务与预算管理", "pri": "P2", "freq": "每月", "desc": "月度成本报表填写，补给审批（≤500领队审批），费用报销整理", "scene": "train", "role": "leader"}, {"code": "M-11", "title": "应急处理", "pri": "P1", "freq": "即时", "desc": "6类突发场景处理（请假/设备故障/CS2崩溃/情绪冲突/比赛争议/签证问题）", "scene": "train", "role": "leader"}, {"code": "M-12", "title": "局域网文件归档", "pri": "P1", "freq": "每周", "desc": "检查所有文件命名规范性、补漏、确保存储位置正确", "scene": "train", "role": "leader"}, {"code": "M-13", "title": "赛训数据同步检查", "pri": "P1", "freq": "每日", "desc": "17:30自动同步后检查ur-esports.cn数据完整性，异常反馈", "scene": "train", "role": "leader"}, {"code": "M-14", "title": "文档归档与周报", "pri": "P1", "freq": "每周", "desc": "赛训汇总报告（按周）、月度成本报表整理", "scene": "train", "role": "leader"}, {"code": "C-09", "title": "Ban/Pick 策略制定", "pri": "P0", "freq": "每赛", "desc": "赛前确定 BP 方案，准备2-3套备选，BO3/BO5图池覆盖确认，对手BP习惯分析", "scene": "event", "role": "coach"}, {"code": "C-09b", "title": "赛中实时指挥", "pri": "P0", "freq": "每赛", "desc": "与IGL分工：教练负责宏观战术调整，IGL负责回合内微操；技术暂停快速复盘调整；关键经济局决策；暂停时机把握", "scene": "event", "role": "coach"}, {"code": "C-08b", "title": "赛前对手情报简报", "pri": "P0", "freq": "每赛", "desc": "赛前24小时完成对手情报简报：强图/弱图/惯用战术/关键选手/近期战绩/BP倾向", "scene": "event", "role": "coach"}, {"code": "C-12", "title": "试训选手技战术评估", "pri": "P1", "freq": "按需", "desc": "5维度考核（枪法/战术理解/团队配合/态度/潜力），提交评估报告", "scene": "event", "role": "coach"}, {"code": "M-09", "title": "差旅安排", "pri": "P0", "freq": "每赛", "desc": "赛事行程规划（交通/住宿/餐饮），优先直飞/高铁，酒店近赛场/网络条件优，预订执行，报销单据收集", "scene": "event", "role": "leader"}, {"code": "M-06", "title": "赛前设备调试", "pri": "P0", "freq": "每赛", "desc": "比赛机/外设/网络调试确认，驱动版本锁定，备用机就位，CS2设置同步确认", "scene": "event", "role": "leader"}, {"code": "M-04b", "title": "比赛录像归档", "pri": "P1", "freq": "每赛", "desc": "比赛录像按命名规则归档至局域网，Demo入库，关键回合标注", "scene": "event", "role": "leader"}, {"code": "M-11b", "title": "赛中后勤与应急", "pri": "P0", "freq": "每赛", "desc": "赛中餐饮/水分补充，技术暂停设备处理，场外信息屏蔽，突发情况应急响应", "scene": "event", "role": "leader"}];

const SCENE_META = {
  train:   { label: '日常训练周', cls: 'wsd-sc-train' },
  event:   { label: '赛事期间',   cls: 'wsd-sc-event' },
  meeting: { label: '周六例会',   cls: 'wsd-sc-meeting' },
};
const ROLE_META = {
  coach:  { label: '教练职责', badge: 'COACH',  owner: 'HZ' },
  leader: { label: '领队职责', badge: 'LEADER', owner: 'Smokkky' },
};
const PRI_ORDER = { P0: 0, P1: 1, P2: 2 };

function DutyBoard({ role }) {
  const [items, setItems] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canEdit = ['admin', 'coach', 'team_lead'].includes(user.role);

  useEffect(() => {
    api.get('/admin/duties')
      .then(({ data }) => {
        if (data && Array.isArray(data.items) && data.items.length) {
          setItems(data.items);
          setUpdatedAt(data.updated_at || null);
        } else setItems(DUTY_SEED.map((x) => ({ ...x })));
      })
      .catch(() => setItems(DUTY_SEED.map((x) => ({ ...x }))));
  }, []);

  if (!items) return <div className="wsd-loading">职责表加载中…</div>;

  const mine = items
    .map((x, idx) => ({ ...x, _i: idx }))
    .filter((x) => x.role === role || x.role === 'coop')
    .sort((a, b) => (PRI_ORDER[a.pri] ?? 3) - (PRI_ORDER[b.pri] ?? 3));
  const cnt = (p) => mine.filter((x) => x.pri === p).length;
  const meta = ROLE_META[role];

  const upd = (i, patch) => setItems((all) => all.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const del = (i) => setItems((all) => all.filter((_, idx) => idx !== i));
  const add = () => setItems((all) => [...all, { code: '', title: '', pri: 'P2', freq: '', desc: '', scene: 'train', role }]);
  const save = () => {
    setSaving(true);
    api.put('/admin/duties', { items })
      .then(({ data }) => { setUpdatedAt(data.updated_at || new Date().toISOString()); setEditing(false); })
      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setSaving(false));
  };

  return (
    <div className="wsd-board">
      <div className="wsd-summary">
        <span className="wsd-rolebadge">{meta.badge}</span>
        <span className="wsd-owner">负责人 · {meta.owner}</span>
        <span className="wsd-cnt wsd-cnt-p0">P0 × {cnt('P0')}</span>
        <span className="wsd-cnt wsd-cnt-p1">P1 × {cnt('P1')}</span>
        <span className="wsd-cnt wsd-cnt-p2">P2 × {cnt('P2')}</span>
        <span className="wsd-updated">{updatedAt ? `更新 ${String(updatedAt).slice(0, 16).replace('T', ' ')}` : '默认职责表'}</span>
        <span className="wsd-flex" />
        {canEdit
          ? (editing
            ? <><span className="wsd-btn" onClick={add}>+ 加一条</span><span className="wsd-btn wsd-btn-main" onClick={saving ? null : save}>{saving ? '保存中…' : '保存'}</span></>
            : <span className="wsd-btn" onClick={() => setEditing(true)}>编辑</span>)
          : <span className="wsd-lock">🔒 只读</span>}
      </div>

      <div className="wsd-table">
        <div className="wsd-row wsd-head">
          <span>优先级</span><span>职责事项</span><span>场景</span><span>频次</span>{editing && <span />}
        </div>
        {mine.map((x) => (
          <div key={x._i} className={'wsd-row wsd-' + String(x.pri).toLowerCase()}>
            <span>
              {editing
                ? <select className="wsd-in" value={x.pri} onChange={(e) => upd(x._i, { pri: e.target.value })}><option>P0</option><option>P1</option><option>P2</option></select>
                : <span className={'wsd-pri wsd-pri-' + String(x.pri).toLowerCase()}>{x.pri}</span>}
            </span>
            <span className="wsd-item">
              {editing ? (
                <>
                  <input className="wsd-in" value={x.title} placeholder="职责事项" onChange={(e) => upd(x._i, { title: e.target.value })} />
                  <input className="wsd-in wsd-in-desc" value={x.desc} placeholder="说明" onChange={(e) => upd(x._i, { desc: e.target.value })} />
                </>
              ) : (
                <>
                  <b>{x.code ? `${x.code} · ` : ''}{x.title}</b>
                  {x.desc && <i>{x.desc}</i>}
                </>
              )}
            </span>
            <span>
              {editing
                ? <select className="wsd-in" value={x.scene} onChange={(e) => upd(x._i, { scene: e.target.value })}>{Object.entries(SCENE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                : (
                  <span className="wsd-scwrap">
                    <span className={'wsd-sc ' + (SCENE_META[x.scene]?.cls || '')}>{SCENE_META[x.scene]?.label || x.scene}</span>
                    <span className={'wsd-sc ' + (x.role === 'coop' ? 'wsd-sc-coop' : 'wsd-sc-solo')}>{x.role === 'coop' ? '协作分工' : '独立职责'}</span>
                  </span>
                )}
            </span>
            <span className="wsd-freq">
              {editing
                ? <input className="wsd-in" value={x.freq} onChange={(e) => upd(x._i, { freq: e.target.value })} />
                : (x.freq || '—')}
            </span>
            {editing && <span className="wsd-del" onClick={() => del(x._i)}>删</span>}
          </div>
        ))}
      </div>

      <div className="wsd-legend">
        <span className="wsd-sc wsd-sc-train">日常训练周</span>
        <span className="wsd-sc wsd-sc-event">赛事期间</span>
        <span className="wsd-sc wsd-sc-meeting">周六例会</span>
        <span className="wsd-sc wsd-sc-solo">独立职责</span>
        <span className="wsd-sc wsd-sc-coop">协作分工</span>
      </div>
    </div>
  );
}
