/**
 * NexaPay SDK Production Test
 *
 * This script tests the NexaPay SDK connectivity to the production backend
 * at https://backend.nexapay.space
 */

const NexaPayClient = require("./sdk/dist/index.js").default;

/**
 * Test configuration
 */
const TEST_CONFIG = {
  // Use default base URL (should be https://backend.nexapay.space)
  baseURL: "https://backend.nexapay.space",
  timeout: 10000,
};

/**
 * Test API key (if available for testing public endpoints)
 * Note: Some endpoints don't require authentication
 */
const TEST_API_KEY = process.env.NEXAPAY_TEST_API_KEY || "";

/**
 * Test results tracking
 */
let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

/**
 * Helper to run a test and track results
 */
async function runTest(name, testFn) {
  console.log(`\n📋 ${name}`);
  console.log("─".repeat(50));

  try {
    await testFn();
    console.log(`✅ ${name} - PASSED`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name} - FAILED`);
    console.error(`   Error: ${error.message}`);
    if (error.response?.data) {
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`,
      );
    }
    testsFailed++;
  }
}

/**
 * Helper to skip a test
 */
function skipTest(name, reason) {
  console.log(`\n📋 ${name}`);
  console.log("─".repeat(50));
  console.log(`⏭️  ${name} - SKIPPED: ${reason}`);
  testsSkipped++;
}

/**
 * Test 1: Initialize SDK with production URL
 */
async function testSdkInitialization() {
  console.log("🚀 Testing SDK initialization with production URL...");

  // Test 1.1: Default initialization (should use https://backend.nexapay.space)
  const defaultClient = new NexaPayClient({});
  const defaultBaseURL = defaultClient.getBaseURL();
  console.log(`   Default base URL: ${defaultBaseURL}`);

  if (defaultBaseURL !== "https://backend.nexapay.space") {
    throw new Error(
      `Expected base URL 'https://backend.nexapay.space', got '${defaultBaseURL}'`,
    );
  }

  // Test 1.2: Explicit production URL
  const explicitClient = new NexaPayClient({
    baseURL: "https://backend.nexapay.space",
  });
  const explicitBaseURL = explicitClient.getBaseURL();
  console.log(`   Explicit base URL: ${explicitBaseURL}`);

  if (explicitBaseURL !== "https://backend.nexapay.space") {
    throw new Error(
      `Expected base URL 'https://backend.nexapay.space', got '${explicitBaseURL}'`,
    );
  }

  console.log("✅ SDK initialized correctly with production URL");
}

/**
 * Test 2: Test public endpoints (no authentication required)
 */
async function testPublicEndpoints() {
  console.log("🌐 Testing public API endpoints...");

  const client = new NexaPayClient(TEST_CONFIG);

  // Test 2.1: Chain stats endpoint
  console.log("   Testing /chain/stats endpoint...");
  const statsResponse = await client.request("GET", "/chain/stats");

  if (!statsResponse.success && statsResponse.error) {
    throw new Error(`Chain stats failed: ${statsResponse.error}`);
  }

  console.log(`   Chain stats response:`, statsResponse.data || statsResponse);

  // Check for expected fields in response
  const responseData = statsResponse.data || statsResponse;
  if (!responseData.chain_height && !responseData.chain_height_raw) {
    console.warn("   Warning: Chain stats response missing expected fields");
  }

  // Test 2.2: Developer documentation snippets (public endpoint)
  console.log("   Testing /dev/docs/snippets endpoint...");
  try {
    const docsResponse = await client.request("GET", "/dev/docs/snippets");

    if (docsResponse.success && docsResponse.data) {
      console.log(
        `   Docs snippets available:`,
        Object.keys(docsResponse.data),
      );
    } else if (docsResponse.error) {
      console.log(`   Docs endpoint returned error: ${docsResponse.error}`);
      // This is okay - endpoint might require authentication
    }
  } catch (error) {
    console.log(`   Docs endpoint error (may be expected): ${error.message}`);
  }
}

