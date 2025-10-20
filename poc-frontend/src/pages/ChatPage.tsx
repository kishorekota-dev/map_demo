import { useState } from 'react'
import { useChat } from '@/hooks/useChat'
import { ChatContainer } from '@/components/organisms/ChatContainer/ChatContainer'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@atoms/Button/Button'
import { Toast } from '@molecules/Toast/Toast'
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

  const [error, setError] = useState<string | null>(null)

  const handleSendMessage = async (text: string) => {
    try {
      setError(null)
      await sendMessage(text)
    } catch (err: any) {
      console.error('Error sending message:', err)
      setError(err.message || 'Failed to send message. Please check your connection and try again.')
    }
  }

  const handleResumeSession = async (sessionId: string) => {
    try {
      setError(null)
      await resumeSession(sessionId)
    } catch (err: any) {
      console.error('Error resuming session:', err)
      setError(err.message || 'Failed to resume session. Please try again.')
    }
  }

  const handleCreateNewSession = async () => {
    try {
      setError(null)
      await createNewSession()
    } catch (err: any) {
      console.error('Error creating session:', err)
      setError(err.message || 'Failed to create new session. Please try again.')
    }
  }

  const handleEndSession = async (reason?: string) => {
    try {
      setError(null)
      await endSession(reason)
    } catch (err: any) {
      console.error('Error ending session:', err)
      setError(err.message || 'Failed to end session. Please try again.')
    }
  }

  const handleResolveSession = async (notes?: string) => {
    try {
      setError(null)
      await resolveSession(notes)
    } catch (err: any) {
      console.error('Error resolving session:', err)
      setError(err.message || 'Failed to resolve session. Please try again.')
    }
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/auth'
  }

  // Show error message if user is not properly authenticated
  if (!user?.userId) {
    return (
      <div className="chat-page">
        <div className="chat-page__error">
          <h2>Authentication Error</h2>
          <p>Unable to load user information. Please log in again.</p>
          <Button onClick={handleLogout}>Return to Login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__branding">
          <h1>Banking Chatbot</h1>
          {session?.sessionId && (
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
          onSend={handleSendMessage} 
          loading={loading} 
          intent={intent}
          session={session}
          unresolvedSessions={unresolvedSessions}
          onResumeSession={handleResumeSession}
          onCreateNewSession={handleCreateNewSession}
          onEndSession={handleEndSession}
          onResolveSession={handleResolveSession}
        />
      </div>

      {error && (
        <Toast 
          id="chat-error"
          message={error} 
          type="error" 
          onClose={() => setError(null)} 
        />
      )}
    </div>
  )
}
