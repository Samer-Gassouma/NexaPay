// test-export.js
// Test the export structure of @nexapay/node-sdk package

console.log('Testing @nexapay/node-sdk export structure...\n');

// Try to import the SDK
const sdkModule = require('@nexapay/node-sdk');

console.log('=== Module Structure ===');
console.log('Type of module:', typeof sdkModule);
console.log('Is object:', typeof sdkModule === 'object' && sdkModule !== null);
console.log('Keys:', Object.keys(sdkModule));

console.log('\n=== Checking Exports ===');

// Check if it has a default export
if (sdkModule.default) {
  console.log('✅ Has default export');
  console.log('Default export type:', typeof sdkModule.default);
  console.log('Is function:', typeof sdkModule.default === 'function');

  if (typeof sdkModule.default === 'function') {
    console.log('Function name:', sdkModule.default.name || 'anonymous');

    // Try to instantiate
    try {
      const client = new sdkModule.default({
        apiKey: 'test'
      });
      console.log('✅ Can instantiate via .default');
      console.log('Client base URL:', client.getBaseURL ? client.getBaseURL() : 'N/A');
    } catch (error) {
      console.log('❌ Cannot instantiate via .default:', error.message);
    }
  }
} else {
  console.log('❌ No default export');
}

// Check if the module itself is a constructor
if (typeof sdkModule === 'function') {
  console.log('\n✅ Module itself is a function/constructor');
  console.log('Function name:', sdkModule.name || 'anonymous');

  // Try to instantiate
  try {
    const client = new sdkModule({
      apiKey: 'test'
    });
    console.log('✅ Can instantiate module directly');
    console.log('Client base URL:', client.getBaseURL ? client.getBaseURL() : 'N/A');
  } catch (error) {
    console.log('❌ Cannot instantiate module directly:', error.message);
  }
}

// Check for named exports
console.log('\n=== Named Exports ===');
const namedExports = [
  'NexaPayClient',
  'NexaPayConfig',
  'ApiResponse',
  'PaymentIntent',
  'MerchantsResource',
  'PaymentIntentsResource'
];

for (const exportName of namedExports) {
  if (sdkModule[exportName]) {
    console.log(`✅ ${exportName} exists`);
  } else {
    console.log(`❌ ${exportName} not found`);
  }
}

// Try alternative import pattern
console.log('\n=== Alternative Import Patterns ===');

// Pattern 1: Direct import
try {
  const NexaPay = require('@nexapay/node-sdk');
  console.log('Pattern 1: const NexaPay = require(...) - SUCCESS');
  console.log('  Type:', typeof NexaPay);
} catch (error) {
  console.log('Pattern 1: const NexaPay = require(...) - ERROR:', error.message);
}

// Pattern 2: Import with .default
try {
  const NexaPay = require('@nexapay/node-sdk').default;
  console.log('Pattern 2: require(...).default - SUCCESS');
  console.log('  Type:', typeof NexaPay);

  if (typeof NexaPay === 'function') {
    const client = new NexaPay({ apiKey: 'test' });
    console.log('  Can instantiate:', !!client);
  }
} catch (error) {
  console.log('Pattern 2: require(...).default - ERROR:', error.message);
}

// Pattern 3: Destructure
try {
  const { NexaPayClient } = require('@nexapay/node-sdk');
  console.log('Pattern 3: const { NexaPayClient } = require(...) - SUCCESS');
  console.log('  Type:', typeof NexaPayClient);

  if (typeof NexaPayClient === 'function') {
    const client = new NexaPayClient({ apiKey: 'test' });
    console.log('  Can instantiate:', !!client);
  }
} catch (error) {
  console.log('Pattern 3: const { NexaPayClient } = require(...) - ERROR:', error.message);
}

console.log('\n=== Test Complete ===');