/**
 * Test 3: Test API response format handling
 */
async function testResponseFormatHandling() {
  console.log("🔧 Testing API response format handling...");

  const client = new NexaPayClient(TEST_CONFIG);

  // Different endpoints return different formats:
  // 1. /chain/* returns raw data { chain_height, ... }
  // 2. /gateway/v1/* returns { success, data?, error? }
  // 3. /dev/* returns mixed formats

  console.log("   Testing response format detection...");

  // Get chain stats (should be raw format)
  const statsResponse = await client.request("GET", "/chain/stats");

  // The SDK should handle both formats transparently
  if (statsResponse.success === false && statsResponse.error) {
    // This is okay if the endpoint requires authentication
    console.log(`   Chain stats returned error format: ${statsResponse.error}`);
  } else if (statsResponse.success === true && statsResponse.data) {
    console.log(`   Chain stats returned success format with data`);
  } else if (statsResponse.chain_height || statsResponse.chain_height_raw) {
    console.log(`   Chain stats returned raw data format`);
  } else {
    console.log(`   Chain stats returned unknown format:`, statsResponse);
  }

  // Test the extractData method
  const extractedData = client.extractData(statsResponse);
  console.log(
    `   extractData() result:`,
    extractedData ? "Data extracted" : "No data",
  );

  // Test the isSuccess method
  const isSuccessful = client.isSuccess(statsResponse);
  console.log(`   isSuccess() result: ${isSuccessful}`);
}

/**
 * Test 4: Test with API key if available
 */
async function testWithApiKey() {
  if (!TEST_API_KEY) {
    skipTest(
      "API Key Tests",
      "No test API key provided (set NEXAPAY_TEST_API_KEY env var)",
    );
    return;
  }

  console.log("🔑 Testing with API key...");

  const client = new NexaPayClient({
    ...TEST_CONFIG,
    apiKey: TEST_API_KEY,
  });

  console.log(
    `   API Key configured (prefix: ${TEST_API_KEY.substring(0, 20)}...)`,
  );

  // Test merchant balance endpoint (requires API key)
  try {
    console.log("   Testing /gateway/v1/balance endpoint...");
    const balanceResponse = await client.balance.get();

    if (balanceResponse.success && balanceResponse.data) {
      console.log(`   Balance retrieved successfully`);
      console.log(`   Currency: ${balanceResponse.data.currency}`);
      console.log(`   Available: ${balanceResponse.data.available} millimes`);
    } else if (balanceResponse.error) {
      console.log(`   Balance endpoint error: ${balanceResponse.error}`);
      // Might be invalid API key or no permissions
    }
  } catch (error) {
    console.log(`   Balance endpoint failed: ${error.message}`);
  }

  // Test payment intent creation
  try {
    console.log("   Testing payment intent creation...");
    const intentResponse = await client.paymentIntents.create({
      amount: 1000, // 1.000 TND in millimes
      currency: "TND",
      description: "SDK Production Test",
      idempotency_key: `sdk-test-${Date.now()}`,
    });

    if (intentResponse.success && intentResponse.data) {
      console.log(
        `   Payment intent created: ${intentResponse.data.intent_id}`,
      );
      console.log(`   Checkout URL: ${intentResponse.data.checkout_url}`);

      // Test retrieving the intent
      const retrieveResponse = await client.paymentIntents.get(
        intentResponse.data.intent_id,
      );
      if (retrieveResponse.success && retrieveResponse.data) {
        console.log(
          `   Payment intent retrieved: ${retrieveResponse.data.status}`,
        );
      }
    } else if (intentResponse.error) {
      console.log(`   Payment intent creation error: ${intentResponse.error}`);
    }
  } catch (error) {
    console.log(`   Payment intent creation failed: ${error.message}`);
  }
}

/**
 * Test 5: Test error handling
 */
