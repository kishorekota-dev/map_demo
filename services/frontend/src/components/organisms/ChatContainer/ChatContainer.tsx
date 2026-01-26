import React, { useRef, useEffect } from 'react'
import { ChatMessage as ChatMessageComponent } from '@molecules/ChatMessage/ChatMessage'
import { IntentDisplay } from '@molecules/IntentDisplay/IntentDisplay'
import type { ChatMessage as ChatMessageType } from '@/types'
import './ChatContainer.css'

export interface ChatContainerProps {
  messages: ChatMessageType[]
  onSend: (text: string) => Promise<any>
  loading?: boolean
  intent?: any
}

export function ChatContainer({ messages, onSend, loading, intent }: ChatContainerProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // scroll to bottom on new messages
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="chat-container">
      <div className="chat-container__main">
        <div className="chat-container__messages" ref={listRef}>
          {messages.map(m => (
            <ChatMessageComponent key={m.id} message={m} showIntent={true} />
          ))}
        </div>

        <div className="chat-container__input">
          <ChatInput onSend={onSend} disabled={loading} />
        </div>
      </div>

      <aside className="chat-container__sidebar">
        <IntentDisplay currentIntent={intent} />
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

  return (
    <div className="chat-input">
      <textarea
        className="chat-input__textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
      />
      <button className="chat-input__send" onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  )
}
