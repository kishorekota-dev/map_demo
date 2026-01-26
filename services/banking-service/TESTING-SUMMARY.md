# POC Banking - Testing Summary

## Quick Start

The POC Banking system now includes comprehensive end-to-end API testing with multiple test runners and detailed reporting.

## Available Test Scripts

### 1. Complete Setup and Test (Recommended for First Time)

```bash
cd poc-banking-service
./setup-and-test.sh
```

**What it does:**
- ✅ Checks prerequisites (Docker, curl, etc.)
- ✅ Starts all services via Docker Compose
- ✅ Waits for services to be healthy
- ✅ Installs test dependencies
- ✅ Runs comprehensive test suite
- ✅ Generates HTML and JSON reports

### 2. Quick Test Runner (Services Already Running)

```bash
cd poc-banking-service
./run-tests.sh
```

**Options:**
1. Bash test suite (comprehensive, uses cURL)
2. Node.js test suite (better error handling)
3. Both test suites

### 3. Manual Test Execution

#### Bash Tests
```bash
cd poc-banking-service/tests
./e2e-api-test.sh
```

#### Node.js Tests
```bash
cd poc-banking-service/tests
npm test
```

## Test Coverage

### Test Suites

1. **Customer Management (REST API)** - 13 tests
   - Create customers (multiple scenarios)
   - Retrieve customers (by ID, list, pagination)
   - Update customer information
   - KYC verification workflow
   - Filter and search operations
   - Duplicate detection

2. **BIAN API - Party Reference Data Management** - 6 tests
   - Initiate Party Reference Profile
   - Retrieve Party Reference Profile
   - Update Party Reference Profile
   - Control actions (suspend, activate, block)

3. **Validation & Error Handling** - 5 tests
   - Missing required fields
   - Invalid email format
   - Invalid date format
   - Non-existent customer (404)
   - Update non-existent customer (404)

4. **Performance & Load Testing** - 11 tests
   - Rapid customer creation (10 customers)
   - Large pagination requests

5. **Integration Testing** - 6 tests
   - Complete customer lifecycle
   - Create → Retrieve → Update → Verify KYC → Suspend → Activate

**Total Tests: ~35-40 tests**

## Test Data

Pre-defined test customers:

| Name | Email | Role | KYC Status |
|------|-------|------|------------|
| John Doe | john.doe@example.com | Primary Test User | VERIFIED |
| Jane Smith | jane.smith@example.com | Secondary Test User | IN_PROGRESS |
| Robert Johnson | robert.johnson@example.com | High Value Customer | VERIFIED |
| Emily Williams | emily.williams@example.com | BIAN Test User | PENDING |
| Michael Brown | michael.brown@example.com | International Customer | PENDING |
| Maria Garcia | maria.garcia@example.com | VIP Customer | PENDING |

Additional test data in: `tests/test-data.json`

## Test Results

### Output Formats

1. **Console Output**: Real-time colored test results
2. **HTML Report**: `test-results/report_TIMESTAMP.html`
3. **JSON Report**: `test-results/test-results-TIMESTAMP.json` (Node.js only)
4. **Test Log**: `test-results/test_run_TIMESTAMP.log` (Bash only)
5. **Individual Responses**: `test-results/{test_name}_response.json`

### Viewing Results

```bash
# View latest HTML report
open poc-banking-service/tests/test-results/report_*.html

# View test log
cat poc-banking-service/tests/test-results/test_run_*.log

# View JSON results
cat poc-banking-service/tests/test-results/test-results-*.json | jq '.'

# View specific test response
cat poc-banking-service/tests/test-results/Create_Customer_John_Doe_response.json | jq '.'
```

## API Endpoints Tested

### REST API

| Method | Endpoint | Description | Expected Status |
|--------|----------|-------------|----------------|
| POST | /customers | Create customer | 201 |
| GET | /customers | Get all customers | 200 |
| GET | /customers/:id | Get customer by ID | 200 |
| PUT | /customers/:id | Update customer | 200 |
| GET | /customers/:id/kyc | Get KYC status | 200 |
| POST | /customers/:id/kyc/verify | Verify KYC | 200 |
| GET | /customers?status=ACTIVE | Filter by status | 200 |
| GET | /customers?kyc_status=VERIFIED | Filter by KYC | 200 |
| GET | /customers?page=1&limit=10 | Pagination | 200 |

### BIAN API

| Method | Endpoint | Description | Expected Status |
|--------|----------|-------------|----------------|
| POST | /sd-party-reference-data-management/v1/party-reference-profile/initiate | Create party profile | 201 |
| GET | /sd-party-reference-data-management/v1/party-reference-profile/:id/retrieve | Get party profile | 200 |
| PUT | /sd-party-reference-data-management/v1/party-reference-profile/:id/update | Update party profile | 200 |
| PUT | /sd-party-reference-data-management/v1/party-reference-profile/:id/control?action=suspend | Suspend customer | 200 |
| PUT | /sd-party-reference-data-management/v1/party-reference-profile/:id/control?action=activate | Activate customer | 200 |
| PUT | /sd-party-reference-data-management/v1/party-reference-profile/:id/control?action=block | Block customer | 200 |

