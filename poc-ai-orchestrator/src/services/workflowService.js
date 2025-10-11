const BankingChatWorkflow = require('../workflows/bankingChatWorkflow');
const { WorkflowExecution, HumanFeedback } = require('../models');
const logger = require('../utils/logger');

/**
 * Workflow Service
 * Orchestrates workflow execution and manages state
 * Now uses Enhanced MCP Client with hybrid protocol support
 */
class WorkflowService {
  constructor(mcpClient, sessionManager) {
    this.mcpClient = mcpClient;
    this.sessionManager = sessionManager;
    this.workflow = new BankingChatWorkflow(mcpClient, sessionManager);
    
    logger.info('Workflow Service initialized with Enhanced MCP Client');
  }

  /**
   * Process a message through the workflow
   */
  async processMessage({ sessionId, intent, question, userId, metadata = {} }) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Processing message through workflow', {
      sessionId,
      executionId,
      intent,
      userId
    });

    try {
      // Get or create session
      let session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        session = await this.sessionManager.createSession(
          userId,
          sessionId,
          intent,
          metadata
        );
      }

      // Add user message to conversation history
      await this.sessionManager.addMessage(sessionId, 'user', question);

      // Create workflow execution record
      const execution = await WorkflowExecution.create({
        sessionId,
        executionId,
        intent,
        input: { question, userId, metadata },
        status: 'running',
        startedAt: new Date()
      });

      // Build workflow input with authenticated user context
      const workflowInput = {
        sessionId,
        userId,
        intent,
        question,
        conversationHistory: session.conversationHistory,
        collectedData: session.collectedData,
        requiredData: session.requiredData || []
      };

      // Execute workflow
      const result = await this.workflow.execute(workflowInput);

      // Update execution record
      await execution.update({
        status: result.error ? 'failed' : 'completed',
        output: result.finalResponse,
        currentNode: result.currentStep,
        executionPath: this.extractExecutionPath(result),
        error: result.error ? { message: result.error } : null,
        completedAt: new Date()
      });

      // Handle human input required
      if (result.needsHumanInput) {
        const feedback = await HumanFeedback.create({
          sessionId,
          executionId,
          feedbackType: result.finalResponse.type === 'confirmation_required' 
            ? 'confirmation' 
            : 'data_collection',
          question: result.finalResponse.question || result.humanInputQuestion,
          requiredFields: result.finalResponse.requiredFields || result.requiredData,
          context: result.finalResponse.details || {},
          status: 'pending',
          expiresAt: new Date(Date.now() + 300000) // 5 minutes
        });

        logger.info('Human input required', {
          sessionId,
          executionId,
          feedbackId: feedback.id,
          type: feedback.feedbackType
        });
      }

      logger.info('Workflow execution completed', {
        sessionId,
        executionId,
        status: result.error ? 'failed' : 'completed',
        needsHumanInput: result.needsHumanInput
      });

      return {
        executionId,
        ...result.finalResponse,
        needsHumanInput: result.needsHumanInput,
        currentStep: result.currentStep
      };

    } catch (error) {
      logger.error('Workflow processing error', {
        sessionId,
        executionId,
        error: error.message,
        stack: error.stack
      });

      // Update execution as failed
      await WorkflowExecution.update(
        {
          status: 'failed',
          error: { message: error.message, stack: error.stack },
          completedAt: new Date()
        },
        { where: { executionId } }
      );

      throw error;
    }
  }

  /**
   * Process human feedback
   */
  async processHumanFeedback({ sessionId, response, confirmed }) {
    logger.info('Processing human feedback', {
      sessionId,
      confirmed
    });

    try {
      // Get session
      const session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Get pending feedback
      const feedback = await HumanFeedback.findOne({
        where: {
          sessionId,
          status: 'pending'
        },
        order: [['createdAt', 'DESC']]
      });

      if (!feedback) {
        throw new Error('No pending feedback found');
      }

      // Update feedback
      await feedback.update({
        response,
        status: 'received',
        respondedAt: new Date()
      });

      // Process based on feedback type
      if (feedback.feedbackType === 'confirmation') {
        return await this.processConfirmation(sessionId, confirmed, feedback);
      } else {
        return await this.processDataCollection(sessionId, response, feedback);
      }

    } catch (error) {
      logger.error('Error processing human feedback', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process confirmation feedback
   */
  async processConfirmation(sessionId, confirmed, feedback) {
    if (confirmed === true || confirmed === 'yes') {
      // User confirmed - execute the action
      const session = await this.sessionManager.getSession(sessionId);
      
      // Resume workflow with confirmation
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Execute tools with confirmed data
      const tools = feedback.context.tools || [];
      const toolResults = {};
      
      for (const tool of tools) {
        const result = await this.mcpClient.executeToolWithRetry(
          tool,
          session.collectedData,
          sessionId
        );
        toolResults[tool] = result;
      }

      // Generate final response
      return {
        type: 'complete',
        message: 'Action completed successfully',
        confirmed: true,
        toolResults
      };
    } else {
      // User cancelled
      await this.sessionManager.updateSession(sessionId, {
        status: 'active'
      });

      return {
        type: 'cancelled',
        message: 'Action cancelled. How else can I help you?',
        confirmed: false
      };
    }
  }

  /**
   * Process data collection feedback
   */
  async processDataCollection(sessionId, response, feedback) {
    // Parse response and collect data
    const collectedData = this.parseDataFromResponse(response, feedback.requiredFields);
    
    // Update session with collected data
    for (const [field, value] of Object.entries(collectedData)) {
      await this.sessionManager.collectData(sessionId, field, value);
    }

    // Get updated session
    const session = await this.sessionManager.getSession(sessionId);
    
    // Check if all required data is collected
    const isComplete = await this.sessionManager.isDataCollectionComplete(sessionId);
    
    if (isComplete) {
      // Resume workflow
      const result = await this.processMessage({
        sessionId,
        intent: session.intent,
        question: session.conversationHistory[session.conversationHistory.length - 1]?.content || '',
        userId: session.userId
      });

      return result;
    } else {
      // Still need more data
      return {
        type: 'human_input_required',
        message: 'Thank you. I still need some more information.',
        requiredFields: session.requiredData
      };
    }
  }

  /**
   * Parse data from user response
   */
  parseDataFromResponse(response, requiredFields) {
    const collectedData = {};
    
    // Simple parsing - in production, use NLU service
    if (typeof response === 'object') {
      return response;
    }
    
    // Try to extract values from text
    // This is a simple implementation - should be enhanced
    requiredFields.forEach(field => {
      if (field === 'amount') {
        const match = response.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
          collectedData[field] = parseFloat(match[1].replace(',', ''));
        }
      } else {
        collectedData[field] = response;
      }
    });
    
    return collectedData;
  }

  /**
   * Extract execution path from workflow result
   */
  extractExecutionPath(result) {
    const path = [];
    
    if (result.currentStep) {
      path.push(result.currentStep);
    }
    
    return path;
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(sessionId) {
    return await WorkflowExecution.findAll({
      where: { sessionId },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
  }
}

module.exports = WorkflowService;
