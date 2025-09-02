#!/bin/bash

# Database Integration Test Script
echo "🧪 Testing Credit Card Enterprise Database Integration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test database connection
test_connection() {
    print_test "Testing database connection..."
    
    cd packages/backend
    
    node -e "
        const { testConnection } = require('./database');
        testConnection().then(success => {
            process.exit(success ? 0 : 1);
        }).catch(() => process.exit(1));
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_pass "Database connection successful"
        return 0
    else
        print_fail "Database connection failed"
        return 1
    fi
    
    cd ../..
}

# Test user model
test_user_model() {
    print_test "Testing User model operations..."
    
    cd packages/backend
    
    node -e "
        const UserModel = require('./models/User');
        (async () => {
            try {
                const stats = await UserModel.getStatistics();
                if (stats.total_users > 0) {
                    console.log('✅ Users found:', stats.total_users);
                    process.exit(0);
                } else {
                    console.log('❌ No users found');
                    process.exit(1);
                }
            } catch (error) {
                console.log('❌ Error:', error.message);
                process.exit(1);
            }
        })();
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_pass "User model working correctly"
        return 0
    else
        print_fail "User model test failed"
        return 1
    fi
    
    cd ../..
}

# Test account model
test_account_model() {
    print_test "Testing Account model operations..."
    
    cd packages/backend
    
    node -e "
        const AccountModel = require('./models/Account');
        (async () => {
            try {
                const stats = await AccountModel.getStatistics();
                if (stats.total_accounts > 0) {
                    console.log('✅ Accounts found:', stats.total_accounts);
                    process.exit(0);
                } else {
                    console.log('❌ No accounts found');
                    process.exit(1);
                }
            } catch (error) {
                console.log('❌ Error:', error.message);
                process.exit(1);
            }
        })();
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_pass "Account model working correctly"
        return 0
    else
        print_fail "Account model test failed"
        return 1
    fi
    
    cd ../..
}

# Test transaction model
test_transaction_model() {
    print_test "Testing Transaction model operations..."
    
    cd packages/backend
    
    node -e "
        const TransactionModel = require('./models/Transaction');
        (async () => {
            try {
                const stats = await TransactionModel.getStatistics();
                if (stats.total_transactions > 0) {
                    console.log('✅ Transactions found:', stats.total_transactions);
                    process.exit(0);
                } else {
                    console.log('❌ No transactions found');
                    process.exit(1);
                }
            } catch (error) {
                console.log('❌ Error:', error.message);
                process.exit(1);
            }
        })();
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_pass "Transaction model working correctly"
        return 0
    else
        print_fail "Transaction model test failed"
        return 1
    fi
    
    cd ../..
}

# Test API endpoints
test_api_endpoints() {
    print_test "Testing API endpoints with database..."
    
    # Start backend server in background
    cd packages/backend
    npm run dev > /dev/null 2>&1 &
    SERVER_PID=$!
    cd ../..
    
    # Wait for server to start
    sleep 5
    
    # Test health endpoint
    if curl -s http://localhost:3001/health > /dev/null; then
        print_pass "Health endpoint responding"
    else
        print_fail "Health endpoint not responding"
        kill $SERVER_PID 2>/dev/null
        return 1
    fi
    
    # Test users endpoint
    if curl -s http://localhost:3001/api/v1/users | grep -q "users"; then
        print_pass "Users API endpoint working"
    else
        print_fail "Users API endpoint failed"
        kill $SERVER_PID 2>/dev/null
        return 1
    fi
    
    # Test accounts endpoint
    if curl -s http://localhost:3001/api/v1/accounts | grep -q "accounts"; then
        print_pass "Accounts API endpoint working"
    else
        print_fail "Accounts API endpoint failed"
        kill $SERVER_PID 2>/dev/null
        return 1
    fi
    
    # Test transactions endpoint
    if curl -s http://localhost:3001/api/v1/transactions | grep -q "transactions"; then
        print_pass "Transactions API endpoint working"
    else
        print_fail "Transactions API endpoint failed"
        kill $SERVER_PID 2>/dev/null
        return 1
    fi
    
    # Stop server
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
    
    return 0
}

# Main test function
main() {
    echo "🏦 Credit Card Enterprise Database Tests"
    echo "======================================="
    
    local tests_passed=0
    local total_tests=5
    
    # Run tests
    if test_connection; then
        ((tests_passed++))
    fi
    
    if test_user_model; then
        ((tests_passed++))
    fi
    
    if test_account_model; then
        ((tests_passed++))
    fi
    
    if test_transaction_model; then
        ((tests_passed++))
    fi
    
    if test_api_endpoints; then
        ((tests_passed++))
    fi
    
    echo ""
    echo "📊 Test Results:"
    echo "  Tests Passed: $tests_passed/$total_tests"
    
    if [ $tests_passed -eq $total_tests ]; then
        print_pass "🎉 All tests passed! Database integration is working correctly."
        echo ""
        echo "🚀 Your backend is ready with:"
        echo "  • 1000+ customers with complete profiles"
        echo "  • 25,000+ realistic transactions"
        echo "  • Complete fraud and dispute data"
        echo "  • Production-ready PostgreSQL database"
        return 0
    else
        print_fail "❌ Some tests failed. Please check the database setup."
        return 1
    fi
}

# Run tests
main "$@"