## Expected Test Results

When all services are healthy:

- **Total Tests**: 35-40
- **Pass Rate**: 95-100%
- **Failed Tests**: 0 (all error tests validate correctly)
- **Execution Time**: 20-30 seconds

## Troubleshooting

### Services Not Starting

```bash
# Check Docker
docker ps

# Check logs
docker-compose -f docker-compose-banking.yml logs

# Restart services
docker-compose -f docker-compose-banking.yml restart
```

### Test Failures

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3010/health

# Check database
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT COUNT(*) FROM customers;"

# Clear test data
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "DELETE FROM customers WHERE email LIKE '%example.com';"
```

### Missing Dependencies

```bash
# Install jq (for Bash tests)
# macOS
brew install jq

# Linux
sudo apt-get install jq

# Install bc (for calculations)
# Usually pre-installed on most systems

# Install Node.js dependencies
cd tests
npm install
```

## Test Validation

### What Gets Validated

1. **HTTP Status Codes**: Every request checks for expected status
2. **Response Structure**: JSON schema validation
3. **Data Integrity**: Field presence and data types
4. **Business Logic**: KYC workflows, status transitions
5. **Error Handling**: Proper error messages and codes
6. **BIAN Compliance**: Control records, metadata, actions

### Assertions Checked

- ✅ Customer creation returns 201 with valid ID
- ✅ Duplicate email returns 409 conflict
- ✅ Missing required fields return 400
- ✅ Invalid email format returns 400
- ✅ Non-existent customer returns 404
- ✅ KYC verification updates status correctly
- ✅ Customer status control actions work
- ✅ Pagination returns correct structure
- ✅ BIAN responses include controlRecordId
- ✅ BIAN responses include metadata with timestamp

## Performance Benchmarks

Expected response times (local Docker):

| Operation | Expected Time |
|-----------|--------------|
| Create Customer | < 100ms |
| Get Customer | < 50ms |
| Update Customer | < 100ms |
| List Customers | < 200ms |
| KYC Verification | < 100ms |
| Bulk Operations | < 2s for 10 customers |

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
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Start Services
        run: |
          cd poc-banking-service
          docker-compose -f docker-compose-banking.yml up -d
      
      - name: Wait for Services
        run: |
          timeout 60 bash -c 'until curl -s -f http://localhost:3001/health > /dev/null; do sleep 2; done'
      
      - name: Run Tests
        run: |
          cd poc-banking-service
          ./setup-and-test.sh
      
      - name: Upload Test Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: poc-banking-service/tests/test-results/
      
      - name: Cleanup
        if: always()
        run: |
          cd poc-banking-service
          docker-compose -f docker-compose-banking.yml down -v
```

## Test Data Cleanup

```bash
# Clean all test data
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "
  DELETE FROM customer_preferences WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE '%example.com');
  DELETE FROM customers WHERE email LIKE '%example.com';
"

# Or reset entire database
docker-compose -f docker-compose-banking.yml down -v
docker-compose -f docker-compose-banking.yml up -d
```

## Adding New Tests

### Bash Test Example

Edit `tests/e2e-api-test.sh`:

```bash
# Test X.X: Your Test Description
log_info "Test X.X: Your Test Description"
run_test "Test Name" "POST" "$API_GATEWAY/endpoint" '{
  "field": "value"
}' "201"

if [ condition ]; then
  log_success "Additional validation passed"
else
  log_error "Additional validation failed"
fi
```

### Node.js Test Example

Edit `tests/e2e-api-test.js`:

```javascript
const result = await runTest(
  'Your Test Name',
  'POST',
  `${CONFIG.apiGateway}/endpoint`,
  { field: 'value' },
  201
);

const id = result.success ? result.data?.data?.id : null;
logInfo(`Extracted ID: ${id}`);
```

## Best Practices

1. ✅ **Always run tests on clean database** or with cleanup
2. ✅ **Check service health** before running tests
3. ✅ **Review test results** in detail, not just pass/fail count
4. ✅ **Save correlation IDs** from failed tests for debugging
5. ✅ **Run tests before deploying** to any environment
6. ✅ **Use test data generators** for large datasets
7. ✅ **Validate both happy path and error scenarios**
8. ✅ **Check response times** for performance regression

## Summary

The POC Banking system now has:

✅ **2 Test Runners**: Bash (cURL) and Node.js (Axios)
✅ **3 Quick Scripts**: setup-and-test.sh, run-tests.sh, individual runners
✅ **5 Test Suites**: Customer Management, BIAN API, Validation, Performance, Integration
✅ **35-40 Tests**: Covering all implemented endpoints
✅ **Multiple Report Formats**: Console, HTML, JSON, Log files
✅ **Comprehensive Validation**: Status codes, response structure, business logic
✅ **CI/CD Ready**: Easy integration with GitHub Actions

## Next Steps

1. Run the tests: `./setup-and-test.sh`
2. Review HTML report
3. Check for any failures
4. Add more test scenarios as needed
5. Integrate into CI/CD pipeline

---

**Created**: October 5, 2025
**Version**: 1.0.0
