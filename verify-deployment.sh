#!/bin/bash
# NexaPay Deployment Verification Script
# Verifies domain configuration, services, and API functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAIN_DOMAIN="nexapay.space"
BACKEND_DOMAIN="backend.nexapay.space"
SERVER_IP="20.199.106.44"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   NexaPay Deployment Verification     ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
    fi
}

# Function to test URL
test_url() {
    local url=$1
    local description=$2
    echo -n "Testing $description ($url)... "

    if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Accessible${NC}"
        return 0
    else
        echo -e "${RED}✗ Not accessible${NC}"
        return 1
    fi
}

# Function to test DNS
test_dns() {
    local domain=$1
    local description=$2
    echo -n "Testing DNS for $description ($domain)... "

    if dig +short "$domain" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Resolves${NC}"
        return 0
    else
        echo -e "${RED}✗ Does not resolve${NC}"
        return 1
    fi
}

echo -e "${YELLOW}=== Phase 1: DNS Configuration ===${NC}"
echo ""

# Test DNS resolution
test_dns "$MAIN_DOMAIN" "Main domain"
test_dns "$BACKEND_DOMAIN" "Backend subdomain"
test_dns "www.$MAIN_DOMAIN" "WWW subdomain"

echo ""
echo -e "${YELLOW}=== Phase 2: SSL/TLS Certificates ===${NC}"
echo ""

# Test SSL certificates
echo -n "Testing SSL for $MAIN_DOMAIN... "
if openssl s_client -connect "$MAIN_DOMAIN:443" -servername "$MAIN_DOMAIN" < /dev/null 2>/dev/null | grep -q "Verify return code: 0 (ok)"; then
    echo -e "${GREEN}✓ Valid certificate${NC}"
else
    echo -e "${RED}✗ Invalid or missing certificate${NC}"
fi

echo -n "Testing SSL for $BACKEND_DOMAIN... "
if openssl s_client -connect "$BACKEND_DOMAIN:443" -servername "$BACKEND_DOMAIN" < /dev/null 2>/dev/null | grep -q "Verify return code: 0 (ok)"; then
    echo -e "${GREEN}✓ Valid certificate${NC}"
else
    echo -e "${RED}✗ Invalid or missing certificate${NC}"
fi

echo ""
echo -e "${YELLOW}=== Phase 3: Nginx Configuration ===${NC}"
echo ""

# Test nginx configuration
echo -n "Testing nginx configuration... "
if sudo nginx -t > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Valid configuration${NC}"
    NGINX_OK=0
else
    echo -e "${RED}✗ Invalid configuration${NC}"
    NGINX_OK=1
fi

echo -n "Testing nginx service status... "
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo ""
echo -e "${YELLOW}=== Phase 4: Docker Services ===${NC}"
echo ""

# Check Docker services
echo -n "Checking Docker Compose services... "
if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Services running${NC}"

    # List services
    echo ""
    echo -e "${BLUE}Running containers:${NC}"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
else
    echo -e "${RED}✗ No services running${NC}"
fi

echo ""
echo -e "${YELLOW}=== Phase 5: Frontend Accessibility ===${NC}"
echo ""

# Test frontend
test_url "https://$MAIN_DOMAIN" "Main frontend"
test_url "https://www.$MAIN_DOMAIN" "WWW frontend"

# Test specific frontend pages
test_url "https://$MAIN_DOMAIN/dashboard" "Dashboard page"
test_url "https://$MAIN_DOMAIN/dev" "Developer portal"
test_url "https://$MAIN_DOMAIN/checkout" "Checkout (root)"

echo ""
echo -e "${YELLOW}=== Phase 6: Backend API ===${NC}"
echo ""

# Test backend API
test_url "https://$BACKEND_DOMAIN" "Backend API root"
test_url "https://$BACKEND_DOMAIN/chain/height" "Chain height endpoint"

# Test CORS headers
echo -n "Testing CORS configuration... "
if curl -s -I "https://$BACKEND_DOMAIN/chain/height" | grep -q "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✓ CORS headers present${NC}"
else
    echo -e "${RED}✗ CORS headers missing${NC}"
