import React, { useState } from 'react';
import { Input } from '@atoms/Input/Input';
import { Button } from '@atoms/Button/Button';
import { LoadingSpinner } from '@atoms/LoadingSpinner/LoadingSpinner';
import { useAuthStore } from '@/stores/authStore';
import type { LoginRequest } from '@/types';
import './LoginForm.css';

export interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: '',
  });
  const [validationErrors, setValidationErrors] = useState<Partial<LoginRequest>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear validation error for this field
    if (validationErrors[name as keyof LoginRequest]) {
      setValidationErrors(prev => ({ ...prev, [name]: undefined }));
    }
    
    // Clear auth error
    if (error) {
      clearError();
    }
  };

  const validate = (): boolean => {
    const errors: Partial<LoginRequest> = {};

    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    try {
      await login(formData);
      onSuccess?.();
    } catch (err: any) {
      onError?.(err.message);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-form__header">
        <h2>Sign In</h2>
        <p>Sign in to your banking account</p>
      </div>

      {error && (
        <div className="login-form__error-banner">
          {error}
        </div>
      )}

      <Input
        name="username"
        type="text"
        label="Username"
        placeholder="Enter your username"
        value={formData.username}
        onChange={handleChange}
        error={validationErrors.username}
        disabled={isLoading}
        fullWidth
        autoComplete="username"
      />

      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="Enter your password"
        value={formData.password}
        onChange={handleChange}
        error={validationErrors.password}
        disabled={isLoading}
        fullWidth
        autoComplete="current-password"
      />

      <Button
        type="submit"
        disabled={isLoading}
        className="login-form__submit"
      >
        {isLoading ? (
          <>
            <LoadingSpinner size="small" />
            <span>Signing in...</span>
          </>
        ) : (
          'Sign In'
        )}
      </Button>

      <div className="login-form__footer">
        <p className="login-form__help-text">
          Use your banking credentials to sign in
        </p>
      </div>
    </form>
  );
}
