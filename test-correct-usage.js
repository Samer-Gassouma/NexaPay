/**
 * NexaPay SDK Correct Usage Example
 *
 * This demonstrates proper usage of the NexaPay SDK with the actual API response formats.
 *
 * Important: The NexaPay API has two response formats:
 * 1. Standard endpoints return { success: boolean, data?: T, error?: string }
 * 2. Legacy endpoints return raw data T without success wrapper
 *
 * The SDK handles both formats transparently.
 */

const path = require("path");
const {
  default: NexaPay,
  isApiResponse,
  extractResponseData,
  isResponseSuccessful,
  getResponseError,
} = require(path.join(__dirname, "sdk", "dist", "index.js"));

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

console.log(
  `${colors.cyan}╔══════════════════════════════════╗${colors.reset}`,
);
console.log(
  `${colors.cyan}║    NexaPay SDK Correct Usage      ║${colors.reset}`,
);
console.log(
  `${colors.cyan}╚══════════════════════════════════╝${colors.reset}\n`,
);

const BASE_URL = "http://localhost:8088";
const PORTAL_URL = "http://localhost:3001";

async function runExamples() {
  console.log(
    `${colors.magenta}🚀 Starting NexaPay SDK Examples${colors.reset}\n`,
  );

  try {
    // -------------------------------------------------------------------
    // Example 1: Direct API calls to understand response formats
    // -------------------------------------------------------------------
    console.log(
      `${colors.blue}📊 Example 1: Understanding Response Formats${colors.reset}\n`,
    );

    console.log(
      `${colors.yellow}Note: The API has different response formats:${colors.reset}`,
    );
    console.log(
      `• /dev/register returns developer data and now requires phone + password`,
    );
    console.log(`• /gateway/v1/* returns { success, data?, error? } format`);
    console.log(`• /chain/* returns raw data { chain_height, ... }`);
    console.log("");

    // -------------------------------------------------------------------
    // Example 2: Get a developer API key
    // -------------------------------------------------------------------
    console.log(
      `${colors.blue}🔑 Example 2: Getting Developer API Key${colors.reset}\n`,
    );

    // Create a client without API key for initial registration
    const noAuthClient = new NexaPay({
      baseURL: BASE_URL,
      timeout: 10000,
    });

    // Register a developer (returns raw response, not ApiResponse)
    console.log("Registering developer...");
    const uniqueSuffix = Date.now();
    const devResponse = await noAuthClient.post("/dev/register", {
      company_name: "Example Corp",
      contact_name: "Example User",
      email: `example-${uniqueSuffix}@test.com`,
      phone: `98${String(uniqueSuffix).slice(-6)}`,
      password: `ExamplePwd-${uniqueSuffix}`,
      plan: "starter",
    });

    // Check what type of response we got
    console.log(
      `Response type: ${isApiResponse(devResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(devResponse)}`);

    // Extract the data regardless of format
    const devData = extractResponseData(devResponse) || devResponse;
    console.log(
      `Developer API key: ${devData.api_key ? devData.api_key.substring(0, 20) + "..." : "None"}`,
    );

    if (!devData.api_key) {
      console.log(
        `${colors.red}Error: ${getResponseError(devResponse) || "No API key returned"}${colors.reset}`,
      );
      return;
    }

    const developerKey = devData.api_key;

    // -------------------------------------------------------------------
    // Example 3: Create authenticated client
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🔐 Example 3: Creating Authenticated Client${colors.reset}\n`,
    );

    const client = new NexaPay({
      apiKey: developerKey,
      baseURL: BASE_URL,
      timeout: 10000,
    });

    // -------------------------------------------------------------------
    // Example 4: Chain stats (raw response)
    // -------------------------------------------------------------------
    console.log(
      `${colors.blue}⛓️  Example 4: Getting Chain Stats (raw response)${colors.reset}\n`,
    );

    const chainResponse = await client.get("/chain/stats");
    console.log(
      `Response type: ${isApiResponse(chainResponse) ? "ApiResponse" : "raw data"}`,
    );

    const chainData = extractResponseData(chainResponse) || chainResponse;
    console.log(`Chain height: ${chainData.chain_height}`);
    console.log(`Network status: ${chainData.network_status}`);
    console.log(`Total accounts: ${chainData.total_accounts}`);

    // -------------------------------------------------------------------
    // Example 5: Developer snippets (ApiResponse format)
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}📚 Example 5: Getting Developer Snippets (ApiResponse format)${colors.reset}\n`,
    );

    const snippetsResponse = await client.developer.docsSnippets();
    console.log(
      `Response type: ${isApiResponse(snippetsResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(snippetsResponse)}`);

    if (isApiResponse(snippetsResponse) && !snippetsResponse.success) {
      console.log(
        `${colors.red}Error: ${snippetsResponse.error}${colors.reset}`,
      );
    } else {
      const snippetsData =
        extractResponseData(snippetsResponse) || snippetsResponse;
      console.log(
        `Test cards available: ${snippetsData.test_cards?.length || 0}`,
      );
      console.log(`Checkout URL pattern: ${snippetsData.checkout_url_pattern}`);
    }

    // -------------------------------------------------------------------
    // Example 6: Register a merchant (ApiResponse format)
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🏪 Example 6: Registering a Merchant (ApiResponse format)${colors.reset}\n`,
    );

    const merchantResponse = await client.merchants.register({
      name: "Example Store",
      support_email: `support-${Date.now()}@examplestore.tn`,
      business_name: "Example Store SARL",
      webhook_url: "https://examplestore.tn/webhooks/nexapay",
    });

    console.log(
      `Response type: ${isApiResponse(merchantResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(merchantResponse)}`);

    if (!isResponseSuccessful(merchantResponse)) {
      const error = getResponseError(merchantResponse);
      console.log(`${colors.red}Error: ${error}${colors.reset}`);
      return;
    }

    const merchantData =
      extractResponseData(merchantResponse) || merchantResponse;
    console.log(`Merchant ID: ${merchantData.merchant_id}`);
    console.log(`Merchant key: ${merchantData.api_key.substring(0, 20)}...`);
    console.log(`Checkout base URL: ${merchantData.checkout_base_url}`);

    const merchantKey = merchantData.api_key;

    // -------------------------------------------------------------------
    // Example 7: Create merchant client
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}💰 Example 7: Creating Merchant Client${colors.reset}\n`,
    );

    const merchantClient = new NexaPay({
      apiKey: merchantKey,
      baseURL: BASE_URL,
      timeout: 10000,
    });

    // -------------------------------------------------------------------
    // Example 8: Get merchant balance (ApiResponse format)
    // -------------------------------------------------------------------
    console.log(
      `${colors.blue}💳 Example 8: Getting Merchant Balance (ApiResponse format)${colors.reset}\n`,
    );

    const balanceResponse = await merchantClient.balance.get();
    console.log(
      `Response type: ${isApiResponse(balanceResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(balanceResponse)}`);

    if (!isResponseSuccessful(balanceResponse)) {
      console.log(
        `${colors.red}Error: ${getResponseError(balanceResponse)}${colors.reset}`,
      );
    } else {
      const balanceData =
        extractResponseData(balanceResponse) || balanceResponse;
      console.log(`Currency: ${balanceData.currency}`);
      console.log(`Available balance: ${balanceData.available} millimes`);
      console.log(`Pending: ${balanceData.pending} millimes`);
    }

    // -------------------------------------------------------------------
    // Example 9: Create payment intent (ApiResponse format)
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🛒 Example 9: Creating Payment Intent (ApiResponse format)${colors.reset}\n`,
    );

    const intentResponse = await merchantClient.paymentIntents.create({
      amount: 42000, // 42.000 TND in millimes
      currency: "TND",
      description: "Example Order #1",
      customer_email: "customer@example.tn",
      customer_name: "Example Customer",
      idempotency_key: `order-${Date.now()}`,
    });

    console.log(
      `Response type: ${isApiResponse(intentResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(intentResponse)}`);

    if (!isResponseSuccessful(intentResponse)) {
      console.log(
        `${colors.red}Error: ${getResponseError(intentResponse)}${colors.reset}`,
      );
    } else {
      const intentData = extractResponseData(intentResponse) || intentResponse;
      console.log(`Intent ID: ${intentData.intent_id}`);
      console.log(`Status: ${intentData.status}`);
      console.log(`Amount: ${intentData.amount} ${intentData.currency}`);
      console.log(`Checkout URL: ${intentData.checkout_url}`);

      // Store for later examples
      const intentId = intentData.intent_id;

      // -------------------------------------------------------------------
      // Example 10: Retrieve payment intent
      // -------------------------------------------------------------------
      console.log(
        `\n${colors.blue}🔍 Example 10: Retrieving Payment Intent${colors.reset}\n`,
      );

      const getIntentResponse =
        await merchantClient.paymentIntents.get(intentId);
      console.log(
        `Response type: ${isApiResponse(getIntentResponse) ? "ApiResponse" : "raw data"}`,
      );

      if (isResponseSuccessful(getIntentResponse)) {
        const retrievedIntent =
          extractResponseData(getIntentResponse) || getIntentResponse;
        console.log(`Retrieved intent status: ${retrievedIntent.status}`);
        console.log(
          `Checkout URL works: ${retrievedIntent.checkout_url.includes(intentId)}`,
        );
      }
    }

    // -------------------------------------------------------------------
    // Example 11: Error handling
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🚨 Example 11: Error Handling${colors.reset}\n`,
    );

    console.log(`${colors.yellow}Testing invalid API key...${colors.reset}`);
    const invalidClient = new NexaPay({
      apiKey: "nxp_invalid_1234567890",
      baseURL: BASE_URL,
      timeout: 5000,
    });

    const invalidResponse = await invalidClient.balance.get();
    console.log(
      `Response type: ${isApiResponse(invalidResponse) ? "ApiResponse" : "raw data"}`,
    );
    console.log(`Is successful: ${isResponseSuccessful(invalidResponse)}`);

    if (!isResponseSuccessful(invalidResponse)) {
      const error = getResponseError(invalidResponse);
      console.log(
        `${colors.green}✓ Correctly returned error response: ${error ? error.substring(0, 50) + "..." : "Unknown error"}${colors.reset}`,
      );
    } else {
      console.log(
        `${colors.red}Should have returned error response!${colors.reset}`,
      );
    }

    // -------------------------------------------------------------------
    // Example 12: Webhook verification
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🔐 Example 12: Webhook Verification${colors.reset}\n`,
    );

    const crypto = require("crypto");
    const payload = JSON.stringify({
      event: "payment_intent.succeeded",
      data: { id: "test_123" },
    });
    const secret = "test_webhook_secret_123";

    const signature = crypto
      .createHash("sha256")
      .update(secret + "." + payload)
      .digest("hex");

    const isValid = merchantClient.verifyWebhookSignature(
      payload,
      signature,
      secret,
    );
    console.log(`Webhook signature valid: ${isValid ? "Yes" : "No"}`);

    // -------------------------------------------------------------------
    // Example 13: Using the convenience methods
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.blue}🛠️  Example 13: Using Convenience Methods${colors.reset}\n`,
    );

    // Test all resource methods
    console.log("Available resources on client:");
    console.log(`• merchants: ${typeof merchantClient.merchants}`);
    console.log(`• paymentIntents: ${typeof merchantClient.paymentIntents}`);
    console.log(`• refunds: ${typeof merchantClient.refunds}`);
    console.log(`• payouts: ${typeof merchantClient.payouts}`);
    console.log(`• webhooks: ${typeof merchantClient.webhooks}`);
    console.log(`• balance: ${typeof merchantClient.balance}`);
    console.log(`• transactions: ${typeof merchantClient.transactions}`);

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    console.log(
      `\n${colors.green}✅ All Examples Completed Successfully!${colors.reset}\n`,
    );

    console.log(`${colors.cyan}📋 Summary:${colors.reset}`);
    console.log(`• Developer API key: ${developerKey.substring(0, 20)}...`);
    console.log(`• Merchant API key: ${merchantKey.substring(0, 20)}...`);
    console.log(
      `• Services running: Backend (${BASE_URL}), Portal (${PORTAL_URL})`,
    );
    console.log(`• SDK working correctly with both response formats`);

    console.log(`\n${colors.yellow}📝 Key Takeaways:${colors.reset}`);
    console.log(`1. Use isApiResponse() to check response format`);
    console.log(`2. Use extractResponseData() to get data from either format`);
    console.log(`3. Use isResponseSuccessful() to check if request succeeded`);
    console.log(`4. Use getResponseError() to get error messages`);
    console.log(
      `5. Resource methods (merchants, paymentIntents, etc.) handle formats automatically`,
    );
  } catch (error) {
    console.log(
      `${colors.red}❌ Example failed: ${error.message}${colors.reset}`,
    );
    console.log(error.stack);
  }
}

// Run examples
runExamples().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});

module.exports = { runExamples };
