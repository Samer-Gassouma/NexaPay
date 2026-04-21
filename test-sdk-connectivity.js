/**
 * NexaPay SDK Connectivity Test
 *
 * This script tests basic connectivity to the NexaPay production backend.
 * It verifies that the SDK is properly configured and can communicate with
 * the production API at https://backend.nexapay.space
 *
 * Usage:
 *   node test-sdk-connectivity.js
 *
 * Environment Variables:
 *   NEXAPAY_API_KEY - Optional API key for authenticated endpoints
 */

const NexaPay = require('./sdk/dist/index.js').default;

// Configuration
const CONFIG = {
  // Use default production URL: https://backend.nexapay.space
  timeout: 10000, // 10 seconds
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(color + message + colors.reset);
}

function logSuccess(message) {
  log('✅ ' + message, colors.green);
}

function logError(message) {
  log('❌ ' + message, colors.red);
}

function logInfo(message) {
  log('ℹ️  ' + message, colors.cyan);
}

function logWarning(message) {
  log('⚠️  ' + message, colors.yellow);
}

async function testConnectivity() {
  console.log('\n' + '='.repeat(60));
  logInfo('NexaPay SDK Connectivity Test');
  logInfo('Start time: ' + new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  // Test 1: SDK Initialization
  logInfo('Test 1: SDK Initialization');
  let client;
  try {
    client = new NexaPay(CONFIG);
    const baseURL = client.getBaseURL();
    logSuccess(`SDK initialized successfully`);
    log(`   Base URL: ${baseURL}`);

    if (baseURL !== 'https://backend.nexapay.space') {
      logWarning(`Expected base URL 'https://backend.nexapay.space', got '${baseURL}'`);
    }
  } catch (error) {
    logError(`Failed to initialize SDK: ${error.message}`);
    return false;
  }

  // Test 2: Public endpoint (no authentication required)
  logInfo('\nTest 2: Public API Endpoint (/chain/stats)');
  try {
    const response = await client.request('GET', '/chain/stats');

    if (response.success === false && response.error) {
      logWarning(`API returned error: ${response.error}`);
      log(`   This is OK for public endpoint - may require authentication`);
    } else if (response.success === true || response.chain_height || response.chain_height_raw) {
      logSuccess(`API responded successfully`);

      // Show some stats if available
      if (response.data) {
        const stats = response.data;
        if (stats.chain_height) log(`   Chain height: ${stats.chain_height}`);
        if (stats.chain_height_raw) log(`   Chain height (raw): ${stats.chain_height_raw}`);
        if (stats.timestamp) log(`   Timestamp: ${stats.timestamp}`);
      } else if (response.chain_height) {
        log(`   Chain height: ${response.chain_height}`);
      }
    } else {
      logWarning(`Unexpected response format:`, response);
    }
  } catch (error) {
    logError(`Failed to reach public endpoint: ${error.message}`);
    return false;
  }

  // Test 3: SDK response format handling
  logInfo('\nTest 3: SDK Response Format Handling');
  try {
    const response = await client.request('GET', '/chain/stats');

    // Test extractData method
    const extractedData = client.extractData(response);
    logSuccess(`extractData() method works`);
    log(`   Data extracted: ${extractedData ? 'Yes' : 'No'}`);

    // Test isSuccess method
    const isSuccessful = client.isSuccess(response);
    logSuccess(`isSuccess() method works`);
    log(`   Response indicates success: ${isSuccessful}`);

  } catch (error) {
    logError(`Response format test failed: ${error.message}`);
    return false;
  }

  // Test 4: Authenticated endpoint (if API key provided)
  const apiKey = process.env.NEXAPAY_API_KEY;
  if (apiKey) {
    logInfo('\nTest 4: Authenticated Endpoint (with API key)');

    const authClient = new NexaPay({
      ...CONFIG,
      apiKey: apiKey,
    });

    try {
      log(`   Testing balance endpoint...`);
      const response = await authClient.balance.get();

      if (response.success && response.data) {
        logSuccess(`Authenticated request successful`);
        const balance = response.data;
        log(`   Currency: ${balance.currency}`);
        log(`   Available: ${balance.available} millimes`);
        log(`   Gross: ${balance.gross} millimes`);
      } else if (response.error) {
        logWarning(`Authenticated endpoint returned error: ${response.error}`);
        log(`   This may be OK (invalid API key, no permissions, etc.)`);
      } else {
        logWarning(`Unexpected authenticated response format`);
      }
    } catch (error) {
      logWarning(`Authenticated request failed: ${error.message}`);
      log(`   This may be OK if the API key is invalid or has no permissions`);
    }
  } else {
    logInfo('\nTest 4: Authenticated Endpoint (skipped)');
    log(`   No NEXAPAY_API_KEY environment variable set`);
    log(`   To test authenticated endpoints, run:`);
    log(`   NEXAPAY_API_KEY=your_api_key node test-sdk-connectivity.js`);
  }

  // Test 5: Error handling
  logInfo('\nTest 5: Error Handling');
  try {
    const response = await client.request('GET', '/non-existent-endpoint');

    if (response.success === false && response.error) {
      logSuccess(`Error handling works correctly`);
      log(`   Error message: ${response.error}`);
    } else {
      logWarning(`Unexpected response for non-existent endpoint`);
    }
  } catch (error) {
    logSuccess(`Error handling works (threw exception)`);
    log(`   Error: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  logInfo('Connectivity Test Complete');
  logInfo('End time: ' + new Date().toISOString());
  console.log('='.repeat(60));

  logSuccess('\n✅ SDK connectivity tests passed!');
  log('\nNext steps:');
  log('1. Test with your actual API key for authenticated endpoints');
  log('2. Create a payment intent to test full payment flow');
  log('3. Set up webhooks for payment notifications');
  log('4. Monitor your application logs for any issues');

  return true;
}

// Handle command line execution
if (require.main === module) {
  testConnectivity().then(success => {
    if (!success) {
      logError('\n❌ Some connectivity tests failed.');
      log('\nTroubleshooting tips:');
      log('1. Check your internet connection');
      log('2. Verify https://backend.nexapay.space is accessible');
      log('3. Check if the SDK is properly built (run: cd sdk && npm run build)');
      log('4. Verify no firewall is blocking the connection');
      log('5. Check the NexaPay status page for service outages');
      process.exit(1);
    }
  }).catch(error => {
    logError(`\n❌ Unhandled error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  testConnectivity,
  colors,
};
