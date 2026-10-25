import { useEffect, useRef, useState } from 'react';
import { ChatMessage as ChatMessageComponent } from '@molecules/ChatMessage/ChatMessage';
import { IntentDisplay } from '@molecules/IntentDisplay/IntentDisplay';
import { LoadingSpinner } from '@atoms/LoadingSpinner/LoadingSpinner';
import type { ChatMessage as ChatMessageType, IntentAnalysis } from '@/types';
import type { ChannelHandoff, ConversationChannel } from '@/services/api';
import './ChatContainer.css';

const SUGGESTED_PROMPTS = [
  'Check my account balance',
  'Show my recent transactions',
  'I need help with my card',
  'Report suspicious activity',
];

export interface ChatContainerProps {
  channel?: ConversationChannel;
  switchingChannel?: boolean;
  handoff?: ChannelHandoff | null;
  onSwitchChannel?: (target: ConversationChannel) => Promise<void>;
  onResumeChannel?: (grant: string, target: 'digital' | 'ava') => Promise<boolean>;
  onRefreshConversation?: () => Promise<void>;
  messages: ChatMessageType[];
  onSend: (text: string) => Promise<boolean>;
  onNewConversation: () => Promise<void>;
  initializing?: boolean;
  sending?: boolean;
  recoveryRequired?: boolean;
  recovering?: boolean;
  onRecover?: () => Promise<void>;
  intent?: IntentAnalysis;
  error?: string | null;
  onDismissError: () => void;
  sessionId: string;
  displayName: string;
}

export function ChatContainer({
  channel = 'digital', switchingChannel = false, handoff = null, onSwitchChannel, onResumeChannel, onRefreshConversation,
  messages,
  onSend,
  onNewConversation,
  initializing = false,
  sending = false,
  recoveryRequired = false,
  recovering = false,
  onRecover,
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
              disabled={initializing || sending || recoveryRequired || recovering || switchingChannel}
            >
              <span aria-hidden="true">＋</span>
              New conversation
            </button>
          </div>
        </header>

        {recoveryRequired && (
          <div className="chat-alert chat-recovery" role="status">
            <div><strong>Your request was interrupted.</strong><span>Resume the same request before continuing this conversation.</span></div>
            <button type="button" className="secondary-action" disabled={initializing || sending || recovering} onClick={() => void onRecover?.()}>
              {recovering ? 'Resuming request…' : 'Resume interrupted request'}
            </button>
          </div>
        )}

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
                    disabled={sending || recoveryRequired || recovering || switchingChannel || channel === 'ivr'}
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
          <ChatInput onSend={onSend} disabled={initializing || sending || recoveryRequired || recovering || switchingChannel || channel === 'ivr'} />
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
              <dd>{recoveryRequired ? 'Recovery required' : 'Active'}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{channel === 'ivr' ? 'IVR' : channel === 'ava' ? 'AVA' : 'Digital'}</dd>
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
        {onSwitchChannel && <ChannelSwitcher channel={channel} busy={initializing || sending || recovering || switchingChannel}
          blocked={recoveryRequired} handoff={handoff} onSwitch={onSwitchChannel}
          onResume={onResumeChannel} onRefresh={onRefreshConversation} />}
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

function ChannelSwitcher({ channel, busy, blocked, handoff, onSwitch, onResume, onRefresh }: {
  channel: ConversationChannel; busy: boolean; blocked: boolean; handoff: ChannelHandoff | null;
  onSwitch: (target: ConversationChannel) => Promise<void>;
  onResume?: (grant: string, target: 'digital' | 'ava') => Promise<boolean>;
  onRefresh?: () => Promise<void>;
}) {
  const [grant, setGrant] = useState('');
  const [destination, setDestination] = useState<'digital' | 'ava'>('digital');
  return <section className="conversation-card channel-switcher" aria-label="Continue in another channel">
    <h2>Continue your conversation</h2>
    <p>Your conversation and request details follow you. Review any pending action again when asked.</p>
    <div className="channel-switcher__actions">
      {(['digital', 'ava'] as const).map(target => <button key={target} type="button" className="secondary-action"
        disabled={busy || blocked || channel === target} onClick={() => void onSwitch(target)}>
        Continue in {target === 'ava' ? 'AVA' : 'Digital'}
      </button>)}
      <button type="button" className="secondary-action" disabled={busy || blocked || channel === 'ivr'}
        onClick={() => void onSwitch('ivr')}>Prepare IVR transfer</button>
      {onRefresh && <button type="button" className="secondary-action" disabled={busy}
        onClick={() => void onRefresh()}>Refresh conversation</button>}
    </div>
    {channel === 'ivr' && <p role="status">This conversation is in IVR. Continue in Digital or AVA to send messages here.</p>}
    {handoff && <div role="status" className="channel-transfer">
      <strong>IVR transfer ready</strong>
      <p>Use this one-use transfer grant with your organization’s authenticated voice service before {new Date(handoff.expiresAt).toLocaleTimeString()}. It expires after five minutes. Refresh after the voice service connects.</p>
      <label htmlFor="ivr-transfer-grant">IVR transfer grant</label>
      <textarea id="ivr-transfer-grant" value={handoff.grant} readOnly autoComplete="off" spellCheck={false} />
      <p>This prepares a transfer. Your configured voice service starts the call.</p>
    </div>}
    {onResume && <details>
      <summary>Resume a transfer from IVR</summary>
      <label htmlFor="channel-return-grant">One-use return grant</label>
      <input id="channel-return-grant" type="password" autoComplete="off" value={grant} maxLength={43}
        onChange={event => setGrant(event.target.value)} />
      <label htmlFor="channel-return-target">Destination</label>
      <select id="channel-return-target" value={destination} onChange={event => setDestination(event.target.value as 'digital' | 'ava')}>
        <option value="digital">Digital</option><option value="ava">AVA</option>
      </select>
      <button type="button" className="secondary-action" disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(grant)}
        onClick={() => { const pending = grant; setGrant(''); void onResume(pending, destination); }}>Resume transferred conversation</button>
    </details>}
  </section>;
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
