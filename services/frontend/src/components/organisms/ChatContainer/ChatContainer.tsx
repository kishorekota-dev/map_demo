import { useEffect, useRef, useState } from 'react';
import { ChatMessage as ChatMessageComponent } from '@molecules/ChatMessage/ChatMessage';
import { IntentDisplay } from '@molecules/IntentDisplay/IntentDisplay';
import { LoadingSpinner } from '@atoms/LoadingSpinner/LoadingSpinner';
import type { ChatMessage as ChatMessageType, IntentAnalysis } from '@/types';
import './ChatContainer.css';

const SUGGESTED_PROMPTS = [
  'Check my account balance',
  'Show my recent transactions',
  'I need help with my card',
  'Report suspicious activity',
];

export interface ChatContainerProps {
  messages: ChatMessageType[];
  onSend: (text: string) => Promise<boolean>;
  onNewConversation: () => Promise<void>;
  initializing?: boolean;
  sending?: boolean;
  intent?: IntentAnalysis;
  error?: string | null;
  onDismissError: () => void;
  sessionId: string;
  displayName: string;
}

export function ChatContainer({
  messages,
  onSend,
  onNewConversation,
  initializing = false,
  sending = false,
  intent,
  error,
  onDismissError,
  sessionId,
  displayName,
}: ChatContainerProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending]);

  return (
    <div className="chat-workspace">
      <section className="chat-panel" aria-label="Banking assistant conversation">
        <header className="chat-panel__header">
          <div className="assistant-identity">
            <span className="assistant-identity__mark" aria-hidden="true">A</span>
            <div>
              <div className="assistant-identity__eyebrow">Secure assistant</div>
              <h1>How can I help, {displayName}?</h1>
            </div>
          </div>
          <div className="chat-panel__actions">
            <span className="availability-pill">
              <span className="availability-pill__dot" aria-hidden="true" />
              Online
            </span>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void onNewConversation()}
              disabled={initializing || sending}
            >
              <span aria-hidden="true">＋</span>
              New conversation
            </button>
          </div>
        </header>

        {error && (
          <div className="chat-alert" role="alert">
            <div>
              <strong>We couldn’t complete that request.</strong>
              <span>{error}</span>
            </div>
            <button type="button" onClick={onDismissError} aria-label="Dismiss error">×</button>
          </div>
        )}

        <div
          className="chat-panel__messages"
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {initializing ? (
            <div className="chat-state chat-state--loading">
              <LoadingSpinner />
              <p>Opening a secure conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome__icon" aria-hidden="true">✦</div>
              <h2>Your banking, one conversation away</h2>
              <p>
                Ask about balances, recent activity, cards, transfers, or anything
                that doesn’t look right.
              </p>
              <div className="suggested-prompts" aria-label="Suggested questions">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => void onSend(prompt)}
                    disabled={sending}
                  >
                    <span>{prompt}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageComponent key={message.id} message={message} showIntent={false} />
            ))
          )}

          {sending && (
            <div className="assistant-typing" aria-label="Assistant is responding">
              <span /><span /><span />
            </div>
          )}
        </div>

        <div className="chat-panel__composer">
          <ChatInput onSend={onSend} disabled={initializing || sending} />
          <p className="composer-disclaimer">
            Never share a password, PIN, or one-time security code in chat.
          </p>
        </div>
      </section>

      <aside className="chat-insights" aria-label="Conversation details">
        <div className="conversation-card">
          <div className="conversation-card__heading">
            <span>Conversation</span>
            <span className="secure-badge">Protected</span>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>Active</dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>{messages.length}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd title={sessionId}>{sessionId.slice(-8)}</dd>
            </div>
          </dl>
        </div>
        <IntentDisplay currentIntent={intent} />
        <div className="privacy-note">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Built for sensitive conversations</strong>
            <p>Your session is isolated and requests are policy checked before action.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');

  const handleSend = async () => {
    const content = text.trim();
    if (!content || disabled) return;
    const sent = await onSend(content);
    if (sent) setText('');
  };

  return (
    <div className="chat-input">
      <label htmlFor="chat-message-input" className="sr-only">Message the assistant</label>
      <textarea
        id="chat-message-input"
        className="chat-input__textarea"
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, 2000))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
          }
        }}
        placeholder="Ask about your accounts, cards, or transactions…"
        disabled={disabled}
        rows={1}
        maxLength={2000}
      />
      <button
        type="button"
        className="chat-input__send"
        onClick={() => void handleSend()}
        disabled={disabled || !text.trim()}
        aria-label="Send message"
      >
        <span>Send</span>
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
