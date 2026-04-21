/**
 * NexaPay SDK Local Integration Test
 *
 * This script tests the SDK integration with the local NexaPay services.
 * Run this after starting the local services with `docker compose up -d`.
 *
 * Services should be running on:
 * - Backend API: http://localhost:8088
 * - Web Portal: http://localhost:3001
 * - PostgreSQL: localhost:5433
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Import the local SDK (built version)
const sdkPath = path.join(__dirname, "sdk", "dist");
const { default: NexaPay } = require(path.join(sdkPath, "index.js"));

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

console.log(
  `${colors.cyan}╔═══════════════════════════════════════╗${colors.reset}`,
);
console.log(
  `${colors.cyan}║    NexaPay SDK Local Integration Test  ║${colors.reset}`,
);
console.log(
  `${colors.cyan}╚═══════════════════════════════════════╝${colors.reset}\n`,
);

// Test configuration
const config = {
  baseURL: "http://localhost:8088",
  portalURL: "http://localhost:3001",
  testTimeout: 30000,
};

// Test state
let testState = {
  developerApiKey: null,
  merchantApiKey: null,
  merchantId: null,
  paymentIntentId: null,
  testResults: [],
};

/**
 * Log test result
 */
function logTest(name, success, message = "") {
  const status = success
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`;
  const statusText = success ? "PASS" : "FAIL";
  console.log(`${status} ${name} ${message ? `- ${message}` : ""}`);

  testState.testResults.push({
    name,
    success,
    message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Wait for a specified time
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if services are running
 */
async function checkServices() {
  console.log(`${colors.blue}🔍 Checking local services...${colors.reset}\n`);

  try {
    // Check backend API
    const apiResponse = await axios.get(`${config.baseURL}/chain/stats`, {
      timeout: 5000,
    });
    if (apiResponse.data && apiResponse.data.network_status) {
      logTest(
        "Backend API",
        true,
        `Chain height: ${apiResponse.data.chain_height}`,
      );
    } else {
      logTest("Backend API", false, "Invalid response");
    }
  } catch (error) {
    logTest("Backend API", false, `Error: ${error.message}`);
  }

  try {
    // Check portal
    const portalResponse = await axios.get(`${config.portalURL}`, {
      timeout: 5000,
    });
    if (portalResponse.status === 200) {
      logTest("Web Portal", true, "Portal is accessible");
    } else {
      logTest("Web Portal", false, `Status: ${portalResponse.status}`);
    }
  } catch (error) {
    logTest("Web Portal", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 1: Direct API calls (without SDK)
 */
async function testDirectApiCalls() {
  console.log(`${colors.blue}🧪 Test 1: Direct API Calls${colors.reset}\n`);

  try {
    // Register a developer
    const registerResponse = await axios.post(
      `${config.baseURL}/dev/register`,
      {
        company_name: "SDK Test Corp",
        contact_name: "SDK Tester",
        email: `sdk-test-${Date.now()}@example.com`,
        plan: "free",
      },
      { timeout: 10000 },
    );

    if (registerResponse.data && registerResponse.data.api_key) {
      testState.developerApiKey = registerResponse.data.api_key;
      logTest(
        "Register Developer",
        true,
        `Key: ${registerResponse.data.api_key_prefix}...`,
      );
    } else {
      logTest("Register Developer", false, "No API key in response");
    }
  } catch (error) {
    logTest("Register Developer", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 2: SDK Initialization and Basic Methods
 */
async function testSdkInitialization() {
  console.log(`${colors.blue}🧪 Test 2: SDK Initialization${colors.reset}\n`);

  try {
    // Test with developer API key
    if (!testState.developerApiKey) {
      logTest("SDK Initialization", false, "No developer API key available");
      return;
    }

    const client = new NexaPay({
      apiKey: testState.developerApiKey,
      baseURL: config.baseURL,
      timeout: 10000,
    });

    logTest("Create SDK Client", true, "Client created successfully");

    // Test getting chain stats via SDK
    try {
      const response = await client.get("/chain/stats");
      if (response.success) {
        logTest(
          "SDK GET Request",
          true,
          `Chain height: ${response.data.chain_height}`,
        );
      } else {
        logTest("SDK GET Request", false, response.error || "Unknown error");
      }
    } catch (error) {
      logTest("SDK GET Request", false, `Error: ${error.message}`);
    }

    // Test developer resource
    try {
      const response = await client.developer.docsSnippets();
      if (response.success && response.data) {
        logTest("Developer Resource", true, "Got documentation snippets");
      } else {
        logTest("Developer Resource", false, response.error || "No data");
      }
    } catch (error) {
      logTest("Developer Resource", false, `Error: ${error.message}`);
    }

    testState.sdkClient = client;
  } catch (error) {
    logTest("SDK Initialization", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 3: Merchant Registration Flow
 */
async function testMerchantRegistration() {
  console.log(
    `${colors.blue}🧪 Test 3: Merchant Registration${colors.reset}\n`,
  );

  if (!testState.sdkClient) {
    logTest("Merchant Registration", false, "SDK client not available");
    return;
  }

  try {
    const timestamp = Date.now();
    const merchantData = {
      name: `Test Store ${timestamp}`,
      business_name: `Test Store ${timestamp} SARL`,
      support_email: `support+${timestamp}@teststore.tn`,
      webhook_url: `https://teststore.tn/webhooks/${timestamp}`,
    };

    const response = await testState.sdkClient.merchants.register(merchantData);

    if (response.success && response.data) {
      testState.merchantApiKey = response.data.api_key;
      testState.merchantId = response.data.merchant_id;
      testState.merchantUuid = response.data.merchant_uuid;

      logTest(
        "Register Merchant",
        true,
        `Merchant ID: ${response.data.merchant_id}`,
      );
      logTest(
        "Merchant API Key",
        true,
        `Prefix: ${response.data.api_key_prefix}...`,
      );
      logTest("Checkout URL", true, `Base: ${response.data.checkout_base_url}`);

      // Create a merchant client for subsequent tests
      testState.merchantClient = new NexaPay({
        apiKey: testState.merchantApiKey,
        baseURL: config.baseURL,
        timeout: 10000,
      });

      logTest("Create Merchant Client", true, "Merchant client ready");
    } else {
      logTest("Register Merchant", false, response.error || "Unknown error");
    }
  } catch (error) {
    logTest("Merchant Registration", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 4: Payment Intent Creation
 */
async function testPaymentIntentCreation() {
  console.log(
    `${colors.blue}🧪 Test 4: Payment Intent Creation${colors.reset}\n`,
  );

  if (!testState.merchantClient) {
    logTest("Payment Intent", false, "Merchant client not available");
    return;
  }

  try {
    const intentData = {
      amount: 42000, // 42.000 TND in millimes
      currency: "TND",
      description: "Test Order #1",
      customer_email: "test.customer@example.tn",
      customer_name: "Test Customer",
      idempotency_key: `test-order-${Date.now()}`,
    };

    const response =
      await testState.merchantClient.paymentIntents.create(intentData);

    if (response.success && response.data) {
      testState.paymentIntentId = response.data.intent_id;
      testState.paymentIntent = response.data;

      logTest(
        "Create Payment Intent",
        true,
        `Intent ID: ${response.data.intent_id}`,
      );
      logTest("Intent Status", true, `Status: ${response.data.status}`);
      logTest(
        "Intent Amount",
        true,
        `${response.data.amount} ${response.data.currency}`,
      );
      logTest("Checkout URL", true, `URL: ${response.data.checkout_url}`);

      // Test retrieving the intent
      try {
        const getResponse = await testState.merchantClient.paymentIntents.get(
          response.data.intent_id,
        );
        if (getResponse.success && getResponse.data) {
          logTest(
            "Retrieve Payment Intent",
            true,
            "Intent retrieved successfully",
          );
        } else {
          logTest(
            "Retrieve Payment Intent",
            false,
            getResponse.error || "Unknown error",
          );
        }
      } catch (error) {
        logTest("Retrieve Payment Intent", false, `Error: ${error.message}`);
      }
    } else {
      logTest(
        "Create Payment Intent",
        false,
        response.error || "Unknown error",
      );
    }
  } catch (error) {
    logTest("Payment Intent Creation", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 5: Balance and Transactions
 */
async function testBalanceAndTransactions() {
  console.log(
    `${colors.blue}🧪 Test 5: Balance & Transactions${colors.reset}\n`,
  );

  if (!testState.merchantClient) {
    logTest("Balance Check", false, "Merchant client not available");
    return;
  }

  try {
    // Test balance
    const balanceResponse = await testState.merchantClient.balance.get();

    if (balanceResponse.success && balanceResponse.data) {
      logTest(
        "Get Balance",
        true,
        `Currency: ${balanceResponse.data.currency}`,
      );
      logTest(
        "Available Balance",
        true,
        `${balanceResponse.data.available} millimes`,
      );

      // Check if we have valid balance data
      if (
        typeof balanceResponse.data.gross === "number" &&
        typeof balanceResponse.data.available === "number"
      ) {
        logTest("Balance Data Structure", true, "All fields present");
      } else {
        logTest("Balance Data Structure", false, "Missing fields");
      }
    } else {
      logTest("Get Balance", false, balanceResponse.error || "Unknown error");
    }
  } catch (error) {
    logTest("Balance Check", false, `Error: ${error.message}`);
  }

  try {
    // Test transactions
    const txResponse = await testState.merchantClient.transactions.list();

    if (txResponse.success && txResponse.data) {
      logTest("Get Transactions", true, "Transaction data received");

      if (Array.isArray(txResponse.data.intents)) {
        logTest(
          "Transactions Structure",
          true,
          `Intents: ${txResponse.data.intents.length}`,
        );
      }

      if (Array.isArray(txResponse.data.refunds)) {
        logTest(
          "Refunds Structure",
          true,
          `Refunds: ${txResponse.data.refunds.length}`,
        );
      }
    } else {
      logTest("Get Transactions", false, txResponse.error || "Unknown error");
    }
  } catch (error) {
    logTest("Transactions Check", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 6: Checkout Flow Simulation
 */
async function testCheckoutFlow() {
  console.log(
    `${colors.blue}🧪 Test 6: Checkout Flow Simulation${colors.reset}\n`,
  );

  if (!testState.paymentIntentId) {
    logTest("Checkout Flow", false, "No payment intent available");
    return;
  }

  // Simulate customer being redirected to checkout
  const checkoutUrl = `${config.portalURL}/checkout/${testState.paymentIntentId}`;
  logTest("Checkout URL Generation", true, `URL: ${checkoutUrl}`);

  try {
    // Check if checkout page is accessible
    const response = await axios.get(checkoutUrl, { timeout: 5000 });
    if (response.status === 200) {
      logTest("Checkout Page Access", true, "Checkout page is accessible");

      // Check if page contains expected elements
      const html = response.data;
      if (
        html.includes("NexaPay Checkout") ||
        html.includes("Secure Payment")
      ) {
        logTest("Checkout Page Content", true, "Contains payment form");
      } else {
        logTest("Checkout Page Content", false, "Missing payment form");
      }
    } else {
      logTest("Checkout Page Access", false, `Status: ${response.status}`);
    }
  } catch (error) {
    logTest("Checkout Page Access", false, `Error: ${error.message}`);
  }

  console.log("");
}

/**
 * Test 7: Payment Confirmation (Test Card)
 */
async function testPaymentConfirmation() {
  console.log(
    `${colors.blue}🧪 Test 7: Payment Confirmation Test${colors.reset}\n`,
  );

  if (!testState.paymentIntentId) {
    logTest("Payment Confirmation", false, "No payment intent available");
    return;
  }

  // Note: In production, you should use the hosted checkout page.
  // This direct confirmation is for testing only.

  console.log(
    `${colors.yellow}⚠️  Note: Direct payment confirmation bypasses hosted checkout.`,
  );
  console.log(
    `   In production, redirect customers to checkout_url instead.${colors.reset}\n`,
  );

  try {
    const testCardData = {
      card_number: "4242424242424242", // Test success card
      expiry_month: "12",
      expiry_year: "2029",
      cvv: "123",
      pin: "1234",
      card_holder_name: "Test Cardholder",
    };

    // Use direct API call for this test since SDK might not have merchant client
    const response = await axios.post(
      `${config.baseURL}/gateway/v1/intents/${testState.paymentIntentId}/confirm`,
      testCardData,
      {
        timeout: 10000,
        headers: testState.merchantApiKey
          ? {
              "X-API-Key": testState.merchantApiKey,
            }
          : {},
      },
    );

    if (response.data && response.data.success !== undefined) {
      if (response.data.success) {
        logTest(
          "Payment Confirmation",
          true,
          `Status: ${response.data.status}`,
        );
        logTest("Payment Success", true, "Test payment succeeded!");

        if (response.data.redirect_url) {
          logTest("Redirect URL", true, "Redirect URL provided");
        }
      } else {
        logTest(
          "Payment Confirmation",
          true,
          `Status: ${response.data.status}`,
        );
        logTest(
          "Payment Failed",
          false,
          response.data.failure_reason || "Unknown reason",
        );
      }
    } else {
      logTest("Payment Confirmation", false, "Invalid response format");
    }
  } catch (error) {
    logTest("Payment Confirmation", false, `Error: ${error.message}`);

    if (error.response) {
      console.log(
        `${colors.yellow}Response status: ${error.response.status}${colors.reset}`,
      );
      console.log(
        `${colors.yellow}Response data: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`,
      );
    }
  }

  console.log("");
}

/**
 * Test 8: Error Handling
 */
async function testErrorHandling() {
  console.log(`${colors.blue}🧪 Test 8: SDK Error Handling${colors.reset}\n`);

  try {
    // Test with invalid API key
    const invalidClient = new NexaPay({
      apiKey: "invalid_key_nxp_invalid_12345678",
      baseURL: config.baseURL,
      timeout: 5000,
    });

    const response = await invalidClient.balance.get();
    if (response.success === false) {
      logTest(
        "Invalid API Key",
        true,
        `Correctly rejected: ${response.error || "Invalid API key"}`,
      );
    } else {
      logTest("Invalid API Key", false, "Should have returned success: false");
    }

    // Test with merchant client for validation errors
    if (testState.merchantClient) {
      const response = await testState.merchantClient.paymentIntents.create({
        amount: 0, // Invalid amount
        currency: "TND",
      });
      if (response.success === false) {
        logTest("Validation Error", true, "Correctly returned success: false");
      } else {
        logTest(
          "Validation Error",
          false,
          "Should have returned success: false",
        );
      }
    }
  } catch (error) {
    logTest("Error Handling Test", false, `Unexpected error: ${error.message}`);
  }

  console.log("");
}

/**
 * Generate test report
 */
function generateReport() {
  console.log(`${colors.cyan}📊 Test Summary${colors.reset}\n`);

  const totalTests = testState.testResults.length;
  const passedTests = testState.testResults.filter((t) => t.success).length;
  const failedTests = totalTests - passedTests;

  console.log(`Total Tests: ${totalTests}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(
    `${failedTests > 0 ? colors.red : colors.green}Failed: ${failedTests}${colors.reset}`,
  );

  const passRate =
    totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  console.log(`Pass Rate: ${passRate}%\n`);

  if (failedTests > 0) {
    console.log(`${colors.yellow}⚠️  Failed Tests:${colors.reset}`);
    testState.testResults
      .filter((t) => !t.success)
      .forEach((t) => {
        console.log(`  • ${t.name}: ${t.message}`);
      });
    console.log("");
  }

  // Save test results to file
  const report = {
    timestamp: new Date().toISOString(),
    config,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      passRate,
    },
    results: testState.testResults,
    state: {
      developerApiKeyPrefix: testState.developerApiKey
        ? testState.developerApiKey.substring(0, 20) + "..."
        : null,
      merchantApiKeyPrefix: testState.merchantApiKey
        ? testState.merchantApiKey.substring(0, 20) + "..."
        : null,
      merchantId: testState.merchantId,
      paymentIntentId: testState.paymentIntentId,
    },
  };

  const reportFile = `sdk-test-report-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log(
    `${colors.cyan}📄 Test report saved to: ${reportFile}${colors.reset}\n`,
  );
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(
    `${colors.magenta}🚀 Starting NexaPay SDK Integration Tests${colors.reset}`,
  );
  console.log(
    `${colors.magenta}============================================${colors.reset}\n`,
  );

  console.log(`${colors.yellow}📋 Test Configuration:${colors.reset}`);
  console.log(`  Backend URL: ${config.baseURL}`);
  console.log(`  Portal URL: ${config.portalURL}`);
  console.log(`  Timeout: ${config.testTimeout}ms\n`);

  try {
    // Run tests in sequence
    await checkServices();
    await testDirectApiCalls();
    await testSdkInitialization();
    await testMerchantRegistration();
    await testPaymentIntentCreation();
    await testBalanceAndTransactions();
    await testCheckoutFlow();
    await testPaymentConfirmation();
    await testErrorHandling();

    console.log(
      `${colors.cyan}════════════════════════════════════════════════${colors.reset}\n`,
    );

    generateReport();

    // Provide next steps
    console.log(`${colors.green}✅ All tests completed!${colors.reset}\n`);

    if (testState.merchantApiKey && testState.paymentIntentId) {
      console.log(`${colors.blue}🔗 Test Resources Created:${colors.reset}`);
      console.log(`  • Merchant ID: ${testState.merchantId}`);
      console.log(`  • Payment Intent: ${testState.paymentIntentId}`);
      console.log(
        `  • Checkout URL: ${config.portalURL}/checkout/${testState.paymentIntentId}`,
      );
      console.log(
        `  • API Key Prefix: ${testState.merchantApiKey.substring(0, 20)}...`,
      );
    }

    console.log(`\n${colors.yellow}📝 Next Steps:${colors.reset}`);
    console.log(`  1. View the web portal: ${config.portalURL}`);
    console.log(`  2. Test checkout flow manually`);
    console.log(`  3. Review test report for details`);
    console.log(`  4. Use the SDK in your own projects!`);
  } catch (error) {
    console.log(
      `${colors.red}❌ Test runner failed: ${error.message}${colors.reset}`,
    );
    console.log(error.stack);

    // Generate partial report
    generateReport();
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

// Export for use in other test files
module.exports = {
  runAllTests,
  testState,
  config,
};
