import React, { useState } from 'react';
import { Input } from '@atoms/Input/Input';
import { Button } from '@atoms/Button/Button';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types';
import './TokenInput.css';

export interface TokenInputProps {
  onSuccess?: () => void;
}

export function TokenInput({ onSuccess }: TokenInputProps) {
  const { setManualToken } = useAuthStore();
  const [token, setToken] = useState('');
  const [userInfo, setUserInfo] = useState<Partial<UserProfile>>({
    username: '',
    userId: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token.trim()) {
      setError('API token is required');
      return;
    }

    try {
      // Basic JWT validation
      const parts = token.split('.');
      if (parts.length !== 3) {
        setError('Invalid token format');
        return;
      }

      setManualToken(token, {
        userId: userInfo.userId || 'manual-user',
        username: userInfo.username || 'API User',
      });

      onSuccess?.();
    } catch (err) {
      setError('Failed to set token. Please check the token format.');
    }
  };

  return (
    <form className="token-input" onSubmit={handleSubmit}>
      <div className="token-input__header">
        <h2>Use API Token</h2>
        <p>Enter your existing API token to authenticate</p>
      </div>

      {error && (
        <div className="token-input__error-banner">
          {error}
        </div>
      )}

      <Input
        name="token"
        type="text"
        label="API Token"
        placeholder="Enter your JWT token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        fullWidth
        autoComplete="off"
      />

      <div className="token-input__optional">
        <p className="token-input__optional-label">Optional Information</p>
        
        <Input
          name="username"
          type="text"
          label="Username (Optional)"
          placeholder="Your username"
          value={userInfo.username}
          onChange={(e) => setUserInfo(prev => ({ ...prev, username: e.target.value }))}
          fullWidth
        />

        <Input
          name="userId"
          type="text"
          label="User ID (Optional)"
          placeholder="Your user ID"
          value={userInfo.userId}
          onChange={(e) => setUserInfo(prev => ({ ...prev, userId: e.target.value }))}
          fullWidth
        />
      </div>

      <Button
        type="submit"
        className="token-input__submit"
      >
        Set Token
      </Button>

      <div className="token-input__footer">
        <p className="token-input__help-text">
          You can get an API token from the banking service login endpoint
        </p>
      </div>
    </form>
  );
}
