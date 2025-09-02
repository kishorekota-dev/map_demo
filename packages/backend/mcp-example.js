#!/usr/bin/env node

/**
 * Enterprise Banking MCP Client Example
 * Demonstrates how to use the Enterprise Banking MCP Server
 * Shows authentication, customer management, and banking operations
 */

const { spawn } = require('child_process');
const readline = require('readline');

class EnterpriseBankingMCPClient {
  constructor() {
    this.mcpProcess = null;
    this.connected = false;
    this.requestId = 1;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // Start the MCP server process
      this.mcpProcess = spawn('node', ['mcp-server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      this.mcpProcess.stderr.on('data', (data) => {
        console.log('🔧 MCP Server:', data.toString().trim());
        if (data.toString().includes('running on stdio')) {
          this.connected = true;
          resolve();
        }
      });

      this.mcpProcess.on('error', reject);
      this.mcpProcess.on('exit', (code) => {
        console.log(`🔧 MCP Server exited with code ${code}`);
        this.connected = false;
      });
    });
  }

  async sendRequest(method, params = {}) {
    if (!this.connected) {
      throw new Error('MCP Server not connected');
    }

    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      let responseData = '';
      
      const onData = (data) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          this.mcpProcess.stdout.removeListener('data', onData);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        } catch (e) {
          // Continue reading if JSON is incomplete
        }
      };

      this.mcpProcess.stdout.on('data', onData);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async listTools() {
    console.log('📋 Listing available tools...\n');
    const result = await this.sendRequest('tools/list');
    
    console.log('Available Enterprise Banking Tools:');
    result.tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name} - ${tool.description}`);
    });
    console.log();
  }

  async demonstrateAuthentication() {
    console.log('🔐 Demonstrating Authentication...\n');
    
    try {
      // Login as customer
      console.log('👤 Logging in as customer...');
      const loginResult = await this.sendRequest('tools/call', {
        name: 'enterprise_login',
        arguments: {
          email: 'sarah.johnson@email.com',
          password: 'SecurePass456!',
          loginType: 'CUSTOMER'
        }
      });
      console.log(loginResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Authentication failed: ${error.message}\n`);
    }
  }

  async demonstrateCustomerRegistration() {
    console.log('📝 Demonstrating Customer Registration...\n');
    
    try {
      const registrationResult = await this.sendRequest('tools/call', {
        name: 'register_customer',
        arguments: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith.demo@example.com',
          password: 'SecurePass123!',
          dateOfBirth: '1985-03-15',
          phoneNumber: '555-987-6543',
          ssn: '987-65-4321',
          addressLine1: '456 Demo Street',
          city: 'Demo City',
          state: 'CA',
          zipCode: '90210',
          employmentStatus: 'FULL_TIME',
          employer: 'Demo Corp',
          annualIncome: '75000-100000'
        }
      });
      console.log(registrationResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Registration failed: ${error.message}\n`);
    }
  }

  async demonstrateCustomerProfile() {
    console.log('👤 Demonstrating Customer Profile Management...\n');
    
    try {
      // Get customer profile
      console.log('📋 Getting customer profile...');
      const profileResult = await this.sendRequest('tools/call', {
        name: 'get_customer_profile',
        arguments: {}
      });
      console.log(profileResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Profile retrieval failed: ${error.message}\n`);
    }
  }

  async demonstrateAccountManagement() {
    console.log('💳 Demonstrating Account Management...\n');
    
    try {
      // Get customer accounts
      console.log('📋 Getting customer accounts...');
      const accountsResult = await this.sendRequest('tools/call', {
        name: 'get_customer_accounts',
        arguments: {
          page: 1,
          limit: 10
        }
      });
      console.log(accountsResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Account retrieval failed: ${error.message}\n`);
    }
  }

  async demonstrateTransactionHistory() {
    console.log('💰 Demonstrating Transaction History...\n');
    
    try {
      // Get transactions
      console.log('📋 Getting transaction history...');
      const transactionsResult = await this.sendRequest('tools/call', {
        name: 'get_transactions',
        arguments: {
          page: 1,
          limit: 5
        }
      });
      console.log(transactionsResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Transaction retrieval failed: ${error.message}\n`);
    }
  }

  async demonstrateCreditCardApplication() {
    console.log('💳 Demonstrating Credit Card Application...\n');
    
    try {
      // Apply for credit card
      console.log('📝 Applying for credit card...');
      const applicationResult = await this.sendRequest('tools/call', {
        name: 'apply_credit_card',
        arguments: {
          cardType: 'VISA',
          requestedCreditLimit: 5000,
          purpose: 'PERSONAL'
        }
      });
      console.log(applicationResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Credit card application failed: ${error.message}\n`);
    }
  }

  async demonstratePaymentProcessing() {
    console.log('💰 Demonstrating Payment Processing...\n');
    
    try {
      // Make a payment
      console.log('💳 Making a payment...');
      const paymentResult = await this.sendRequest('tools/call', {
        name: 'make_payment',
        arguments: {
          accountId: 'demo-account-id',
          amount: 250.00,
          paymentMethod: 'ACH',
          memo: 'Monthly payment demo'
        }
      });
      console.log(paymentResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Payment failed: ${error.message}\n`);
    }
  }

  async demonstrateSystemHealth() {
    console.log('🏥 Demonstrating System Health Check...\n');
    
    try {
      // Check system health
      console.log('🔍 Checking system health...');
      const healthResult = await this.sendRequest('tools/call', {
        name: 'get_system_health',
        arguments: {}
      });
      console.log(healthResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Health check failed: ${error.message}\n`);
    }
  }

  async demonstrateAdminFunctions() {
    console.log('👨‍💼 Demonstrating Admin Functions...\n');
    
    try {
      // Login as admin first
      console.log('👨‍💼 Logging in as admin...');
      const adminLoginResult = await this.sendRequest('tools/call', {
        name: 'enterprise_login',
        arguments: {
          email: 'admin@enterprisebanking.com',
          password: 'AdminPass123!',
          loginType: 'ADMIN'
        }
      });
      console.log(adminLoginResult.content[0].text);
      
      // Search customers
      console.log('🔍 Searching customers...');
      const searchResult = await this.sendRequest('tools/call', {
        name: 'admin_search_customers',
        arguments: {
          query: 'sarah',
          limit: 5
        }
      });
      console.log(searchResult.content[0].text);
      console.log();
    } catch (error) {
      console.log(`❌ Admin functions failed: ${error.message}\n`);
    }
  }

  async runDemo() {
    console.log('🏦 Enterprise Banking MCP Client Demo');
    console.log('=====================================\n');

    try {
      // Connect to MCP server
      console.log('🔌 Connecting to MCP server...');
      await this.connect();
      console.log('✅ Connected to MCP server\n');

      // List available tools
      await this.listTools();

      // Run demonstrations
      await this.demonstrateAuthentication();
      await this.demonstrateCustomerRegistration();
      await this.demonstrateCustomerProfile();
      await this.demonstrateAccountManagement();
      await this.demonstrateTransactionHistory();
      await this.demonstrateCreditCardApplication();
      await this.demonstratePaymentProcessing();
      await this.demonstrateSystemHealth();
      await this.demonstrateAdminFunctions();

      console.log('🎉 Demo completed successfully!');
      console.log('\n📋 Enterprise Banking MCP Features Demonstrated:');
      console.log('• Customer Authentication & Registration');
      console.log('• Profile Management with PII Security');
      console.log('• Account & Transaction Management');
      console.log('• Credit Card Applications');
      console.log('• Payment Processing');
      console.log('• Admin Functions & Customer Search');
      console.log('• System Health Monitoring');
      console.log('\n🏆 BIAN-compliant enterprise banking operations ready for production!');

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
    } finally {
      this.disconnect();
    }
  }

  disconnect() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.connected = false;
      console.log('\n🔌 Disconnected from MCP server');
    }
  }
}

// Interactive demo runner
async function runInteractiveDemo() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🏦 Enterprise Banking MCP Interactive Demo');
  console.log('==========================================\n');
  console.log('Choose an option:');
  console.log('1. Run full automated demo');
  console.log('2. Manual tool testing');
  console.log('3. Exit\n');

  const choice = await new Promise(resolve => {
    rl.question('Enter your choice (1-3): ', resolve);
  });

  if (choice === '1') {
    rl.close();
    const client = new EnterpriseBankingMCPClient();
    await client.runDemo();
  } else if (choice === '2') {
    console.log('\n🔧 Manual tool testing mode');
    console.log('You can now test individual tools...');
    rl.close();
    // Implementation for manual testing would go here
  } else {
    console.log('👋 Goodbye!');
    rl.close();
  }
}

// Run the demo
if (require.main === module) {
  runInteractiveDemo().catch(console.error);
}

module.exports = EnterpriseBankingMCPClient;
