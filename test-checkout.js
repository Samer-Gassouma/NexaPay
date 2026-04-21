const path = require("path");
const NexaPay = require(path.join(__dirname, "sdk", "dist", "index.js")).default;

const BASE_URL = "http://localhost:8088";

async function test() {
  console.log("Testing checkout flow...");

  // Step 1: Register a developer (if needed)
  const devClient = new NexaPay({ baseURL: BASE_URL, timeout: 10000 });
  const unique = Date.now();
  const devResp = await devClient.post("/dev/register", {
    company_name: "Test Corp " + unique,
    contact_name: "Test User",
    email: `test${unique}@example.com`,
    phone: `98${String(unique).slice(-6)}`,
    password: `TestPwd-${unique}`,
    plan: "starter",
  });

  if (!devResp.success) {
    console.error("Developer registration failed:", devResp.error);
    return;
  }

  const devApiKey = devResp.data?.api_key;
  if (!devApiKey) {
    console.error("No API key in response");
    return;
  }

  // Step 2: Register a merchant
  const merchantResp = await devClient.post("/gateway/v1/merchants/register", {
    name: "Test Store " + unique,
    support_email: `store${unique}@example.com`,
  }, {
    headers: { "X-Developer-Token": devApiKey }
  });

  if (!merchantResp.success) {
    console.error("Merchant registration failed:", merchantResp.error);
    return;
  }

  const merchantApiKey = merchantResp.data?.api_key;
  const merchantId = merchantResp.data?.merchant_id;
  console.log("Merchant ID:", merchantId);
  console.log("Merchant API key prefix:", merchantApiKey?.substring(0, 20) + "...");

  // Step 3: Create payment intent
  const merchantClient = new NexaPay({ apiKey: merchantApiKey, baseURL: BASE_URL });
  const intentResp = await merchantClient.paymentIntents.create({
    amount: 42000,
    currency: "TND",
    description: "Test checkout flow",
  });

  if (!intentResp.success) {
    console.error("Intent creation failed:", intentResp.error);
    return;
  }

  const intentId = intentResp.data?.intent_id;
  const checkoutUrl = intentResp.data?.checkout_url;
  console.log("Intent ID:", intentId);
  console.log("Checkout URL:", checkoutUrl);

  // Step 4: Test public endpoint
  const publicResp = await devClient.get(`/gateway/v1/intents/${intentId}/public`);
  console.log("Public intent status:", publicResp.data?.status);

  // Step 5: Test confirmation with invalid card (should fail)
  console.log("\nTesting invalid card...");
  const invalidCard = {
    card_number: "4111111111111111", // invalid test card
    expiry_month: "12",
    expiry_year: "2029",
    cvv: "123",
    pin: "1234",
    card_holder_name: "Invalid Cardholder"
  };

  const confirmResp = await devClient.post(`/gateway/v1/intents/${intentId}/confirm`, invalidCard);
  console.log("Confirmation response success:", confirmResp.success);
  console.log("Status:", confirmResp.data?.status);
  console.log("Failure reason:", confirmResp.data?.failure_reason);

  // Step 6: Test confirmation with valid test card (should succeed)
  console.log("\nTesting valid test card...");
  const validCard = {
    card_number: "4242424242424242",
    expiry_month: "12",
    expiry_year: "2029",
    cvv: "123",
    pin: "1234",
    card_holder_name: "Valid Cardholder"
  };

  const validResp = await devClient.post(`/gateway/v1/intents/${intentId}/confirm`, validCard);
  console.log("Valid confirmation success:", validResp.success);
  console.log("Status:", validResp.data?.status);
  console.log("Redirect URL:", validResp.data?.redirect_url);
}

test().catch(console.error);
