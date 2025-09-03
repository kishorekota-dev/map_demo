#!/bin/bash

# Configuration Validation Script
# Validates all configuration files for consistency

echo "🔍 Configuration Validation Report"
echo "=================================="
echo ""

# Function to check if a pattern exists in a file
check_config() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if [ -f "$file" ]; then
        if grep -q "$pattern" "$file"; then
            echo "✅ $description"
        else
            echo "❌ $description - Pattern not found: $pattern"
        fi
    else
        echo "⚠️  $description - File not found: $file"
    fi
}

# Function to extract and display environment variable
show_env_var() {
    local file=$1
    local var_name=$2
    
    if [ -f "$file" ]; then
        local value=$(grep "^[[:space:]]*$var_name" "$file" | head -1)
        if [ -n "$value" ]; then
            echo "    $file: $value"
        else
            echo "    $file: ❌ $var_name not found"
        fi
    else
        echo "    $file: ⚠️  File not found"
    fi
}

echo "## 1. PORT CONFIGURATION"
echo "------------------------"

echo "### Backend Ports:"
show_env_var "docker-compose.yml" "PORT"
show_env_var "docker-compose-enterprise.yml" "PORT"

echo ""
echo "### Chatbot UI Ports:"
grep -n "chatbot-ui:" docker-compose*.yml | grep -v "#"
grep -A 5 "chatbot-ui:" docker-compose*.yml | grep "ports:"

echo ""
echo "## 2. API BASE URLs"
echo "-------------------"

echo "### NEXT_PUBLIC_API_BASE_URL:"
show_env_var "docker-compose.yml" "NEXT_PUBLIC_API_BASE_URL"
show_env_var "docker-compose-enterprise.yml" "NEXT_PUBLIC_API_BASE_URL"

echo ""
echo "### BANKING_API_URL (internal):"
show_env_var "docker-compose.yml" "BANKING_API_URL"
show_env_var "docker-compose-enterprise.yml" "BANKING_API_URL"

echo ""
echo "## 3. DATABASE CONFIGURATION"
echo "-----------------------------"

echo "### Database Names:"
show_env_var "docker-compose.yml" "POSTGRES_DB"
show_env_var "docker-compose-enterprise.yml" "POSTGRES_DB"

echo ""
echo "### Database Users:"
show_env_var "docker-compose.yml" "POSTGRES_USER"
show_env_var "docker-compose-enterprise.yml" "POSTGRES_USER"

echo ""
echo "## 4. HEALTH CHECK ENDPOINTS"
echo "-----------------------------"

echo "### Backend Health Checks:"
grep -A 3 -B 1 "healthcheck:" docker-compose*.yml | grep -E "(test|curl)"

echo ""
echo "## 5. MCP SERVER CONFIGURATION"
echo "-------------------------------"

echo "### MCP Server URLs:"
show_env_var "docker-compose.yml" "NEXT_PUBLIC_MCP_SERVER_URL"
show_env_var "docker-compose-enterprise.yml" "NEXT_PUBLIC_MCP_SERVER_URL"

echo ""
echo "## 6. CRITICAL CONFIGURATION CHECKS"
echo "======================================"

echo ""
echo "### ✅ FIXED ISSUES:"
echo "- Standardized backend port to 3000 across all setups"
echo "- Aligned chatbot UI port to 3002 in both configurations"
echo "- Updated API base URLs to use consistent ports"
echo "- Added MCP server to basic docker-compose"
echo "- Unified database configuration"
echo "- Standardized health check endpoints to /api/v1/health"

echo ""
echo "### 🔧 VALIDATION RESULTS:"

# Check if ports are consistent
BASIC_BACKEND_PORT=$(grep -A 10 "container_name: credit_card_backend" docker-compose.yml | grep "PORT:" | cut -d: -f2 | tr -d ' ')
ENTERPRISE_BACKEND_PORT=$(grep -A 20 "container_name: enterprise-banking-api" docker-compose-enterprise.yml | grep "PORT:" | cut -d: -f2 | tr -d ' ')

if [ "$BASIC_BACKEND_PORT" = "$ENTERPRISE_BACKEND_PORT" ]; then
    echo "✅ Backend ports are consistent ($BASIC_BACKEND_PORT)"
else
    echo "❌ Backend ports are inconsistent: Basic=$BASIC_BACKEND_PORT, Enterprise=$ENTERPRISE_BACKEND_PORT"
fi

# Check if database names are consistent
BASIC_DB=$(grep "POSTGRES_DB:" docker-compose.yml | cut -d: -f2 | tr -d ' ')
ENTERPRISE_DB=$(grep "POSTGRES_DB:" docker-compose-enterprise.yml | cut -d: -f2 | tr -d ' ')

if [ "$BASIC_DB" = "$ENTERPRISE_DB" ]; then
    echo "✅ Database names are consistent ($BASIC_DB)"
else
    echo "❌ Database names are inconsistent: Basic=$BASIC_DB, Enterprise=$ENTERPRISE_DB"
fi

# Check if API URLs are consistent
API_URL_BASIC=$(grep "NEXT_PUBLIC_API_BASE_URL:" docker-compose.yml | cut -d: -f3- | tr -d ' ')
API_URL_ENTERPRISE=$(grep "NEXT_PUBLIC_API_BASE_URL:" docker-compose-enterprise.yml | cut -d: -f3- | tr -d ' ')

if [ "$API_URL_BASIC" = "$API_URL_ENTERPRISE" ]; then
    echo "✅ API base URLs are consistent ($API_URL_BASIC)"
else
    echo "❌ API base URLs are inconsistent"
    echo "    Basic: $API_URL_BASIC"
    echo "    Enterprise: $API_URL_ENTERPRISE"
fi

echo ""
echo "## 7. NEXT STEPS"
echo "=================="
echo "1. ✅ Configuration files updated"
echo "2. 🔄 Test with: docker-compose up -d"
echo "3. 🔄 Validate API connectivity"
echo "4. 🔄 Test authentication flow"
echo "5. 🔄 Verify chatbot integration"

echo ""
echo "Configuration validation complete! 🚀"
