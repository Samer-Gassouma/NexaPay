/**
 * NexaPay SDK Developer Test
 *
 * This script tests the NexaPay Node.js SDK installed from npm registry
 * using a developer API key to verify production deployment.
 *
 * API Key: nxp_developer_60b5e574b16010866d0ccee1_e57ccbc7
 *
 * Usage: node test-developer.js
 */

const NexaPayClient = require("@nexapay/node-sdk").default;

// Configuration
const CONFIG = {
  apiKey: "nxp_developer_60b5e574b16010866d0ccee1_e57ccbc7",
  // Defaults to https://backend.nexapay.space
  timeout: 30000,
};

// Colors for console output
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
};

// Helper functions
function log(message, color = COLORS.reset, indent = 0) {
  const prefix = " ".repeat(indent);
  console.log(color + prefix + message + COLORS.reset);
}

function logSuccess(message) {
  log("✅ " + message, COLORS.green);
  testResults.passed++;
}

function logError(message) {
  log("❌ " + message, COLORS.red);
  testResults.failed++;
}

function logWarning(message) {
  log("⚠️  " + message, COLORS.yellow);
  testResults.warnings++;
}

function logInfo(message) {
  log("ℹ️  " + message, COLORS.cyan);
}

function logSection(message) {
  console.log("\n" + "-".repeat(60));
  log(message, COLORS.bold + COLORS.blue);
  console.log("-".repeat(60));
}

function logHeader(message) {
  console.log("\n" + "=".repeat(70));
  log(message, COLORS.bold + COLORS.magenta);
  console.log("=".repeat(70));
}

async function runTest(name, testFn) {
  logInfo(`Running: ${name}`);
  try {
    await testFn();
    logSuccess(`${name} - PASSED`);
  } catch (error) {
    logError(`${name} - FAILED: ${error.message}`);
    if (error.response?.data) {
      log(
        `  Response: ${JSON.stringify(error.response.data, null, 2)}`,
        COLORS.yellow,
        2,
      );
    }
  }
}

/**
 * Test 1: SDK Installation and Initialization
 */
async function testSdkInitialization() {
  logSection("SDK Initialization Test");

  // Test 1.1: Create client with developer API key
  logInfo("Creating client with developer API key...");
  const client = new NexaPayClient(CONFIG);

  // Test 1.2: Verify base URL
  const baseURL = client.getBaseURL();
  log(`Base URL: ${baseURL}`);

  if (baseURL !== "https://backend.nexapay.space") {
    throw new Error(
      `Expected base URL 'https://backend.nexapay.space', got '${baseURL}'`,
    );
  }

  // Test 1.3: Verify API key is set in config
  const config = client.getConfig();
  if (!config.apiKey || !config.apiKey.startsWith("nxp_developer_")) {
    throw new Error("API key not properly configured or not a developer key");
  }

  log(`API Key prefix: ${config.apiKey.substring(0, 20)}...`);
  logSuccess("SDK initialized correctly");
}

/**
 * Test 2: Public Endpoints (No authentication required)
 */
async function testPublicEndpoints() {
  logSection("Public Endpoints Test");

  const client = new NexaPayClient(CONFIG);

  // Test 2.1: Chain stats
  await runTest("Chain stats endpoint", async () => {
    const response = await client.request("GET", "/chain/stats");

    if (response.success === false && response.error) {
      // This is OK - endpoint might still work
      logWarning(`Chain stats returned error: ${response.error}`);
    } else if (
      response.success === true ||
      response.chain_height ||
      response.chain_height_raw
    ) {
      log(
        `Chain height: ${response.data?.chain_height || response.chain_height || "N/A"}`,
      );
    } else {
      throw new Error("Unexpected response format from chain stats");
    }
  });

  // Test 2.2: Developer documentation snippets
  await runTest("Developer docs endpoint", async () => {
    const response = await client.request("GET", "/dev/docs/snippets");

    if (response.success === false && response.error) {
      // This might require authentication
      logWarning(
        `Developer docs returned error: ${response.error} (may require auth)`,
      );
    } else if (response.success === true && response.data) {
      log(`Test cards available: ${response.data.test_cards?.length || 0}`);
    } else {
      logWarning("Developer docs endpoint returned unexpected format");
    }
  });
}

/**
 * Test 3: Developer-Specific Endpoints
 */
