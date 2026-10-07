import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  bootstrapSession,
  getSessionSnapshot,
  subscribeSession,
} from "./lib/session";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { safeReturnPath, legacyAppDestination } from "./lib/reportNavigation";
import AppShell from "./components/AppShell";
import LoadBoundary from "./components/LoadBoundary";
import { apiFetch } from "./lib/api";
import { DataState } from "./components/AnalyticsParts";

const Login = lazy(() => import("./pages/Login"));
const VisitorOverview = lazy(() => import("./pages/VisitorOverview"));
const VisitorDetail = lazy(() => import("./pages/VisitorDetail"));
const Infrastructure = lazy(() => import("./pages/Infrastructure"));
const Services = lazy(() => import("./pages/Services"));
const AppDetails = lazy(() => import("./pages/AppDetails"));
const Settings = lazy(() => import("./pages/Settings"));
const ClientGrowth = lazy(() => import("./pages/ClientGrowth"));
const Vault = lazy(() => import("./pages/Vault"));

const VisitorSite = () => {
  const { id } = useParams();
  return <VisitorDetail key={id} />;
};

const PageLoader = () => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 20000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="loader-mark" aria-hidden="true" />
      <span>טוען את סביבת הניטור…</span>
      {slow && (
        <button
          className="btn"
          type="button"
          onClick={() => window.location.reload()}
        >
          הטעינה מתעכבת · נסו מחדש
        </button>
      )}
    </div>
  );
};

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const user = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  return user ? (
    children
  ) : (
    <Navigate
      to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
};

const LoginDestination = () => {
  const location = useLocation();
  return (
    <Navigate
      to={safeReturnPath(new URLSearchParams(location.search).get("returnTo"))}
      replace
    />
  );
};

function App() {
  const authenticated = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    bootstrapSession()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (error)
    return (
      <div className="login">
        <div className="login__card">
          <p role="alert">{error}</p>
          <button className="btn" onClick={() => location.reload()}>
            ניסיון נוסף
          </button>
        </div>
      </div>
    );
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <LoadBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/login"
              element={authenticated ? <LoginDestination /> : <Login />}
            />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/visitors" replace />} />
              <Route path="/visitors" element={<VisitorOverview />} />
              <Route path="/visitors/:id" element={<VisitorSite />} />
              <Route path="/infrastructure" element={<Infrastructure />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:id" element={<AppDetails />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/vault/*" element={<Vault />} />
              <Route
                path="/clients"
                element={<ClientGrowth key="overview" />}
              />
              <Route path="/clients/:id" element={<ClientGrowth />} />
              <Route path="/app/:id" element={<LegacyAppRedirect />} />
              <Route
                path="/system-stats"
                element={<RouteAlias to="/infrastructure" />}
              />
              <Route
                path="/server"
                element={<RouteAlias to="/infrastructure" />}
              />
              <Route
                path="/dashboard"
                element={<RouteAlias to="/visitors" />}
              />
              <Route path="/sites" element={<RouteAlias to="/visitors" />} />
            </Route>
            <Route
              path="*"
              element={
                <Navigate to={authenticated ? "/visitors" : "/login"} replace />
              }
            />
          </Routes>
        </Suspense>
      </LoadBoundary>
    </BrowserRouter>
  );
}

const RouteAlias = ({ to }) => {
  const location = useLocation();
  return <Navigate to={to + location.search} replace />;
};
const LegacyAppRedirect = () => {
  const { id } = useParams(),
    location = useLocation();
  const [app, setApp] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    apiFetch(`/apps/${id}`)
      .then((value) => alive && setApp(value))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  if (app)
    return <Navigate to={legacyAppDestination(app, location.search)} replace />;
  return (
    <div className="page">
      <DataState
        loading={!error}
        error={error}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
};

export default App;
