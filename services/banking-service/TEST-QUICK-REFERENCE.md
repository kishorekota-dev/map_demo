# POC Banking - Quick Test Reference Card

## 🚀 Quick Start (First Time)

```bash
cd poc-banking-service
./setup-and-test.sh
```

This will:
1. Start all services
2. Wait for health checks
3. Run comprehensive tests
4. Generate reports

## 📊 Run Tests (Services Already Running)

```bash
cd poc-banking-service
./run-tests.sh
```

Choose:
- 1 = Bash tests (cURL)
- 2 = Node.js tests (Axios)
- 3 = Both

## 🔍 Check Service Status

```bash
cd poc-banking-service
./check-status.sh
```

## 📋 Manual Test Commands

### Bash Tests
```bash
cd poc-banking-service/tests
./e2e-api-test.sh
```

### Node.js Tests
```bash
cd poc-banking-service/tests
npm test
```

## 🌐 Test Endpoints Manually

### Create Customer
```bash
curl -X POST http://localhost:3001/customers \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "+15551234567",
    "dateOfBirth": "1990-01-01"
  }'
```

### Get All Customers
```bash
curl http://localhost:3001/customers
```

### Get Customer by ID
```bash
curl http://localhost:3001/customers/{customer-id}
```

### Update Customer
```bash
curl -X PUT http://localhost:3001/customers/{customer-id} \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

### Verify KYC
```bash
curl -X POST http://localhost:3001/customers/{customer-id}/kyc/verify \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VERIFIED",
    "verifiedBy": "admin",
    "riskRating": "LOW"
  }'
```

### BIAN - Initiate Party Profile
```bash
curl -X POST http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "partyName": {"firstName": "Jane", "lastName": "Doe"},
    "contactDetails": {"email": "jane@example.com", "phone": "+15559999999"}
  }'
```

### BIAN - Retrieve Party Profile
```bash
curl http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/retrieve
```

### BIAN - Control (Suspend)
```bash
curl -X PUT "http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/control?action=suspend"
```

## 🔧 Service Management

### Start Services
```bash
cd poc-banking-service
docker-compose -f docker-compose-banking.yml up -d
```

### Stop Services
```bash
docker-compose -f docker-compose-banking.yml down
```

### View Logs
```bash
# All services
docker-compose -f docker-compose-banking.yml logs -f

# Specific service
docker-compose -f docker-compose-banking.yml logs -f customer-service

# Last 50 lines
docker-compose -f docker-compose-banking.yml logs --tail=50
```

### Restart Services
```bash
docker-compose -f docker-compose-banking.yml restart
```

### Check Health
```bash
# API Gateway
curl http://localhost:3001/health

# Customer Service
curl http://localhost:3010/health
```

## 📁 View Test Results

### HTML Report (Best)
```bash
open tests/test-results/report_*.html
```

### Console Log
```bash
cat tests/test-results/test_run_*.log
```

### JSON Results
```bash
cat tests/test-results/test-results-*.json | jq '.'
```

### Individual Test Response
```bash
cat tests/test-results/Create_Customer_John_Doe_response.json | jq '.'
```

## 🗄️ Database Commands

### Connect to PostgreSQL
```bash
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db
```

### Quick Queries
```bash
# Count customers
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT COUNT(*) FROM customers;"

# View customers
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT id, customer_number, first_name, last_name, email, status FROM customers;"

# Clear test data
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "DELETE FROM customers WHERE email LIKE '%example.com';"
```

## 🐛 Troubleshooting

### Services Won't Start
```bash
# Check Docker
docker ps

# Check logs
docker-compose -f docker-compose-banking.yml logs

# Full reset
docker-compose -f docker-compose-banking.yml down -v
docker-compose -f docker-compose-banking.yml up -d
```

### Tests Failing
```bash
# Check service health
./check-status.sh

# Clear old test data
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "DELETE FROM customers WHERE email LIKE '%example.com';"

# Restart services
docker-compose -f docker-compose-banking.yml restart
```

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3001
lsof -i :3010
lsof -i :5432

# Kill process
kill -9 <PID>
```

## 📊 Test Statistics

- **Total Tests**: 35-40
- **Expected Pass Rate**: 95-100%
- **Execution Time**: 20-30 seconds
- **Test Suites**: 5
- **Endpoints Covered**: 15+

## 🎯 Test Suites

1. **Customer Management** (13 tests)
   - CRUD operations
   - Pagination & filtering
   - KYC verification

2. **BIAN API** (6 tests)
   - Initiate, retrieve, update
   - Control actions

3. **Validation** (5 tests)
   - Error handling
   - Input validation

4. **Performance** (11 tests)
   - Bulk operations
   - Load testing

5. **Integration** (6 tests)
   - Complete workflows
   - Lifecycle testing

## 📖 Documentation

- **Full Guide**: `TESTING-SUMMARY.md`
- **Test Details**: `tests/README.md`
- **API Reference**: `../API-QUICK-REFERENCE.md`
- **Architecture**: `../BIAN-ARCHITECTURE.md`

## 🔗 Service URLs

- API Gateway: http://localhost:3001
- Customer Service: http://localhost:3010
- pgAdmin: http://localhost:5050
- PostgreSQL: localhost:5432

## 🎨 Color Codes in Output

- 🟢 **GREEN [PASS]** - Test passed
- 🔴 **RED [FAIL]** - Test failed
- 🔵 **BLUE [INFO]** - Information
- 🟡 **YELLOW [WARN]** - Warning

## 💡 Pro Tips

1. Always check service health before testing
2. Use HTML reports for best visualization
3. Save correlation IDs for debugging
4. Clear test data between test runs
5. Check database state if tests fail
6. Use `jq` for pretty JSON output
7. Enable verbose logging for debugging

---

**Quick Help**: Run `./check-status.sh` to see service status
