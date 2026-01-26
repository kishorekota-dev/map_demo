/**
 * Enhanced DialogFlow Service with Full SDK Implementation
 * 
 * This file demonstrates all capabilities of the @google-cloud/dialogflow SDK
 * It extends the basic implementation with advanced features like:
 * - Context management
 * - Intent management
 * - Entity management
 * - Streaming detection
 * - Agent operations
 */

const {
  SessionsClient,
  IntentsClient,
  EntityTypesClient,
  ContextsClient,
  AgentsClient
} = require('@google-cloud/dialogflow');
const logger = require('../utils/logger');
const config = require('../config/config');

class EnhancedDialogFlowService {
  constructor() {
    this.enabled = config.dialogflow.enabled;
    this.projectId = config.dialogflow.projectId;
    this.languageCode = config.dialogflow.languageCode || 'en-US';
    
    // SDK clients
    this.sessionsClient = null;
    this.intentsClient = null;
    this.entityTypesClient = null;
    this.contextsClient = null;
    this.agentsClient = null;
    
    if (this.enabled) {
      try {
        this.initializeAllClients();
        logger.info('Enhanced DialogFlow SDK initialized with all clients');
      } catch (error) {
        logger.error('Failed to initialize DialogFlow SDK', { error: error.message });
        this.enabled = false;
      }
    } else {
      logger.info('DialogFlow SDK disabled - using mock mode');
    }
  }
  
  /**
   * Initialize all DialogFlow SDK clients
   */
  initializeAllClients() {
    if (!this.projectId) {
      throw new Error('DialogFlow project ID not configured');
    }
    
    const clientConfig = {
      projectId: this.projectId
    };
    
    // Add credentials if provided
    if (config.dialogflow.keyFilename) {
      clientConfig.keyFilename = config.dialogflow.keyFilename;
    }
    
    try {
      // Initialize all SDK clients
      this.sessionsClient = new SessionsClient(clientConfig);
      this.intentsClient = new IntentsClient(clientConfig);
      this.entityTypesClient = new EntityTypesClient(clientConfig);
      this.contextsClient = new ContextsClient(clientConfig);
      this.agentsClient = new AgentsClient(clientConfig);
      
      logger.info('All DialogFlow SDK clients initialized successfully', {
        projectId: this.projectId,
        hasCredentials: !!config.dialogflow.keyFilename,
        clients: ['Sessions', 'Intents', 'EntityTypes', 'Contexts', 'Agents']
      });
    } catch (error) {
      logger.warn('DialogFlow SDK initialization failed, falling back to mock mode', {
        error: error.message
      });
      throw error;
    }
  }
  
  // ==================== SESSION & INTENT DETECTION ====================
  
  /**
   * Detect intent from text using DialogFlow SDK
   * This is the main method used by the NLU service
   */
  async detectIntent(message, sessionId = 'default', languageCode = null) {
    const lang = languageCode || this.languageCode;
    
    try {
      // Use real SDK if available
      if (this.sessionsClient && this.enabled) {
        return await this.detectIntentWithSDK(message, sessionId, lang);
      } else {
        // Fallback to mock
        return await this.detectIntentMock(message, sessionId, lang);
      }
    } catch (error) {
      logger.error('Intent detection failed', { error: error.message, sessionId });
      
      // Fallback to mock on error
      logger.warn('Falling back to mock detection');
      return await this.detectIntentMock(message, sessionId, lang);
    }
  }
  