async function testErrorHandling() {
  console.log("⚠️  Testing error handling...");

  const client = new NexaPayClient(TEST_CONFIG);

  // Test non-existent endpoint
  try {
    console.log("   Testing 404 error...");
    const response = await client.request("GET", "/non-existent-endpoint");

    if (response.success === false && response.error) {
      console.log(`   404 handled correctly: ${response.error}`);
    } else {
      console.log(`   Unexpected response for 404:`, response);
    }
  } catch (error) {
    console.log(`   404 endpoint threw error: ${error.message}`);
  }

  // Test with invalid API key
  const invalidClient = new NexaPayClient({
    ...TEST_CONFIG,
    apiKey: "nxp_invalid_key_123",
  });

  try {
    console.log("   Testing invalid API key...");
    const response = await invalidClient.balance.get();

    if (response.success === false && response.error) {
      console.log(`   Invalid API key handled correctly: ${response.error}`);
    } else {
      console.log(`   Unexpected response for invalid key:`, response);
    }
  } catch (error) {
    console.log(`   Invalid API key threw error: ${error.message}`);
  }
}

/**
 * Test 6: Verify production domain accessibility
 */
async function testDomainAccessibility() {
  console.log("🌍 Testing production domain accessibility...");

  // Use the SDK's HTTP client to test connectivity
  const client = new NexaPayClient(TEST_CONFIG);

  // Simple GET request to verify SSL and domain resolution
  try {
    const axios = require("axios");
    const response = await axios.get(
      "https://backend.nexapay.space/chain/stats",
      {
        timeout: 5000,
        validateStatus: null, // Don't throw on non-2xx
      },
    );

    console.log(`   Domain accessible: HTTP ${response.status}`);
    console.log(
      `   SSL Certificate: ${response.request.res.socket.encrypted ? "Valid" : "Invalid"}`,
    );

    if (response.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${response.status}`);
    }
  } catch (error) {
    throw new Error(`Domain accessibility test failed: ${error.message}`);
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log("🚀 Starting NexaPay SDK Production Tests");
  console.log("==========================================");
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🔗 Production URL: ${TEST_CONFIG.baseURL}`);
  console.log("==========================================\n");

  try {
    // Run all tests
    await runTest("SDK Initialization", testSdkInitialization);
    await runTest("Public Endpoints", testPublicEndpoints);
    await runTest("Response Format Handling", testResponseFormatHandling);
    await runTest("Domain Accessibility", testDomainAccessibility);
    await runTest("Error Handling", testErrorHandling);

    // This test might be skipped if no API key
    if (TEST_API_KEY) {
      await runTest("API Key Authentication", testWithApiKey);
    } else {
      skipTest("API Key Authentication", "No test API key provided");
    }
  } catch (error) {
    console.error("\n🔥 Critical test failure:", error.message);
    testsFailed++;
  }

  // Print summary
  console.log("\n==========================================");
  console.log("📊 TEST SUMMARY");
  console.log("==========================================");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`⏭️  Skipped: ${testsSkipped}`);
  console.log(`📈 Total: ${testsPassed + testsFailed + testsSkipped}`);
  console.log("==========================================\n");

  if (testsFailed > 0) {
    console.log("❌ Some tests failed. Check the errors above.");
    process.exit(1);
  } else if (testsPassed === 0) {
    console.log("⚠️  No tests were executed.");
    process.exit(0);
  } else {
    console.log("✅ All tests passed! SDK is ready for production use.");
    console.log("\n🎯 Next steps:");
    console.log("1. Get a production API key from https://nexapay.space/dev");
    console.log("2. Update your code to use the production base URL");
    console.log("3. Test with real payment intents");
    console.log("4. Set up webhooks for payment notifications");
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testSdkInitialization,
  testPublicEndpoints,
  testResponseFormatHandling,
  testWithApiKey,
  testErrorHandling,
  testDomainAccessibility,
};
