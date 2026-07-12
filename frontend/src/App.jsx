import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';

const Login = lazy(() => import('./pages/Login'));
const VisitorOverview = lazy(() => import('./pages/VisitorOverview'));
const VisitorDetail = lazy(() => import('./pages/VisitorDetail'));
const Infrastructure = lazy(() => import('./pages/Infrastructure'));
const Services = lazy(() => import('./pages/Services'));
const AppDetails = lazy(() => import('./pages/AppDetails'));
const Settings = lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <span className="loader-mark" aria-hidden="true" />
    <span>טוען את סביבת הניטור…</span>
  </div>
);

const ProtectedRoute = ({ children }) => (
  localStorage.getItem('token') ? children : <Navigate to="/login" replace />
);

function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const handleAuthChange = () => setAuthenticated(Boolean(localStorage.getItem('token')));
    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={authenticated ? <Navigate to="/visitors" replace /> : <Login />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Navigate to="/visitors" replace />} />
            <Route path="/visitors" element={<VisitorOverview />} />
            <Route path="/visitors/:id" element={<VisitorDetail />} />
            <Route path="/infrastructure" element={<Infrastructure />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:id" element={<AppDetails />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/app/:id" element={<LegacyAppRedirect />} />
            <Route path="/system-stats" element={<Navigate to="/infrastructure" replace />} />
          </Route>
          <Route path="*" element={<Navigate to={authenticated ? '/visitors' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const LegacyAppRedirect = () => {
  const id = window.location.pathname.split('/').filter(Boolean).pop();
  return <Navigate to={`/services/${id}`} replace />;
};

export default App;
