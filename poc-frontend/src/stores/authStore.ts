import { create } from 'zustand';
import authService from '@/services/authService';
import type { UserProfile, LoginRequest } from '@/types';

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  setManualToken: (token: string, userInfo?: Partial<UserProfile>) => void;
  logout: () => void;
  checkAuth: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: authService.isAuthenticated(),
  user: authService.getUserProfile(),
  isLoading: false,
  error: null,

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await authService.login(credentials);
      
      set({
        isAuthenticated: true,
        user: response.data.user,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error.message || 'Login failed',
      });
      throw error;
    }
  },

  setManualToken: (token: string, userInfo?: Partial<UserProfile>) => {
    authService.setManualToken(token, userInfo);
    
    set({
      isAuthenticated: true,
      user: authService.getUserProfile(),
      error: null,
    });
  },

  logout: () => {
    authService.logout();
    
    set({
      isAuthenticated: false,
      user: null,
      error: null,
    });
  },

  checkAuth: () => {
    const isAuthenticated = authService.isAuthenticated() && authService.isTokenValid();
    const user = authService.getUserProfile();
    
    console.log('Auth check:', { isAuthenticated, user });
    
    set({
      isAuthenticated,
      user: isAuthenticated ? user : null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
