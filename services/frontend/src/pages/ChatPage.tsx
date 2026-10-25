import { useChat } from '@/hooks/useChat'
import { ChatContainer } from '@organisms/ChatContainer/ChatContainer'
import { useAuthStore } from '@/stores/authStore'

export default function ChatPage() {
  const user = useAuthStore((state) => state.user)
  const {
    sessionId,
    channel, switchingChannel, handoff, switchChannel, resumeChannel, refreshConversation,
    messages,
    initializing,
    sending,
    recoveryRequired, recovering, recoverConversation,
    intent,
    error,
    dismissError,
    sendMessage,
    startNewConversation,
  } = useChat()
  const displayName = user?.firstName || user?.name || user?.username || 'there'

  return (
    <ChatContainer
      channel={channel}
      switchingChannel={switchingChannel}
      handoff={handoff}
      onSwitchChannel={switchChannel}
      onResumeChannel={resumeChannel}
      onRefreshConversation={refreshConversation}
      messages={messages}
      onSend={sendMessage}
      onNewConversation={startNewConversation}
      initializing={initializing}
      sending={sending}
      recoveryRequired={recoveryRequired}
      recovering={recovering}
      onRecover={recoverConversation}
      intent={intent}
      error={error}
      onDismissError={dismissError}
      sessionId={sessionId}
      displayName={displayName}
    />
  )
}
