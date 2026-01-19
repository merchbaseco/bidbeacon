#!/bin/bash

# Test script for BidBeacon Server API
# Run with: ./test-api.sh

API_BASE="http://localhost:8080"

echo "🚀 Testing BidBeacon Server API"
echo ""

# Test health check
echo "🔍 Testing health check..."
health_response=$(curl -s "$API_BASE/api/health")
if [ $? -eq 0 ]; then
    echo "✅ Health check: $health_response"
else
    echo "❌ Health check failed - is the server running?"
    echo "   Start server with: bun run start"
    exit 1
fi

echo ""

# Test test endpoint
echo "🔍 Testing test endpoint..."
test_response=$(curl -s "$API_BASE/api/test")
if [ $? -eq 0 ]; then
    echo "✅ Test endpoint: $test_response"
else
    echo "❌ Test endpoint failed"
    exit 1
fi

echo ""
echo "✅ API testing complete!"
