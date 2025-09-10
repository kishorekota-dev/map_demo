const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class SimpleMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'simple-demo-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_users',
            description: 'Fetch all users from the backend API',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_user_by_id',
            description: 'Fetch a specific user by their ID',
            inputSchema: {
              type: 'object',
              properties: {
                userId: {
                  type: 'string',
                  description: 'The ID of the user to fetch',
                },
              },
              required: ['userId'],
            },
          },
          {
            name: 'create_user',
            description: 'Create a new user',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'The name of the new user',
                },
                email: {
                  type: 'string',
                  description: 'The email of the new user',
                },
                role: {
                  type: 'string',
                  description: 'The role of the new user (default: user)',
                  enum: ['admin', 'user'],
                },
              },
              required: ['name', 'email'],
            },
          },
          {
            name: 'get_tasks',
            description: 'Fetch all tasks from the backend API',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'create_task',
            description: 'Create a new task',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of the new task',
                },
                userId: {
                  type: 'string',
                  description: 'The ID of the user to assign the task to',
                },
              },
              required: ['title', 'userId'],
            },
          },
          {
            name: 'complete_task',
            description: 'Mark a task as completed',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'The ID of the task to complete',
                },
              },
              required: ['taskId'],
            },
          },
          {
            name: 'get_api_health',
            description: 'Check the health status of the backend API',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_users':
            return await this.getUsers();
          
          case 'get_user_by_id':
            return await this.getUserById(args.userId);
          
          case 'create_user':
            return await this.createUser(args.name, args.email, args.role);
          
          case 'get_tasks':
            return await this.getTasks();
          
          case 'create_task':
            return await this.createTask(args.title, args.userId);
          
          case 'complete_task':
            return await this.completeTask(args.taskId);
          
          case 'get_api_health':
            return await this.getApiHealth();
          
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error.message}`
        );
      }
    });
  }

  async getUsers() {
    try {
      const response = await axios.get('http://localhost:3001/api/users');
      return {
        content: [
          {
            type: 'text',
            text: `Successfully fetched ${response.data.data.length} users:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to fetch users: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      const response = await axios.get(`http://localhost:3001/api/users/${userId}`);
      return {
        content: [
          {
            type: 'text',
            text: `User found:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidRequest, `User with ID ${userId} not found`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to fetch user: ${error.message}`);
    }
  }

  async createUser(name, email, role = 'user') {
    try {
      const response = await axios.post('http://localhost:3001/api/users', {
        name,
        email,
        role,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created user:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to create user: ${error.message}`);
    }
  }

  async getTasks() {
    try {
      const response = await axios.get('http://localhost:3001/api/tasks');
      return {
        content: [
          {
            type: 'text',
            text: `Successfully fetched ${response.data.data.length} tasks:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to fetch tasks: ${error.message}`);
    }
  }

  async createTask(title, userId) {
    try {
      const response = await axios.post('http://localhost:3001/api/tasks', {
        title,
        userId: parseInt(userId),
      });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created task:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to create task: ${error.message}`);
    }
  }

  async completeTask(taskId) {
    try {
      const response = await axios.put(`http://localhost:3001/api/tasks/${taskId}`, {
        completed: true,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully completed task:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidRequest, `Task with ID ${taskId} not found`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to complete task: ${error.message}`);
    }
  }

  async getApiHealth() {
    try {
      const response = await axios.get('http://localhost:3001/api/health');
      return {
        content: [
          {
            type: 'text',
            text: `API Health Status:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to check API health: ${error.message}`);
    }
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down MCP Server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    console.log('🔧 Starting Simple MCP Server...');
    console.log('📡 Available tools: get_users, get_user_by_id, create_user, get_tasks, create_task, complete_task, get_api_health');
    await this.server.connect(transport);
  }
}

// Start the server
const server = new SimpleMCPServer();
server.run().catch(console.error);
