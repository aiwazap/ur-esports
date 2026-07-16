import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import './codex-made.css';

export default function CodexMade() {
  const [html, setHtml] = useState('');
  const [locked, setLocked] = useState(false);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/codex-made');
      setHtml(data?.html || '');
      setLocked(false);
    } catch (err) {
      if (err.response?.status === 423) setLocked(true);
      else setError(err.response?.status === 403 ? '仅 Admin 可访问' : '页面加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(); }, [loadPage]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!pass || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/admin/codex-made/unlock', { pass });
      setPass('');
      await loadPage();
    } catch (err) {
      setError(err.response?.data?.error || '验证失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (locked) {
    return (
      <div className="cm-gate">
        <div className="cm-gate__grid" aria-hidden="true" />
        <form className="cm-gate__panel" onSubmit={unlock}>
          <span className="cm-gate__eyebrow">CODEX MADE · RESTRICTED RECORD</span>
          <h1>二次验证</h1>
          <p>此页面仅限 Admin，并需要输入私人档案口令。</p>
          <label>
            <span>ACCESS PHRASE</span>
            <input
              type="password"
              value={pass}
              onChange={(event) => setPass(event.target.value)}
              placeholder="输入口令"
              autoFocus
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={!pass || submitting}>
            {submitting ? '验证中' : '进入档案'}
          </button>
          <div className="cm-gate__error" role="alert">{error}</div>
          <small>验证有效期 12 小时 · 失败尝试受到限制</small>
        </form>
      </div>
    );
  }

  if (error) return <div className="cm-state cm-state--error">{error}</div>;
  if (loading || !html) return <div className="cm-state">正在验证私人档案…</div>;

  return (
    <div className="cm-shell">
      <iframe
        className="cm-frame"
        title="codex made"
        srcDoc={html}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
