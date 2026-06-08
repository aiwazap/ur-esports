import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import Members from './pages/Members';
import Matches from './pages/Matches';
import TrainingReport from './pages/TrainingReport';
import TrainingPlans from './pages/TrainingPlans';
import Tactics from './pages/Tactics';
import OpponentIntel from './pages/OpponentIntel';
import Admin from './pages/Admin';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/overview" />} />
        <Route path="overview" element={<Overview />} />
        <Route path="members" element={<Members />} />
        <Route path="matches" element={<Matches />} />
        <Route path="training-report" element={<TrainingReport />} />
        <Route path="training-plans" element={<TrainingPlans />} />
        <Route path="tactics" element={<Tactics />} />
        <Route path="opponent-intel" element={<OpponentIntel />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  );
}
