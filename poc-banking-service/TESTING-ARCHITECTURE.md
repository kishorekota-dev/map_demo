# POC Banking - Testing Architecture

## Test Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User / CI/CD Pipeline                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────┐
        │   ./setup-and-test.sh     │  ◄── Recommended for first time
        │   (Complete Setup)        │
        └─────────────┬─────────────┘
                      │
                      ├─── Check Prerequisites (Docker, curl, jq)
                      ├─── Start Docker Compose
                      ├─── Wait for Services
                      ├─── Install Test Dependencies
                      └─── Run Tests
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
    ┌───────────────────────┐     ┌───────────────────────┐
    │   ./run-tests.sh      │     │  ./check-status.sh    │
    │   (Interactive Menu)   │     │  (Health Check)       │
    └───────────┬───────────┘     └───────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌───────────────┐  ┌───────────────┐
│  Bash Tests   │  │ Node.js Tests │
│  (e2e-api-    │  │ (e2e-api-     │
│   test.sh)    │  │  test.js)     │
└───────┬───────┘  └───────┬───────┘
        │                  │
        └──────────┬───────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   Test Execution     │
        │   35-40 Tests        │
        └──────────┬───────────┘
                   │
        ┌──────────┴──────────────────┬──────────────┬──────────────┐
        ▼                             ▼              ▼              ▼
┌───────────────┐  ┌─────────────┐  ┌─────────┐  ┌──────────────┐
│ Customer Mgmt │  │  BIAN API   │  │Validation│ │ Performance  │
│   13 tests    │  │   6 tests   │  │ 5 tests  │ │  11 tests    │
└───────────────┘  └─────────────┘  └─────────┘  └──────────────┘
        │                   │              │              │
        └───────────────────┴──────────────┴──────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Test Results        │
                └───────────┬───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│HTML Report  │   │  JSON Report │   │  Console    │
│report_*.html│   │test-results  │   │  Output     │
│             │   │  *.json      │   │  (colored)  │
└─────────────┘   └──────────────┘   └─────────────┘
```

## Test Suite Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  POC Banking Test Suites                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Suite 1      │   │  Suite 2      │   │  Suite 3      │
│  Customer     │   │  BIAN API     │   │  Validation   │
│  Management   │   │               │   │  & Errors     │
│  (13 tests)   │   │  (6 tests)    │   │  (5 tests)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        │  • Create         │  • Initiate       │  • Missing fields
        │  • Retrieve       │  • Retrieve       │  • Invalid email
        │  • Update         │  • Update         │  • Invalid date
        │  • Delete         │  • Control        │  • 404 errors
        │  • Pagination     │                   │  • Duplicates
        │  • Filtering      │                   │
        │  • KYC verify     │                   │
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Suite 4      │   │  Suite 5      │   │               │
│  Performance  │   │  Integration  │   │  Results      │
│  & Load       │   │  Testing      │   │  Aggregation  │
│  (11 tests)   │   │  (6 tests)    │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        │  • Bulk create    │  • Lifecycle      │  Total: 35-40
        │  • Large pages    │  • Workflows      │  Pass: 35-40
        │  • Concurrent     │  • State trans    │  Fail: 0
        │                   │                   │  Rate: 100%
        │                   │                   │
        └───────────────────┴───────────────────┘
```

## Service Communication During Tests

```
┌──────────────┐
│  Test Script │
└──────┬───────┘
       │
       │ HTTP Requests
       ▼
┌──────────────────────────────────────────────────────────┐
│                    API Gateway (3001)                     │
│  • Routing                                                │
│  • Rate Limiting                                          │
│  • Correlation ID                                         │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
    ┌─────────────┐  ┌─────────┐  ┌─────────┐
    │  Customer   │  │ Account │  │  Card   │
    │  Service    │  │ Service │  │ Service │
    │   (3010)    │  │ (3011)  │  │ (3012)  │
    └──────┬──────┘  └────┬────┘  └────┬────┘
           │              │            │
           └──────────────┼────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │   PostgreSQL     │
                │     (5432)       │
                │                  │
                │  • customer_db   │
                │  • account_db    │
                │  • card_db       │
                └──────────────────┘
```

## Test Data Flow

