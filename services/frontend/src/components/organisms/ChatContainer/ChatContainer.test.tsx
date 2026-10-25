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

 test('customer channel controls show the verified current channel and prevent browser turns while in IVR', () => {
   const html = renderToStaticMarkup(<ChatContainer messages={[]} onSend={async () => true} onNewConversation={async () => {}}
     onDismissError={() => {}} sessionId="original-session" displayName="Customer" channel="ivr"
     onSwitchChannel={async () => {}} onResumeChannel={async () => true} onRefreshConversation={async () => {}} />);
   expect(html).toContain('Continue in AVA'); expect(html).toContain('Continue in Digital');
   expect(html).toContain('Resume a transfer from IVR'); expect(html).toContain('This conversation is in IVR');
   expect(html).toMatch(/textarea[^>]*disabled=""/);
   expect(html).toContain('type="password"');
 });
