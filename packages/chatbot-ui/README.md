# Enterprise Banking ChatBot UI

A comprehensive conversational AI interface for enterprise banking operations, built with React, Next.js, and integrated with DialogFlow NLP, LangChain agents, and Model Context Protocol (MCP) for seamless backend API communication.

## Features

### 🤖 Advanced AI Integration
- **DialogFlow NLP**: Natural language understanding for banking conversations
- **LangChain Agents**: Intelligent conversation management with context retention
- **Intent Detection**: Automatic categorization of banking requests and queries
- **Context Management**: Maintains conversation history and user session state

### 🏦 Enterprise Banking Capabilities
- **Account Management**: View balances, statements, and account details
- **Transaction Processing**: Transfer funds, view transaction history
- **Payment Services**: Bill payments, beneficiary management
- **Card Services**: Card management, activation, blocking
- **Fraud Detection**: Real-time fraud monitoring and alerts
- **Dispute Management**: Transaction dispute handling and resolution

### 🔗 MCP Integration
- **33 Banking Operations**: Complete coverage of enterprise banking APIs
- **Real-time Communication**: Direct integration with backend services
- **Secure Protocol**: End-to-end encrypted communication
- **Error Handling**: Comprehensive error management and recovery

### 🎨 User Experience
- **Responsive Design**: Works seamlessly across desktop and mobile
- **Quick Actions**: Pre-defined banking operations for faster access
- **Authentication**: Secure user authentication with demo credentials
- **Real-time Updates**: Live conversation updates and status indicators

## Technology Stack

### Frontend
- **React 18**: Modern React with hooks and functional components
- **Next.js 14**: Full-stack React framework with API routes
- **TypeScript**: Type-safe development environment
- **Tailwind CSS**: Utility-first CSS framework for styling

### AI & NLP
- **Google DialogFlow**: Natural language processing and intent detection
- **LangChain**: Large language model orchestration and agents
- **Context Management**: Conversation state and session handling

### Backend Integration
- **Model Context Protocol (MCP)**: Direct backend API communication
- **RESTful APIs**: Enterprise banking service integration
- **WebSocket Support**: Real-time communication capabilities

## Getting Started

### Prerequisites
- Node.js 18 or later
- npm or yarn package manager
- Google Cloud Project (for DialogFlow)
- Enterprise Banking API access

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd packages/chatbot-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Set up DialogFlow**
   - Create a Google Cloud Project
   - Enable DialogFlow API
   - Create a service account and download credentials
   - Configure intents in DialogFlow console

5. **Start the development server**
   ```bash
   npm run dev
   ```

### Environment Configuration

Create a `.env.local` file with the following variables:

```env
# DialogFlow Configuration
GOOGLE_PROJECT_ID=your-dialogflow-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json

# MCP Server Configuration
MCP_SERVER_URL=http://localhost:3001
MCP_SERVER_API_KEY=your-api-key

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret
```

## Architecture

### Component Structure
```
src/
├── components/          # React UI components
│   ├── ChatBot.tsx     # Main chat interface
│   ├── MessageList.tsx # Message display
│   ├── MessageInput.tsx# Input component
│   └── QuickActions.tsx# Banking shortcuts
├── services/           # Business logic services
│   ├── dialogflow.ts   # NLP integration
│   ├── mcp-client.ts   # Backend API client
│   └── chatbot.ts      # Main orchestration
├── agents/             # LangChain conversation agents
│   └── banking-agent.ts# Banking-specific logic
├── types/              # TypeScript definitions
│   └── index.ts        # Type definitions
└── utils/              # Utility functions
    └── store.ts        # State management
```

### Data Flow
1. **User Input** → Message typed in chat interface
2. **DialogFlow NLP** → Intent detection and parameter extraction
3. **LangChain Agent** → Action planning and context management
4. **MCP Client** → Backend API communication
5. **Response Generation** → Formatted response to user

## Usage

### Basic Chat
1. Open the application in your browser
2. Click "Sign In" and use demo credentials
3. Type banking questions or requests
4. Use quick action buttons for common operations

### Banking Operations
- **Check Balance**: "What's my account balance?"
- **Transfer Money**: "Transfer $500 to John's account"
- **View Transactions**: "Show my recent transactions"
- **Pay Bills**: "Pay my electricity bill"
- **Card Management**: "Block my credit card"

### Quick Actions
- Account Balance
- Recent Transactions
- Transfer Money
- Pay Bills
- Card Services
- Customer Support

## Development

### Project Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

### Code Style
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- Tailwind CSS for styling

### Testing
```bash
npm run test         # Run unit tests
npm run test:e2e     # Run end-to-end tests
npm run test:coverage# Generate coverage report
```

## API Integration

### MCP Client Methods
The MCP client provides 33 banking operations organized in categories:

#### Authentication
- `authenticate(credentials)`
- `refreshToken()`
- `logout()`

#### Customer Management
- `getCustomerProfile()`
- `updateCustomerProfile(data)`
- `getCustomerDocuments()`

#### Account Operations
- `getAccounts()`
- `getAccountBalance(accountId)`
- `getAccountStatement(accountId, period)`
- `openAccount(data)`
- `closeAccount(accountId)`

#### Transaction Services
- `getTransactionHistory(accountId, period)`
- `transferMoney(fromAccount, toAccount, amount)`
- `scheduleTransfer(transferData)`

#### Payment Services
- `payBill(paymentData)`
- `addBeneficiary(beneficiaryData)`
- `getBeneficiaries()`

#### Card Management
- `getCards()`
- `activateCard(cardId)`
- `blockCard(cardId)`
- `requestCard(cardType)`

#### Fraud & Security
- `reportFraud(fraudData)`
- `checkFraudStatus(transactionId)`
- `updateSecuritySettings(settings)`

## Deployment

### Production Build
```bash
npm run build
npm run start
```

### Environment Variables
Ensure all production environment variables are configured:
- DialogFlow project credentials
- MCP server endpoints
- Authentication secrets
- API keys and tokens

### Security Considerations
- Use HTTPS in production
- Secure API endpoints
- Implement rate limiting
- Validate all user inputs
- Use secure session management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Check the documentation
- Review the troubleshooting guide
- Contact the development team
- Submit an issue on GitHub

## Changelog

### Version 1.0.0
- Initial release with full ChatBot functionality
- DialogFlow NLP integration
- MCP client with 33 banking operations
- LangChain conversation agents
- Complete React UI with authentication
- Next.js application framework
- Comprehensive TypeScript definitions
