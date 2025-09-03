// Simple mock DialogFlow service to avoid build issues
import { DetectedIntent } from '../types';

export default class DialogFlowService {
  private projectId: string;

  constructor(config: any) {
    this.projectId = config.projectId || 'mock-project';
  }

  async detectIntent(text: string, userId?: string): Promise<DetectedIntent> {
    // Simple intent detection based on keywords
    const lowercaseText = text.toLowerCase();
    
    if (lowercaseText.includes('balance') || lowercaseText.includes('account')) {
      return {
        name: 'account.balance',
        displayName: 'Check Account Balance',
        confidence: 0.8,
        parameters: { accountId: 'default' },
        fulfillmentText: 'I can help you check your account balance.',
        category: 'account_management' as any,
      };
    }
    
    if (lowercaseText.includes('transfer') || lowercaseText.includes('payment')) {
      return {
        name: 'payment.transfer',
        displayName: 'Transfer Money',
        confidence: 0.8,
        parameters: {},
        fulfillmentText: 'I can help you transfer money.',
        category: 'payment_management' as any,
      };
    }
    
    if (lowercaseText.includes('card') || lowercaseText.includes('block')) {
      return {
        name: 'card.status',
        displayName: 'Card Management',
        confidence: 0.8,
        parameters: {},
        fulfillmentText: 'I can help you with your card.',
        category: 'card_management' as any,
      };
    }
    
    // Default response
    return {
      name: 'default.welcome',
      displayName: 'Welcome',
      confidence: 0.5,
      parameters: {},
      fulfillmentText: 'How can I help you today?',
      category: 'general' as any,
    };
  }
}
