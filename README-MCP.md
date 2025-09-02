# Credit Card Enterprise MCP Server

A Model Context Protocol (MCP) server that provides tools to interact with the Credit Card Enterprise API. This server enables AI assistants and other clients to perform operations on credit card accounts, transactions, fraud cases, and more through a standardized protocol.

## Features

The MCP server provides the following tools:

### Authentication
- **authenticate**: Login to get access token for API access

### Account Management
- **get_accounts**: Retrieve user accounts with filtering and pagination
- **create_account**: Create new credit card accounts
- **get_account_details**: Get detailed information about specific accounts

### Transaction Management
- **get_transactions**: Retrieve transactions with comprehensive filtering
- **create_transaction**: Create new transactions

### Card Management
- **get_cards**: Retrieve credit/debit cards
- **create_card**: Create new credit or debit cards

### Fraud Management
- **get_fraud_cases**: Retrieve fraud cases with filtering
- **create_fraud_case**: Create new fraud cases

### Dispute Management
- **get_disputes**: Retrieve dispute cases

### System Health
- **health_check**: Check API server health status

## Prerequisites

- Node.js (v14 or higher)
- Running Credit Card Enterprise API server
- MCP SDK dependencies

## Installation

1. **Install dependencies:**
   ```bash
   chmod +x setup-mcp.sh
   ./setup-mcp.sh
   ```

2. **Or install manually:**
   ```bash
   npm install @modelcontextprotocol/sdk axios
   ```

## Configuration

### Environment Variables

- `API_BASE_URL`: Base URL for the Credit Card API (default: `http://localhost:3000/api/v1`)

### MCP Configuration

The server can be configured in your MCP client using the `mcp-config.json` file:

```json
{
  "mcpServers": {
    "credit-card-enterprise": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api/v1"
      }
    }
  }
}
```

## Usage

### Starting the Server

1. **Start the Credit Card API server:**
   ```bash
   npm start
   ```

2. **Start the MCP server:**
   ```bash
   node mcp-server.js
   ```

The MCP server communicates via stdio and will be ready to receive requests.

### Testing

Run the test script to validate functionality:

```bash
chmod +x test-mcp.sh
./test-mcp.sh
```

## Tool Examples

### Authentication

```json
{
  "name": "authenticate",
  "arguments": {
    "email": "user@example.com",
    "password": "password123"
  }
}
```

### Get Accounts

```json
{
  "name": "get_accounts",
  "arguments": {
    "page": 1,
    "limit": 10,
    "status": "ACTIVE",
    "accountType": "CREDIT"
  }
}
```

### Create Account

```json
{
  "name": "create_account",
  "arguments": {
    "accountType": "CREDIT",
    "creditLimit": 5000
  }
}
```

### Get Transactions

```json
{
  "name": "get_transactions",
  "arguments": {
    "page": 1,
    "limit": 20,
    "accountId": "acc_123456",
    "status": "COMPLETED",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

### Create Transaction

```json
{
  "name": "create_transaction",
  "arguments": {
    "accountId": "acc_123456",
    "amount": 100.50,
    "type": "DEBIT",
    "description": "Coffee shop purchase",
    "category": "Food & Dining"
  }
}
```

### Create Fraud Case

```json
{
  "name": "create_fraud_case",
  "arguments": {
    "accountId": "acc_123456",
    "description": "Suspicious transaction detected",
    "priority": "HIGH",
    "riskScore": 85,
    "category": "Unauthorized Transaction"
  }
}
```

## Architecture

The MCP server acts as a bridge between MCP clients and the Credit Card Enterprise API:

```
MCP Client → MCP Server → Credit Card API
```

### Components

1. **MCP Server** (`mcp-server.js`): Main server implementing the Model Context Protocol
2. **Tool Handlers**: Individual functions for each API operation
3. **Authentication Manager**: Handles API authentication and token management
4. **Request Manager**: Makes HTTP requests to the backend API

### Security

- All API requests (except authentication and health check) require a valid JWT token
- The server securely manages authentication tokens
- Input validation is performed on all tool arguments
- Error handling prevents sensitive information leakage

## Error Handling

The server provides comprehensive error handling:

- **Authentication errors**: Invalid credentials or expired tokens
- **Validation errors**: Invalid input parameters
- **API errors**: Backend API failures with detailed error messages
- **Network errors**: Connection issues with the backend API

## Development

### File Structure

```
├── mcp-server.js           # Main MCP server implementation
├── mcp-config.json         # MCP client configuration
├── mcp-package.json        # MCP-specific dependencies
├── setup-mcp.sh           # Setup script
├── test-mcp.sh            # Test script
└── README-MCP.md          # This documentation
```

### Adding New Tools

1. Add the tool definition to the `ListToolsRequestSchema` handler
2. Implement the tool handler in the `CallToolRequestSchema` handler
3. Create the corresponding method in the `CreditCardMCPServer` class
4. Update this documentation

### Testing

The test suite validates:
- MCP server startup and communication
- Tool availability and schema validation
- Basic API connectivity
- Error handling

## Troubleshooting

### Common Issues

1. **"Connection refused" errors**
   - Ensure the Credit Card API server is running on the correct port
   - Check the `API_BASE_URL` configuration

2. **Authentication failures**
   - Verify the API server has valid test users
   - Check that the authentication endpoint is working

3. **MCP communication issues**
   - Ensure the MCP SDK is properly installed
   - Verify the server is reading from stdin correctly

### Debugging

Enable debug logging by setting environment variables:

```bash
DEBUG=* node mcp-server.js
```

## License

MIT License - see the main project LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the Credit Card API documentation
3. Submit an issue with detailed reproduction steps
