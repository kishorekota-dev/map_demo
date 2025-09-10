const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simple in-memory data store
let users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' }
];

let tasks = [
  { id: 1, title: 'Complete project setup', completed: false, userId: 1 },
  { id: 2, title: 'Write documentation', completed: true, userId: 2 },
  { id: 3, title: 'Test the application', completed: false, userId: 3 }
];

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Simple Backend API for MCP Demo',
    endpoints: {
      users: '/api/users',
      tasks: '/api/tasks',
      health: '/api/health'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Users endpoints
app.get('/api/users', (req, res) => {
  res.json({ success: true, data: users });
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({ success: true, data: user });
});

app.post('/api/users', (req, res) => {
  const { name, email, role = 'user' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }
  
  const newUser = {
    id: users.length + 1,
    name,
    email,
    role
  };
  
  users.push(newUser);
  res.status(201).json({ success: true, data: newUser });
});

// Tasks endpoints
app.get('/api/tasks', (req, res) => {
  res.json({ success: true, data: tasks });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  res.json({ success: true, data: task });
});

app.post('/api/tasks', (req, res) => {
  const { title, userId, completed = false } = req.body;
  if (!title || !userId) {
    return res.status(400).json({ success: false, error: 'Title and userId are required' });
  }
  
  const newTask = {
    id: tasks.length + 1,
    title,
    completed,
    userId: parseInt(userId)
  };
  
  tasks.push(newTask);
  res.status(201).json({ success: true, data: newTask });
});

app.put('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  
  tasks[taskIndex] = { ...tasks[taskIndex], ...req.body };
  res.json({ success: true, data: tasks[taskIndex] });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend API server running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   GET  http://localhost:${PORT}/api/users`);
  console.log(`   POST http://localhost:${PORT}/api/users`);
  console.log(`   GET  http://localhost:${PORT}/api/tasks`);
  console.log(`   POST http://localhost:${PORT}/api/tasks`);
});

module.exports = app;
