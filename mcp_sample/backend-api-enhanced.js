const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Enhanced in-memory data store with events
let users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', createdAt: new Date() },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user', createdAt: new Date() },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user', createdAt: new Date() }
];

let tasks = [
  { id: 1, title: 'Complete project setup', completed: false, userId: 1, createdAt: new Date() },
  { id: 2, title: 'Write documentation', completed: true, userId: 2, createdAt: new Date() },
  { id: 3, title: 'Test the application', completed: false, userId: 3, createdAt: new Date() }
];

let analytics = {
  userCount: users.length,
  taskCount: tasks.length,
  completedTasks: tasks.filter(t => t.completed).length,
  apiCalls: 0,
  wsConnections: 0
};

// WebSocket handling
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  analytics.wsConnections++;
  
  console.log(`📡 WebSocket client connected. Total: ${clients.size}`);
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'init',
    data: { users, tasks, analytics }
  }));

  ws.on('close', () => {
    clients.delete(ws);
    analytics.wsConnections--;
    console.log(`📡 WebSocket client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast function
function broadcast(event, data) {
  const message = JSON.stringify({ type: event, data, timestamp: new Date() });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Middleware to track API calls
app.use((req, res, next) => {
  analytics.apiCalls++;
  next();
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Enhanced Backend API for MCP Demo with WebSocket Support',
    version: '2.0.0',
    features: ['REST API', 'WebSocket Real-time Updates', 'Analytics'],
    endpoints: {
      users: '/api/users',
      tasks: '/api/tasks',
      analytics: '/api/analytics',
      health: '/api/health',
      websocket: 'ws://localhost:3001'
    }
  });
});

// Health check with enhanced metrics
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime)}s`,
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    },
    connections: {
      websocket: clients.size,
      total: analytics.wsConnections
    }
  });
});

// Analytics endpoint
app.get('/api/analytics', (req, res) => {
  const now = new Date();
  const recentTasks = tasks.filter(t => 
    new Date(t.createdAt) > new Date(now - 24 * 60 * 60 * 1000)
  ).length;
  
  res.json({
    success: true,
    data: {
      ...analytics,
      recentTasks,
      completionRate: analytics.taskCount > 0 ? 
        Math.round((analytics.completedTasks / analytics.taskCount) * 100) : 0,
      timestamp: new Date().toISOString()
    }
  });
});

// Enhanced Users endpoints
app.get('/api/users', (req, res) => {
  const { role, limit, offset } = req.query;
  let filteredUsers = users;
  
  if (role) {
    filteredUsers = users.filter(u => u.role === role);
  }
  
  const start = parseInt(offset) || 0;
  const end = start + (parseInt(limit) || filteredUsers.length);
  
  res.json({ 
    success: true, 
    data: filteredUsers.slice(start, end),
    meta: {
      total: filteredUsers.length,
      offset: start,
      limit: end - start
    }
  });
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  
  // Include user's tasks
  const userTasks = tasks.filter(t => t.userId === user.id);
  
  res.json({ 
    success: true, 
    data: { 
      ...user, 
      tasks: userTasks,
      taskCount: userTasks.length,
      completedTasks: userTasks.filter(t => t.completed).length
    }
  });
});

app.post('/api/users', (req, res) => {
  const { name, email, role = 'user' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }
  
  // Check for duplicate email
  if (users.find(u => u.email === email)) {
    return res.status(409).json({ success: false, error: 'Email already exists' });
  }
  
  const newUser = {
    id: Math.max(...users.map(u => u.id)) + 1,
    name,
    email,
    role,
    createdAt: new Date()
  };
  
  users.push(newUser);
  analytics.userCount++;
  
  // Broadcast update
  broadcast('user_created', newUser);
  broadcast('analytics_updated', analytics);
  
  res.status(201).json({ success: true, data: newUser });
});

// Enhanced Tasks endpoints
app.get('/api/tasks', (req, res) => {
  const { completed, userId, limit, offset } = req.query;
  let filteredTasks = tasks;
  
  if (completed !== undefined) {
    filteredTasks = tasks.filter(t => t.completed === (completed === 'true'));
  }
  
  if (userId) {
    filteredTasks = filteredTasks.filter(t => t.userId === parseInt(userId));
  }
  
  const start = parseInt(offset) || 0;
  const end = start + (parseInt(limit) || filteredTasks.length);
  
  res.json({ 
    success: true, 
    data: filteredTasks.slice(start, end),
    meta: {
      total: filteredTasks.length,
      offset: start,
      limit: end - start
    }
  });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  
  // Include assigned user info
  const assignedUser = users.find(u => u.id === task.userId);
  
  res.json({ 
    success: true, 
    data: { 
      ...task, 
      assignedUser: assignedUser ? { id: assignedUser.id, name: assignedUser.name } : null
    }
  });
});

app.post('/api/tasks', (req, res) => {
  const { title, userId, completed = false, description } = req.body;
  if (!title || !userId) {
    return res.status(400).json({ success: false, error: 'Title and userId are required' });
  }
  
  // Verify user exists
  if (!users.find(u => u.id === parseInt(userId))) {
    return res.status(400).json({ success: false, error: 'Invalid userId' });
  }
  
  const newTask = {
    id: Math.max(...tasks.map(t => t.id)) + 1,
    title,
    description: description || '',
    completed,
    userId: parseInt(userId),
    createdAt: new Date()
  };
  
  tasks.push(newTask);
  analytics.taskCount++;
  if (completed) analytics.completedTasks++;
  
  // Broadcast update
  broadcast('task_created', newTask);
  broadcast('analytics_updated', analytics);
  
  res.status(201).json({ success: true, data: newTask });
});

app.put('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  
  const oldTask = tasks[taskIndex];
  const updatedTask = { ...oldTask, ...req.body, updatedAt: new Date() };
  
  // Update completion analytics
  if (oldTask.completed !== updatedTask.completed) {
    if (updatedTask.completed) {
      analytics.completedTasks++;
    } else {
      analytics.completedTasks--;
    }
  }
  
  tasks[taskIndex] = updatedTask;
  
  // Broadcast update
  broadcast('task_updated', updatedTask);
  broadcast('analytics_updated', analytics);
  
  res.json({ success: true, data: updatedTask });
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  
  const deletedTask = tasks[taskIndex];
  tasks.splice(taskIndex, 1);
  analytics.taskCount--;
  if (deletedTask.completed) analytics.completedTasks--;
  
  // Broadcast update
  broadcast('task_deleted', { id: taskId });
  broadcast('analytics_updated', analytics);
  
  res.json({ success: true, data: deletedTask });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Enhanced Backend API server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   GET  http://localhost:${PORT}/api/analytics`);
  console.log(`   GET  http://localhost:${PORT}/api/users`);
  console.log(`   POST http://localhost:${PORT}/api/users`);
  console.log(`   GET  http://localhost:${PORT}/api/tasks`);
  console.log(`   POST http://localhost:${PORT}/api/tasks`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
});

module.exports = app;
