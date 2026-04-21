const axios = require('axios');
const path = require('path');

// Import the SDK
const sdkPath = path.join(__dirname, 'sdk', 'dist');
const { default: NexaPay } = require(path.join(sdkPath, 'index.js'));

// Colors for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}╔══════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║    NexaPay SDK Debug Script   ║${colors.reset}`);
console.log(`${colors.cyan}╚══════════════════════════════╝${colors.reset}\n`);

const BASE_URL = 'http://localhost:8088';
const PORTAL_URL = 'http://localhost:3001';

let state = {
  developerKey: null,
  merchantKey: null,
  merchantId: null,
  intentId: null
};

async function testStep(name, fn) {
  console.log(`${colors.blue}▶ ${name}...${colors.reset}`);
  try {
    const result = await fn();
    console.log(`${colors.green}  ✓ ${name}${colors.reset}`);
    return { success: true, result };
  } catch (error) {
    console.log(`${colors.red}  ✗ ${name}: ${error.message}${colors.reset}`);
    if (error.response) {
      console.log(`${colors.yellow}    Status: ${error.response.status}${colors.reset}`);
      if (error.response.data) {
        console.log(`${colors.yellow}    Data: ${JSON.stringify(error.response.data)}${colors.reset}`);
      }
    }
    return { success: false, error };
  }
}

