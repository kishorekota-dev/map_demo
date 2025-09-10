#!/bin/bash

echo "🚀 MCP Host with OpenAI Setup Script"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

print_status "Node.js is installed: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_status "npm is installed: $(npm --version)"

# Install dependencies
print_info "Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    print_status "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    cp .env.example .env
    print_info "Please edit .env file and add your OpenAI API key"
else
    print_status ".env file already exists"
fi

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    print_warning "OPENAI_API_KEY environment variable not set"
    print_info "You can either:"
    print_info "1. Set it in your environment: export OPENAI_API_KEY=your_key_here"
    print_info "2. Add it to the .env file: OPENAI_API_KEY=your_key_here"
    print_info "3. Get your API key from: https://platform.openai.com/api-keys"
else
    print_status "OpenAI API key is set"
fi

# Run basic tests
print_info "Running basic tests..."
node test-mcp-host.js

echo ""
print_info "Setup complete! Available commands:"
echo "  npm run host                - Run MCP Host demo"
echo "  npm run host:interactive    - Run interactive mode"
echo "  npm run dev:host           - Start backend + MCP Host"
echo "  npm run test               - Run all tests"
echo ""
print_info "Example usage:"
echo '  export OPENAI_API_KEY=your_key_here'
echo '  npm run dev:host'
echo ""
print_warning "Make sure to set your OpenAI API key before running the demo!"

exit 0
