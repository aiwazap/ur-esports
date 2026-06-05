import { useState } from 'react';
import api from '../api';

export default function Admin() {
  // ── JSON Import State ──
  const [jsonFiles, setJsonFiles] = useState([]);
  const [opponent, setOpponent] = useState('');
  const [importing, setImporting] = useState(false);
  const [batchResults, setBatchResults] = useState(null);   // 批量结果数组
  const [importError, setImportError] = useState(null);

  // 从文件名提取对手名（格式：MMDD_对手名_M*.json）
  const extractOpponentFromFilename = (filename) => {
    const m = filename.match(/^\d{4}[_-](.+?)_[Mm]\d+/);
    if (m) return m[1];
    return '';
  };

  /** 移除已选中的某个文件 */
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
      // 全部成功后清空
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

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-2xl font-bold text-white mb-1">数据管理</h2>
      <p className="text-gray-500 text-sm mb-6">数据导入 · 用户管理 · 系统配置</p>

      {/* JSON Import */}
      <div className="data-card mb-5">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-ur-cyan" />
          训练赛 JSON 导入
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">对手名称 <span className="text-gray-600 text-xs">(可选，自动从文件名识别)</span></label>
            <input
              type="text"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="自动从文件名识别，如 0508_Mongolz.A_M1.json → Mongolz.A"
              className="w-full bg-ur-bg border border-ur-border text-white rounded-lg px-4 py-2.5 text-sm
                         focus:border-ur-cyan focus:outline-none placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* 单行文件选择 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1.5">JSON 数据文件 <span className="text-ur-rose">*</span></label>
          <input
            id="json-file-input"
            type="file"
            accept=".json"
            multiple
            onChange={e => {
              const selected = Array.from(e.target.files || []);
              setJsonFiles(prev => [...prev, ...selected]);
              // 自动从第一个文件名提取对手名
              if (selected.length > 0 && !opponent) {
                const inferred = extractOpponentFromFilename(selected[0].name);
                if (inferred && !opponent) setOpponent(inferred);
              }
              setImportError(null);
              setBatchResults(null);
            }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg
                       file:border-0 file:text-sm file:font-display file:bg-ur-indigo/20 file:text-ur-cyan
                       hover:file:bg-ur-indigo/30 file:cursor-pointer"
          />
        </div>

        {/* 已选文件列表 */}
        {jsonFiles.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">已选 {jsonFiles.length} 个文件</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {jsonFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-ur-bg rounded px-3 py-1.5 text-sm group">
                  <span className="text-gray-300 truncate mr-2">{f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    disabled={importing}
                    className="text-gray-600 hover:text-ur-rose transition-colors shrink-0 disabled:opacity-30"
                    title="移除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleJsonImport}
            disabled={importing || jsonFiles.length === 0}
            className="px-6 py-2.5 text-sm font-display bg-ur-cyan text-ur-bg rounded-lg
                       hover:bg-ur-cyan/80 disabled:opacity-50 transition-all"
          >
            {importing ? `导入中 (${jsonFiles.length} 文件)...` : `导入到数据库 (${jsonFiles.length > 0 ? jsonFiles.length + ' 文件' : ''})`}
          </button>
          <span className="text-xs text-gray-600">CS2 比赛 JSON → matches + player_stats</span>
        </div>

        {/* 批量结果 */}
        {batchResults && (
          <div className="mt-4 space-y-2">
            {/* 汇总 */}
            <div className="p-3 bg-ur-indigo/10 border border-ur-indigo/30 rounded-lg text-sm flex items-center gap-3">
              <span className="font-display text-ur-cyan">
                批量导入完成：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
              </span>
              <span className="text-gray-500">
                {batchResults.filter(r => !r.success).length > 0 && `${batchResults.filter(r => !r.success).length} 失败`}
              </span>
            </div>
            {/* 逐文件详情 */}
            {batchResults.map((r, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm border ${
                  r.success
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-ur-rose/10 border-ur-rose/30'
                }`}
              >
                <p className={`font-display mb-0.5 ${r.success ? 'text-emerald-400' : 'text-ur-rose'}`}>
                  {r.success ? '✓' : '✗'} {r.filename}
                </p>
                {r.success ? (
                  <p className="text-gray-400">
                    {r.map} · {r.score} · {r.opponent && `${r.opponent} · `}
                    {r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '平'} · {r.players} 名选手数据
                    {r.players === 0 && r.totalEntries > 0 && (
                      <span className="text-ur-amber ml-1">({r.totalEntries} 条记录未匹配)</span>
                    )}
                  </p>
                ) : (
                  <p className="text-ur-rose/70">{r.error}</p>
                )}
                {/* 诊断信息：当选手数为 0 时显示 */}
                {r.success && r.players === 0 && r.skippedReasons && r.skippedReasons.length > 0 && (
                  <div className="mt-1.5 bg-ur-amber/10 border border-ur-amber/20 rounded p-2 text-xs">
                    <p className="text-ur-amber/80 font-display mb-1">诊断信息：</p>
                    {r.skippedReasons.map((reason, j) => (
                      <p key={j} className="text-gray-500 ml-2 leading-relaxed">{reason}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 错误（请求级错误） */}
        {importError && (
          <div className="mt-4 p-3 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-sm text-ur-rose">
            {importError}
          </div>
        )}
      </div>

      {/* User & Members placeholder */}
      <div className="data-card mb-5">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-ur-purple" />
          用户与成员管理
        </h3>
        <p className="text-gray-500 text-sm text-center py-4">功能开发中 — 用户审核 · 成员权限 · 操作日志</p>
      </div>

      {/* Schedule placeholder */}
      <div className="data-card mb-5">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-ur-amber" />
          赛程管理
        </h3>
        <p className="text-gray-500 text-sm text-center py-4">功能开发中 — 赛程导入 · 赛果更新</p>
      </div>

      {/* Logs placeholder */}
      <div className="data-card">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-gray-600" />
          操作日志
        </h3>
        <p className="text-gray-500 text-sm text-center py-4">功能开发中 — 操作记录 · 数据变更追踪</p>
      </div>
    </div>
  );
}
