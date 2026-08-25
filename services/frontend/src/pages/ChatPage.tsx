import { useChat } from '@/hooks/useChat'
import { ChatContainer } from '@organisms/ChatContainer/ChatContainer'
import { useAuthStore } from '@/stores/authStore'

export default function ChatPage() {
  const user = useAuthStore((state) => state.user)
  const {
    sessionId,
    messages,
    initializing,
    sending,
    intent,
    error,
    dismissError,
    sendMessage,
    startNewConversation,
  } = useChat()
  const displayName = user?.firstName || user?.name || user?.username || 'there'

  return (
    <ChatContainer
      messages={messages}
      onSend={sendMessage}
      onNewConversation={startNewConversation}
      initializing={initializing}
      sending={sending}
      intent={intent}
      error={error}
      onDismissError={dismissError}
      sessionId={sessionId}
      displayName={displayName}
    />
  )
}
