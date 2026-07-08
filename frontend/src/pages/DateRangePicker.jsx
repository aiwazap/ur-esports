import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 工具函数 ────────────────────────────────────────────────
const toStr  = (d) => d.toISOString().slice(0, 10);
const today  = () => toStr(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toStr(d); };

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const PRESETS = [
  { label: '近3天',  start: () => daysAgo(3) },
  { label: '近7天',  start: () => daysAgo(7) },
  { label: '近30天', start: () => daysAgo(30) },
  { label: '近90天', start: () => daysAgo(90) },
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}
function buildCalendar(year, month) {
  const days     = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const cells    = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}
function dateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── 单个日历面板 ────────────────────────────────────────────
function CalendarPanel({ year, month, onPrev, onNext, selecting, startDate, endDate, hoverDate, onDayClick, onDayHover, isLeft }) {
  const todayStr = today();
  const cells    = buildCalendar(year, month);

  return (
    <div style={{ width: 240, flexShrink: 0 }}>
      {/* 月份导航 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        {isLeft ? (
          <button onClick={onPrev} style={navBtnStyle}>‹</button>
        ) : <div style={{ width: 28 }} />}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1 }}>
          {year}年 {MONTHS[month]}
        </div>
        {!isLeft ? (
          <button onClick={onNext} style={navBtnStyle}>›</button>
        ) : <div style={{ width: 28 }} />}
      </div>

      {/* 星期头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10, color: '#5a6a85', padding: '2px 0', fontWeight: 600 }}>{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px 0' }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;

          const ds        = dateStr(year, month, day);
          const isToday   = ds === todayStr;
          const isFuture  = ds > todayStr;
          const isStart   = ds === startDate;
          const isEnd     = ds === endDate;
          const isSelected = isStart || isEnd;

          // 范围高亮
          const rangeEnd  = selecting && hoverDate ? hoverDate : endDate;
          const lo        = startDate && rangeEnd ? (startDate < rangeEnd ? startDate : rangeEnd) : null;
          const hi        = startDate && rangeEnd ? (startDate < rangeEnd ? rangeEnd : startDate) : null;
          const inRange   = lo && hi && ds > lo && ds < hi;

          let bg        = 'transparent';
          let color     = isFuture ? '#3a4a5a' : '#c8d8e8';
          let fontWeight = 400;
          let borderRadius = 6;

          if (isSelected) {
            bg         = 'linear-gradient(135deg, #00d4ff, #0066cc)';
            color      = '#fff';
            fontWeight = 700;
          } else if (inRange) {
            bg         = 'rgba(0,212,255,0.12)';
            color      = '#00d4ff';
            borderRadius = 0;
          }
          if (isToday && !isSelected) {
            color = '#00d4ff';
            fontWeight = 700;
          }

          return (
            <div
              key={idx}
              onClick={() => !isFuture && onDayClick(ds)}
              onMouseEnter={() => !isFuture && onDayHover(ds)}
              style={{
                textAlign: 'center', fontSize: 12, padding: '6px 2px',
                background: bg, color, fontWeight, borderRadius,
                cursor: isFuture ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                ...(isToday && !isSelected ? { textDecoration: 'underline', textDecorationColor: '#00d4ff' } : {}),
              }}
              onMouseLeave={() => {}}
            >
              {isSelected && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 6,
                  background: 'linear-gradient(135deg,#00d4ff,#0066cc)',
                  zIndex: -1,
                  boxShadow: '0 0 10px rgba(0,212,255,0.4)',
                }} />
              )}
              {day}
              {isToday && !isSelected && (
                <div style={{
                  position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: '#00d4ff',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtnStyle = {
  width: 28, height: 28, borderRadius: 6,
  background: 'rgba(0,212,255,0.08)',
  border: '1px solid rgba(0,212,255,0.2)',
  color: '#00d4ff', fontSize: 18, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.2s', padding: 0, lineHeight: 1,
};

// ─── 主组件 ──────────────────────────────────────────────────
export default function DateRangePicker({ start, end, onChange }) {
  const todayStr = today();

  // 左侧日历显示月份（右侧自动 +1）
  const initDate = new Date(end || todayStr);
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth() === 0 ? 0 : initDate.getMonth() - 1);

  const [open,      setOpen]      = useState(false);
  const [selecting, setSelecting] = useState(false); // true = 已点第一个日期，等第二个
  const [tempStart, setTempStart] = useState(start);
  const [tempEnd,   setTempEnd]   = useState(end);
  const [hoverDate, setHoverDate] = useState(null);
  const [activePreset, setActivePreset] = useState('近7天');

  const containerRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSelecting(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { setOpen(false); setSelecting(false); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 右侧日历月份
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const rightYear  = viewMonth === 11 ? viewYear + 1 : viewYear;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    // 不允许右侧超过当前月
    const nextR = rightMonth === 11 ? 0 : rightMonth + 1;
    const nextRY = rightMonth === 11 ? rightYear + 1 : rightYear;
    const now = new Date();
    if (nextRY > now.getFullYear() || (nextRY === now.getFullYear() && nextR > now.getMonth())) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDayClick = (ds) => {
    if (!selecting) {
      // 第一次点击：设为起始
      setTempStart(ds);
      setTempEnd(null);
      setSelecting(true);
      setActivePreset(null);
    } else {
      // 第二次点击：设为结束
      const lo = ds < tempStart ? ds : tempStart;
      const hi = ds < tempStart ? tempStart : ds;
      setTempStart(lo);
      setTempEnd(hi);
      setSelecting(false);
      setOpen(false);
      onChange(lo, hi);
    }
  };

  const handlePreset = (p) => {
    const s = p.start();
    const e = todayStr;
    setTempStart(s);
    setTempEnd(e);
    setActivePreset(p.label);
    setSelecting(false);
    setOpen(false);
    onChange(s, e);
  };

  const handleConfirm = () => {
    if (tempStart && tempEnd) {
      onChange(tempStart, tempEnd);
      setOpen(false);
      setSelecting(false);
    }
  };

  // 显示文字
  const displayText = start && end
    ? `${start}  →  ${end}`
    : '选择日期范围';

  const dayCount = start && end
    ? Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1
    : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>

      {/* ── 触发栏 ── */}
      <div
        onClick={() => { setOpen(o => !o); setTempStart(start); setTempEnd(end); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 18px', cursor: 'pointer',
          background: 'rgba(8,14,32,0.9)',
          border: `1px solid ${open ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
          borderRadius: 8, transition: 'all 0.2s',
          boxShadow: open ? '0 0 20px rgba(0,212,255,0.1)' : 'none',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* 顶部光边 */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg,transparent,rgba(0,212,255,0.5),transparent)',
          opacity: open ? 1 : 0.4, transition: 'opacity 0.3s',
        }} />

        {/* 左侧标签 */}
        <div style={{ fontSize: 10, color: '#5a6a85', letterSpacing: 2, fontWeight: 700, whiteSpace: 'nowrap' }}>
          数据范围
        </div>

        {/* 分割线 */}
        <div style={{ width: 1, height: 16, background: 'rgba(0,212,255,0.2)' }} />

        {/* 预设快捷 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={e => { e.stopPropagation(); handlePreset(p); }}
              style={{
                padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s', border: '1px solid',
                background: activePreset === p.label ? 'rgba(0,212,255,0.15)' : 'transparent',
                color:      activePreset === p.label ? '#00d4ff' : '#5a6a85',
                borderColor: activePreset === p.label ? 'rgba(0,212,255,0.35)' : 'rgba(0,212,255,0.1)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 分割线 */}
        <div style={{ width: 1, height: 16, background: 'rgba(0,212,255,0.2)' }} />

        {/* 日历图标 + 日期显示 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{
            fontSize: 12, color: start ? '#e2e8f0' : '#5a6a85',
            fontFamily: "'Orbitron', monospace", letterSpacing: 1,
          }}>
            {displayText}
          </span>
          {dayCount && (
            <span style={{
              fontSize: 10, color: '#5a6a85', marginLeft: 4,
              background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.1)',
              borderRadius: 4, padding: '1px 6px',
            }}>
              {dayCount}天
            </span>
          )}
        </div>

        {/* 箭头 */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="#5a6a85"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </div>

      {/* ── 下拉面板 ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999,
          background: 'rgba(6,11,20,0.98)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 12, padding: '16px 20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.08)',
          backdropFilter: 'blur(20px)',
          minWidth: 540,
        }}>
          {/* 顶部光边 */}
          <div style={{
            position: 'absolute', top: 0, left: 20, right: 20, height: 1,
            background: 'linear-gradient(90deg,transparent,rgba(0,212,255,0.5),transparent)',
          }} />

          {/* 操作提示 */}
          <div style={{
            fontSize: 11, color: '#5a6a85', marginBottom: 14, textAlign: 'center', letterSpacing: 1,
          }}>
            {selecting
              ? '✦ 请选择结束日期'
              : '✦ 点击选择开始日期'}
          </div>

          {/* 双日历 */}
          <div style={{ display: 'flex', gap: 24 }}>
            <CalendarPanel
              year={viewYear} month={viewMonth}
              onPrev={prevMonth} onNext={null}
              selecting={selecting}
              startDate={tempStart} endDate={tempEnd}
              hoverDate={hoverDate}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              isLeft={true}
            />
            <div style={{ width: 1, background: 'rgba(0,212,255,0.1)', alignSelf: 'stretch' }} />
            <CalendarPanel
              year={rightYear} month={rightMonth}
              onPrev={null} onNext={nextMonth}
              selecting={selecting}
              startDate={tempStart} endDate={tempEnd}
              hoverDate={hoverDate}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              isLeft={false}
            />
          </div>

          {/* 底部：已选范围 + 确认 */}
          <div style={{
            marginTop: 14, paddingTop: 12,
            borderTop: '1px solid rgba(0,212,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 11, color: '#5a6a85' }}>
              {tempStart && tempEnd ? (
                <span>
                  <span style={{ color: '#00d4ff', fontFamily: 'Orbitron,monospace' }}>{tempStart}</span>
                  <span style={{ margin: '0 8px', color: '#3a4a5a' }}>→</span>
                  <span style={{ color: '#00d4ff', fontFamily: 'Orbitron,monospace' }}>{tempEnd}</span>
                  <span style={{ marginLeft: 8, color: '#3a4a5a' }}>
                    共 {Math.ceil((new Date(tempEnd) - new Date(tempStart)) / 86400000) + 1} 天
                  </span>
                </span>
              ) : tempStart ? (
                <span style={{ color: '#5a6a85' }}>已选 <span style={{ color: '#00d4ff' }}>{tempStart}</span>，请选结束日期</span>
              ) : (
                <span>请选择日期范围</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setOpen(false); setSelecting(false); }}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#5a6a85',
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={!tempStart || !tempEnd}
                style={{
                  padding: '5px 16px', borderRadius: 6, fontSize: 12, cursor: tempStart && tempEnd ? 'pointer' : 'not-allowed',
                  background: tempStart && tempEnd ? 'linear-gradient(135deg,#00d4ff,#0066cc)' : 'rgba(0,212,255,0.1)',
                  border: 'none', color: tempStart && tempEnd ? '#000' : '#3a4a5a',
                  fontWeight: 700, transition: 'all 0.2s',
                  boxShadow: tempStart && tempEnd ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