fi

echo ""
echo -e "${YELLOW}=== Phase 7: API Functionality ===${NC}"
echo ""

# Test API endpoints
echo -n "Testing chain API... "
CHAIN_RESPONSE=$(curl -s "https://$BACKEND_DOMAIN/chain/height" || echo "ERROR")
if [[ "$CHAIN_RESPONSE" != "ERROR" ]] && echo "$CHAIN_RESPONSE" | grep -q "chain_height"; then
    echo -e "${GREEN}✓ Chain API working${NC}"
else
    echo -e "${RED}✗ Chain API failed${NC}"
fi

echo -n "Testing health check... "
HEALTH_RESPONSE=$(curl -s "https://$BACKEND_DOMAIN/health" || echo "ERROR")
if [[ "$HEALTH_RESPONSE" != "ERROR" ]] && echo "$HEALTH_RESPONSE" | grep -q "healthy\|ok"; then
    echo -e "${GREEN}✓ Health check working${NC}"
elif [[ "$HEALTH_RESPONSE" == "ERROR" ]]; then
    echo -e "${YELLOW}⚠ Health endpoint may not exist${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
fi

echo ""
echo -e "${YELLOW}=== Phase 8: Integration Tests ===${NC}"
echo ""

# Test that frontend can reach backend
echo -n "Testing frontend-backend connectivity... "
FRONTEND_API_URL=$(grep NEXT_PUBLIC_API_URL docker-compose.yml | head -1 | cut -d: -f2- | xargs)
echo -n "API URL: $FRONTEND_API_URL... "

if [[ "$FRONTEND_API_URL" == "https://$BACKEND_DOMAIN" ]]; then
    echo -e "${GREEN}✓ Correctly configured${NC}"
else
    echo -e "${RED}✗ Incorrect configuration${NC}"
    echo -e "${YELLOW}  Expected: https://$BACKEND_DOMAIN${NC}"
    echo -e "${YELLOW}  Got: $FRONTEND_API_URL${NC}"
fi

# Test portal container environment variable
echo -n "Checking portal container env var... "
PORTAL_ENV=$(docker compose exec portal env | grep NEXT_PUBLIC_API_URL || echo "NOT_FOUND")
if [[ "$PORTAL_ENV" == *"$BACKEND_DOMAIN"* ]]; then
    echo -e "${GREEN}✓ Correctly set${NC}"
else
    echo -e "${RED}✗ Not set correctly${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Deployment Summary                  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Summary
echo -e "${YELLOW}Configuration:${NC}"
echo "  Main Domain:     https://$MAIN_DOMAIN"
echo "  Backend API:     https://$BACKEND_DOMAIN"
echo "  Server IP:       $SERVER_IP"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"

# Check if backend DNS needs configuration
if ! dig +short "$BACKEND_DOMAIN" > /dev/null 2>&1; then
    echo -e "${RED}1. Configure DNS A record for $BACKEND_DOMAIN:${NC}"
    echo -e "   Type: A"
    echo -e "   Name: backend"
    echo -e "   Value: $SERVER_IP"
    echo -e "   TTL: 14400"
    echo ""
fi

# Check if www redirect is working
if ! curl -s -o /dev/null -w "%{http_code}" "http://www.$MAIN_DOMAIN" | grep -q "301"; then
    echo -e "${YELLOW}2. Verify www redirect configuration${NC}"
    echo ""
fi

echo -e "${GREEN}3. Test complete checkout flow:${NC}"
echo "   a. Create payment intent via API"
echo "   b. Visit checkout page"
echo "   c. Complete payment with test card"
echo "   d. Verify success page"
echo ""
echo -e "${GREEN}4. Verify developer portal functionality${NC}"
echo "   a. Access /dev"
echo "   b. Register merchant"
echo "   c. Create payment intent"
echo ""

echo -e "${BLUE}========================================${NC}"
echo "Verification complete at $(date)"
echo -e "${BLUE}========================================${NC}"

# Exit with appropriate code
if [ $NGINX_OK -eq 0 ]; then
    exit 0
else
    exit 1
fi
