import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { getRuntimeConfig } from '@/config/runtimeConfig'
import ChatPage from '@pages/ChatPage'
import AuthPage from '@pages/AuthPage'
import { useAuthStore } from '@/stores/authStore'

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const runtimeConfig = getRuntimeConfig()

  return (
    <BrowserRouter>
      <div className="app-root">
        {isAuthenticated && (
          <header className="app-header">
            <h1>{runtimeConfig.productName}</h1>
            <nav>
              <Link to="/">Home</Link> | <Link to="/chat">Assistant</Link>
            </nav>
          </header>
        )}

        <main className="app-main">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route 
              path="/" 
              element={
                isAuthenticated
                  ? (
                    <div>
                      Welcome to {runtimeConfig.productName}. Continue to <Link to="/chat">your assistant</Link>.
                    </div>
                  )
                  : <Navigate to="/auth" replace />
              }
            />
            <Route 
              path="/chat" 
              element={isAuthenticated ? <ChatPage /> : <Navigate to="/auth" replace />} 
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
