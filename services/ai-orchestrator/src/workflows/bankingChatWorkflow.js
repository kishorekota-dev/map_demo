const { StateGraph, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');
const logger = require('../utils/logger');
const config = require('../../config');
const { getCheckpointer } = require('../utils/checkpointer');
const intentMapper = require('../services/intentMapper');
const slmDataExtractor = require('../services/poc-slm-data-extractor');

/**
 * Banking Chat Workflow using LangGraph
 * Handles intent-based conversation flow with human-in-the-loop
 * Uses LangGraph checkpointer for state persistence across invocations
 */
class BankingChatWorkflow {
  constructor(mcpClient, sessionManager, policyEngine) {
    this.mcpClient = mcpClient;
    this.sessionManager = sessionManager;
    this.policyEngine = policyEngine;
    this.slm = slmDataExtractor;
    
    // Initialize OpenAI.
    // Determinism: temperature/top_p default to 0 and the seed is pinned so the
    // same intent + collected data + tool results produce the same response.
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openai.apiKey,
      modelName: config.openai.model,
      temperature: config.openai.temperature,
      topP: config.openai.topP,
      maxTokens: config.openai.maxTokens,
      modelKwargs: Number.isFinite(config.openai.seed) ? { seed: config.openai.seed } : {}
    });
    
    // Get checkpointer instance
    this.checkpointerManager = getCheckpointer();
    
    // Build the workflow graph
    this.graph = this.buildGraph();
    
    logger.info('Banking Chat Workflow initialized', {
      checkpointerEnabled: this.checkpointerManager.isEnabled()
    });
  }

  /**
   * Build the LangGraph workflow
   */
  buildGraph() {
    // Define the state schema
    const graphState = {
      sessionId: null,
      userId: null,
      authToken: null,
      intent: null,
      question: null,
      conversationHistory: [],
      collectedData: {},
      requiredData: [],
      validationResult: null,
      invalidFields: [],
      slmMetadata: null,
      currentStep: 'start',
      needsHumanInput: false,
      humanInputQuestion: null,
      toolResults: {},
      pendingTools: [],
      policyDecision: null,
      policyTrace: [],
      confirmationGranted: false,
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
    workflow.addNode('handle_policy', this.handlePolicy.bind(this));
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
        'policy': 'handle_policy',
        'confirmation': 'request_confirmation',
        'generate': 'generate_response',
        'error': 'handle_error'
      }
    );

    workflow.addEdge('request_confirmation', END);
    workflow.addEdge('handle_policy', END);
    workflow.addEdge('generate_response', END);
    workflow.addEdge('handle_error', END);

    // Compile with checkpointer if enabled
    const checkpointer = this.checkpointerManager.getCheckpointer();
    if (checkpointer) {
      logger.info('Compiling workflow with checkpointer enabled');
      return workflow.compile({ checkpointer });
    } else {
      logger.info('Compiling workflow without checkpointer');
      return workflow.compile();
    }
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
      const requiredData = intentMapper.getRequiredData(state.intent);
      
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
      const baseCollected = {
        ...(session?.collectedData || {}),
        ...(state.collectedData || {})
      };
      const requiredFields = state.requiredData?.length
        ? state.requiredData
        : intentMapper.getRequiredData(state.intent);

      // Try SLM-based extraction before prompting the human
      let slmResult = null;
      if (this.slm.isEnabled()) {
        slmResult = await this.slm.extractAndValidate({
          intent: state.intent,
          conversationHistory: state.conversationHistory || session?.conversationHistory || [],
          latestInput: state.question,
          existingData: baseCollected
        });
      }

      const collectedData = slmResult?.extractedData || baseCollected;
      const validationResult = slmResult?.validationResult || intentMapper.validateData(state.intent, collectedData);
      const missingData = validationResult.missing?.length
        ? validationResult.missing
        : requiredFields.filter(field => !collectedData[field]);
      const invalidFields = validationResult.invalid || [];
      const pendingFields = [...new Set([
        ...missingData,
        ...invalidFields
          .map(issue => issue.field)
          .filter(Boolean)
      ])];

      logger.info('Missing/invalid data check', {
        sessionId: state.sessionId,
        missing: missingData,
        invalid: invalidFields.map(v => v.field)
      });

      await this.sessionManager.updateSession(state.sessionId, {
        collectedData,
        requiredData: pendingFields,
        currentStep: 'check_required_data'
      });

      await this.sessionManager.updateWorkflowState(
        state.sessionId,
        'check_required_data',
        {
          slm: { enabled: this.slm.isEnabled(), modelOutput: slmResult?.modelOutput },
          validationResult
        }
      );

      return {
        ...state,
        collectedData,
        requiredData: pendingFields,
        validationResult,
        invalidFields,
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
      const missingFields = state.requiredData || [];
      const invalidFields = state.validationResult?.invalid || state.invalidFields || [];
      const requiredFields = [...new Set([
        ...missingFields,
        ...invalidFields
          .map(issue => issue.field || issue)
          .filter(Boolean)
      ])];
      let question = 'To help you with this request, I need some information:';

      if (missingFields.length > 0) {
        missingFields.forEach(field => {
          const fieldName = field.replace(/_/g, ' ');
          question += `\n- ${fieldName}`;
        });
      }

      if (invalidFields.length > 0) {
        question += '\n\nThese values need correction:';
        invalidFields.forEach(issue => {
          const fieldName = (issue.field || issue).toString().replace(/_/g, ' ');
          const reason = issue.reason ? ` (${issue.reason})` : '';
          question += `\n- ${fieldName}${reason}`;
        });
      }

      question += '\n\nPlease provide this information so I can continue.';

      // Update session to waiting state
      await this.sessionManager.updateSession(state.sessionId, {
        status: 'waiting_human_input',
        requiredData: requiredFields,
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
          requiredFields,
          invalidFields
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
      const tools = intentMapper.getToolsForIntent(state.intent);

      // Deterministic auth guard: banking tools require a propagated session
      // token. Fail fast with a stable block (routed through the same terminal
      // path as a policy block) instead of letting every tool call return a
      // non-deterministic 401 from the banking service.
      if (tools.length > 0 && intentMapper.requiresAuth(state.intent) && !state.authToken) {
        logger.warn('Tool execution blocked: missing auth token', {
          sessionId: state.sessionId,
          intent: state.intent
        });
        const authBlock = this.policyEngine.block(
          'pre_tool',
          'authentication_required',
          'Your session is not authenticated for this banking action. Please sign in and try again.',
          { flags: ['missing_auth_token'], metadata: { intent: state.intent, tools } }
        );
        return {
          ...state,
          pendingTools: tools,
          policyDecision: authBlock,
          policyTrace: [...(state.policyTrace || []), authBlock.audit],
          currentStep: 'policy_pre_tool',
          finalResponse: {
            type: 'policy_blocked',
            stage: authBlock.stage,
            code: authBlock.code,
            message: authBlock.message,
            policy: authBlock.audit
          }
        };
      }

      const policyDecision = this.policyEngine.evaluateToolExecution({
        intent: state.intent,
        tools,
        state
      });
      const policyTrace = policyDecision.audit
        ? [...(state.policyTrace || []), policyDecision.audit]
        : state.policyTrace || [];

      if (policyDecision.action === 'block') {
        await this.sessionManager.updateWorkflowState(state.sessionId, 'policy_pre_tool', {
          policy: policyDecision.audit
        });

        return {
          ...state,
          pendingTools: tools,
          policyDecision,
          policyTrace,
          currentStep: 'policy_pre_tool',
          finalResponse: {
            type: 'policy_blocked',
            stage: policyDecision.stage,
            code: policyDecision.code,
            message: policyDecision.message,
            policy: policyDecision.audit
          }
        };
      }

      if (policyDecision.action === 'require_confirmation') {
        return {
          ...state,
          pendingTools: tools,
          policyDecision,
          policyTrace,
          currentStep: 'policy_pre_tool'
        };
      }

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
        {
          toolResults,
          policy: policyDecision.audit
        }
      );

      return {
        ...state,
        toolResults,
        pendingTools: tools,
        policyTrace,
        policyDecision: null,
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
      userId: state.userId,
      intent: state.intent
    });

    try {
      // Build context from collected data and tool results
      // Include userId for authenticated context
      const sanitizedToolResults = this.policyEngine.sanitizeStructuredData(state.toolResults);
      const context = {
        question: state.question,
        userId: state.userId,
        ...state.collectedData,
        ...sanitizedToolResults
      };

      // Build messages
      const systemMessage = new SystemMessage(intentMapper.buildSystemMessage(state.intent));
      const userMessage = new HumanMessage(intentMapper.buildUserMessage(state.intent, context));

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
      const responsePolicy = this.policyEngine.evaluateResponse({
        intent: state.intent,
        response: response.content,
        toolResults: sanitizedToolResults
      });
      const policyTrace = responsePolicy.audit
        ? [...(state.policyTrace || []), responsePolicy.audit]
        : state.policyTrace || [];
      const finalResponse = responsePolicy.action === 'block'
        ? responsePolicy.message
        : responsePolicy.response;

      await this.sessionManager.updateWorkflowState(
        state.sessionId,
        'generate_response',
        {
          policy: responsePolicy.audit
        }
      );

      // Save response to session
      await this.sessionManager.addMessage(
        state.sessionId,
        'assistant',
        finalResponse,
        {
          intent: state.intent,
          toolResults: sanitizedToolResults,
          policy: responsePolicy.audit
        }
      );

      logger.info('Response generated', {
        sessionId: state.sessionId,
        userId: state.userId,
        responseLength: finalResponse.length
      });

      return {
        ...state,
        toolResults: sanitizedToolResults,
        policyTrace,
        finalResponse: {
          type: 'complete',
          response: finalResponse,
          intent: state.intent,
          policy: responsePolicy.audit
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
      const question = state.policyDecision?.question || this.buildConfirmationQuestion(state);
      const details = {
        ...state.collectedData,
        tools: state.pendingTools?.length ? state.pendingTools : intentMapper.getToolsForIntent(state.intent),
        policy: state.policyDecision?.audit || null
      };

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
          details
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
   * Node: Handle Policy Outcome
   */
  async handlePolicy(state) {
    logger.warn('Workflow: Policy decision applied', {
      sessionId: state.sessionId,
      stage: state.policyDecision?.stage,
      code: state.policyDecision?.code
    });

    await this.sessionManager.updateSession(state.sessionId, {
      status: 'active',
      currentStep: state.currentStep || 'handle_policy'
    });

    await this.sessionManager.updateWorkflowState(state.sessionId, state.currentStep || 'handle_policy', {
      policy: state.policyDecision?.audit || null
    });

    return {
      ...state,
      currentStep: state.currentStep || 'handle_policy'
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
    if (state.validationResult?.invalid?.length > 0) {
      return 'need_input';
    }

    if (state.requiredData.length > 0) {
      return 'need_input';
    }
    
    const tools = intentMapper.getToolsForIntent(state.intent);
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

    if (state.policyDecision?.action === 'block') {
      return 'policy';
    }
    
    if (state.policyDecision?.action === 'require_confirmation') {
      return 'confirmation';
    }
    
    return 'generate';
  }

  /**
   * Build tool parameters from state
   */
  buildToolParameters(tool, state) {
    const params = { ...state.collectedData };

    // Add session + authenticated context. The banking tools require authToken
    // (Authorization: Bearer <jwt>); without it every call 401s. Propagate the
    // session JWT and userId so tool execution is correct and reproducible.
    params.sessionId = state.sessionId;
    if (state.userId) {
      params.userId = state.userId;
    }
    if (state.authToken) {
      params.authToken = state.authToken;
    }

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
   * Execute the workflow with checkpointer support
   * Uses sessionId as thread_id for conversation continuity
   */
  async execute(input) {
    logger.info('Executing workflow', {
      sessionId: input.sessionId,
      userId: input.userId,
      intent: input.intent,
      checkpointerEnabled: this.checkpointerManager.isEnabled()
    });

    try {
      // Build config with thread_id (sessionId) for checkpointer
      const config = {
        configurable: {
          thread_id: input.sessionId
        }
      };

      // Execute workflow with checkpointer config
      // This enables state persistence across invocations for the same session
      const result = await this.graph.invoke(input, config);
      
      logger.info('Workflow completed', {
        sessionId: input.sessionId,
        currentStep: result.currentStep,
        needsHumanInput: result.needsHumanInput
      });

      return result;
    } catch (error) {
      logger.error('Workflow execution failed', {
        sessionId: input.sessionId,
        error: error.message,
        stack: error.stack
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
