const { StateGraph, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');
const logger = require('../utils/logger');
const config = require('../../config');
const {
  buildSystemMessage,
  buildUserMessage,
  getRequiredDataForIntent,
  needsConfirmation,
  getToolsForIntent
} = require('../prompts/intentPrompts');

/**
 * Banking Chat Workflow using LangGraph
 * Handles intent-based conversation flow with human-in-the-loop
 */
class BankingChatWorkflow {
  constructor(mcpClient, sessionManager) {
    this.mcpClient = mcpClient;
    this.sessionManager = sessionManager;
    
    // Initialize OpenAI
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openai.apiKey,
      modelName: config.openai.model,
      temperature: config.openai.temperature,
      maxTokens: config.openai.maxTokens
    });
    
    // Build the workflow graph
    this.graph = this.buildGraph();
    
    logger.info('Banking Chat Workflow initialized');
  }

  /**
   * Build the LangGraph workflow
   */
  buildGraph() {
    // Define the state schema
    const graphState = {
      sessionId: null,
      intent: null,
      question: null,
      conversationHistory: [],
      collectedData: {},
      requiredData: [],
      currentStep: 'start',
      needsHumanInput: false,
      humanInputQuestion: null,
      toolResults: {},
      finalResponse: null,
      error: null
    };

    // Create state graph
    const workflow = new StateGraph({
      channels: graphState
    });

    // Add nodes
    workflow.addNode('analyze_intent', this.analyzeIntent.bind(this));
    workflow.addNode('check_required_data', this.checkRequiredData.bind(this));
    workflow.addNode('request_human_input', this.requestHumanInput.bind(this));
    workflow.addNode('execute_tools', this.executeTools.bind(this));
    workflow.addNode('generate_response', this.generateResponse.bind(this));
    workflow.addNode('request_confirmation', this.requestConfirmation.bind(this));
    workflow.addNode('handle_error', this.handleError.bind(this));

    // Define edges (workflow flow)
    workflow.setEntryPoint('analyze_intent');
    
    workflow.addConditionalEdges(
      'analyze_intent',
      this.routeAfterIntent.bind(this),
      {
        'check_data': 'check_required_data',
        'error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'check_required_data',
      this.routeAfterDataCheck.bind(this),
      {
        'need_input': 'request_human_input',
        'execute': 'execute_tools',
        'generate': 'generate_response'
      }
    );

    workflow.addEdge('request_human_input', END);

    workflow.addConditionalEdges(
      'execute_tools',
      this.routeAfterTools.bind(this),
      {
        'confirmation': 'request_confirmation',
        'generate': 'generate_response',
        'error': 'handle_error'
      }
    );

    workflow.addEdge('request_confirmation', END);
    workflow.addEdge('generate_response', END);
    workflow.addEdge('handle_error', END);

    return workflow.compile();
  }

  /**
   * Node: Analyze Intent
   */
  async analyzeIntent(state) {
    logger.info('Workflow: Analyzing intent', {
      sessionId: state.sessionId,
      intent: state.intent
    });

    try {
      // Intent is already determined from NLU service
      // Update session with intent
      await this.sessionManager.updateSession(state.sessionId, {
        intent: state.intent,
        currentStep: 'analyze_intent'
      });

      // Get required data for this intent
      const requiredData = getRequiredDataForIntent(state.intent);
      
      return {
        ...state,
        requiredData,
        currentStep: 'analyze_intent'
      };
    } catch (error) {
      logger.error('Error in analyze_intent', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Check Required Data
   */
  async checkRequiredData(state) {
    logger.info('Workflow: Checking required data', {
      sessionId: state.sessionId,
      requiredData: state.requiredData
    });

    try {
      // Get session to check collected data
      const session = await this.sessionManager.getSession(state.sessionId);
      
      // Check which required data is missing
      const missingData = state.requiredData.filter(
        field => !session.collectedData[field]
      );

      logger.info('Missing data check', {
        sessionId: state.sessionId,
        missing: missingData
      });

      return {
        ...state,
        collectedData: session.collectedData,
        requiredData: missingData,
        currentStep: 'check_required_data'
      };
    } catch (error) {
      logger.error('Error in check_required_data', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Request Human Input
   */
  async requestHumanInput(state) {
    logger.info('Workflow: Requesting human input', {
      sessionId: state.sessionId,
      missingData: state.requiredData
    });

    try {
      // Build question for missing data
      const missingFields = state.requiredData;
      let question = `To help you with this request, I need some information:\n`;
      
      missingFields.forEach(field => {
        const fieldName = field.replace(/_/g, ' ');
        question += `- ${fieldName}\n`;
      });
      
      question += '\nPlease provide this information.';

      // Update session to waiting state
      await this.sessionManager.updateSession(state.sessionId, {
        status: 'waiting_human_input',
        requiredData: missingFields,
        currentStep: 'request_human_input'
      });

      return {
        ...state,
        needsHumanInput: true,
        humanInputQuestion: question,
        currentStep: 'request_human_input',
        finalResponse: {
          type: 'human_input_required',
          question,
          requiredFields: missingFields
        }
      };
    } catch (error) {
      logger.error('Error in request_human_input', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Execute Tools
   * Now uses Enhanced MCP Client with hybrid protocol support
   */
  async executeTools(state) {
    logger.info('Workflow: Executing tools', {
      sessionId: state.sessionId,
      intent: state.intent
    });

    try {
      const tools = getToolsForIntent(state.intent);
      const toolResults = {};

      // Execute each tool using Enhanced MCP Client
      // Tries MCP Protocol first, falls back to HTTP automatically
      for (const tool of tools) {
        try {
          const parameters = this.buildToolParameters(tool, state);
          const result = await this.mcpClient.executeTool(
            tool,
            parameters,
            state.sessionId
          );
          
          toolResults[tool] = result;
          
          logger.info('Tool executed successfully', {
            sessionId: state.sessionId,
            tool,
            success: result.success || true
          });
        } catch (error) {
          logger.error('Tool execution failed', {
            sessionId: state.sessionId,
            tool,
            error: error.message
          });
          toolResults[tool] = { success: false, error: error.message };
        }
      }

      // Update session with tool results
      await this.sessionManager.updateWorkflowState(
        state.sessionId,
        'execute_tools',
        { toolResults }
      );

      return {
        ...state,
        toolResults,
        currentStep: 'execute_tools'
      };
    } catch (error) {
      logger.error('Error in execute_tools', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Generate Response
   */
  async generateResponse(state) {
    logger.info('Workflow: Generating response', {
      sessionId: state.sessionId,
      intent: state.intent
    });

    try {
      // Build context from collected data and tool results
      const context = {
        question: state.question,
        ...state.collectedData,
        ...state.toolResults
      };

      // Build messages
      const systemMessage = new SystemMessage(buildSystemMessage(state.intent));
      const userMessage = new HumanMessage(buildUserMessage(state.intent, context));

      // Add conversation history
      const messages = [systemMessage];
      
      state.conversationHistory.forEach(msg => {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        }
      });
      
      messages.push(userMessage);

      // Generate response using LLM
      const response = await this.llm.invoke(messages);
      const finalResponse = response.content;

      // Save response to session
      await this.sessionManager.addMessage(
        state.sessionId,
        'assistant',
        finalResponse,
        { intent: state.intent, toolResults: state.toolResults }
      );

      logger.info('Response generated', {
        sessionId: state.sessionId,
        responseLength: finalResponse.length
      });

      return {
        ...state,
        finalResponse: {
          type: 'complete',
          response: finalResponse,
          intent: state.intent
        },
        currentStep: 'generate_response'
      };
    } catch (error) {
      logger.error('Error in generate_response', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Request Confirmation
   */
  async requestConfirmation(state) {
    logger.info('Workflow: Requesting confirmation', {
      sessionId: state.sessionId,
      intent: state.intent
    });

    try {
      const question = this.buildConfirmationQuestion(state);

      await this.sessionManager.updateSession(state.sessionId, {
        status: 'waiting_human_input',
        currentStep: 'request_confirmation'
      });

      return {
        ...state,
        needsHumanInput: true,
        currentStep: 'request_confirmation',
        finalResponse: {
          type: 'confirmation_required',
          question,
          action: state.intent,
          details: state.collectedData
        }
      };
    } catch (error) {
      logger.error('Error in request_confirmation', {
        sessionId: state.sessionId,
        error: error.message
      });
      return { ...state, error: error.message };
    }
  }

  /**
   * Node: Handle Error
   */
  async handleError(state) {
    logger.error('Workflow: Handling error', {
      sessionId: state.sessionId,
      error: state.error
    });

    await this.sessionManager.updateSession(state.sessionId, {
      status: 'failed',
      currentStep: 'handle_error'
    });

    return {
      ...state,
      finalResponse: {
        type: 'error',
        message: 'I encountered an error processing your request. Please try again.',
        error: state.error
      }
    };
  }

  /**
   * Routing: After Intent Analysis
   */
  routeAfterIntent(state) {
    if (state.error) return 'error';
    return 'check_data';
  }

  /**
   * Routing: After Data Check
   */
  routeAfterDataCheck(state) {
    if (state.requiredData.length > 0) {
      return 'need_input';
    }
    
    const tools = getToolsForIntent(state.intent);
    if (tools.length > 0) {
      return 'execute';
    }
    
    return 'generate';
  }

  /**
   * Routing: After Tool Execution
   */
  routeAfterTools(state) {
    if (state.error) return 'error';
    
    if (needsConfirmation(state.intent)) {
      return 'confirmation';
    }
    
    return 'generate';
  }

  /**
   * Build tool parameters from state
   */
  buildToolParameters(tool, state) {
    const params = { ...state.collectedData };
    
    // Add session context
    params.sessionId = state.sessionId;
    
    return params;
  }

  /**
   * Build confirmation question
   */
  buildConfirmationQuestion(state) {
    const intentDescriptions = {
      transfer_funds: `transfer $${state.collectedData.amount} to ${state.collectedData.recipient}`,
      card_management: `${state.collectedData.cardAction} your card`,
      dispute_transaction: `file a dispute for transaction ${state.collectedData.transactionId}`
    };

    const action = intentDescriptions[state.intent] || 'proceed with this action';
    return `Are you sure you want to ${action}? Please confirm (yes/no).`;
  }

  /**
   * Execute the workflow
   */
  async execute(input) {
    logger.info('Executing workflow', {
      sessionId: input.sessionId,
      intent: input.intent
    });

    try {
      const result = await this.graph.invoke(input);
      
      logger.info('Workflow completed', {
        sessionId: input.sessionId,
        currentStep: result.currentStep,
        needsHumanInput: result.needsHumanInput
      });

      return result;
    } catch (error) {
      logger.error('Workflow execution failed', {
        sessionId: input.sessionId,
        error: error.message
      });
      
      return {
        ...input,
        error: error.message,
        finalResponse: {
          type: 'error',
          message: 'Workflow execution failed',
          error: error.message
        }
      };
    }
  }

  /**
   * Get available tools via MCP Protocol (tool discovery)
   * Uses Enhanced MCP Client to discover tools dynamically
   */
  async getAvailableTools() {
    try {
      const tools = await this.mcpClient.listTools();
      logger.info('Discovered tools via MCP Protocol', {
        count: tools.length,
        tools: tools.map(t => t.name)
      });
      return tools;
    } catch (error) {
      logger.error('Failed to discover tools', { error: error.message });
      throw error;
    }
  }

  /**
   * Get MCP client health status
   */
  async getClientHealth() {
    return await this.mcpClient.healthCheck();
  }

  /**
   * Get MCP client statistics
   */
  getClientStats() {
    return this.mcpClient.getStats();
  }
}

module.exports = BankingChatWorkflow;
