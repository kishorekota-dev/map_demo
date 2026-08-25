import React, { useState } from 'react';
import { getRuntimeConfig } from '@/config/runtimeConfig';
import { Input } from '@atoms/Input/Input';
import { Button } from '@atoms/Button/Button';
import { useAuthStore } from '@/stores/authStore';
import authService from '@/services/authService';
import type { UserProfile } from '@/types';
import './TokenInput.css';

export interface TokenInputProps {
  onSuccess?: () => void;
}

export function TokenInput({ onSuccess }: TokenInputProps) {
  const { setManualToken } = useAuthStore();
  const runtimeConfig = getRuntimeConfig();
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
      if (!authService.isTokenValid(token.trim())) {
        setError('Enter a valid, unexpired JWT access token');
        return;
      }

      setManualToken(token.trim(), {
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
      {error && (
        <div className="token-input__error-banner" role="alert">
          {error}
        </div>
      )}

      <Input
        name="token"
        type="password"
        label="API Token"
        placeholder="Enter your JWT token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        fullWidth
        autoComplete="off"
      />

      <div className="token-input__optional">
        <p className="token-input__optional-label">Profile details <span>(optional)</span></p>
        
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
          Use an unexpired JWT issued by your organization. The configured identity endpoint is {runtimeConfig.authBaseUrl}.
        </p>
      </div>
    </form>
  );
}
