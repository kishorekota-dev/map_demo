# POC Banking - API Testing Guide

## Overview

This directory contains comprehensive end-to-end API tests for the POC Banking system. Tests validate both REST and BIAN-compliant APIs.

## Test Files

- **e2e-api-test.sh**: Bash-based test suite using cURL
- **e2e-api-test.js**: Node.js-based test suite using Axios
- **test-data.json**: Test data and scenarios
- **package.json**: Node.js dependencies

## Prerequisites

### For Bash Tests
- bash
- curl
- jq (for JSON processing)
- bc (for calculations)

### For Node.js Tests
- Node.js 18+
- npm

## Installation

```bash
# Install Node.js dependencies
cd tests
npm install
```

## Running Tests

### Option 1: Bash Script (Recommended for CI/CD)

```bash
# Make executable
chmod +x e2e-api-test.sh

# Run tests
./e2e-api-test.sh
```

### Option 2: Node.js Script (Better error handling)

```bash
# Run with npm
npm test

# Or run directly
node e2e-api-test.js
```

### Option 3: Watch Mode (Development)

```bash
npm run test:watch
```

## Test Suites

### 1. Customer Management (REST API)
Tests standard REST endpoints for customer operations:
- Create customers (multiple scenarios)
- Retrieve customers (by ID, list, pagination)
- Update customer information
- KYC verification workflow
- Filter and search operations

### 2. BIAN API - Party Reference Data Management
Tests BIAN-compliant endpoints:
- Initiate Party Reference Profile
- Retrieve Party Reference Profile
- Update Party Reference Profile
- Control actions (activate, suspend, block, close)

### 3. Validation & Error Handling
Tests error scenarios:
- Missing required fields
- Invalid data formats
- Duplicate entries
- Non-existent resources
- Invalid IDs

### 4. Performance & Load Testing
Tests system under load:
- Rapid customer creation (bulk operations)
- Large pagination requests
- Concurrent requests

### 5. Integration Testing
Tests complete workflows:
- Full customer lifecycle (create → retrieve → update → verify → suspend → activate)
- Cross-service operations
- State transitions

## Test Data

### Sample Customers

1. **John Doe** - Primary test user
   - Email: john.doe@example.com
   - Phone: +15551234567
   - Status: ACTIVE
   - KYC: VERIFIED

2. **Jane Smith** - Secondary test user
   - Email: jane.smith@example.com
   - Phone: +15559876543
   - Status: ACTIVE
   - KYC: IN_PROGRESS

3. **Robert Johnson** - High value customer
   - Email: robert.johnson@example.com
   - Phone: +15555555555
   - Status: ACTIVE
   - KYC: VERIFIED

4. **Emily Williams** - BIAN test user
   - Email: emily.williams@example.com
   - Phone: +15556789012
   - Status: ACTIVE
   - KYC: PENDING

## Test Results

Results are saved in the `test-results/` directory:

- **test_run_TIMESTAMP.log**: Detailed test execution log
- **report_TIMESTAMP.html**: HTML test report
- **test-results-TIMESTAMP.json**: JSON format results (Node.js tests)
- **{test_name}_response.json**: Individual test responses

### Viewing Results

```bash
# View latest log
cat test-results/test_run_*.log | tail -n 50

# Open HTML report
open test-results/report_*.html

# View JSON results
cat test-results/test-results-*.json | jq '.'
```

## Expected Test Results

When all services are healthy:
- **Total Tests**: ~35-40
- **Expected Pass Rate**: 95-100%
- **Expected Failures**: 0 (all error tests should pass validation)

## Troubleshooting

### Services Not Running

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3010/health

# Start services
cd ..
docker-compose -f docker-compose-banking.yml up -d
```

### Connection Refused

```bash
# Check if ports are available
lsof -i :3001
lsof -i :3010

# Check Docker containers
docker ps | grep banking
```

### Database Errors

```bash
# Check PostgreSQL
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT COUNT(*) FROM customers;"

# View logs
docker-compose -f ../docker-compose-banking.yml logs postgres
```

### Test Failures

1. Check service logs:
   ```bash
   docker-compose -f ../docker-compose-banking.yml logs customer-service
   ```

2. Verify database state:
   ```bash
   docker exec -it poc-banking-postgres psql -U banking_user -d customer_db
   \dt
   SELECT * FROM customers LIMIT 5;
   ```

3. Check for duplicate data:
   ```bash
   # Clear test data
   docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "DELETE FROM customers WHERE email LIKE '%example.com';"
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Start services
        run: docker-compose -f poc-banking-service/docker-compose-banking.yml up -d
      - name: Wait for services
        run: sleep 30
      - name: Run tests
        run: |
          cd poc-banking-service/tests
          chmod +x e2e-api-test.sh
          ./e2e-api-test.sh
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: poc-banking-service/tests/test-results/
```

## Custom Test Configuration

Set environment variables to customize test behavior:

```bash
# Custom API endpoints
export API_GATEWAY=http://api.example.com
export CUSTOMER_SERVICE=http://customer.example.com

# Run tests
./e2e-api-test.sh
```

## Adding New Tests

### Bash Script

Add test to `e2e-api-test.sh`:

```bash
# Test X.X: Your Test Name
log_info "Test X.X: Your Test Name"
run_test "Your Test Name" "POST" "$API_GATEWAY/your-endpoint" '{
  "field": "value"
}' "201"
```

### Node.js Script

Add test to `e2e-api-test.js`:

```javascript
await runTest(
  'Your Test Name',
  'POST',
  `${CONFIG.apiGateway}/your-endpoint`,
  { field: 'value' },
  201
);
```

## Performance Benchmarks

Expected response times (running locally):
- Customer creation: < 100ms
- Customer retrieval: < 50ms
- Customer update: < 100ms
- List operations: < 200ms

## Security Testing

Tests include:
- Input validation
- SQL injection prevention (parameterized queries)
- Email format validation
- Date format validation
- UUID format validation

## Test Coverage

Current coverage:
- ✅ REST API endpoints (100%)
- ✅ BIAN API endpoints (100%)
- ✅ Validation rules (100%)
- ✅ Error handling (100%)
- ✅ Customer lifecycle (100%)
- 🔄 Account operations (pending)
- 🔄 Card operations (pending)
- 🔄 Payment operations (pending)
- 🔄 Fraud detection (pending)

## Best Practices

1. **Clean State**: Run tests on a clean database or use cleanup scripts
2. **Idempotency**: Tests should be repeatable without side effects
3. **Isolation**: Each test should be independent
4. **Assertions**: Always check both status code and response body
5. **Logging**: Enable verbose logging for debugging
6. **Timeouts**: Set appropriate timeouts for API calls

## Support

For issues or questions:
1. Check test logs in `test-results/`
2. Verify services are running
3. Check database connectivity
4. Review API documentation

---

**Last Updated**: October 5, 2025
**Version**: 1.0.0
