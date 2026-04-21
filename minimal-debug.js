const axios = require('axios');
const path = require('path');

// Import the SDK
const sdkPath = path.join(__dirname, 'sdk', 'dist');
const { default: NexaPay } = require(path.join(sdkPath, 'index.js'));

console.log('=== NexaPay SDK Response Debug ===\n');

const BASE_URL = 'http://localhost:8088';

async function debugResponseFormat() {
  console.log('1. Testing direct API call to /dev/register...');

  try {
    // Direct API call
    const directResponse = await axios.post(
      `${BASE_URL}/dev/register`,
      {
        company_name: 'Debug Corp',
        contact_name: 'Debug User',
        email: `debug-${Date.now()}@example.com`,
        plan: 'free'
      }
    );

    console.log('Direct API response:');
    console.log('Status:', directResponse.status);
    console.log('Headers:', JSON.stringify(directResponse.headers, null, 2));
    console.log('Data:', JSON.stringify(directResponse.data, null, 2));
    console.log('Data type:', typeof directResponse.data);

    const developerKey = directResponse.data.api_key;
    console.log('\nDeveloper key:', developerKey ? `${developerKey.substring(0, 20)}...` : 'None');

    // Test SDK with the same key
    console.log('\n2. Testing SDK with developer key...');

    const client = new NexaPay({
      apiKey: developerKey,
      baseURL: BASE_URL,
      timeout: 10000
    });

    console.log('\n3. Testing SDK GET /chain/stats...');

    try {
      const sdkResponse = await client.get('/chain/stats');
      console.log('SDK response type:', typeof sdkResponse);
      console.log('SDK response:', JSON.stringify(sdkResponse, null, 2));

      if (sdkResponse && typeof sdkResponse === 'object') {
        console.log('Has success property:', 'success' in sdkResponse);
        console.log('Success value:', sdkResponse.success);
        console.log('Has data property:', 'data' in sdkResponse);
        console.log('Has error property:', 'error' in sdkResponse);
      }
    } catch (sdkError) {
      console.log('SDK error:', sdkError.message);
      console.log('SDK error type:', sdkError.constructor.name);
      console.log('SDK error object:', JSON.stringify(sdkError, null, 2));
    }

    // Test developer resource
    console.log('\n4. Testing SDK developer.docsSnippets()...');

    try {
      const snippetsResponse = await client.developer.docsSnippets();
      console.log('Snippets response type:', typeof snippetsResponse);
      console.log('Snippets response:', JSON.stringify(snippetsResponse, null, 2));
    } catch (snippetsError) {
      console.log('Snippets error:', snippetsError.message);
      console.log('Snippets error object:', JSON.stringify(snippetsError, null, 2));
    }

    // Test direct API for chain/stats to compare
    console.log('\n5. Testing direct API GET /chain/stats...');

    const directStats = await axios.get(`${BASE_URL}/chain/stats`);
    console.log('Direct stats response:');
    console.log('Status:', directStats.status);
    console.log('Data:', JSON.stringify(directStats.data, null, 2));

    // Check if response has success field
    console.log('\n6. Analyzing response format...');
    console.log('Direct stats has success field:', 'success' in directStats.data);
    console.log('Direct stats keys:', Object.keys(directStats.data));

    // Test with headers
    console.log('\n7. Testing with explicit headers...');

    const headersResponse = await axios.get(`${BASE_URL}/chain/stats`, {
      headers: {
        'X-API-Key': developerKey
      }
    });

    console.log('With headers - Status:', headersResponse.status);
    console.log('With headers - Data:', JSON.stringify(headersResponse.data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Test merchant registration
async function debugMerchantRegistration() {
  console.log('\n\n=== Debugging Merchant Registration ===\n');

  try {
    // Get a developer key first
    const devResponse = await axios.post(
      `${BASE_URL}/dev/register`,
      {
        company_name: 'Merchant Debug',
        contact_name: 'Merchant Tester',
        email: `merchant-debug-${Date.now()}@example.com`,
        plan: 'free'
      }
    );

    const developerKey = devResponse.data.api_key;
    console.log('Developer key:', developerKey ? `${developerKey.substring(0, 20)}...` : 'None');

    // Direct merchant registration
    console.log('\n1. Direct merchant registration...');

    const directMerchant = await axios.post(
      `${BASE_URL}/gateway/v1/merchants/register`,
      {
        name: 'Debug Store',
        support_email: `support-${Date.now()}@debugstore.tn`
      },
      {
        headers: { 'X-API-Key': developerKey }
      }
    );

    console.log('Direct merchant response status:', directMerchant.status);
    console.log('Direct merchant response data:', JSON.stringify(directMerchant.data, null, 2));

    const merchantKey = directMerchant.data.api_key;

    // SDK merchant registration
    console.log('\n2. SDK merchant registration...');

    const client = new NexaPay({
      apiKey: developerKey,
      baseURL: BASE_URL,
      timeout: 10000
    });

    try {
      const sdkMerchant = await client.merchants.register({
        name: 'SDK Debug Store',
        support_email: `sdk-support-${Date.now()}@debugstore.tn`
      });

      console.log('SDK merchant response type:', typeof sdkMerchant);
      console.log('SDK merchant response:', JSON.stringify(sdkMerchant, null, 2));
    } catch (sdkError) {
      console.log('SDK merchant error:', sdkError.message);
      console.log('SDK merchant error object:', JSON.stringify(sdkError, null, 2));

      // Check if it's an ApiError
      if (sdkError.isNexaPayApiError) {
        console.log('Is NexaPayApiError:', sdkError.isNexaPayApiError);
        console.log('Status code:', sdkError.statusCode);
        console.log('Request ID:', sdkError.requestId);
      }
    }

    // Test merchant API with SDK
    console.log('\n3. Testing merchant API with SDK...');

    if (merchantKey) {
      const merchantClient = new NexaPay({
        apiKey: merchantKey,
        baseURL: BASE_URL,
        timeout: 10000
      });

      try {
        const balanceResponse = await merchantClient.balance.get();
        console.log('Balance response type:', typeof balanceResponse);
        console.log('Balance response:', JSON.stringify(balanceResponse, null, 2));
      } catch (balanceError) {
        console.log('Balance error:', balanceError.message);
        console.log('Balance error object:', JSON.stringify(balanceError, null, 2));
      }
    }

  } catch (error) {
    console.error('Merchant debug error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run debug
debugResponseFormat()
  .then(() => debugMerchantRegistration())
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
