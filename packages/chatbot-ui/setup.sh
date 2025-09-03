#!/bin/bash

# Enterprise Banking ChatBot UI Setup Script
echo "Setting up Enterprise Banking ChatBot UI..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the chatbot-ui directory."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if .env.local exists, if not copy from example
if [ ! -f ".env.local" ]; then
    echo "Creating .env.local from example..."
    cp .env.local.example .env.local
    echo "Please edit .env.local with your configuration before running the application."
fi

# Build the application
echo "Building the application..."
npm run build

echo "Setup complete! To start the development server, run:"
echo "npm run dev"
echo ""
echo "To configure the application:"
echo "1. Edit .env.local with your DialogFlow and MCP server configuration"
echo "2. Set up your Google Cloud credentials for DialogFlow"
echo "3. Ensure your MCP server is running on the configured port"
echo ""
echo "For more information, see the README.md file."
