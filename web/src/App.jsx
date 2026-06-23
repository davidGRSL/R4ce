import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rankings from './pages/Rankings.jsx';
import Times from './pages/Times.jsx';
import TimeDetail from './pages/TimeDetail.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index             element={<Dashboard />} />
        <Route path="rankings"   element={<Rankings />} />
        <Route path="times"      element={<Times />} />
        <Route path="times/:id"  element={<TimeDetail />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