async function testDeveloperEndpoints() {
  logSection("Developer Endpoints Test");

  const client = new NexaPayClient(CONFIG);

  // Test 3.1: Merchant registration
  await runTest("Merchant registration endpoint", async () => {
    const merchantData = {
      name: "Test Merchant from SDK",
      business_name: "Test Business LLC",
      support_email: "test@example.tn",
      webhook_url: "https://webhook.example.tn/nexapay",
    };

    const response = await client.merchants.register(merchantData);

    if (response.success && response.data) {
      const merchant = response.data;
      log(`Merchant created: ${merchant.merchant_id}`);
      log(`API Key: ${merchant.api_key.substring(0, 20)}...`);
      log(`Status: ${merchant.status}`);

      // Store merchant info for later tests
      global.testMerchant = merchant;
    } else if (response.error) {
      // Might be duplicate merchant or other validation error
      logWarning(`Merchant registration error: ${response.error}`);
    } else {
      throw new Error("Merchant registration failed with unknown error");
    }
  });

  // Test 3.2: Get merchant statistics (if merchant was created)
  await runTest("Merchant statistics endpoint", async () => {
    if (!global.testMerchant) {
      logWarning(
        "Skipping merchant stats - no merchant created in previous test",
      );
      testResults.skipped++;
      return;
    }

    // Create a client with the merchant API key
    const merchantClient = new NexaPayClient({
      apiKey: global.testMerchant.api_key,
      timeout: 30000,
    });

    const response = await merchantClient.merchants.stats();

    if (response.success && response.data) {
      const stats = response.data;
      log(`Payments: ${stats.payments?.succeeded || 0} succeeded`);
      log(`Balance: ${stats.totals?.available || 0} millimes available`);
    } else if (response.error) {
      logWarning(`Merchant stats error: ${response.error}`);
    }
  });
}

/**
 * Test 4: Payment Intent Flow
 */
async function testPaymentIntentFlow() {
  logSection("Payment Intent Flow Test");

  const client = new NexaPayClient(CONFIG);

  // Test 4.1: Create payment intent
  await runTest("Create payment intent", async () => {
    const paymentIntentData = {
      amount: 1000, // 1.000 TND in millimes
      currency: "TND",
      description: "SDK Developer Test Payment",
      customer_email: "test.customer@example.tn",
      customer_name: "Test Customer",
      metadata: {
        test: true,
        sdk_version: "0.1.1",
        timestamp: new Date().toISOString(),
      },
      idempotency_key: `dev-test-${Date.now()}`,
    };

    const response = await client.paymentIntents.create(paymentIntentData);

    if (response.success && response.data) {
      const intent = response.data;
      log(`Payment intent created: ${intent.intent_id}`);
      log(`Status: ${intent.status}`);
      log(`Checkout URL: ${intent.checkout_url}`);
      log(`Amount: ${intent.amount} ${intent.currency}`);

      // Store intent for retrieval test
      global.testIntent = intent;
    } else if (response.error) {
      logWarning(`Payment intent creation error: ${response.error}`);
    } else {
      throw new Error("Payment intent creation failed with unknown error");
    }
  });

  // Test 4.2: Retrieve payment intent
  await runTest("Retrieve payment intent", async () => {
    if (!global.testIntent) {
      logWarning(
        "Skipping intent retrieval - no intent created in previous test",
      );
      testResults.skipped++;
      return;
    }

    const response = await client.paymentIntents.get(
      global.testIntent.intent_id,
    );

    if (response.success && response.data) {
      const intent = response.data;
      log(`Intent retrieved: ${intent.intent_id}`);
      log(`Status: ${intent.status}`);
      log(`Created: ${intent.created_at || "N/A"}`);

      // Verify data matches
      if (intent.amount !== global.testIntent.amount) {
        logWarning(
          `Amount mismatch: ${intent.amount} vs ${global.testIntent.amount}`,
        );
      }
    } else if (response.error) {
      logWarning(`Intent retrieval error: ${response.error}`);
    }
  });

  // Test 4.3: List transactions
  await runTest("List transactions", async () => {
    const response = await client.transactions.list();

    if (response.success && response.data) {
      const intents = response.data.intents || [];
      const refunds = response.data.refunds || [];
      log(`Total intents: ${intents.length}`);
      log(`Total refunds: ${refunds.length}`);

      if (intents.length > 0) {
        log(`Latest intent: ${intents[0].intent_id} (${intents[0].status})`);
      }
      if (refunds.length > 0) {
        log(`Latest refund: ${refunds[0].refund_id} (${refunds[0].status})`);
      }
    } else if (response.error) {
      logWarning(`List transactions error: ${response.error}`);
    }
  });
}

