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
      <div className="auth-page__container">
        <div className="auth-page__branding">
          <h1>{runtimeConfig.productName}</h1>
          <p>{runtimeConfig.tagline}</p>
        </div>

        <div className="auth-page__tabs">
          <button
            className={`auth-page__tab ${mode === 'login' ? 'auth-page__tab--active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign In
          </button>
          {allowTokenAuth && (
            <button
              className={`auth-page__tab ${mode === 'token' ? 'auth-page__tab--active' : ''}`}
              onClick={() => setMode('token')}
            >
              Use Token
            </button>
          )}
        </div>

        <div className="auth-page__form">
          {mode === 'login' || !allowTokenAuth ? (
            <LoginForm onSuccess={handleSuccess} />
          ) : (
            <TokenInput onSuccess={handleSuccess} />
          )}
        </div>

        <div className="auth-page__info">
          <p>
            {mode === 'login' || !allowTokenAuth
              ? 'Sign in with your enterprise credentials to access the assistant'
              : 'If your organization issues API tokens, you can authenticate directly with a valid token'
            }
          </p>
          <p>Need access? Contact {runtimeConfig.supportEmail}</p>
        </div>
      </div>
    </div>
  );
}
