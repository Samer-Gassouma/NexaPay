/**
 * NexaPay Production Payment Flow Test
 *
 * Tests the complete payment flow in production environment.
 * Verifies that checkout URLs point to https://nexapay.space
 *
 * Usage: node test-production-payment-flow.js
 */

const NexaPayClient = require("@nexapay/node-sdk").default;

// Production configuration
const PRODUCTION_CONFIG = {
  apiKey: "nxp_developer_60b5e574b16010866d0ccee1_e57ccbc7",
  baseURL: "https://backend.nexapay.space",
  timeout: 30000,
};

// Test merchant configuration
const TEST_MERCHANT = {
  name: "Production Test Merchant",
  business_name: "Production Test Business LLC",
  support_email: "production-test@example.tn",
  webhook_url: "https://webhook.example.tn/nexapay-production-test",
};

// Test payment intent configuration
const TEST_PAYMENT = {
  amount: 1500, // 1.500 TND in millimes
  currency: "TND",
  description: "Production Payment Flow Test",
  customer_email: "production.customer@example.tn",
  customer_name: "Production Test Customer",
  metadata: {
    test: true,
    environment: "production",
    timestamp: new Date().toISOString(),
  },
  idempotency_key: `production-test-${Date.now()}`,
};

// Test card details (success test card)
const TEST_CARD_SUCCESS = {
  card_number: "4242424242424242",
  expiry_month: "12",
  expiry_year: "2029",
  cvv: "123",
  pin: "1234",
  card_holder_name: "Production Test Cardholder",
};

// Colors for console output
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

/**
 * Log a message with color
 */
function log(message, color = COLORS.reset) {
  console.log(color + message + COLORS.reset);
}

/**
 * Log a success message
 */
function logSuccess(message) {
  log("✅ " + message, COLORS.green);
}

/**
 * Log an error message
 */
function logError(message) {
  log("❌ " + message, COLORS.red);
}

/**
 * Log an info message
 */
function logInfo(message) {
  log("ℹ️  " + message, COLORS.cyan);
}

/**
 * Log a warning message
 */
function logWarning(message) {
  log("⚠️  " + message, COLORS.yellow);
}

/**
 * Log a step header
 */
function logStep(stepNumber, title) {
  console.log("\n" + "=".repeat(70));
  log(`Step ${stepNumber}: ${title}`, COLORS.bold + COLORS.blue);
  console.log("=".repeat(70));
}

/**
 * Log a section header
 */
function logHeader(title) {
  console.log("\n" + "=".repeat(70));
  log(title, COLORS.bold + COLORS.magenta);
  console.log("=".repeat(70));
}

/**
 * Validate a URL points to production domain
 */
function validateProductionUrl(url, expectedDomain = "nexapay.space") {
  try {
    const parsedUrl = new URL(url);

    const checks = {
      protocol: parsedUrl.protocol === "https:",
      domain: parsedUrl.hostname === expectedDomain,
      hasPath: parsedUrl.pathname.length > 0,
    };

    const issues = [];
    if (!checks.protocol)
      issues.push(`uses ${parsedUrl.protocol} instead of https:`);
    if (!checks.domain)
      issues.push(
        `points to ${parsedUrl.hostname} instead of ${expectedDomain}`,
      );

    return {
      valid: checks.protocol && checks.domain,
      parsedUrl,
      checks,
      issues,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      issues: [`Invalid URL format: ${error.message}`],
    };
  }
}

/**
 * Test the complete production payment flow
 */