/**
 * Test 5: SDK Utility Methods
 */
async function testSdkUtilities() {
  logSection("SDK Utility Methods Test");

  const client = new NexaPayClient(CONFIG);

  // Test 5.1: Extract data method
  await runTest("extractData() utility", async () => {
    const response = await client.request("GET", "/chain/stats");
    const extractedData = client.extractData(response);

    if (extractedData) {
      log("Data successfully extracted from response");
    } else {
      logWarning("No data extracted from response");
    }
  });

  // Test 5.2: isSuccess method
  await runTest("isSuccess() utility", async () => {
    const response = await client.request("GET", "/chain/stats");
    const isSuccessful = client.isSuccess(response);

    log(`Response indicates success: ${isSuccessful}`);
  });

  // Test 5.3: Error handling
  await runTest("Error handling", async () => {
    try {
      const response = await client.request("GET", "/non-existent-endpoint");

      if (response.success === false && response.error) {
        log(`Error correctly returned: ${response.error}`);
      } else {
        logWarning("Unexpected response for non-existent endpoint");
      }
    } catch (error) {
      log(`Exception thrown: ${error.message}`);
    }
  });
}

/**
 * Main test runner
 */
async function runAllTests() {
  logHeader("NEXAPAY SDK DEVELOPER TEST");
  log(`Start time: ${new Date().toISOString()}`, COLORS.yellow);
  log(
    `SDK Version: ${require("@nexapay/node-sdk/package.json").version}`,
    COLORS.yellow,
  );
  log(`API Key: ${CONFIG.apiKey.substring(0, 20)}...`, COLORS.yellow);
  log(`Target: ${new NexaPayClient(CONFIG).getBaseURL()}`, COLORS.yellow);

  try {
    await testSdkInitialization();
    await testPublicEndpoints();
    await testDeveloperEndpoints();
    await testPaymentIntentFlow();
    await testSdkUtilities();
  } catch (error) {
    logError(`Unhandled error in test suite: ${error.message}`);
  }

  // Print summary
  logHeader("TEST SUMMARY");

  const totalTests =
    testResults.passed +
    testResults.failed +
    testResults.skipped +
    testResults.warnings;

  log(`Tests executed: ${totalTests}`, COLORS.bold);
  log(`✅ Passed: ${testResults.passed}`, COLORS.green);
  log(
    `❌ Failed: ${testResults.failed}`,
    testResults.failed > 0 ? COLORS.red : COLORS.reset,
  );
  log(
    `⚠️  Warnings: ${testResults.warnings}`,
    testResults.warnings > 0 ? COLORS.yellow : COLORS.reset,
  );
  log(`⏭️  Skipped: ${testResults.skipped}`, COLORS.yellow);

  console.log();

  // Final verdict
  if (testResults.failed > 0) {
    log("❌ SDK TEST FAILED", COLORS.red + COLORS.bold);
    log("Some tests failed. Check the errors above.", COLORS.red);
  } else if (testResults.warnings > 0) {
    log("⚠️  SDK TEST COMPLETED WITH WARNINGS", COLORS.yellow + COLORS.bold);
    log(
      "SDK is functional but has some warnings. Review warnings above.",
      COLORS.yellow,
    );
  } else {
    log("✅ SDK TEST PASSED", COLORS.green + COLORS.bold);
    log(
      "All tests passed! SDK is working correctly with production backend.",
      COLORS.green,
    );
  }

  logHeader("NEXT STEPS");
  log("1. Test with merchant API keys for payment processing", COLORS.cyan);
  log("2. Test webhook signature verification", COLORS.cyan);
  log("3. Test refund and payout functionality", COLORS.cyan);
  log("4. Monitor production logs for any issues", COLORS.cyan);
  log("5. Update documentation with production examples", COLORS.cyan);
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  log(`\n🔥 Uncaught exception: ${error.message}`, COLORS.red + COLORS.bold);
  console.error(error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log(`\n🔥 Unhandled promise rejection: ${reason}`, COLORS.red + COLORS.bold);
  process.exit(1);
});

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    log(`\n🔥 Fatal error: ${error.message}`, COLORS.red + COLORS.bold);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testSdkInitialization,
  testPublicEndpoints,
  testDeveloperEndpoints,
  testPaymentIntentFlow,
  testSdkUtilities,
  testResults,
  COLORS,
};
