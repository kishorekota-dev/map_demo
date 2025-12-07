import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import ChatPage from '@pages/ChatPage'
import AuthPage from '@pages/AuthPage'
import { useAuthStore } from '@/stores/authStore'

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <BrowserRouter>
      <div className="app-root">
        {isAuthenticated && (
          <header className="app-header">
            <h1>Chatbot POC</h1>
            <nav>
              <Link to="/">Home</Link> | <Link to="/chat">Chat</Link>
            </nav>
          </header>
        )}

        <main className="app-main">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route 
              path="/" 
              element={isAuthenticated ? <div>Welcome! Go to <Link to="/chat">Chat</Link></div> : <Navigate to="/auth" replace />} 
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
