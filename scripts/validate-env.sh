#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT_ENV_FILE="${1:-.env.development}"

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

ensure_root_context() {
    if [ ! -f "package.json" ] || [ ! -d "services" ]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi

    if [ ! -f "$ROOT_ENV_FILE" ]; then
        if [ -f ".env.example" ]; then
            print_warning "$ROOT_ENV_FILE not found. Falling back to .env.example"
            ROOT_ENV_FILE=".env.example"
        else
            print_error "No root environment file found"
            exit 1
        fi
    fi
}

load_root_env() {
    set -a
    source "$ROOT_ENV_FILE"
    set +a
}

validate_dependencies() {
    print_status "Checking Node.js and npm versions..."

    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js is not installed"
        return 1
    fi

    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm is not installed"
        return 1
    fi

    local node_version
    node_version=$(node --version)
    local major_version
    major_version=$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')

    print_status "Node.js version: $node_version"
    print_status "npm version: $(npm --version)"

    if [ "$major_version" -lt 18 ]; then
        print_error "Node.js version must be >= 18.0.0"
        return 1
    fi

    print_success "Runtime toolchain is compatible"
}

validate_root_env() {
    print_status "Validating root environment file: $ROOT_ENV_FILE"

    local errors=0

    if [ -z "${NODE_ENV:-}" ]; then
        print_error "NODE_ENV is not set"
        errors=$((errors + 1))
    fi

    if [ -z "${JWT_SECRET:-}" ]; then
        print_error "JWT_SECRET is not set"
        errors=$((errors + 1))
    elif [ "${JWT_SECRET}" = "change-this-to-a-secure-secret-in-production" ] || [ "${JWT_SECRET}" = "dev-jwt-secret-change-me-in-production-2024" ]; then
        print_warning "JWT_SECRET is still using a development placeholder"
    else
        print_success "JWT_SECRET is configured"
    fi

    if [ -z "${PRODUCT_DISPLAY_NAME:-}" ]; then
        print_warning "PRODUCT_DISPLAY_NAME is not set; frontend branding will fall back to defaults"
    fi

    if [ -z "${AUTH_PROVIDER:-}" ]; then
        print_warning "AUTH_PROVIDER is not set; assuming local JWT auth"
    fi

    return "$errors"
}

validate_service_structure() {
    print_status "Validating service directory structure..."

    local errors=0
    local service_dirs=(
        "services/frontend"
        "services/api-gateway"
        "services/chat-backend"
        "services/banking-service"
        "services/nlu-service"
        "services/mcp-service"
        "services/ai-orchestrator"
        "services/agent-ui"
    )

    for service_dir in "${service_dirs[@]}"; do
        if [ ! -d "$service_dir" ]; then
            print_error "Missing service directory: $service_dir"
            errors=$((errors + 1))
            continue
        fi

        if [ ! -f "$service_dir/package.json" ]; then
            print_error "Missing package.json in $service_dir"
            errors=$((errors + 1))
        else
            print_success "$service_dir/package.json found"
        fi
    done

    return "$errors"
}

check_service_urls() {
    print_status "Validating service URL configurations..."

    declare -A services=(
        ["FRONTEND_URL"]="${FRONTEND_URL:-http://localhost:3000}"
        ["API_GATEWAY_URL"]="${API_GATEWAY_URL:-http://localhost:3001}"
        ["CHAT_BACKEND_URL"]="${CHAT_BACKEND_URL:-http://localhost:3006}"
        ["BANKING_SERVICE_URL"]="${BANKING_SERVICE_URL:-http://localhost:3005}"
        ["NLP_SERVICE_URL"]="${NLP_SERVICE_URL:-http://localhost:3003}"
        ["NLU_SERVICE_URL"]="${NLU_SERVICE_URL:-http://localhost:3003}"
        ["MCP_SERVICE_URL"]="${MCP_SERVICE_URL:-http://localhost:3004}"
        ["AI_ORCHESTRATOR_URL"]="${AI_ORCHESTRATOR_URL:-http://localhost:3007}"
        ["AGENT_UI_URL"]="${AGENT_UI_URL:-http://localhost:8081}"
    )

    declare -A expected_ports=(
        ["FRONTEND_URL"]=3000
        ["API_GATEWAY_URL"]=3001
        ["CHAT_BACKEND_URL"]=3006
        ["BANKING_SERVICE_URL"]=3005
        ["NLP_SERVICE_URL"]=3003
        ["NLU_SERVICE_URL"]=3003
        ["MCP_SERVICE_URL"]=3004
        ["AI_ORCHESTRATOR_URL"]=3007
        ["AGENT_UI_URL"]=8081
    )

    for service_name in "${!services[@]}"; do
        local url="${services[$service_name]}"
        local port
        port=$(echo "$url" | sed -n 's/.*:\([0-9]*\).*/\1/p')

        print_status "$service_name -> $url"

        if [ -z "$port" ]; then
            print_warning "Could not extract a port from $service_name"
            continue
        fi

        if [ "$port" = "${expected_ports[$service_name]}" ]; then
            print_success "$service_name uses expected port $port"
        else
            print_warning "$service_name uses port $port; expected ${expected_ports[$service_name]}"
        fi
    done
}

