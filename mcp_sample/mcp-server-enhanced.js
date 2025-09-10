const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class EnhancedMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'enhanced-demo-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.baseURL = 'http://localhost:3001/api';
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Basic CRUD operations
          {
            name: 'get_users',
            description: 'Fetch users with optional filtering and pagination',
            inputSchema: {
              type: 'object',
              properties: {
                role: {
                  type: 'string',
                  description: 'Filter by user role (admin/user)',
                  enum: ['admin', 'user'],
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of users to return',
                },
                offset: {
                  type: 'number',
                  description: 'Number of users to skip',
                },
              },
              required: [],
            },
          },
          {
            name: 'get_user_by_id',
            description: 'Fetch a specific user with their tasks',
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
            description: 'Create a new user with validation',
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
                  format: 'email',
                },
                role: {
                  type: 'string',
                  description: 'The role of the new user',
                  enum: ['admin', 'user'],
                },
              },
              required: ['name', 'email'],
            },
          },
          {
            name: 'get_tasks',
            description: 'Fetch tasks with advanced filtering',
            inputSchema: {
              type: 'object',
              properties: {
                completed: {
                  type: 'boolean',
                  description: 'Filter by completion status',
                },
                userId: {
                  type: 'string',
                  description: 'Filter by assigned user ID',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of tasks to return',
                },
                offset: {
                  type: 'number',
                  description: 'Number of tasks to skip',
                },
              },
              required: [],
            },
          },
          {
            name: 'create_task',
            description: 'Create a new task with optional description',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of the new task',
                },
                description: {
                  type: 'string',
                  description: 'Optional description of the task',
                },
                userId: {
                  type: 'string',
                  description: 'The ID of the user to assign the task to',
                },
                completed: {
                  type: 'boolean',
                  description: 'Initial completion status (default: false)',
                },
              },
              required: ['title', 'userId'],
            },
          },
          {
            name: 'update_task',
            description: 'Update an existing task',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'The ID of the task to update',
                },
                title: {
                  type: 'string',
                  description: 'New title for the task',
                },
                description: {
                  type: 'string',
                  description: 'New description for the task',
                },
                completed: {
                  type: 'boolean',
                  description: 'New completion status',
                },
                userId: {
                  type: 'string',
                  description: 'New assigned user ID',
                },
              },
              required: ['taskId'],
            },
          },
          {
            name: 'delete_task',
            description: 'Delete a task by ID',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'The ID of the task to delete',
                },
              },
              required: ['taskId'],
            },
          },
          // Analytics and reporting
          {
            name: 'get_analytics',
            description: 'Get comprehensive analytics and metrics',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_user_productivity',
            description: 'Get productivity metrics for a specific user',
            inputSchema: {
              type: 'object',
              properties: {
                userId: {
                  type: 'string',
                  description: 'The ID of the user to analyze',
                },
              },
              required: ['userId'],
            },
          },
          {
            name: 'get_system_health',
            description: 'Get detailed system health and performance metrics',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          // Bulk operations
          {
            name: 'bulk_complete_tasks',
            description: 'Mark multiple tasks as completed',
            inputSchema: {
              type: 'object',
              properties: {
                taskIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of task IDs to mark as completed',
                },
              },
              required: ['taskIds'],
            },
          },
          {
            name: 'search_tasks',
            description: 'Search tasks by title or description',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for task title or description',
                },
              },
              required: ['query'],
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
            return await this.getUsers(args);
          case 'get_user_by_id':
            return await this.getUserById(args.userId);
          case 'create_user':
            return await this.createUser(args);
          case 'get_tasks':
            return await this.getTasks(args);
          case 'create_task':
            return await this.createTask(args);
          case 'update_task':
            return await this.updateTask(args);
          case 'delete_task':
            return await this.deleteTask(args.taskId);
          case 'get_analytics':
            return await this.getAnalytics();
          case 'get_user_productivity':
            return await this.getUserProductivity(args.userId);
          case 'get_system_health':
            return await this.getSystemHealth();
          case 'bulk_complete_tasks':
            return await this.bulkCompleteTasks(args.taskIds);
          case 'search_tasks':
            return await this.searchTasks(args.query);
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

  async getUsers(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.role) queryParams.append('role', params.role);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response = await axios.get(`${this.baseURL}/users?${queryParams}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully fetched ${response.data.data.length} users:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to fetch users: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      const response = await axios.get(`${this.baseURL}/users/${userId}`);
      return {
        content: [
          {
            type: 'text',
            text: `User details with tasks:\n${JSON.stringify(response.data.data, null, 2)}`,
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

  async createUser(params) {
    try {
      const response = await axios.post(`${this.baseURL}/users`, params);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created user:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 409) {
        throw new McpError(ErrorCode.InvalidRequest, 'Email already exists');
      }
      throw new McpError(ErrorCode.InternalError, `Failed to create user: ${error.message}`);
    }
  }

  async getTasks(params = {}) {
    try {
      const queryParams = new URLSearchParams();
      if (params.completed !== undefined) queryParams.append('completed', params.completed.toString());
      if (params.userId) queryParams.append('userId', params.userId);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const response = await axios.get(`${this.baseURL}/tasks?${queryParams}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully fetched ${response.data.data.length} tasks:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to fetch tasks: ${error.message}`);
    }
  }

  async createTask(params) {
    try {
      const response = await axios.post(`${this.baseURL}/tasks`, {
        ...params,
        userId: parseInt(params.userId),
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

  async updateTask(params) {
    try {
      const { taskId, ...updateData } = params;
      if (updateData.userId) {
        updateData.userId = parseInt(updateData.userId);
      }
      
      const response = await axios.put(`${this.baseURL}/tasks/${taskId}`, updateData);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated task:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidRequest, `Task with ID ${params.taskId} not found`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to update task: ${error.message}`);
    }
  }

  async deleteTask(taskId) {
    try {
      const response = await axios.delete(`${this.baseURL}/tasks/${taskId}`);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted task:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidRequest, `Task with ID ${taskId} not found`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to delete task: ${error.message}`);
    }
  }

  async getAnalytics() {
    try {
      const response = await axios.get(`${this.baseURL}/analytics`);
      return {
        content: [
          {
            type: 'text',
            text: `System Analytics:\n${JSON.stringify(response.data.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to fetch analytics: ${error.message}`);
    }
  }

  async getUserProductivity(userId) {
    try {
      const userResponse = await axios.get(`${this.baseURL}/users/${userId}`);
      const user = userResponse.data.data;
      
      const productivity = {
        userId: user.id,
        userName: user.name,
        totalTasks: user.taskCount,
        completedTasks: user.completedTasks,
        pendingTasks: user.taskCount - user.completedTasks,
        completionRate: user.taskCount > 0 ? Math.round((user.completedTasks / user.taskCount) * 100) : 0,
        productivity: user.completedTasks > 0 ? 'High' : user.taskCount > 0 ? 'Medium' : 'Low'
      };
      
      return {
        content: [
          {
            type: 'text',
            text: `User Productivity Report:\n${JSON.stringify(productivity, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new McpError(ErrorCode.InvalidRequest, `User with ID ${userId} not found`);
      }
      throw new McpError(ErrorCode.InternalError, `Failed to get user productivity: ${error.message}`);
    }
  }

  async getSystemHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/health`);
      return {
        content: [
          {
            type: 'text',
            text: `System Health Report:\n${JSON.stringify(response.data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to check system health: ${error.message}`);
    }
  }

  async bulkCompleteTasks(taskIds) {
    try {
      const results = [];
      
      for (const taskId of taskIds) {
        try {
          const response = await axios.put(`${this.baseURL}/tasks/${taskId}`, { completed: true });
          results.push({ taskId, status: 'completed', data: response.data.data });
        } catch (error) {
          results.push({ taskId, status: 'failed', error: error.message });
        }
      }
      
      const successful = results.filter(r => r.status === 'completed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      
      return {
        content: [
          {
            type: 'text',
            text: `Bulk completion results:\nSuccessful: ${successful}\nFailed: ${failed}\n\nDetails:\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to bulk complete tasks: ${error.message}`);
    }
  }

  async searchTasks(query) {
    try {
      const response = await axios.get(`${this.baseURL}/tasks`);
      const allTasks = response.data.data;
      
      const matchingTasks = allTasks.filter(task => 
        task.title.toLowerCase().includes(query.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(query.toLowerCase()))
      );
      
      return {
        content: [
          {
            type: 'text',
            text: `Search results for "${query}":\nFound ${matchingTasks.length} matching tasks:\n${JSON.stringify(matchingTasks, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to search tasks: ${error.message}`);
    }
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[Enhanced MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Enhanced MCP Server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    console.log('🔧 Starting Enhanced MCP Server v2.0...');
    console.log('📡 Available tools: 13 advanced tools including CRUD, analytics, and bulk operations');
    await this.server.connect(transport);
  }
}

// Start the server
const server = new EnhancedMCPServer();
server.run().catch(console.error);