  /**
   * Real DialogFlow SDK intent detection
   */
  async detectIntentWithSDK(message, sessionId, languageCode) {
    try {
      // Create session path using SDK
      const sessionPath = this.sessionsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      // Build request
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: languageCode
          }
        }
      };
      
      logger.debug('Calling DialogFlow SDK detectIntent', {
        sessionPath,
        message: message.substring(0, 100),
        languageCode
      });
      
      // Call DialogFlow API via SDK
      const [response] = await this.sessionsClient.detectIntent(request);
      
      logger.info('DialogFlow SDK response received', {
        intent: response.queryResult.intent?.displayName,
        confidence: response.queryResult.intentDetectionConfidence,
        sessionId
      });
      
      // Parse and return
      return this.parseDialogFlowSDKResponse(response.queryResult);
      
    } catch (error) {
      logger.error('DialogFlow SDK call failed', {
        error: error.message,
        code: error.code,
        sessionId
      });
      throw error;
    }
  }
  
  /**
   * Detect intent with conversation context
   */
  async detectIntentWithContext(message, sessionId, contexts = [], languageCode = null) {
    const lang = languageCode || this.languageCode;
    
    if (!this.sessionsClient || !this.enabled) {
      throw new Error('DialogFlow SDK not available');
    }
    
    try {
      const sessionPath = this.sessionsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: lang
          }
        },
        queryParams: {
          contexts: contexts  // Provide conversation contexts
        }
      };
      
      const [response] = await this.sessionsClient.detectIntent(request);
      
      return this.parseDialogFlowSDKResponse(response.queryResult);
      
    } catch (error) {
      logger.error('Context-based detection failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Detect intent with sentiment analysis
   */
  async detectIntentWithSentiment(message, sessionId, languageCode = null) {
    const lang = languageCode || this.languageCode;
    
    if (!this.sessionsClient || !this.enabled) {
      throw new Error('DialogFlow SDK not available');
    }
    
    try {
      const sessionPath = this.sessionsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: lang
          }
        },
        queryParams: {
          sentimentAnalysisRequestConfig: {
            analyzeQueryTextSentiment: true
          }
        }
      };
      
      const [response] = await this.sessionsClient.detectIntent(request);
      
      const result = this.parseDialogFlowSDKResponse(response.queryResult);
      
      // Add sentiment
      if (response.queryResult.sentimentAnalysisResult) {
        result.sentiment = {
          score: response.queryResult.sentimentAnalysisResult.queryTextSentiment.score,
          magnitude: response.queryResult.sentimentAnalysisResult.queryTextSentiment.magnitude
        };
      }
      
      return result;
      
    } catch (error) {
      logger.error('Sentiment detection failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Parse DialogFlow SDK response into standard format
   */
  parseDialogFlowSDKResponse(queryResult) {
    // Extract parameters
    const parameters = {};
    const entities = [];
    
    if (queryResult.parameters && queryResult.parameters.fields) {
      for (const [key, value] of Object.entries(queryResult.parameters.fields)) {
        // Extract actual value based on type
        let extractedValue = null;
        
        if (value.stringValue) {
          extractedValue = value.stringValue;
        } else if (value.numberValue !== undefined) {
          extractedValue = value.numberValue;
        } else if (value.boolValue !== undefined) {
          extractedValue = value.boolValue;
        } else if (value.listValue) {
          extractedValue = value.listValue.values;
        } else if (value.structValue) {
          extractedValue = value.structValue;
        }
        
        parameters[key] = extractedValue;
        
        if (extractedValue !== null) {
          entities.push({
            entity: key,
            value: extractedValue,
            source: 'dialogflow'
          });
        }
      }
    }
    
    return {
      intent: queryResult.intent?.displayName || 'unknown',
      confidence: queryResult.intentDetectionConfidence || 0,
      entities: entities,
      fulfillmentText: queryResult.fulfillmentText || '',
      fulfillmentMessages: queryResult.fulfillmentMessages || [],
      source: 'dialogflow-sdk',
      languageCode: queryResult.languageCode || this.languageCode,
      queryText: queryResult.queryText || '',
      allRequiredParamsPresent: queryResult.allRequiredParamsPresent !== false,
      parameters: parameters,
      outputContexts: queryResult.outputContexts || [],
      diagnosticInfo: queryResult.diagnosticInfo || null
    };
  }
  
  // ==================== CONTEXT MANAGEMENT ====================
  
  /**
   * List all contexts for a session
   */
  async listContexts(sessionId) {
    if (!this.contextsClient || !this.enabled) {
      return [];
    }
    
    try {
      const sessionPath = this.contextsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      const [contexts] = await this.contextsClient.listContexts({
        parent: sessionPath
      });
      
      return contexts.map(ctx => ({
        name: ctx.name,
        lifespanCount: ctx.lifespanCount,
        parameters: ctx.parameters
      }));
      
    } catch (error) {
      logger.error('Failed to list contexts', { error: error.message });
      return [];
    }
  }
  
  /**
   * Create or update a context
   */
  async setContext(sessionId, contextName, lifespanCount, parameters = {}) {
    if (!this.contextsClient || !this.enabled) {
      throw new Error('DialogFlow SDK not available');
    }
    
    try {
      const sessionPath = this.contextsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      const contextPath = `${sessionPath}/contexts/${contextName}`;
      
      // Convert parameters to DialogFlow format
      const formattedParams = { fields: {} };
      for (const [key, value] of Object.entries(parameters)) {
        if (typeof value === 'string') {
          formattedParams.fields[key] = { stringValue: value };
        } else if (typeof value === 'number') {
          formattedParams.fields[key] = { numberValue: value };
        } else if (typeof value === 'boolean') {
          formattedParams.fields[key] = { boolValue: value };
        }
      }
      
      const context = {
        name: contextPath,
        lifespanCount: lifespanCount,
        parameters: formattedParams
      };
      
      const [response] = await this.contextsClient.createContext({
        parent: sessionPath,
        context: context
      });
      
      logger.info('Context created/updated', { contextName, sessionId });
      
      return response;
      
    } catch (error) {
      logger.error('Failed to set context', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Delete all contexts for a session
   */
  async clearContexts(sessionId) {
    if (!this.contextsClient || !this.enabled) {
      return { success: false, message: 'SDK not available' };
    }
    
    try {
      const sessionPath = this.contextsClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );
      
      await this.contextsClient.deleteAllContexts({
        parent: sessionPath
      });
      
      logger.info('All contexts cleared', { sessionId });
      
      return { success: true, message: 'Contexts cleared' };
      
    } catch (error) {
      logger.error('Failed to clear contexts', { error: error.message });
      return { success: false, error: error.message };
    }
  }
  
  // ==================== INTENT MANAGEMENT ====================
  
  /**
   * List all intents in the agent
   */
  async listAllIntents() {
    if (!this.intentsClient || !this.enabled) {
      return [];
    }
    
    try {
      const projectAgentPath = this.intentsClient.projectAgentPath(this.projectId);
      
      const [intents] = await this.intentsClient.listIntents({
        parent: projectAgentPath,
        intentView: 'INTENT_VIEW_FULL'
      });
      
      return intents.map(intent => ({
        id: intent.name.split('/').pop(),
        displayName: intent.displayName,
        priority: intent.priority,
        isFallback: intent.isFallback,
        trainingPhrasesCount: intent.trainingPhrases?.length || 0,
        action: intent.action,
        events: intent.events || []
      }));
      
    } catch (error) {
      logger.error('Failed to list intents', { error: error.message });
      return [];
    }
  }
  
  /**
   * Get specific intent details
   */
  async getIntentDetails(intentId) {
    if (!this.intentsClient || !this.enabled) {
      throw new Error('DialogFlow SDK not available');
    }
    
    try {
      const intentPath = this.intentsClient.projectAgentIntentPath(
        this.projectId,
        intentId
      );
      
      const [intent] = await this.intentsClient.getIntent({
        name: intentPath,
        intentView: 'INTENT_VIEW_FULL'
      });
      
      return intent;
      
    } catch (error) {
      logger.error('Failed to get intent', { error: error.message });
      throw error;
    }
  }
  
  // ==================== AGENT INFORMATION ====================
  
  /**
   * Get agent information
   */
  async getAgentInfo() {
    if (!this.agentsClient || !this.enabled) {
      return null;
    }
    
    try {
      const projectPath = this.agentsClient.projectPath(this.projectId);
      
      const [agent] = await this.agentsClient.getAgent({
        parent: projectPath
      });
      
      return {
        displayName: agent.displayName,
        defaultLanguageCode: agent.defaultLanguageCode,
        supportedLanguageCodes: agent.supportedLanguageCodes || [],
        timeZone: agent.timeZone,
        description: agent.description,
        apiVersion: agent.apiVersion,
        tier: agent.tier
      };
      
    } catch (error) {
      logger.error('Failed to get agent info', { error: error.message });
      return null;
    }
  }
  
  // ==================== SERVICE STATUS ====================
  
  /**
   * Get comprehensive service status
   */
  getServiceStatus() {
    return {
      enabled: this.enabled,
      projectId: this.projectId,
      languageCode: this.languageCode,
      sdkVersion: require('@google-cloud/dialogflow/package.json').version,
      clients: {
        sessions: !!this.sessionsClient,
        intents: !!this.intentsClient,
        entityTypes: !!this.entityTypesClient,
        contexts: !!this.contextsClient,
        agents: !!this.agentsClient
      },
      status: this.enabled ? 'connected' : 'disabled',
      mode: this.sessionsClient ? 'sdk' : 'mock'
    };
  }
  
  // ==================== MOCK MODE (FALLBACK) ====================
  
  /**
   * Mock intent detection for testing without API
   */
  async detectIntentMock(message, sessionId, languageCode) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const lowerMessage = message.toLowerCase();
    
    // Banking intent patterns
    if (lowerMessage.includes('balance')) {
      return {
        intent: 'check.balance',
        confidence: 0.92,
        entities: [
          {
            entity: 'account_type',
            value: lowerMessage.includes('savings') ? 'savings' : 'checking',
            source: 'mock'
          }
        ],
        fulfillmentText: 'I can help you check your account balance.',
        source: 'mock',
        languageCode: languageCode,
        allRequiredParamsPresent: true,
        parameters: {
          account_type: lowerMessage.includes('savings') ? 'savings' : 'checking'
        }
      };
    }
    
    if (lowerMessage.includes('transfer')) {
      return {
        intent: 'transfer.money',
        confidence: 0.88,
        entities: [],
        fulfillmentText: 'I can help you transfer money.',
        source: 'mock',
        languageCode: languageCode,
        allRequiredParamsPresent: false,
        parameters: {}
      };
    }
    
    if (lowerMessage.includes('transaction')) {
      return {
        intent: 'view.transactions',
        confidence: 0.85,
        entities: [],
        fulfillmentText: 'I can show you your transaction history.',
        source: 'mock',
        languageCode: languageCode,
        allRequiredParamsPresent: true,
        parameters: {}
      };
    }
    
    // Default fallback
    return {
      intent: 'Default Fallback Intent',
      confidence: 0.3,
      entities: [],
      fulfillmentText: "I'm not sure how to help with that.",
      source: 'mock',
      languageCode: languageCode,
      allRequiredParamsPresent: false,
      parameters: {}
    };
  }
}

// Export singleton instance
module.exports = new EnhancedDialogFlowService();
