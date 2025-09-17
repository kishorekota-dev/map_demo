import { useChat } from '@/hooks/useChat'
import { ChatContainer } from '@organisms/ChatContainer/ChatContainer'

export default function ChatPage() {
  const { messages, loading, intent, sendMessage } = useChat()

  return (
    <div style={{height:'100%'}}>
      <ChatContainer messages={messages} onSend={sendMessage} loading={loading} intent={intent} />
    </div>
  )
}
