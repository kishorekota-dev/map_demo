import { useChat } from '@/hooks/useChat'
import { ChatContainer } from '@/components/organisms/ChatContainer/ChatContainer'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@atoms/Button/Button'
import './ChatPage.css'

export default function ChatPage() {
  const { user, logout } = useAuthStore()
  const { 
    messages, 
    loading, 
    intent, 
    session,
    unresolvedSessions,
    sendMessage,
    resumeSession,
    createNewSession,
    endSession,
    resolveSession,
  } = useChat()

  const handleLogout = () => {
    logout()
    window.location.href = '/auth'
  }

  return (
    <div className="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__branding">
          <h1>Banking Chatbot</h1>
          {session && (
            <span className="chat-page__session-id">
              Session: {session.sessionId.substring(0, 8)}...
            </span>
          )}
        </div>
        <div className="chat-page__user-info">
          <span className="chat-page__username">
            {user?.username || 'User'}
          </span>
          <Button variant="secondary" size="small" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <div className="chat-page__content">
        <ChatContainer 
          messages={messages} 
          onSend={sendMessage} 
          loading={loading} 
          intent={intent}
          session={session}
          unresolvedSessions={unresolvedSessions}
          onResumeSession={resumeSession}
          onCreateNewSession={createNewSession}
          onEndSession={endSession}
          onResolveSession={resolveSession}
        />
      </div>
    </div>
  )
}
