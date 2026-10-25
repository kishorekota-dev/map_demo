import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRuntimeConfig } from "@/config/runtimeConfig";
import { LoginForm } from "@/components/organisms/LoginForm/LoginForm";
import { TokenInput } from "@molecules/TokenInput/TokenInput";
import authService from "@/services/authService";
import { useAuthStore } from "@/stores/authStore";
import "./AuthPage.css";

type AuthMode = "login" | "token";

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const navigate = useNavigate();
  const runtimeConfig = getRuntimeConfig();
  const allowTokenAuth = runtimeConfig.features.allowTokenAuth;
  const [enterpriseUrl, setEnterpriseUrl] = useState<string | null>(null);
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState("");

  useEffect(() => {
    let active = true;
    const identityBase = `${runtimeConfig.apiBaseUrl.replace(/\/$/, "")}/identity`;
    void fetch(`${identityBase}/config`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const config = (await response.json()) as {
          enabled?: boolean;
          loginUrl?: string;
        };
        if (active && config.enabled && config.loginUrl) {
          const gateway = new URL(
            runtimeConfig.apiBaseUrl,
            window.location.origin,
          );
          const login = new URL(config.loginUrl, gateway.origin);
          if (
            ["http:", "https:"].includes(login.protocol) &&
            login.origin === gateway.origin
          )
            setEnterpriseUrl(login.toString());
        }
      })
      .catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("enterprise") === "1") {
      setEnterpriseBusy(true);
      void authService
        .completeEnterpriseSignIn()
        .then((user) => {
          if (!active) return;
          useAuthStore.getState().checkAuth();
          const operator = user.roles?.some(
            (role) =>
              role.toLowerCase() === "admin" ||
              role.toLowerCase().startsWith("control_plane_"),
          );
          navigate(operator ? "/control-plane" : "/chat", { replace: true });
        })
        .catch((error: unknown) => {
          if (active) {
            authService.logout();
            useAuthStore.getState().checkAuth();
            setEnterpriseError(
              error instanceof Error
                ? error.message
                : "Enterprise sign-in failed.",
            );
          }
        })
        .finally(() => {
          if (active) setEnterpriseBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [navigate, runtimeConfig.apiBaseUrl]);

  const handleSuccess = () => {
    navigate("/chat");
  };

  return (
    <div className="auth-page">
      <main className="auth-page__shell">
        <section className="auth-page__intro" aria-labelledby="auth-heading">
          <div className="auth-page__brand">
            <span className="auth-page__mark" aria-hidden="true">
              A
            </span>
            <span>{runtimeConfig.productName}</span>
          </div>
          <p className="auth-page__eyebrow">Private banking assistance</p>
          <h1 id="auth-heading">
            A simpler way to take care of your finances.
          </h1>
          <p className="auth-page__tagline">{runtimeConfig.tagline}</p>
          <ul className="auth-page__trust-list">
            <li>
              <span aria-hidden="true">✓</span> Encrypted, isolated
              conversations
            </li>
            <li>
              <span aria-hidden="true">✓</span> Policy checks before sensitive
              actions
            </li>
            <li>
              <span aria-hidden="true">✓</span> A human specialist when you need
              one
            </li>
          </ul>
        </section>

        <section className="auth-page__card" aria-label="Authentication">
          <div className="auth-page__card-heading">
            <span className="auth-page__mobile-brand">
              {runtimeConfig.productName}
            </span>
            <h2>Welcome back</h2>
            <p>Use your organization credentials to continue securely.</p>
          </div>

          <div
            className="auth-page__tabs"
            role="tablist"
            aria-label="Sign-in method"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-page__tab ${mode === "login" ? "auth-page__tab--active" : ""}`}
              onClick={() => setMode("login")}
            >
              Credentials
            </button>
            {allowTokenAuth && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "token"}
                className={`auth-page__tab ${mode === "token" ? "auth-page__tab--active" : ""}`}
                onClick={() => setMode("token")}
              >
                Access token
              </button>
            )}
          </div>

          <div className="auth-page__form" role="tabpanel">
            {enterpriseBusy && (
              <p className="auth-page__enterprise-status" role="status">
                Completing enterprise sign-in…
              </p>
            )}
            {enterpriseError && (
              <p className="auth-page__enterprise-error" role="alert">
                {enterpriseError}
              </p>
            )}
            {enterpriseUrl && !enterpriseBusy && (
              <a className="auth-page__enterprise-login" href={enterpriseUrl}>
                Continue with enterprise identity
              </a>
            )}
            {mode === "login" || !allowTokenAuth ? (
              <LoginForm onSuccess={handleSuccess} />
            ) : (
              <TokenInput onSuccess={handleSuccess} />
            )}
          </div>

          <div className="auth-page__info">
            <span aria-hidden="true">◇</span>
            <p>
              Protected session · Need access? Contact{" "}
              {runtimeConfig.supportEmail}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
