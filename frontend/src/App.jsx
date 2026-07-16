import { Routes, Route, Navigate } from 'react-router-dom';
import { LangProvider } from './i18n';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import Members from './pages/Members';
import Matches from './pages/Matches';
import TrainingReport from './pages/TrainingReport';
import Tactics from './pages/Tactics';
import TrainingPlans from './pages/TrainingPlans';
import Admin from './pages/Admin';
import Users from './pages/Users';
import TrialPlayers from './pages/TrialPlayers';
import Workstation from './pages/Workstation';
import ReportSummary from './pages/ReportSummary';
import AdminHub from './pages/AdminHub';
import FaceitSea from './pages/FaceitSea';
import CodexMade from './pages/CodexMade';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function getRole() {
  try { return (JSON.parse(localStorage.getItem('user') || '{}')).role; } catch { return undefined; }
}

// 游客禁入的页面：直接敲网址也会被弹回总览（后端另有只读强制）
function StaffRoute({ children }) {
  return getRole() === 'guest' ? <Navigate to="/overview" replace /> : children;
}

// 仅 admin：直接敲网址也会被弹回总览（后端 strictAdminAuth 才是真正的关卡）
function AdminRoute({ children }) {
  return getRole() === 'admin' ? children : <Navigate to="/overview" replace />;
}

export default function App() {
  return (
    <LangProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/overview" />} />
          <Route path="overview" element={<Overview />} />
          <Route path="members" element={<Members />} />
          <Route path="matches" element={<Matches />} />
          <Route path="faceit-sea" element={<FaceitSea />} />
          <Route path="training-report" element={<StaffRoute><ReportSummary /></StaffRoute>} />
          <Route path="report-summary" element={<StaffRoute><ReportSummary /></StaffRoute>} />
          <Route path="training-plans" element={<StaffRoute><TrainingPlans /></StaffRoute>} />
          <Route path="tactics" element={<StaffRoute><Tactics /></StaffRoute>} />
          <Route path="workstation" element={<StaffRoute><Workstation /></StaffRoute>} />
          <Route path="trial-players" element={<Navigate to="/members" />} />
          <Route path="admin" element={<StaffRoute><Admin /></StaffRoute>} />
          <Route path="admin-legacy" element={<StaffRoute><Admin /></StaffRoute>} />
          <Route path="admin-hub" element={<StaffRoute><AdminHub /></StaffRoute>} />
          <Route path="users" element={<StaffRoute><Users /></StaffRoute>} />
          <Route path="codex-made" element={<AdminRoute><CodexMade /></AdminRoute>} />
        </Route>
      </Routes>
    </LangProvider>
  );
}
