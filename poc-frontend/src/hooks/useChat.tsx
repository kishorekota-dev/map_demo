import { useState, useEffect, useRef, useCallback } from 'react'
import apiService from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { 
  ChatMessage as ChatMessageType, 
  IntentAnalysis, 
  MessageMetadata, 
  SessionDetail,
  MessageRecord 
} from '@/types'

export interface UseChatOptions {
  initialSessionId?: string;
  autoCreateSession?: boolean;
}

export function useChat(options: UseChatOptions = {}) {
  const { initialSessionId, autoCreateSession = true } = options;
  const { user } = useAuthStore();
  
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [loading, setLoading] = useState(false)
  const [intent, setIntent] = useState<IntentAnalysis | undefined>(undefined)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [unresolvedSessions, setUnresolvedSessions] = useState<SessionDetail[]>([])
  const sessionIdRef = useRef<string | null>(initialSessionId || null)

  // Load session and history on mount
  useEffect(() => {
    let mounted = true

    async function initialize() {
      if (!user?.userId) {
        console.warn('Cannot initialize chat: user or userId is undefined');
        return;
      }

      setLoading(true)
      try {
        // Load unresolved sessions
        const userSessions = await apiService.getUserSessions(user.userId, 'unresolved', 10)
        if (mounted) {
          setUnresolvedSessions(userSessions.sessions)
        }

        // If we have an initial session ID, resume it
        if (sessionIdRef.current) {
          await resumeSession(sessionIdRef.current)
        } else if (autoCreateSession) {
          // Create a new session
          const newSession = await apiService.createSession(user.userId)
          if (mounted) {
            sessionIdRef.current = newSession.sessionId
            apiService.setSessionId(newSession.sessionId)  // Set session ID in API service
            setSession(newSession as SessionDetail)
          }
        }
      } catch (err) {
        console.error('Failed to initialize chat:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initialize()
    return () => { mounted = false }
  }, [user?.userId, autoCreateSession, initialSessionId])

  // Convert MessageRecord to ChatMessage
  const convertToChatMessage = useCallback((record: MessageRecord): ChatMessageType => {
    const sessionId = sessionIdRef.current || 'unknown'
    const metadata: MessageMetadata = {
      sessionId,
      messageId: record.message_id,
      processingTime: undefined,
      responseType: record.message_type
    }

    return {
      id: record.message_id,
      content: record.content,
      type: record.direction === 'incoming' ? 'user' : 'bot',
      timestamp: new Date(record.created_at),
      intent: record.intent ? {
        detected: record.intent,
        confidence: record.confidence_score || 0.75,
        entities: []
      } : undefined,
      metadata
    } as ChatMessageType
  }, [])

  // Resume an existing session
  const resumeSession = useCallback(async (sessionId: string) => {
    setLoading(true)
    try {
      const resumeData = await apiService.resumeSession(sessionId)
      
      sessionIdRef.current = sessionId
      apiService.setSessionId(sessionId)  // Set session ID in API service
      setSession(resumeData.session as SessionDetail)
      
      // Convert history to chat messages
      const chatMessages = resumeData.history.map(convertToChatMessage)
      setMessages(chatMessages)
      
      // Update unresolved sessions list
      if (user?.userId) {
        const userSessions = await apiService.getUserSessions(user.userId, 'unresolved', 10)
        setUnresolvedSessions(userSessions.sessions)
      }
      
      return resumeData
    } catch (err) {
      console.error('Failed to resume session:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user?.userId, convertToChatMessage])

  // Send a message
  const sendMessage = useCallback(async (text: string) => {
    if (!user?.userId) {
      const error = new Error('User not authenticated or userId is missing')
      console.error(error);
      throw error;
    }

    // If no session exists, create one first
    if (!sessionIdRef.current) {
      console.log('No session exists, creating new session...');
      try {
        const newSession = await apiService.createSession(user.userId);
        sessionIdRef.current = newSession.sessionId;
        apiService.setSessionId(newSession.sessionId);
        setSession(newSession as SessionDetail);
      } catch (err) {
        console.error('Failed to create session:', err);
        throw new Error('Failed to create chat session. Please try again.');
      }
    }

    setLoading(true)
    try {
      // Add optimistic user message
      const userMsg: ChatMessageType = {
        id: `u_${Date.now()}`,
        content: text,
        type: 'user',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, userMsg])

      // Send message to backend
      const resp = await apiService.sendMessage(text, sessionIdRef.current || undefined)

      // Update session ID if backend returned a different one (auto-created)
      if (resp.sessionId && resp.sessionId !== sessionIdRef.current) {
        sessionIdRef.current = resp.sessionId
        apiService.setSessionId(resp.sessionId)
        
        // Reload session details
        const sessionDetail = await apiService.getSession(resp.sessionId)
        setSession(sessionDetail)
      }

      // Add bot response
      const botMsg: ChatMessageType = {
        id: resp.response?.id || `b_${Date.now()}`,
        content: resp.response?.content || 'No response',
        type: 'bot',
        timestamp: resp.response?.timestamp ? new Date(resp.response.timestamp) : new Date(),
        intent: resp.agent ? {
          detected: resp.agent.type || 'unknown',
          confidence: resp.agent.confidence ?? 0.5,
          entities: []
        } : undefined,
        metadata: {
          sessionId: resp.sessionId || sessionIdRef.current || 'unknown',
          messageId: resp.response?.id || `b_${Date.now()}`,
          responseType: resp.response?.type,
          agentsInvolved: resp.agent?.agentsInvolved
        }
      }

      setMessages(prev => [...prev, botMsg])
      if (botMsg.intent) setIntent(botMsg.intent)

      return botMsg
    } catch (err: any) {
      console.error('Failed to send message:', err)
      
      // Add error message
      const errorMsg: ChatMessageType = {
        id: `e_${Date.now()}`,
        content: 'Failed to send message. Please try again.',
        type: 'bot',
        timestamp: new Date(),
        metadata: {
          sessionId: sessionIdRef.current || 'unknown',
          messageId: `e_${Date.now()}`,
          isError: true,
        }
      }
      
      setMessages(prev => [...prev, errorMsg])
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  // End the current session
  const endSession = useCallback(async (reason?: string) => {
    if (!sessionIdRef.current) return

    try {
      await apiService.endSession(sessionIdRef.current, reason)
      sessionIdRef.current = null
      setSession(null)
      setMessages([])
      
      // Reload unresolved sessions
      if (user) {
        const userSessions = await apiService.getUserSessions(user.userId, 'unresolved', 10)
        setUnresolvedSessions(userSessions.sessions)
      }
    } catch (err) {
      console.error('Failed to end session:', err)
      throw err
    }
  }, [user])

  // Resolve the current session
  const resolveSession = useCallback(async (notes?: string) => {
    if (!sessionIdRef.current) return

    try {
      await apiService.resolveSession(sessionIdRef.current, notes)
      
      // Update session status
      if (session) {
        setSession({ ...session, isResolved: true, status: 'resolved' })
      }
      
      // Reload unresolved sessions
      if (user) {
        const userSessions = await apiService.getUserSessions(user.userId, 'unresolved', 10)
        setUnresolvedSessions(userSessions.sessions)
      }
    } catch (err) {
      console.error('Failed to resolve session:', err)
      throw err
    }
  }, [session, user])

  // Create a new session
  const createNewSession = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const newSession = await apiService.createSession(user.userId)
      sessionIdRef.current = newSession.sessionId
      setSession(newSession as SessionDetail)
      setMessages([])
      setIntent(undefined)
      
      return newSession
    } catch (err) {
      console.error('Failed to create session:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  return {
    messages,
    loading,
    intent,
    session,
    unresolvedSessions,
    sendMessage,
    resumeSession,
    endSession,
    resolveSession,
    createNewSession,
  }
}