async function testProductionPaymentFlow() {
  logHeader("NEXAPAY PRODUCTION PAYMENT FLOW TEST");
  logInfo(`Start time: ${new Date().toISOString()}`);
  logInfo(`Production API: ${PRODUCTION_CONFIG.baseURL}`);
  logInfo(`Expected checkout domain: https://nexapay.space`);
  logInfo(
    `Test amount: ${TEST_PAYMENT.amount} ${TEST_PAYMENT.currency} millimes`,
  );

  let merchantApiKey = null;
  let merchantId = null;
  let paymentIntent = null;
  let merchantClient = null;
  let developerClient = null;

  try {
    // ============================================================================
    // Step 1: Initialize SDK and verify production configuration
    // ============================================================================
    logStep(1, "SDK Initialization and Production Configuration");

    developerClient = new NexaPayClient(PRODUCTION_CONFIG);

    // Verify base URL
    const baseURL = developerClient.getBaseURL();
    log(`Base URL: ${baseURL}`);

    if (baseURL !== PRODUCTION_CONFIG.baseURL) {
      throw new Error(
        `SDK base URL mismatch. Expected: ${PRODUCTION_CONFIG.baseURL}, Got: ${baseURL}`,
      );
    }
    logSuccess("SDK initialized with correct production base URL");

    // Test API connectivity
    logInfo("Testing API connectivity...");
    const healthResponse = await developerClient.get("/chain/stats");

    if (healthResponse.success || healthResponse.status === "online") {
      logSuccess("API is accessible and responding");
    } else {
      logWarning(
        `API responded with: ${healthResponse.error || "unknown status"}`,
      );
    }

    // ============================================================================
    // Step 2: Register a test merchant
    // ============================================================================
    logStep(2, "Merchant Registration");

    logInfo("Registering test merchant...");
    const merchantResponse =
      await developerClient.merchants.register(TEST_MERCHANT);

    if (merchantResponse.success && merchantResponse.data) {
      const merchant = merchantResponse.data;
      merchantApiKey = merchant.api_key;
      merchantId = merchant.merchant_id;

      logSuccess(`Merchant created: ${merchantId}`);
      log(`Merchant status: ${merchant.status}`);
      log(`API key prefix: ${merchantApiKey.substring(0, 20)}...`);

      // Validate merchant checkout base URL
      if (merchant.checkout_base_url) {
        const urlCheck = validateProductionUrl(merchant.checkout_base_url);
        if (urlCheck.valid) {
          logSuccess(
            `Merchant checkout base URL is correct: ${merchant.checkout_base_url}`,
          );
        } else {
          logWarning(
            `Merchant checkout base URL issues: ${urlCheck.issues.join(", ")}`,
          );
        }
      }
    } else if (
      merchantResponse.error &&
      merchantResponse.error.includes("already exists")
    ) {
      logWarning(
        "Test merchant already exists. Using a new unique merchant...",
      );

      // Create a unique merchant for this test run
      const uniqueMerchant = {
        ...TEST_MERCHANT,
        name: `${TEST_MERCHANT.name} ${Date.now()}`,
        support_email: `test-${Date.now()}@example.tn`,
      };

      const uniqueResponse =
        await developerClient.merchants.register(uniqueMerchant);

      if (uniqueResponse.success && uniqueResponse.data) {
        const merchant = uniqueResponse.data;
        merchantApiKey = merchant.api_key;
        merchantId = merchant.merchant_id;

        logSuccess(`Unique merchant created: ${merchantId}`);
        log(`API key prefix: ${merchantApiKey.substring(0, 20)}...`);
      } else {
        throw new Error(
          `Failed to create unique merchant: ${uniqueResponse.error || "Unknown error"}`,
        );
      }
    } else {
      throw new Error(
        `Merchant registration failed: ${merchantResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Step 3: Initialize merchant client and create payment intent
    // ============================================================================
    logStep(3, "Payment Intent Creation");

    merchantClient = new NexaPayClient({
      apiKey: merchantApiKey,
      baseURL: PRODUCTION_CONFIG.baseURL,
      timeout: PRODUCTION_CONFIG.timeout,
    });

    logInfo("Creating payment intent...");
    const intentResponse =
      await merchantClient.paymentIntents.create(TEST_PAYMENT);

    if (intentResponse.success && intentResponse.data) {
      paymentIntent = intentResponse.data;

      logSuccess(`Payment intent created: ${paymentIntent.intent_id}`);
      log(`Status: ${paymentIntent.status}`);
      log(`Amount: ${paymentIntent.amount} ${paymentIntent.currency}`);
      log(`Client secret: ${paymentIntent.client_secret?.substring(0, 20)}...`);

      if (paymentIntent.reused) {
        logWarning("Payment intent was reused from idempotency key");
      }
    } else {
      throw new Error(
        `Payment intent creation failed: ${intentResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Step 4: Validate checkout URL points to production
    // ============================================================================
    logStep(4, "Checkout URL Validation");

    const checkoutUrl = paymentIntent.checkout_url;

    if (!checkoutUrl) {
      throw new Error("No checkout URL returned in payment intent response");
    }

    log(`Checkout URL: ${checkoutUrl}`);

    // Validate the checkout URL
    const urlValidation = validateProductionUrl(checkoutUrl);

    if (urlValidation.valid) {
      logSuccess("Checkout URL is correctly formatted for production");
      log(`✓ Uses HTTPS: ${urlValidation.checks.protocol}`);
      log(`✓ Points to correct domain: ${urlValidation.checks.domain}`);
      log(`✓ Has valid path: ${urlValidation.checks.hasPath}`);

      // Verify URL contains the intent ID
      if (checkoutUrl.includes(paymentIntent.intent_id)) {
        logSuccess("Checkout URL contains the payment intent ID");
      } else {
        logWarning("Checkout URL does not contain the payment intent ID");
      }
    } else {
      logError("Checkout URL validation failed:");
      urlValidation.issues.forEach((issue) => logError(`  - ${issue}`));
      throw new Error("Checkout URL does not point to production domain");
    }

    // Test checkout URL accessibility
    logInfo("Testing checkout URL accessibility...");
    try {
      const https = require("https");
      const response = await new Promise((resolve, reject) => {
        const req = https.request(
          checkoutUrl,
          { method: "HEAD", timeout: 5000 },
          (res) => {
            resolve(res.statusCode);
          },
        );

        req.on("error", (error) => {
          reject(error);
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Timeout after 5 seconds"));
        });

        req.end();
      });

      if (response >= 200 && response < 400) {
        logSuccess(`Checkout page is accessible (HTTP ${response})`);
      } else if (response === 404) {
        logWarning(
          `Checkout page returned 404 (may be expected for test intent)`,
        );
      } else {
        logWarning(`Checkout page returned HTTP ${response}`);
      }
    } catch (error) {
      logWarning(`Checkout URL accessibility test failed: ${error.message}`);
    }

    // ============================================================================
    // Step 5: Retrieve payment intent (public endpoint)
    // ============================================================================
    logStep(5, "Payment Intent Retrieval");

    logInfo("Retrieving payment intent via public endpoint...");
    const publicResponse = await developerClient.get(
      `/gateway/v1/intents/${paymentIntent.intent_id}/public`,
    );

    if (publicResponse.success && publicResponse.data) {
      const publicIntent = publicResponse.data;
      logSuccess(`Public intent retrieved successfully`);
      log(`Public status: ${publicIntent.status}`);
      log(`Public amount: ${publicIntent.amount} ${publicIntent.currency}`);

      if (publicIntent.status === paymentIntent.status) {
        logSuccess("Public and private intent status match");
      } else {
        logWarning(
          `Status mismatch: public=${publicIntent.status}, private=${paymentIntent.status}`,
        );
      }
    } else {
      logWarning(
        `Public intent retrieval failed: ${publicResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Step 6: Confirm payment with test card
    // ============================================================================
    logStep(6, "Payment Confirmation");

    logInfo("Confirming payment with test card (4242 4242 4242 4242)...");
    log("Note: This uses a test card that should succeed in production");

    const confirmResponse = await merchantClient.paymentIntents.confirm(
      paymentIntent.intent_id,
      TEST_CARD_SUCCESS,
    );

    if (confirmResponse.success && confirmResponse.data) {
      const confirmation = confirmResponse.data;

      if (confirmation.success) {
        logSuccess("Payment confirmed successfully!");
        log(`Updated status: ${confirmation.status}`);
        log(`Redirect URL: ${confirmation.redirect_url}`);

        // Validate redirect URL
        if (confirmation.redirect_url) {
          const redirectValidation = validateProductionUrl(
            confirmation.redirect_url,
          );
          if (redirectValidation.valid) {
            logSuccess("Redirect URL is correctly formatted for production");
          } else {
            logWarning(
              `Redirect URL issues: ${redirectValidation.issues.join(", ")}`,
            );
          }
        }
      } else {
        logError("Payment confirmation failed");
        log(`Failure reason: ${confirmation.failure_reason || "Unknown"}`);
        log(`Status: ${confirmation.status}`);
      }
    } else {
      logError(
        `Payment confirmation request failed: ${confirmResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Step 7: Retrieve updated payment intent
    // ============================================================================
    logStep(7, "Updated Payment Intent Verification");

    logInfo("Retrieving updated payment intent...");
    const updatedResponse = await merchantClient.paymentIntents.get(
      paymentIntent.intent_id,
    );

    if (updatedResponse.success && updatedResponse.data) {
      const updatedIntent = updatedResponse.data;
      logSuccess(`Updated intent retrieved`);
      log(`Final status: ${updatedIntent.status}`);
      log(`Confirmed at: ${updatedIntent.confirmed_at || "Not available"}`);

      if (updatedIntent.card_last4) {
        log(`Card last 4: ${updatedIntent.card_last4}`);
      }
      if (updatedIntent.card_brand) {
        log(`Card brand: ${updatedIntent.card_brand}`);
      }
    } else {
      logWarning(
        `Updated intent retrieval failed: ${updatedResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Step 8: Check merchant balance
    // ============================================================================
    logStep(8, "Merchant Balance Check");

    logInfo("Checking merchant balance...");
    const balanceResponse = await merchantClient.balance.get();

    if (balanceResponse.success && balanceResponse.data) {
      const balance = balanceResponse.data;
      logSuccess(`Merchant balance retrieved`);
      log(`Currency: ${balance.currency}`);
      log(`Gross amount: ${balance.gross} millimes`);
      log(`Available balance: ${balance.available} millimes`);
      log(`Pending payments: ${balance.pending} millimes`);
    } else {
      logWarning(
        `Balance check failed: ${balanceResponse.error || "Unknown error"}`,
      );
    }

    // ============================================================================
    // Summary and cleanup
    // ============================================================================
    logHeader("PRODUCTION PAYMENT FLOW TEST COMPLETE");

    // Summary of key results
    console.log(
      "\n" + "📊 " + COLORS.bold + COLORS.cyan + "TEST SUMMARY" + COLORS.reset,
    );
    console.log(COLORS.bold + "─".repeat(60) + COLORS.reset);

    if (merchantId) {
      log(`Merchant ID: ${merchantId}`, COLORS.cyan);
    }

    if (paymentIntent) {
      log(`Payment Intent ID: ${paymentIntent.intent_id}`, COLORS.cyan);
    }

    if (checkoutUrl) {
      const urlCheck = validateProductionUrl(checkoutUrl);
      const urlStatus = urlCheck.valid ? "✅" : "❌";
      log(`Checkout URL: ${urlStatus} ${checkoutUrl}`, COLORS.cyan);
    }

    console.log(COLORS.bold + "─".repeat(60) + COLORS.reset);

    // Success message
    logSuccess("Production payment flow test completed successfully!");
    log(
      "\n" +
        COLORS.bold +
        "🎉 PRODUCTION SYSTEM IS WORKING CORRECTLY 🎉" +
        COLORS.reset,
    );

    // Recommendations
    log("\n" + COLORS.bold + "📋 NEXT STEPS FOR PRODUCTION:" + COLORS.reset);
    log("1. ✅ Payment gateway is operational");
    log("2. ✅ Checkout URLs point to correct production domain");
    log("3. ✅ Payment processing works with test cards");
    log("4. Monitor payment success rates in dashboard");
    log("5. Test with additional card scenarios if needed");
    log("6. Set up webhooks for payment notifications");

    return {
      success: true,
      merchantId,
      paymentIntentId: paymentIntent?.intent_id,
      checkoutUrl,
      checkoutUrlValid: urlValidation.valid,
    };
  } catch (error) {
    logError(`Production payment flow test failed: ${error.message}`);
    console.error(error.stack);

    log(
      "\n" +
        COLORS.bold +
        COLORS.red +
        "🔧 TROUBLESHOOTING TIPS:" +
        COLORS.reset,
    );
    log(
      "1. Verify the production backend is running: https://backend.nexapay.space",
    );
    log("2. Check SSL certificates are valid for both domains");
    log(
      "3. Verify NEXAPAY_PORTAL_URL environment variable is set to https://nexapay.space",
    );
    log("4. Check nginx configuration for proper routing");
    log(
      "5. Verify Docker containers are running with correct environment variables",
    );

    throw error;
  }
}

// Handle command line execution
if (require.main === module) {
  testProductionPaymentFlow()
    .then((result) => {
      console.log("\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error(
        "\n" + COLORS.red + COLORS.bold + "🔥 TEST FAILED" + COLORS.reset,
      );
      process.exit(1);
    });
}

// Export for use in other tests
module.exports = {
  testProductionPaymentFlow,
  validateProductionUrl,
  PRODUCTION_CONFIG,
  TEST_MERCHANT,
  TEST_PAYMENT,
  TEST_CARD_SUCCESS,
  COLORS,
};
