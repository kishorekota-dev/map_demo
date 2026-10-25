import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  Link,
} from "react-router-dom";
import { getRuntimeConfig } from "@/config/runtimeConfig";
import ChatPage from "@pages/ChatPage";
import AuthPage from "@pages/AuthPage";
import ControlPlanePage from "@pages/ControlPlanePage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/stores/authStore";

function AppHeader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const runtimeConfig = getRuntimeConfig();
  const navigate = useNavigate();
  const hasServicingRole = user?.roles?.some((role) =>
    ["admin", "control_plane_admin", "control_plane_editor", "control_plane_operator", "control_plane_viewer"].includes(role.toLowerCase()),
  );

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="app-header">
      <div className="app-header__brand" aria-label={runtimeConfig.productName}>
        <span className="app-header__mark" aria-hidden="true">
          A
        </span>
        <div>
          <strong>{runtimeConfig.productName}</strong>
          <span>Secure digital banking</span>
        </div>
      </div>
      <nav className="app-header__account" aria-label="Account">
        <Link className="app-header__section-link" to="/chat">
          Customer chat
        </Link>
        {hasServicingRole && (
          <Link className="app-header__section-link" to="/control-plane">
            Servicing studio
          </Link>
        )}
        <span className="app-header__secure">
          <span aria-hidden="true">●</span>
          Protected session
        </span>
        <span className="app-header__user">
          {user?.firstName || user?.name || user?.username}
        </span>
        <button
          type="button"
          className="app-header__logout"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);

  // The api client dispatches `auth:logout` when a 401 cannot be recovered via
  // token refresh. Listening here keeps the Zustand auth state in sync so the
  // route guards immediately redirect to /auth instead of waiting for a reload.
  useEffect(() => {
    const handleForcedLogout = () => {
      logout();
    };

    window.addEventListener("auth:logout", handleForcedLogout);
    return () => window.removeEventListener("auth:logout", handleForcedLogout);
  }, [logout]);

  return (
    <BrowserRouter>
      <div className="app-root">
        <AppHeader />

        <main className="app-main">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/chat" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="*"
              element={
                <Navigate to={isAuthenticated ? "/chat" : "/auth"} replace />
              }
            />
            <Route
              path="/control-plane"
              element={
                <ProtectedRoute>
                  <ControlPlanePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
