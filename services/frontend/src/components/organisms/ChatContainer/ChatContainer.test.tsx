import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatContainer } from './ChatContainer';
test('interrupted conversation exposes explicit resume and disables replacement requests', () => {
  const html = renderToStaticMarkup(<ChatContainer messages={[]} onSend={async () => true} onNewConversation={async () => {}}
    onDismissError={() => {}} sessionId="original-session" displayName="Customer" recoveryRequired onRecover={async () => {}} />);
  expect(html).toContain('Resume interrupted request');
  expect(html).toContain('Recovery required');
  expect(html).toMatch(/disabled=""[^>]*>.*?<span aria-hidden="true">＋<\/span>New conversation/s);
  expect(html).toMatch(/textarea[^>]*disabled=""/);
});