check_port_conflicts() {
    print_status "Checking for local port conflicts..."

    local ports=(3000 3001 3003 3004 3005 3006 3007 8081)
    local conflicts=0

    for port in "${ports[@]}"; do
        if lsof -Pi ":$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
            local process
            process=$(lsof -Pi ":$port" -sTCP:LISTEN -F p | grep -o '[0-9]*' | head -1)
            local process_name
            process_name=$(ps -p "$process" -o comm= 2>/dev/null || echo "unknown")
            print_warning "Port $port is already in use by process $process ($process_name)"
            conflicts=$((conflicts + 1))
        else
            print_success "Port $port is available"
        fi
    done

    if [ "$conflicts" -gt 0 ]; then
        print_warning "Found $conflicts local port conflicts"
        return 1
    fi

    return 0
}

generate_summary() {
    print_header "Environment Configuration Summary"

    echo ""
    echo "Product Metadata:"
    echo "  - Organization:    ${ORG_NAME:-Demo Enterprise}"
    echo "  - Product:         ${PRODUCT_DISPLAY_NAME:-Enterprise Conversational Platform}"
    echo "  - Auth Provider:   ${AUTH_PROVIDER:-jwt}"
    echo "  - Runtime Config:  ${FRONTEND_RUNTIME_CONFIG_PATH:-services/frontend/public/runtime-config.json}"
    echo ""
    echo "Active Services:"
    echo "  - Frontend:        ${FRONTEND_URL:-http://localhost:3000}"
    echo "  - API Gateway:     ${API_GATEWAY_URL:-http://localhost:3001}"
    echo "  - Chat Backend:    ${CHAT_BACKEND_URL:-http://localhost:3006}"
    echo "  - Banking Service: ${BANKING_SERVICE_URL:-http://localhost:3005}"
    echo "  - NLU Service:     ${NLU_SERVICE_URL:-http://localhost:3003}"
    echo "  - MCP Service:     ${MCP_SERVICE_URL:-http://localhost:3004}"
    echo "  - AI Orchestrator: ${AI_ORCHESTRATOR_URL:-http://localhost:3007}"
    echo "  - Agent UI:        ${AGENT_UI_URL:-http://localhost:8081}"
    echo ""
    echo "Enterprise Packaging:"
    echo "  - Generate profile assets: npm run product:generate"
    echo "  - Validate profile schema: npm run product:validate"
    echo ""
}

main() {
    local total_errors=0

    ensure_root_context
    load_root_env
    print_header "Enterprise Conversational Platform - Environment Validation"

    if ! validate_dependencies; then
        total_errors=$((total_errors + 1))
    fi

    if ! validate_root_env; then
        total_errors=$((total_errors + 1))
    fi

    if ! validate_service_structure; then
        total_errors=$((total_errors + 1))
    fi

    check_service_urls

    if ! check_port_conflicts; then
        print_warning "Port conflicts detected. This may be expected if services are already running."
    fi

    generate_summary

    if [ "$total_errors" -eq 0 ]; then
        print_header "Validation Successful"
        print_success "Environment configuration is aligned with the current enterprise-ready topology"
        return 0
    fi

    print_header "Validation Failed"
    print_error "Found $total_errors blocking configuration issue(s)"
    return 1
}

main
