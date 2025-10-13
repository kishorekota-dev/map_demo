import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/organisms/LoginForm/LoginForm';
import { TokenInput } from '@molecules/TokenInput/TokenInput';
import './AuthPage.css';

type AuthMode = 'login' | 'token';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate('/chat');
  };

  return (
    <div className="auth-page">
      <div className="auth-page__container">
        <div className="auth-page__branding">
          <h1>Banking Chatbot</h1>
          <p>Intelligent Banking Assistant powered by AI</p>
        </div>

        <div className="auth-page__tabs">
          <button
            className={`auth-page__tab ${mode === 'login' ? 'auth-page__tab--active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign In
          </button>
          <button
            className={`auth-page__tab ${mode === 'token' ? 'auth-page__tab--active' : ''}`}
            onClick={() => setMode('token')}
          >
            Use Token
          </button>
        </div>

        <div className="auth-page__form">
          {mode === 'login' ? (
            <LoginForm onSuccess={handleSuccess} />
          ) : (
            <TokenInput onSuccess={handleSuccess} />
          )}
        </div>

        <div className="auth-page__info">
          <p>
            {mode === 'login' 
              ? 'Sign in with your banking credentials to access the chatbot'
              : 'If you already have an API token, you can use it to authenticate directly'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
