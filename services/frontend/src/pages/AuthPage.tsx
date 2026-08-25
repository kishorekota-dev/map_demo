import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRuntimeConfig } from '@/config/runtimeConfig';
import { LoginForm } from '@/components/organisms/LoginForm/LoginForm';
import { TokenInput } from '@molecules/TokenInput/TokenInput';
import './AuthPage.css';

type AuthMode = 'login' | 'token';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const navigate = useNavigate();
  const runtimeConfig = getRuntimeConfig();
  const allowTokenAuth = runtimeConfig.features.allowTokenAuth;

  const handleSuccess = () => {
    navigate('/chat');
  };

  return (
    <div className="auth-page">
      <main className="auth-page__shell">
        <section className="auth-page__intro" aria-labelledby="auth-heading">
          <div className="auth-page__brand">
            <span className="auth-page__mark" aria-hidden="true">A</span>
            <span>{runtimeConfig.productName}</span>
          </div>
          <p className="auth-page__eyebrow">Private banking assistance</p>
          <h1 id="auth-heading">A simpler way to take care of your finances.</h1>
          <p className="auth-page__tagline">{runtimeConfig.tagline}</p>
          <ul className="auth-page__trust-list">
            <li><span aria-hidden="true">✓</span> Encrypted, isolated conversations</li>
            <li><span aria-hidden="true">✓</span> Policy checks before sensitive actions</li>
            <li><span aria-hidden="true">✓</span> A human specialist when you need one</li>
          </ul>
        </section>

        <section className="auth-page__card" aria-label="Authentication">
          <div className="auth-page__card-heading">
            <span className="auth-page__mobile-brand">{runtimeConfig.productName}</span>
            <h2>Welcome back</h2>
            <p>Use your organization credentials to continue securely.</p>
          </div>

          <div className="auth-page__tabs" role="tablist" aria-label="Sign-in method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-page__tab ${mode === 'login' ? 'auth-page__tab--active' : ''}`}
              onClick={() => setMode('login')}
            >
              Credentials
            </button>
            {allowTokenAuth && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'token'}
                className={`auth-page__tab ${mode === 'token' ? 'auth-page__tab--active' : ''}`}
                onClick={() => setMode('token')}
              >
                Access token
              </button>
            )}
          </div>

          <div className="auth-page__form" role="tabpanel">
            {mode === 'login' || !allowTokenAuth ? (
              <LoginForm onSuccess={handleSuccess} />
            ) : (
              <TokenInput onSuccess={handleSuccess} />
            )}
          </div>

          <div className="auth-page__info">
            <span aria-hidden="true">◇</span>
            <p>Protected session · Need access? Contact {runtimeConfig.supportEmail}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
