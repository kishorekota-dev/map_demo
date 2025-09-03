import { SessionsClient } from '@google-cloud/dialogflow';
import { DetectedIntent, DialogFlowConfig } from '../types';

export class DialogFlowService {
  private client: SessionsClient;
  private projectId: string;
  private sessionId: string;
  private languageCode: string;
  private sessionPath: string;

  constructor(config: DialogFlowConfig) {
    this.projectId = config.projectId;
    this.sessionId = config.sessionId;
    this.languageCode = config.languageCode || 'en-US';
    
    // Initialize DialogFlow client
    this.client = new SessionsClient({
      projectId: this.projectId,
      keyFilename: config.credentials || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    
    this.sessionPath = this.client.projectAgentSessionPath(
      this.projectId,
      this.sessionId
    );
  }

  /**
   * Detect intent from user input
   */
  async detectIntent(text: string, userId?: string): Promise<DetectedIntent> {
    try {
      const request = {
        session: this.sessionPath,
        queryInput: {
          text: {
            text: text,
            languageCode: this.languageCode,
          },
        },
        queryParams: {
          contexts: this.buildContexts(userId),
          payload: {
            userId: userId,
            timestamp: new Date().toISOString(),
          },
        },
      };

      const [response] = await this.client.detectIntent(request);
      
      if (!response.queryResult) {
        throw new Error('No query result from DialogFlow');
      }

      const intent = response.queryResult.intent;
      const parameters = response.queryResult.parameters;
      const fulfillmentText = response.queryResult.fulfillmentText;
      
      return {
        name: intent?.name || 'default.unknown',
        displayName: intent?.displayName || 'Unknown Intent',
        confidence: response.queryResult.intentDetectionConfidence || 0,
        parameters: this.processParameters(parameters),
        fulfillmentText: fulfillmentText || '',
        category: this.categorizeIntent(intent?.displayName || ''),
      };
    } catch (error) {
      console.error('DialogFlow intent detection error:', error);
      return {
        name: 'default.error',
        displayName: 'Error Processing Request',
        confidence: 0,
        fulfillmentText: 'I apologize, but I encountered an error processing your request.',
        category: 'general_inquiry',
      };
    }
  }

  /**
   * Build contexts for the session
   */
  private buildContexts(userId?: string) {
    const contexts = [];
    
    if (userId) {
      contexts.push({
        name: `${this.sessionPath}/contexts/user-context`,
        lifespanCount: 50,
        parameters: {
          userId: userId,
          sessionId: this.sessionId,
        },
      });
    }

    return contexts;
  }

  /**
   * Process and clean parameters from DialogFlow
   */
  private processParameters(parameters: any): Record<string, any> {
    if (!parameters || !parameters.fields) {
      return {};
    }

    const processed: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(parameters.fields)) {
      processed[key] = this.extractParameterValue(value as any);
    }

    return processed;
  }

  /**
   * Extract value from DialogFlow parameter structure
   */
  private extractParameterValue(parameter: any): any {
    if (!parameter) return null;
    
    if (parameter.stringValue !== undefined) return parameter.stringValue;
    if (parameter.numberValue !== undefined) return parameter.numberValue;
    if (parameter.boolValue !== undefined) return parameter.boolValue;
    if (parameter.listValue) {
      return parameter.listValue.values?.map((v: any) => this.extractParameterValue(v)) || [];
    }
    if (parameter.structValue) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(parameter.structValue.fields || {})) {
        result[key] = this.extractParameterValue(value);
      }
      return result;
    }
    
    return parameter;
  }

  /**
   * Categorize intent based on display name
   */
  private categorizeIntent(displayName: string): string {
    const intentMap: Record<string, string> = {
      // Authentication
      'Login': 'authentication',
      'Logout': 'authentication',
      'Verify Identity': 'authentication',
      'Reset Password': 'authentication',

      // Account inquiries
      'Account Balance': 'balance_inquiry',
      'Account Information': 'account_inquiry',
      'Account Summary': 'account_inquiry',
      'Open Account': 'account_inquiry',
      'Close Account': 'account_inquiry',

      // Transactions
      'Transaction History': 'transaction_history',
      'Transaction Details': 'transaction_history',
      'Transaction Search': 'transaction_history',

      // Payments
      'Make Payment': 'payment',
      'Transfer Money': 'payment',
      'Pay Bills': 'payment',
      'Schedule Payment': 'payment',
      'Payment History': 'payment',

      // Cards
      'Card Information': 'card_management',
      'Block Card': 'card_management',
      'Unblock Card': 'card_management',
      'Card Activation': 'card_management',
      'Card PIN': 'card_management',
      'Card Limit': 'card_management',

      // Disputes
      'Report Dispute': 'dispute',
      'Dispute Status': 'dispute',
      'Transaction Dispute': 'dispute',

      // Fraud
      'Report Fraud': 'fraud_report',
      'Fraud Alert': 'fraud_report',
      'Suspicious Activity': 'fraud_report',

      // Profile
      'Update Profile': 'profile_management',
      'Change Address': 'profile_management',
      'Update Contact': 'profile_management',

      // General
      'Help': 'customer_service',
      'Support': 'customer_service',
      'Contact Us': 'customer_service',
    };

    // Find matching category
    for (const [pattern, category] of Object.entries(intentMap)) {
      if (displayName.toLowerCase().includes(pattern.toLowerCase())) {
        return category;
      }
    }

    return 'general_inquiry';
  }

  /**
   * Create a new session
   */
  async createSession(userId: string): Promise<string> {
    this.sessionId = `${userId}-${Date.now()}`;
    this.sessionPath = this.client.projectAgentSessionPath(
      this.projectId,
      this.sessionId
    );
    return this.sessionId;
  }

  /**
   * Clear session contexts
   */
  async clearSession(): Promise<void> {
    try {
      await this.client.deleteAllContexts({
        parent: this.sessionPath,
      });
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }

  /**
   * Set session context
   */
  async setContext(contextName: string, parameters: Record<string, any>, lifespanCount = 5): Promise<void> {
    try {
      const contextPath = `${this.sessionPath}/contexts/${contextName}`;
      
      await this.client.createContext({
        parent: this.sessionPath,
        context: {
          name: contextPath,
          lifespanCount: lifespanCount,
          parameters: {
            fields: this.convertToDialogFlowParameters(parameters),
          },
        },
      });
    } catch (error) {
      console.error('Error setting context:', error);
    }
  }

  /**
   * Convert parameters to DialogFlow format
   */
  private convertToDialogFlowParameters(parameters: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        converted[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        converted[key] = { numberValue: value };
      } else if (typeof value === 'boolean') {
        converted[key] = { boolValue: value };
      } else if (Array.isArray(value)) {
        converted[key] = {
          listValue: {
            values: value.map(v => ({ stringValue: String(v) })),
          },
        };
      } else if (typeof value === 'object' && value !== null) {
        converted[key] = { stringValue: JSON.stringify(value) };
      }
    }
    
    return converted;
  }
}

export default DialogFlowService;
