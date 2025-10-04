import { useState, useEffect, useRef } from 'react'
import apiService from '@/services/api'
import type { ChatMessage as ChatMessageType, IntentAnalysis, MessageMetadata } from '@/types'

export function useChat(initialSessionId?: string) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [loading, setLoading] = useState(false)
  const [intent, setIntent] = useState<IntentAnalysis | undefined>(undefined)
  const sessionIdRef = useRef(initialSessionId || apiService.getSessionId())

  useEffect(() => {
    // load existing history
    let mounted = true
    async function loadHistory() {
      setLoading(true)
      try {
        const history = await apiService.getChatHistory(sessionIdRef.current, 0, 50)
        if (mounted && history?.messages) {
          // normalize to ChatMessageType shape and satisfy MessageMetadata
          const normalized = history.messages.map((m: any) => {
            const messageId = m.messageId || m.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
            const sessionId = history.session?.sessionId || sessionIdRef.current
            const metadata: MessageMetadata = {
              sessionId,
              messageId,
              processingTime: m.processingTime || m.metadata?.processingTime,
              responseType: m.responseType || m.metadata?.responseType
            }

            return {
              id: messageId,
              content: m.message || m.content || m.text || '',
              type: (m.type as 'user' | 'bot') || 'bot',
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
              intent: m.intent ? {
                detected: m.intent.detected || m.intent.name || (m.intent as any) || 'unknown',
                confidence: m.intent.confidence ?? 0.75,
                entities: m.intent.entities || []
              } : undefined,
              metadata
            } as ChatMessageType
          })

          setMessages(normalized)
        }
      } catch (err) {
        // ignore for now
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadHistory()
    return () => { mounted = false }
  }, [])

  async function sendMessage(text: string) {
    setLoading(true)
    try {
      // add optimistic user message
      const userMsg: ChatMessageType = {
        id: `u_${Date.now()}`,
        content: text,
        type: 'user',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, userMsg])

      const resp = await apiService.sendMessage(text)

      // Update session ID if backend returned a different one (auto-created)
      if (resp.sessionId && resp.sessionId !== sessionIdRef.current) {
        sessionIdRef.current = resp.sessionId
        apiService.setSessionId(resp.sessionId)
      }

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
          sessionId: resp.sessionId || sessionIdRef.current,
          messageId: resp.response?.id || `b_${Date.now()}`,
          responseType: resp.response?.type,
          agentsInvolved: resp.agent?.agentsInvolved
        }
      }

      setMessages(prev => [...prev, botMsg])
      if (botMsg.intent) setIntent(botMsg.intent)

      return botMsg
    } catch (err: any) {
      console.error('Error sending message:', err)
      
      // Add error message to chat
      const errorMsg: ChatMessageType = {
        id: `e_${Date.now()}`,
        content: err?.message || 'Failed to send message. Please try again.',
        type: 'bot',
        timestamp: new Date(),
        metadata: {
          sessionId: sessionIdRef.current,
          messageId: `e_${Date.now()}`,
          isError: true
        }
      }
      
      setMessages(prev => [...prev, errorMsg])
      throw err
    } finally {
      setLoading(false)
    }
  }

  async function analyze(text: string) {
    try {
      const result = await apiService.analyzeMessage(text)
      return result
    } catch (err) {
      return null
    }
  }

  return {
    sessionId: sessionIdRef.current,
    messages,
    loading,
    intent,
    sendMessage,
    analyze
  }
}