```
┌─────────────────┐
│  test-data.json │
│                 │
│  • John Doe     │
│  • Jane Smith   │
│  • Robert J.    │
│  • Emily W.     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Test Execution         │
│                         │
│  1. Create Customer     │
│  2. Verify Response     │
│  3. Extract ID          │
│  4. Update Customer     │
│  5. Verify KYC          │
│  6. Control Actions     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Database (customer_db)                 │
│                                         │
│  customers table:                       │
│  ├─ id (UUID)                           │
│  ├─ customer_number (auto-generated)    │
│  ├─ first_name, last_name               │
│  ├─ email, phone                        │
│  ├─ status, kyc_status                  │
│  ├─ risk_rating                         │
│  └─ timestamps                          │
│                                         │
│  customer_preferences table:            │
│  ├─ customer_id (FK)                    │
│  ├─ email_notifications                 │
│  ├─ sms_notifications                   │
│  └─ preferred_currency                  │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Test Results           │
│                         │
│  Response Validation:   │
│  ✓ HTTP Status Code     │
│  ✓ Response Structure   │
│  ✓ Field Values         │
│  ✓ Business Logic       │
│  ✓ Error Messages       │
│  ✓ Timestamps           │
│  ✓ Correlation IDs      │
└─────────────────────────┘
```

## Report Generation Flow

```
┌─────────────────┐
│  Test Execution │
└────────┬────────┘
         │
         ├─── Capture Results
         │    • Test Name
         │    • Status (Pass/Fail)
         │    • HTTP Code
         │    • Response Body
         │    • Execution Time
         │    • Error Details
         │
         ▼
┌──────────────────────────┐
│  Results Aggregation     │
│                          │
│  • Total Tests: 35-40    │
│  • Passed: X             │
│  • Failed: Y             │
│  • Success Rate: Z%      │
└────────┬─────────────────┘
         │
         ├─────────┬──────────┬──────────┐
         ▼         ▼          ▼          ▼
    ┌────────┐ ┌──────┐  ┌──────┐  ┌──────────┐
    │  HTML  │ │ JSON │  │ Log  │  │ Console  │
    │ Report │ │Report│  │ File │  │  Output  │
    └────────┘ └──────┘  └──────┘  └──────────┘
         │         │          │          │
         ▼         ▼          ▼          ▼
    Beautiful  Machine   Detailed   Real-time
    Visual     Readable  Execution  Colored
    Report     Format    Trace      Feedback
```

## Test Workflow Example

```
Test: Create Customer John Doe
────────────────────────────────────────

1. Prepare Request
   ┌──────────────────────────────┐
   │ POST /customers              │
   │ {                            │
   │   "firstName": "John",       │
   │   "lastName": "Doe",         │
   │   "email": "john@example.com"│
   │ }                            │
   └──────────────────────────────┘
            │
            ▼
2. Send to API Gateway (3001)
   ┌──────────────────────────────┐
   │ • Add Correlation ID         │
   │ • Route to Customer Service  │
   │ • Apply Rate Limiting        │
   └──────────────────────────────┘
            │
            ▼
3. Customer Service (3010)
   ┌──────────────────────────────┐
   │ • Validate Input             │
   │ • Check Duplicate Email      │
   │ • Generate Customer Number   │
   │ • Insert to Database         │
   │ • Create Default Preferences │
   └──────────────────────────────┘
            │
            ▼
4. Database Transaction
   ┌──────────────────────────────┐
   │ BEGIN;                       │
   │ INSERT INTO customers...     │
   │ INSERT INTO preferences...   │
   │ COMMIT;                      │
   └──────────────────────────────┘
            │
            ▼
5. Response
   ┌──────────────────────────────┐
   │ HTTP 201 Created             │
   │ {                            │
   │   "status": "success",       │
   │   "data": {                  │
   │     "id": "uuid...",         │
   │     "customer_number":       │
   │       "CUS0000000001"        │
   │   }                          │
   │ }                            │
   └──────────────────────────────┘
            │
            ▼
6. Test Validation
   ┌──────────────────────────────┐
   │ ✓ Status Code = 201          │
   │ ✓ Response has "id" field    │
   │ ✓ Customer number generated  │
   │ ✓ Email matches request      │
   │ ✓ Status = ACTIVE            │
   │ ✓ KYC Status = PENDING       │
   └──────────────────────────────┘
            │
            ▼
   [PASS] Create Customer John Doe
```

## Summary

This testing architecture provides:

✅ **Multiple Entry Points**: setup-and-test, run-tests, check-status
✅ **Two Test Implementations**: Bash (cURL) + Node.js (Axios)
✅ **Comprehensive Coverage**: 35-40 tests across 5 suites
✅ **Rich Reporting**: HTML, JSON, Console, Log files
✅ **Complete Validation**: Status, structure, logic, errors
✅ **Easy Extension**: Add new tests to existing suites
✅ **CI/CD Ready**: Exit codes, JSON output, Docker-based

---

**Test Execution Time**: 20-30 seconds
**Success Rate**: 100% (when services healthy)
**Maintenance**: Low (add tests as features added)
