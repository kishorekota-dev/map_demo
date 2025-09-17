---
mode: agent
---
This poc for a banking chatbot application demonstrates a modular architecture that integrates multiple backend services and ensures compliance with security and regulatory requirements. The architecture is designed to be scalable, maintainable, and extensible for future enhancements.
# Banking Chatbot Architecture POC
## 🏗️ **Architecture Overview**
The architecture consists of the following key components:
--ChatBot Interface
- **Chat Frontend**: React-based web interface for user interactions
- **Chat Backend**: Node.js/Express server handling for handling Chat requests
- **NLU/NLP Integration**: Natural Language Understanding and Processing services
- **NLU Service**: Integrating with DialogueFlow for intent recognition
- **NLP Service**: Integration with OpenAI GPT-4 for natural language understanding when NLU confidence is low or undeteced
- **Banking APIs**: RESTful services for account management, transactions, and user data
- **MCP Host**: Orchestrates communication between the chatbot, NLU, NLP, and backend services
- **Session Management**: Manages user sessions and context using Redis
- **Database**: PostgreSQL for storing user data, chat logs, and transaction history
- **Security**: Using JWT for authentication and role-based access control


**Chat Backend**:
- Receives chat messages from the frontend
- Manages Chat Session and support start/stop chat session.
- Forwards Message to backend 'Intent Processing'
- Returns response from 'Intent Processing' to frontend.
- Manages Escalation to human agent when needed.
- Human Escalation routed to 'Agent Processing' backend.

Code Location: 'poc-backend'

**Chat Frontend**:
- User interface for chat interactions
- Displays chat messages and user inputs
- Sends user messages to the Chat Backend
- Receives responses from the Chat Backend
- Support start/stop chat session with respective button as applicable.
- Support Login/Logout functionality with JWT token authentication.
- Manages JWT in browser local storage.
- Displays Common Actions for user to click (e.g. Check Balance, Recent Transactions, Transfer Funds, etc.)
- Common Actions are configurable from backend.

Code Location: 'poc-frontend'

**NLU Service**:
- Integrates with DialogueFlow for intent recognition
- Receives user messages from Chat Backend
- Returns recognized intents and entities to MCP Host
- Fallback to NLP Service if intent confidence is low or undetected.
- Code Location: 'poc-nlu'
**NLP Service**:
- Integrates with OpenAI GPT-4 for natural language understanding
- Receives user messages from Chat Backend when NLU confidence is low or undetected.
- Returns interpreted intents and entities to MCP Host
- Code Location: 'poc-nlp'
**MCP Host**:
- Orchestrates communication between Chat Backend, NLU, NLP, and Banking APIs
- Receives intents and entities from NLU/NLP services
- Maps intents to appropriate Banking API calls
- Manages conversation context and state Location: 'poc-mcp-host'


**Agent Processing**:- Backend service for handling human agent interactions
- Receives escalated chat sessions from Chat Backend
- Manages agent responses and chat history
- Returns agent responses to Chat Backend for delivery to the user
- Code Location: 'poc-agent-processing'

**Agent Chat Frontend**:
- User interface for human agents to manage escalated chat sessions
- Displays chat messages and user inputs
- Sends agent messages to the Agent Processing backend
- Receives responses from the Agent Processing backend
- Code Location: 'poc-agent-frontend'   