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

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
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
          <Route path="training-report" element={<ReportSummary />} />
          <Route path="report-summary" element={<ReportSummary />} />
          <Route path="training-plans" element={<TrainingPlans />} />
          <Route path="tactics" element={<Tactics />} />
          <Route path="workstation" element={<Workstation />} />
          <Route path="trial-players" element={<Navigate to="/members" />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin-legacy" element={<Admin />} />
          <Route path="admin-hub" element={<AdminHub />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Routes>
    </LangProvider>
  );
}
