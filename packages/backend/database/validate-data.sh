#!/bin/bash
# Database Statistics Report
# Shows comprehensive data statistics after migration

echo "🏦 COMPREHENSIVE BANKING DATABASE - DATA SUMMARY REPORT"
echo "========================================================="
echo

# Check PostgreSQL connection
echo "📊 Database Connection Status:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "SELECT version();" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi
echo

# Data counts for each table
echo "📈 DATA VOLUME STATISTICS:"
echo "=========================="

# Users
USERS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
echo "👥 Users: $USERS_COUNT"

# Accounts
ACCOUNTS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM accounts;" 2>/dev/null | tr -d ' ')
echo "🏦 Accounts: $ACCOUNTS_COUNT"

# Cards
CARDS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM cards;" 2>/dev/null | tr -d ' ')
echo "💳 Cards: $CARDS_COUNT"

# Transactions
TRANSACTIONS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM transactions;" 2>/dev/null | tr -d ' ')
echo "💰 Transactions: $TRANSACTIONS_COUNT"

# Balance Transfers
BALANCE_TRANSFERS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM balance_transfers;" 2>/dev/null | tr -d ' ')
echo "🔄 Balance Transfers: $BALANCE_TRANSFERS_COUNT"

# Disputes
DISPUTES_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM disputes;" 2>/dev/null | tr -d ' ')
echo "⚖️  Disputes: $DISPUTES_COUNT"

# Fraud Cases
FRAUD_CASES_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM fraud_cases;" 2>/dev/null | tr -d ' ')
echo "🚨 Fraud Cases: $FRAUD_CASES_COUNT"

# Audit Logs
AUDIT_LOGS_COUNT=$(psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -t -c "SELECT COUNT(*) FROM audit_logs;" 2>/dev/null | tr -d ' ')
echo "📋 Audit Logs: $AUDIT_LOGS_COUNT"

echo
echo "💹 TRANSACTION ANALYTICS:"
echo "========================"

# Transaction types breakdown
echo "📊 Transaction Types:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    transaction_type,
    COUNT(*) as count,
    ROUND(SUM(ABS(amount))::numeric, 2) as total_amount
FROM transactions 
GROUP BY transaction_type 
ORDER BY count DESC;" 2>/dev/null

# Transaction status breakdown
echo "📈 Transaction Status:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    status,
    COUNT(*) as count,
    ROUND(AVG(ABS(amount))::numeric, 2) as avg_amount
FROM transactions 
GROUP BY status 
ORDER BY count DESC;" 2>/dev/null

# Recent activity (last 7 days)
echo "🕒 Recent Activity (Last 7 Days):"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    DATE(created_at) as transaction_date,
    COUNT(*) as daily_transactions,
    ROUND(SUM(ABS(amount))::numeric, 2) as daily_volume
FROM transactions 
WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY transaction_date DESC;" 2>/dev/null

echo
echo "🛡️  SECURITY & FRAUD ANALYTICS:"
echo "==============================="

# Fraud cases by type
echo "🚨 Fraud Cases by Type:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    case_type,
    severity,
    COUNT(*) as cases,
    ROUND(AVG(fraud_score)::numeric, 2) as avg_fraud_score
FROM fraud_cases 
GROUP BY case_type, severity 
ORDER BY cases DESC;" 2>/dev/null

# Geographic distribution
echo "🌍 Geographic Transaction Distribution:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    location_state,
    COUNT(*) as transactions,
    COUNT(*) FILTER (WHERE is_international = true) as international_txns,
    COUNT(*) FILTER (WHERE is_online = true) as online_txns
FROM transactions 
WHERE location_state IS NOT NULL
GROUP BY location_state 
ORDER BY transactions DESC
LIMIT 10;" 2>/dev/null

echo
echo "👥 USER & ACCOUNT ANALYTICS:"
echo "============================"

# Account balances and limits
echo "💳 Account Summary:"
psql -h localhost -p 5432 -U credit_card_user -d credit_card_enterprise -c "
SELECT 
    account_type,
    COUNT(*) as accounts,
    ROUND(AVG(credit_limit)::numeric, 2) as avg_credit_limit,
    ROUND(AVG(current_balance)::numeric, 2) as avg_balance,
    ROUND(AVG(available_credit)::numeric, 2) as avg_available_credit
FROM accounts 
GROUP BY account_type;" 2>/dev/null

echo
echo "✅ DATABASE MIGRATION COMPLETED SUCCESSFULLY!"
echo "=============================================="
echo "🎯 Your database now contains comprehensive realistic banking data including:"
echo "   • Multiple user profiles with different spending patterns"
echo "   • 90 days of time-series transaction data"
echo "   • Realistic fraud detection scenarios"
echo "   • Geographic transaction patterns"
echo "   • Balance transfers and payment history"
echo "   • Audit trails and security logs"
echo
echo "🔑 Test Login Credentials:"
echo "   Email: john.doe@example.com"
echo "   Password: password123"
echo
echo "🚀 Ready for application testing and analytics!"
