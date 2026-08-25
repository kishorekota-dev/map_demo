const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const secret = 'agent-ui-browser-test-secret';
const app = express();
app.use(express.json());

app.post('/auth/token', (req, res) => {
    const username = req.body?.credentials?.username;
    if (!username || !req.body?.credentials?.password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const userId = 'agent-browser-test';
    return res.json({
        success: true,
        userId,
        token: jwt.sign({ userId }, secret),
        agent: { name: 'Browser Test Agent', department: 'customer-service' }
    });
});

app.post('/auth/validate', (req, res) => {
    try {
        const decoded = jwt.verify(req.body?.token, secret);
        res.json({ valid: true, userId: decoded.userId });
    } catch (error) {
        res.status(401).json({ valid: false });
    }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
io.use((socket, next) => {
    try {
        socket.user = jwt.verify(socket.handshake.auth?.token, secret);
        next();
    } catch (error) {
        next(new Error('Authentication failed'));
    }
});
io.on('connection', socket => {
    socket.on('authenticate', () => {
        socket.emit('authenticationSuccess', { authenticated: true, userId: socket.user.userId });
    });
    socket.on('request', envelope => {
        const result = envelope.type === 'getSessionHistory'
            ? { sessionId: envelope.data.sessionId, messages: [] }
            : { success: true, sessionId: envelope.data.sessionId };
        socket.emit('response', { requestId: envelope.requestId, success: true, result });
    });
    socket.on('joinSession', data => socket.emit('sessionJoined', { sessionId: data.sessionId }));
    socket.on('ping', () => socket.emit('pong'));
});

server.listen(Number(process.env.STUB_PORT || 13006));

const shutdown = () => io.close(() => server.close(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
