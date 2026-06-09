import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import Members from './pages/Members';
import TrainingReport from './pages/TrainingReport';
import Tactics from './pages/Tactics';
import Admin from './pages/Admin';
import TrialPlayers from './pages/TrialPlayers';

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
        <Route path="training-report" element={<TrainingReport />} />
        <Route path="tactics" element={<Tactics />} />
        <Route path="trial-players" element={<TrialPlayers />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  );
}
