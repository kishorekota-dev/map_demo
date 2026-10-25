import { useCallback, useEffect, useState } from 'react';
import apiService, { type ChannelHandoff, type ConversationChannel } from '@/services/api';
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
  const [channel, setChannel] = useState<ConversationChannel>('digital');
  const [switchingChannel, setSwitchingChannel] = useState(false);
  const [handoff, setHandoff] = useState<ChannelHandoff | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recovering, setRecovering] = useState(false);
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
        const currentChannel = await apiService.getConversationChannel(activeSessionId);
        if (active) setChannel(currentChannel);
        const context = await apiService.getRecoveryContext(activeSessionId);
        if (active) setRecoveryRequired(context.recoveryRequired);
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
    if (!content || sending || recovering || recoveryRequired || switchingChannel || channel === 'ivr') return false;

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
      const response = await apiService.sendMessage(content, { channel });
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
      try { setRecoveryRequired((await apiService.getRecoveryContext()).recoveryRequired); setChannel(await apiService.getConversationChannel()); }
      catch (contextError) { setError(getErrorMessage(contextError)); }
      setSending(false);
    }
  }, [sending, recovering, recoveryRequired, switchingChannel, channel]);

  const startNewConversation = useCallback(async (): Promise<void> => {
    if (sending || recovering || recoveryRequired || switchingChannel) return;

    setInitializing(true);
    setError(null);
    try {
      const newSessionId = await apiService.startNewSession();
      setSessionId(newSessionId);
      setMessages([]);
      setIntent(undefined);
      setChannel('digital');
      setHandoff(null);
    } catch (sessionError) {
      setError(getErrorMessage(sessionError));
    } finally {
      setInitializing(false);
    }
  }, [sending, recovering, recoveryRequired, switchingChannel]);

  const recoverConversation = useCallback(async (): Promise<void> => {
    if (sending || recovering || !recoveryRequired) return;
    setRecovering(true); setError(null);
    try {
      const result = await apiService.recoverConversation();
      setMessages(current => [...current, { id: result.conversation.messageId, content: result.message, type: 'bot',
        timestamp: new Date(result.response.timestamp), intent: result.intent, status: 'sent' }]);
      setIntent(result.intent);
      const context = await apiService.getRecoveryContext(sessionId);
      setRecoveryRequired(context.recoveryRequired);
      if (context.recoveryRequired) setError('The original request is still interrupted. Resume it after the service is available.');
    } catch (recoveryError) {
      setError(getErrorMessage(recoveryError));
      if ((recoveryError as ApiError).status === 409) {
        try { setRecoveryRequired((await apiService.getRecoveryContext(sessionId)).recoveryRequired); } catch { /* Preserve the interrupted request if its state cannot be verified. */ }
      }
    }
    finally { setRecovering(false); }
  }, [sending, recovering, recoveryRequired, sessionId]);

  useEffect(() => {
    if (!handoff) return;
    const timeout = setTimeout(() => setHandoff(null), Math.max(0, Date.parse(handoff.expiresAt) - Date.now()));
    return () => clearTimeout(timeout);
  }, [handoff]);

  const refreshConversation = useCallback(async (): Promise<void> => {
    if (sending || recovering || switchingChannel) return;
    setInitializing(true); setError(null);
    try {
      const id = apiService.getSessionId();
      const history = await apiService.getChatHistory(id, 0, 50);
      const normalized = (history.messages || []).map((message, index) => normalizeMessage(message, id, index));
      setSessionId(id); setMessages(normalized);
      setIntent([...normalized].reverse().find(message => message.intent)?.intent);
      setChannel(await apiService.getConversationChannel(id));
      setRecoveryRequired((await apiService.getRecoveryContext(id)).recoveryRequired);
    } catch (refreshError) { setError(getErrorMessage(refreshError)); }
    finally { setInitializing(false); }
  }, [sending, recovering, switchingChannel]);

  const switchChannel = useCallback(async (targetChannel: ConversationChannel): Promise<void> => {
    if (sending || recovering || recoveryRequired || switchingChannel) return;
    setSwitchingChannel(true); setError(null); setHandoff(null);
    try {
      const transfer = await apiService.createChannelHandoff(targetChannel);
      if (targetChannel === 'ivr') setHandoff(transfer);
      else {
        const result = await apiService.resumeChannelHandoff(transfer.grant, targetChannel);
        setSessionId(result.sessionId); setChannel(result.channel);
      }
    } catch (switchError) { setError(getErrorMessage(switchError)); }
    finally { setSwitchingChannel(false); }
  }, [sending, recovering, recoveryRequired, switchingChannel]);

  const resumeChannel = useCallback(async (grant: string, targetChannel: 'digital' | 'ava'): Promise<boolean> => {
    if (sending || recovering || switchingChannel) return false;
    setSwitchingChannel(true); setError(null); setHandoff(null);
    try {
      const result = await apiService.resumeChannelHandoff(grant.trim(), targetChannel);
      const history = await apiService.getChatHistory(result.sessionId, 0, 50);
      const normalized = (history.messages || []).map((message, index) => normalizeMessage(message, result.sessionId, index));
      setSessionId(result.sessionId); setChannel(result.channel); setMessages(normalized);
      setIntent([...normalized].reverse().find(message => message.intent)?.intent);
      setRecoveryRequired((await apiService.getRecoveryContext(result.sessionId)).recoveryRequired);
      return true;
    } catch (resumeError) { setError(getErrorMessage(resumeError)); return false; }
    finally { setSwitchingChannel(false); }
  }, [sending, recovering, switchingChannel]);

  const analyze = useCallback(async (text: string) => {
    try {
      return await apiService.analyzeMessage(text);
    } catch {
      return null;
    }
  }, []);

  return {
    sessionId,
    channel, switchingChannel, handoff, switchChannel, resumeChannel, refreshConversation,
    messages,
    initializing,
    sending,
    recoveryRequired, recovering, recoverConversation,
    intent,
    error,
    dismissError: () => setError(null),
    sendMessage,
    startNewConversation,
    analyze,
  };
}
