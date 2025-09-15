#!/bin/bash

# Chatbot POC Setup Script
echo "🤖 Setting up Chatbot POC..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="14.0.0"

if ! node -e "process.exit(process.version.slice(1).split('.').map(Number).reduce((a,b,i)=>[100,10,1][i]*b+a) >= '$REQUIRED_VERSION'.split('.').map(Number).reduce((a,b,i)=>[100,10,1][i]*b+a) ? 0 : 1)"; then
    echo "❌ Node.js version $NODE_VERSION is not supported. Please upgrade to version $REQUIRED_VERSION or higher."
    exit 1
fi

echo "✅ Node.js version $NODE_VERSION detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Set up environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️ Creating environment configuration..."
    cp .env .env.local
    echo "✅ Environment file created (.env.local)"
    echo "🔧 Please review and modify .env.local as needed"
else
    echo "✅ Environment file already exists"
fi

# Make scripts executable
echo "🔧 Setting up executable permissions..."
chmod +x scripts/*.sh 2>/dev/null || true

# Run initial health check
echo "🔍 Running initial health check..."
node -e "
const config = require('./config/config');
console.log('✅ Configuration loaded successfully');
console.log('🔧 Server will run on port:', config.server.port);
console.log('🧠 Intent detection threshold:', config.intentDetection.confidenceThreshold);
"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "To start the chatbot:"
echo "  npm start          # Production mode"
echo "  npm run dev        # Development mode with auto-reload"
echo ""
echo "To run tests:"
echo "  npm test           # Run test suite"
echo ""
echo "To view application:"
echo "  Open http://localhost:3000 in your browser"
echo ""
echo "For more information, see README.md"