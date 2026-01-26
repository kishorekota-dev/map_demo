# Migration and Seed Script - Quick Reference

## 🚀 Quick Start

```bash
# 1. Start Docker containers
docker-compose -f docker-compose-banking-simple.yml up -d

# 2. Run migrations and load seed data
./run-migrations-and-seed.sh
```

## 📦 What Gets Created

### Database Tables
- ✅ `customers` - Main customer table
- ✅ `customer_contacts` - Additional contacts
- ✅ `customer_relationships` - Customer connections
- ✅ `customer_preferences` - User preferences

### Sample Data
- ✅ 6 customers with different profiles
- ✅ Customer preferences for all customers
- ✅ Additional contact methods
- ✅ Business relationships

## 👥 Sample Customers

| Name | Email | Segment | KYC Status |
|------|-------|---------|------------|
| James Patterson | james.patterson@premiumbank.com | PREMIUM | ✅ VERIFIED |
| Sarah Martinez | sarah.martinez@sbusiness.com | BUSINESS | ✅ VERIFIED |
| Michael Chen | michael.chen@techstart.com | RETAIL | ⏳ IN_PROGRESS |
| Robert Thompson | robert.thompson@retired.com | WEALTH | ✅ VERIFIED |
| Yuki Tanaka | yuki.tanaka@intlbank.com | INTERNATIONAL | ✅ VERIFIED |
| David Wilson | david.wilson@suspended.com | RETAIL | ❌ SUSPENDED |

## ✅ Verification

```bash
# Via API
curl http://localhost:3010/api/v1/customers | jq '.data[] | {name: .first_name, email}'

# Via PostgreSQL
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT first_name, email, status FROM customers;"

# Customer count
curl -s http://localhost:3010/api/v1/customers | jq '.pagination.total'
```

## 🔄 Re-run Script

Safe to run multiple times - the script is idempotent:
```bash
./run-migrations-and-seed.sh
```

## 🧹 Fresh Start

```bash
# Complete reset
docker-compose -f docker-compose-banking-simple.yml down -v
docker-compose -f docker-compose-banking-simple.yml up -d
sleep 10
./run-migrations-and-seed.sh
```

## 📁 Files Created

- `run-migrations-and-seed.sh` - Main script
- `database/seeds/001_sample_customers.sql` - Sample data
- `DATABASE-SETUP-GUIDE.md` - Full documentation

## 🎯 Next Steps

1. Test API: `curl http://localhost:3010/api/v1/customers`
2. Run tests: `cd tests && bash e2e-api-test-simple.sh`
3. Access pgAdmin: http://localhost:5050

## 📊 Expected Output

```
==========================================
Database Setup Complete!
==========================================
✅ PostgreSQL container running
✅ Database 'customer_db' ready
✅ Migrations applied
✅ Seed data loaded
✅ Customer count: 7
==========================================
```

## 🔧 Common Commands

```bash
# View database logs
docker logs poc-banking-postgres

# Connect to database
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db

# Check service health
curl http://localhost:3010/health

# View customer service logs
docker logs -f poc-banking-customer-service
```

---

**Full documentation:** See `DATABASE-SETUP-GUIDE.md`
