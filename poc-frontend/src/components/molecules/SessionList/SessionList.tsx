import { formatDistanceToNow } from 'date-fns';
import type { SessionDetail } from '@/types';
import { Button } from '@atoms/Button/Button';
import './SessionList.css';

export interface SessionListProps {
  sessions: SessionDetail[];
  onResumeSession: (sessionId: string) => Promise<void>;
  currentSessionId?: string;
}

export function SessionList({ sessions, onResumeSession, currentSessionId }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="session-list session-list--empty">
        <p>No unresolved sessions</p>
      </div>
    );
  }

  return (
    <div className="session-list">
      <h3 className="session-list__title">Unresolved Sessions</h3>
      
      <div className="session-list__items">
        {sessions.map((session) => {
          const isActive = session.sessionId === currentSessionId;
          
          return (
            <div 
              key={session.sessionId} 
              className={`session-item ${isActive ? 'session-item--active' : ''}`}
            >
              <div className="session-item__header">
                <span className="session-item__id">
                  {session.sessionId.substring(0, 8)}...
                </span>
                <span className={`session-item__status session-item__status--${session.status}`}>
                  {session.status}
                </span>
              </div>
              
              <div className="session-item__meta">
                <div className="session-item__stat">
                  <span className="session-item__label">Messages:</span>
                  <span className="session-item__value">{session.messageCount}</span>
                </div>
                <div className="session-item__stat">
                  <span className="session-item__label">Last activity:</span>
                  <span className="session-item__value">
                    {formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {!isActive && (
                <Button
                  size="small"
                  variant="primary"
                  onClick={() => onResumeSession(session.sessionId)}
                  className="session-item__action"
                >
                  Resume
                </Button>
              )}
              
              {isActive && (
                <div className="session-item__active-badge">
                  Current Session
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
