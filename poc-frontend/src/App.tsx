import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import ChatPage from '@pages/ChatPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-root">
        <header className="app-header">
          <h1>Chatbot POC</h1>
          <nav>
            <Link to="/">Home</Link> | <Link to="/chat">Chat</Link>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<div>Open the console to see API calls.</div>} />
            <Route path="/chat" element={<ChatPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
