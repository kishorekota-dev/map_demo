import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import { getRuntimeConfig } from '@/config/runtimeConfig'
import ChatPage from '@pages/ChatPage'
import AuthPage from '@pages/AuthPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useAuthStore } from '@/stores/authStore'

function AppHeader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)
  const runtimeConfig = getRuntimeConfig()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    return null
  }

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  return (
    <header className="app-header">
      <h1>{runtimeConfig.productName}</h1>
      <nav>
        <Link to="/">Home</Link> | <Link to="/chat">Assistant</Link>
        <button type="button" className="app-header__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>
    </header>
  )
}

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)
  const runtimeConfig = getRuntimeConfig()

  // The api client dispatches `auth:logout` when a 401 cannot be recovered via
  // token refresh. Listening here keeps the Zustand auth state in sync so the
  // route guards immediately redirect to /auth instead of waiting for a reload.
  useEffect(() => {
    const handleForcedLogout = () => {
      logout()
    }

    window.addEventListener('auth:logout', handleForcedLogout)
    return () => window.removeEventListener('auth:logout', handleForcedLogout)
  }, [logout])

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
                  <div>
                    Welcome to {runtimeConfig.productName}. Continue to <Link to="/chat">your assistant</Link>.
                  </div>
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
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/auth'} replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