async function runDebug() {
  console.log(`${colors.cyan}🔍 Testing Direct API Calls${colors.reset}\n`);

  // Step 1: Check backend health
  await testStep('Backend health check', async () => {
    const response = await axios.get(`${BASE_URL}/chain/stats`, { timeout: 5000 });
    console.log(`    Chain height: ${response.data.chain_height}`);
    console.log(`    Network status: ${response.data.network_status}`);
    return response.data;
  });

  // Step 2: Register developer
  const devResult = await testStep('Register developer', async () => {
    const response = await axios.post(`${BASE_URL}/dev/register`, {
      company_name: 'Debug Corp',
      contact_name: 'Debug User',
      email: `debug-${Date.now()}@example.com`,
      plan: 'free'
    });
    state.developerKey = response.data.api_key;
    console.log(`    Developer key: ${response.data.api_key_prefix}...`);
    return response.data;
  });

  if (!devResult.success) {
    console.log(`\n${colors.red}❌ Cannot proceed without developer key${colors.reset}`);
    return;
  }

  // Step 3: Test SDK with developer key
  console.log(`\n${colors.cyan}🧪 Testing SDK with Developer Key${colors.reset}\n`);

  const devClient = new NexaPay({
    apiKey: state.developerKey,
    baseURL: BASE_URL,
    timeout: 10000
  });

  // Test chain stats via SDK
  await testStep('SDK GET /chain/stats', async () => {
    const response = await devClient.get('/chain/stats');
    if (response.success) {
      console.log(`    Chain height: ${response.data.chain_height}`);
      return response.data;
    } else {
      throw new Error(response.error || 'Unknown error');
    }
  });

  // Test developer resource
  await testStep('SDK developer.docsSnippets', async () => {
    const response = await devClient.developer.docsSnippets();
    if (response.success && response.data) {
      console.log(`    Got snippets with ${response.data.test_cards?.length || 0} test cards`);
      return response.data;
    } else {
      throw new Error(response.error || 'No data');
    }
  });

  // Step 4: Register merchant
  console.log(`\n${colors.cyan}🏪 Testing Merchant Registration${colors.reset}\n`);

  const merchantResult = await testStep('Register merchant via SDK', async () => {
    const response = await devClient.merchants.register({
      name: 'Debug Store',
      support_email: `support+${Date.now()}@debugstore.tn`,
      business_name: 'Debug Store SARL',
      webhook_url: 'https://debugstore.tn/webhooks'
    });

    if (response.success && response.data) {
      state.merchantKey = response.data.api_key;
      state.merchantId = response.data.merchant_id;
      console.log(`    Merchant ID: ${response.data.merchant_id}`);
      console.log(`    Merchant key: ${response.data.api_key_prefix}...`);
      return response.data;
    } else {
      throw new Error(response.error || 'Registration failed');
    }
  });

  if (!merchantResult.success) {
    console.log(`\n${colors.yellow}⚠️  Trying direct API for merchant registration${colors.reset}\n`);

    const directMerchantResult = await testStep('Direct API merchant registration', async () => {
      const response = await axios.post(
        `${BASE_URL}/gateway/v1/merchants/register`,
        {
          name: 'Debug Store',
          support_email: `support+${Date.now()}@debugstore.tn`,
          business_name: 'Debug Store SARL',
          webhook_url: 'https://debugstore.tn/webhooks'
        },
        {
          headers: { 'X-API-Key': state.developerKey }
        }
      );

      if (response.data.success) {
        state.merchantKey = response.data.api_key;
        state.merchantId = response.data.merchant_id;
        console.log(`    Merchant ID: ${response.data.merchant_id}`);
        console.log(`    Merchant key: ${response.data.api_key_prefix}...`);
        return response.data;
      } else {
        throw new Error(response.data.error || 'Registration failed');
      }
    });

    if (!directMerchantResult.success) {
      console.log(`\n${colors.red}❌ Cannot proceed without merchant key${colors.reset}`);
      return;
    }
  }

  // Step 5: Create merchant client
  console.log(`\n${colors.cyan}💰 Testing Merchant API${colors.reset}\n`);

  const merchantClient = new NexaPay({
    apiKey: state.merchantKey,
    baseURL: BASE_URL,
    timeout: 10000
  });

  // Test balance
  await testStep('Merchant balance', async () => {
    const response = await merchantClient.balance.get();
    if (response.success && response.data) {
      console.log(`    Currency: ${response.data.currency}`);
      console.log(`    Available: ${response.data.available} millimes`);
      return response.data;
    } else {
      throw new Error(response.error || 'No balance data');
    }
  });

  // Step 6: Create payment intent
  const intentResult = await testStep('Create payment intent', async () => {
    const response = await merchantClient.paymentIntents.create({
      amount: 42000,
      currency: 'TND',
      description: 'Debug Order #1',
      customer_email: 'debug@customer.tn',
      customer_name: 'Debug Customer',
      idempotency_key: `debug-${Date.now()}`
    });

    if (response.success && response.data) {
      state.intentId = response.data.intent_id;
      console.log(`    Intent ID: ${response.data.intent_id}`);
      console.log(`    Status: ${response.data.status}`);
      console.log(`    Checkout URL: ${response.data.checkout_url}`);
      return response.data;
    } else {
      throw new Error(response.error || 'Intent creation failed');
    }
  });

  if (!intentResult.success) {
    console.log(`\n${colors.yellow}⚠️  Trying direct API for payment intent${colors.reset}\n`);

    await testStep('Direct API payment intent', async () => {
      const response = await axios.post(
        `${BASE_URL}/gateway/v1/intents`,
        {
          amount: 42000,
          currency: 'TND',
          description: 'Debug Order #1',
          customer_email: 'debug@customer.tn',
          customer_name: 'Debug Customer',
          idempotency_key: `debug-${Date.now()}`
        },
        {
          headers: { 'X-API-Key': state.merchantKey }
        }
      );

      if (response.data.success) {
        state.intentId = response.data.intent_id;
        console.log(`    Intent ID: ${response.data.intent_id}`);
        console.log(`    Checkout URL: ${response.data.checkout_url}`);
        return response.data;
      } else {
        throw new Error(response.data.error || 'Intent creation failed');
      }
    });
  }

  // Step 7: Test checkout page
  if (state.intentId) {
    console.log(`\n${colors.cyan}🛒 Testing Checkout Page${colors.reset}\n`);

    await testStep('Check checkout page', async () => {
      const response = await axios.get(`${PORTAL_URL}/checkout/${state.intentId}`, { timeout: 5000 });
      if (response.status === 200) {
        console.log(`    Checkout page accessible (${response.status})`);

        // Quick check for expected content
        const html = response.data;
        const hasPaymentForm = html.includes('card_number') || html.includes('Secure Payment');
        console.log(`    Has payment form: ${hasPaymentForm ? 'Yes' : 'No'}`);

        return response.status;
      } else {
        throw new Error(`Status: ${response.status}`);
      }
    });
  }

  // Step 8: Test error handling
  console.log(`\n${colors.cyan}🚨 Testing Error Handling${colors.reset}\n`);

  await testStep('Invalid API key rejection', async () => {
    const invalidClient = new NexaPay({
      apiKey: 'nxp_invalid_1234567890',
      baseURL: BASE_URL,
      timeout: 5000
    });

    try {
      await invalidClient.balance.get();
      throw new Error('Should have rejected invalid key');
    } catch (error) {
      if (error.message.includes('Invalid API key') || error.message.includes('Unauthorized')) {
        console.log(`    Correctly rejected: ${error.message.substring(0, 50)}...`);
        return true;
      } else {
        throw new Error(`Wrong error: ${error.message}`);
      }
    }
  });

  // Step 9: Test webhook verification
  console.log(`\n${colors.cyan}🔐 Testing Webhook Verification${colors.reset}\n`);

  await testStep('Webhook signature verification', async () => {
    const payload = JSON.stringify({ event: 'test', data: { test: true } });
    const secret = 'test_secret_123';
    const signature = require('crypto')
      .createHash('sha256')
      .update(secret + '.' + payload)
      .digest('hex');

    const isValid = merchantClient.verifyWebhookSignature(payload, signature, secret);
    console.log(`    Signature valid: ${isValid}`);

    if (!isValid) {
      throw new Error('Webhook verification failed');
    }
    return isValid;
  });

  // Summary
  console.log(`\n${colors.cyan}📊 Debug Summary${colors.reset}\n`);
  console.log(`${colors.green}✓ Services running at:${colors.reset}`);
  console.log(`  Backend: ${BASE_URL}`);
  console.log(`  Portal:  ${PORTAL_URL}\n`);

  console.log(`${colors.green}✓ Test data created:${colors.reset}`);
  console.log(`  Developer key: ${state.developerKey ? state.developerKey.substring(0, 20) + '...' : 'None'}`);
  console.log(`  Merchant ID:   ${state.merchantId || 'None'}`);
  console.log(`  Merchant key:  ${state.merchantKey ? state.merchantKey.substring(0, 20) + '...' : 'None'}`);
  console.log(`  Payment intent: ${state.intentId || 'None'}`);

  if (state.intentId) {
    console.log(`\n${colors.yellow}🔗 Manual test URLs:${colors.reset}`);
    console.log(`  Checkout page: ${PORTAL_URL}/checkout/${state.intentId}`);
    console.log(`  API explorer: ${BASE_URL}/chain/stats`);
  }

  console.log(`\n${colors.cyan}✅ Debug script completed${colors.reset}\n`);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(`${colors.red}Unhandled rejection:${colors.reset}`, error);
  process.exit(1);
});

// Run the debug script
runDebug().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
