#!/bin/bash

# Quick Demo Script for Chatbot POC
echo "🤖 Chatbot POC - Quick Demo"
echo "============================="

# Check if we're in the poc directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the poc directory"
    exit 1
fi

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the server in the background
echo "🚀 Starting chatbot server..."
npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server started successfully (PID: $SERVER_PID)"
    echo ""
    echo "🌐 Open your browser and go to: http://localhost:3000"
    echo ""
    echo "🧪 Try these example messages:"
    echo "   • Hello there!"
    echo "   • What can you do?"
    echo "   • I need help"
    echo "   • Thank you, goodbye"
    echo ""
    echo "📊 Monitor intent detection in the sidebar"
    echo "⚙️  Adjust settings using the gear icon"
    echo ""
    echo "Press Enter to stop the server and exit..."
    read
    
    # Stop the server
    echo "🛑 Stopping server..."
    kill $SERVER_PID
    echo "✅ Demo completed"
else
    echo "❌ Failed to start server"
    exit 1
fi