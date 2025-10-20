import React, { useRef, useEffect, useState } from 'react'
import { ChatMessage as ChatMessageComponent } from '@molecules/ChatMessage/ChatMessage'
import { IntentDisplay } from '@molecules/IntentDisplay/IntentDisplay'
import { SessionList } from '@molecules/SessionList/SessionList'
import { Button } from '@atoms/Button/Button'
import type { ChatMessage as ChatMessageType, SessionDetail } from '@/types'
import './ChatContainer.css'

export interface ChatContainerProps {
  messages: ChatMessageType[]
  onSend: (text: string) => Promise<any>
  loading?: boolean
  intent?: any
  session?: SessionDetail | null
  unresolvedSessions?: SessionDetail[]
  onResumeSession?: (sessionId: string) => Promise<any>
  onCreateNewSession?: () => Promise<any>
  onEndSession?: (reason?: string) => Promise<void>
  onResolveSession?: (notes?: string) => Promise<void>
}

export function ChatContainer({ 
  messages, 
  onSend, 
  loading, 
  intent,
  session,
  unresolvedSessions = [],
  onResumeSession,
  onCreateNewSession,
  onEndSession,
  onResolveSession,
}: ChatContainerProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [showSessionControls, setShowSessionControls] = useState(false)

  useEffect(() => {
    // scroll to bottom on new messages
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleEndSession = async () => {
    if (!onEndSession) return
    if (confirm('Are you sure you want to end this session?')) {
      await onEndSession('user_request')
      setShowSessionControls(false)
    }
  }

  const handleResolveSession = async () => {
    if (!onResolveSession) return
    await onResolveSession('Conversation resolved by user')
    setShowSessionControls(false)
  }

  const handleNewSession = async () => {
    if (!onCreateNewSession) return
    if (session && confirm('Start a new session? Current session will be saved.')) {
      await onCreateNewSession()
    } else if (!session) {
      await onCreateNewSession()
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-container__main">
        {/* Session Controls Bar */}
        {session?.sessionId && (
          <div className="chat-container__session-bar">
            <div className="session-bar__info">
              <span className="session-bar__label">Active Session</span>
              <span className="session-bar__id">{session.sessionId.substring(0, 12)}...</span>
              <span className={`session-bar__status session-bar__status--${session.status}`}>
                {session.status}
              </span>
            </div>
            <div className="session-bar__actions">
              <Button 
                size="small" 
                variant="secondary"
                onClick={handleNewSession}
              >
                New Session
              </Button>
              <Button 
                size="small" 
                variant="secondary"
                onClick={() => setShowSessionControls(!showSessionControls)}
              >
                {showSessionControls ? 'Hide' : 'More'}
              </Button>
            </div>
          </div>
        )}

        {/* Extended Session Controls */}
        {showSessionControls && session && (
          <div className="chat-container__extended-controls">
            <Button 
              size="small" 
              variant="primary"
              onClick={handleResolveSession}
              disabled={session.isResolved}
            >
              {session.isResolved ? 'Resolved' : 'Mark as Resolved'}
            </Button>
            <Button 
              size="small" 
              variant="secondary"
              onClick={handleEndSession}
            >
              End Session
            </Button>
          </div>
        )}

        <div className="chat-container__messages" ref={listRef}>
          {messages.length === 0 ? (
            <div className="chat-container__empty">
              <p>Start a conversation</p>
              <span>Type a message below to begin</span>
            </div>
          ) : (
            messages.map(m => (
              <ChatMessageComponent key={m.id} message={m} showIntent={true} />
            ))
          )}
        </div>

        <div className="chat-container__input">
          <ChatInput onSend={onSend} disabled={loading} />
        </div>
      </div>

      <aside className="chat-container__sidebar">
        {/* Unresolved Sessions */}
        {unresolvedSessions.length > 0 && onResumeSession && (
          <div className="sidebar-section">
            <SessionList 
              sessions={unresolvedSessions}
              onResumeSession={onResumeSession}
              currentSessionId={session?.sessionId}
            />
          </div>
        )}

        {/* Intent Display */}
        <div className="sidebar-section">
          <IntentDisplay currentIntent={intent} />
        </div>
      </aside>
    </div>
  )
}

/**
 * Small ChatInput defined inline to avoid creating many files
 */
function ChatInput({ onSend, disabled }: { onSend: (t: string) => Promise<any>, disabled?: boolean }) {
  const [text, setText] = React.useState('')

  const handleSend = async () => {
    if (!text.trim()) return
    await onSend(text.trim())
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-input">
      <textarea
        className="chat-input__textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
        disabled={disabled}
        rows={3}
      />
      <button 
        className="chat-input__send" 
        onClick={handleSend} 
        disabled={disabled || !text.trim()}
      >
        {disabled ? 'Sending...' : 'Send'}
      </button>
    </div>
  )
}
