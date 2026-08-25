import { useCallback, useEffect, useState } from 'react';
import apiService from '@/services/api';
import type {
  ApiError,
  ChatMessage as ChatMessageType,
  IntentAnalysis,
  MessageMetadata,
} from '@/types';

const getErrorMessage = (error: unknown): string => {
  const candidate = error as Partial<ApiError> | undefined;
  return candidate?.message || 'The assistant is unavailable right now. Please try again.';
};

const normalizeMessage = (
  raw: any,
  sessionId: string,
  index: number
): ChatMessageType => {
  const timestamp = raw.timestamp || raw.createdAt || raw.created_at || new Date().toISOString();
  const messageId =
    raw.messageId || raw.message_id || raw.id || `${sessionId}_${index}_${String(timestamp)}`;
  const direction = raw.direction || raw.sender;
  const type: 'user' | 'bot' =
    raw.type === 'user' || direction === 'incoming' || direction === 'user' || direction === 'customer'
      ? 'user'
      : 'bot';
  const rawIntent = raw.intent || raw.metadata?.intent;
  const intent: IntentAnalysis | undefined = rawIntent
    ? {
        detected:
          typeof rawIntent === 'string'
            ? rawIntent
            : rawIntent.detected || rawIntent.name || 'general_inquiry',
        confidence:
          typeof rawIntent === 'object'
            ? rawIntent.confidence ?? raw.confidence_score ?? 0.75
            : raw.confidence_score ?? 0.75,
        entities: typeof rawIntent === 'object' ? rawIntent.entities || [] : [],
      }
    : undefined;
  const metadata: MessageMetadata = {
    sessionId: raw.sessionId || raw.session_id || sessionId,
    messageId,
    processingTime:
      raw.processingTime || raw.processing_time_ms || raw.agentInfo?.processingTime,
    responseType: raw.responseType || raw.metadata?.responseType || raw.message_type,
  };

  return {
    id: messageId,
    content: raw.content || raw.message || raw.text || '',
    type,
    timestamp: new Date(timestamp),
    intent,
    metadata,
    status: 'sent',
  };
};

export function useChat() {
  const [sessionId, setSessionId] = useState(apiService.getSessionId());
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [sending, setSending] = useState(false);
  const [intent, setIntent] = useState<IntentAnalysis | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadConversation = async () => {
      setInitializing(true);
      setError(null);

      try {
        const activeSessionId = await apiService.ensureSession();
        const history = await apiService.getChatHistory(activeSessionId, 0, 50);
        if (!active) return;

        const normalized = (history.messages || []).map((message, index) =>
          normalizeMessage(message, activeSessionId, index)
        );
        setSessionId(activeSessionId);
        setMessages(normalized);
        setIntent([...normalized].reverse().find((message) => message.intent)?.intent);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError));
      } finally {
        if (active) setInitializing(false);
      }
    };

    void loadConversation();
    return () => {
      active = false;
    };
  }, []);

  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const content = text.trim();
    if (!content || sending) return false;

    const optimisticId = `user_${Date.now()}`;
    const userMessage: ChatMessageType = {
      id: optimisticId,
      content,
      type: 'user',
      timestamp: new Date(),
      status: 'sending',
    };

    setSending(true);
    setError(null);
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await apiService.sendMessage(content);
      const activeSessionId = response.conversation.sessionId || apiService.getSessionId();
      const botMessage: ChatMessageType = {
        id: response.conversation.messageId,
        content: response.message,
        type: 'bot',
        timestamp: new Date(response.response.timestamp),
        intent: response.intent,
        metadata: {
          sessionId: activeSessionId,
          messageId: response.conversation.messageId,
          processingTime: response.metadata?.processingTime,
          responseType: response.response.type,
        },
        status: 'sent',
      };

      setSessionId(activeSessionId);
      setMessages((current) => [
        ...current.map((message) =>
          message.id === optimisticId ? { ...message, status: 'sent' as const } : message
        ),
        botMessage,
      ]);
      setIntent(response.intent);
      return true;
    } catch (sendError) {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId ? { ...message, status: 'error' as const } : message
        )
      );
      setError(getErrorMessage(sendError));
      return false;
    } finally {
      setSending(false);
    }
  }, [sending]);

  const startNewConversation = useCallback(async (): Promise<void> => {
    if (sending) return;

    setInitializing(true);
    setError(null);
    try {
      const newSessionId = await apiService.startNewSession();
      setSessionId(newSessionId);
      setMessages([]);
      setIntent(undefined);
    } catch (sessionError) {
      setError(getErrorMessage(sessionError));
    } finally {
      setInitializing(false);
    }
  }, [sending]);

  const analyze = useCallback(async (text: string) => {
    try {
      return await apiService.analyzeMessage(text);
    } catch {
      return null;
    }
  }, []);

  return {
    sessionId,
    messages,
    initializing,
    sending,
    intent,
    error,
    dismissError: () => setError(null),
    sendMessage,
    startNewConversation,
    analyze,
  };
}
