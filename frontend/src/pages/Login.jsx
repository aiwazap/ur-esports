import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const successMsg = location.state?.message;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.username || !form.password) {
      setErr('请填写所有字段');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        username: form.username,
        password: form.password,
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      nav('/overview');
    } catch (err) {
      setErr(err.response?.data?.error || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-bg-grid" />
      <form onSubmit={submit} className="login-card">
        <div className="login-logo-wrap">
          <img src="/images/ur-logo-transparent.png" alt="UR Esports" />
        </div>
        <div className="login-title">
          <h1>UR Esports</h1>
          <p>赛训数据中心 · 身份验证</p>
        </div>

        {err && (
          <div className="login-alert login-alert--error">
            {err}
          </div>
        )}

        {successMsg && (
          <div className="login-alert login-alert--ok">
            {successMsg}
          </div>
        )}

        <div className="login-field">
          <label>用户名</label>
          <input
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            autoFocus
            placeholder="请输入用户名"
          />
        </div>

        <div className="login-field">
          <label>密码</label>
          <input
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            type="password"
            placeholder="请输入密码"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="login-submit"
        >
          {loading ? '登录中...' : '登录'}
        </button>

        <div className="login-register">
          没有账号？{' '}
          <Link to="/register">立即注册</Link>
        </div>
      </form>
    </div>
  );
}
