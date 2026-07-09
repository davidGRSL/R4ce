import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TimeDetail from './pages/TimeDetail.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import Stages from './pages/Stages.jsx';
import StageCreate from './pages/StageCreate.jsx';
import StageDetail from './pages/StageDetail.jsx';
import Profile from './pages/Profile.jsx';
import Live from './pages/Live.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index                 element={<Dashboard />} />
        <Route path="live"            element={<Live />} />
        <Route path="stages"          element={<Stages />} />
        <Route path="stages/create"   element={<StageCreate />} />
        <Route path="stages/:id"      element={<StageDetail />} />
        <Route path="stages/:id/edit" element={<StageCreate />} />
        {/* Rankings ahora vive como pestaña dentro de Tramos */}
        <Route path="rankings"        element={<Navigate to="/stages?tab=rankings" replace />} />
        <Route path="groups"          element={<Groups />} />
        <Route path="groups/:id"      element={<GroupDetail />} />
        <Route path="times/:id"       element={<TimeDetail />} />
        <Route path="profile"         element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
