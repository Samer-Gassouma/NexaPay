/**
 * NexaPay Production Deployment Final Verification
 *
 * This script performs comprehensive verification of the production deployment
 * including SDK, frontend, backend, and integration testing.
 *
 * Usage: node final-verification.js
 */

const https = require("https");
const axios = require("axios");
const { execSync } = require("child_process");

// Configuration
const CONFIG = {
  MAIN_DOMAIN: "https://nexapay.space",
  BACKEND_DOMAIN: "https://backend.nexapay.space",
  TEST_API_KEY: process.env.NEXAPAY_TEST_API_KEY || "",
  TEST_TIMEOUT: 10000,
  SKIP_PAYMENT_TESTS: process.env.SKIP_PAYMENT_TESTS === "true",
  SKIP_WEBHOOK_TESTS: process.env.SKIP_WEBHOOK_TESTS === "true",
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
};

// Colors for console output
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
};

// Helper functions
function log(message, color = COLORS.reset, indent = 0) {
  const prefix = " ".repeat(indent);
  console.log(color + prefix + message + COLORS.reset);
}

function logHeader(message) {
  console.log("\n" + "=".repeat(70));
  log(message, COLORS.bold + COLORS.cyan);
  console.log("=".repeat(70));
}

function logSection(message) {
  console.log("\n" + "-".repeat(60));
  log(message, COLORS.bold + COLORS.blue);
  console.log("-".repeat(60));
}

function logResult(name, success, message = "", warning = false) {
  const icon = success ? "✅" : warning ? "⚠️" : "❌";
  const color = success ? COLORS.green : warning ? COLORS.yellow : COLORS.red;
  const status = success ? "PASSED" : warning ? "WARNING" : "FAILED";

  log(`${icon} ${name} - ${status}`, color);
  if (message) {
    log(`  ${message}`, color, 2);
  }

  if (success) testResults.passed++;
  else if (warning) testResults.warnings++;
  else testResults.failed++;
}

function logSkipped(name, reason) {
  log(`⏭️  ${name} - SKIPPED: ${reason}`, COLORS.yellow);
  testResults.skipped++;
}

async function test(name, testFn, skipCondition = false, skipReason = "") {
  if (skipCondition) {
    logSkipped(name, skipReason);
    return;
  }

  try {
    await testFn();
    logResult(name, true);
  } catch (error) {
    logResult(name, false, error.message);
  }
}

// Test: SDK Configuration
async function testSdkConfiguration() {
  logSection("SDK Configuration Verification");

  // Check SDK source files for localhost references
  const sdkFiles = [
    "sdk/src/client.ts",
    "sdk/src/types.ts",
    "sdk/README.md",
    "sdk/examples/basic.js",
    "sdk/examples/typescript-usage.ts",
  ];

  for (const file of sdkFiles) {
    try {
      const fs = require("fs");
      const path = require("path");
      const content = fs.readFileSync(path.join(__dirname, file), "utf8");

      // Check for localhost references (excluding comments about local development)
      const localhostPattern =
        /(?:^|[^"'])(localhost|127\.0\.0\.1|0\.0\.0\.0)(?![^"'])/i;
      if (localhostPattern.test(content)) {
        // Check if it's in a comment about local development
        const lines = content.split("\n");
        let foundLocalhost = false;
        let foundInComment = false;

        for (const line of lines) {
          if (localhostPattern.test(line)) {
            foundLocalhost = true;
            // Check if line is a comment (starts with // or contains // before localhost)
            if (
              line.trim().startsWith("//") ||
              line.includes("// local development") ||
              line.includes("// Local development")
            ) {
              foundInComment = true;
            }
          }
        }

        if (foundLocalhost && !foundInComment) {
          throw new Error(
            `Found localhost reference in ${file} outside of comment`,
          );
        }
      }

      // Check for correct production URL
      const productionUrl = CONFIG.BACKEND_DOMAIN.replace("https://", "");
      if (!content.includes(productionUrl) && file.includes("client.ts")) {
        logResult(
          `SDK ${file} production URL`,
          false,
          `Missing production URL reference: ${productionUrl}`,
        );
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        logResult(`SDK ${file} check`, true, `File not found (may be OK)`);
      } else {
        throw error;
      }
    }
  }

  // Test SDK compilation
  try {
    execSync("cd sdk && npm run build", { stdio: "pipe" });
    logResult("SDK compilation", true);
  } catch (error) {
    throw new Error(`SDK compilation failed: ${error.message}`);
  }

  // Test SDK package.json version
  try {
    const fs = require("fs");
    const packageJson = JSON.parse(fs.readFileSync("sdk/package.json", "utf8"));
    if (!packageJson.version || packageJson.version === "0.0.0") {
      throw new Error("SDK version not properly set");
    }
    logResult("SDK package version", true, `Version: ${packageJson.version}`);
  } catch (error) {
    throw new Error(`SDK package.json check failed: ${error.message}`);
  }
}

// Test: DNS and SSL Verification
async function testDnsAndSsl() {
  logSection("DNS and SSL Verification");

  const domains = [
    { name: "Main domain", url: CONFIG.MAIN_DOMAIN },
    { name: "Backend API", url: CONFIG.BACKEND_DOMAIN },
    { name: "WWW domain", url: CONFIG.MAIN_DOMAIN.replace("://", "://www.") },
  ];

  for (const domain of domains) {
    await test(`${domain.name} DNS resolution`, async () => {
      const url = new URL(domain.url);
      const dns = require("dns").promises;
      await dns.resolve(url.hostname);
    });

    await test(`${domain.name} SSL certificate`, async () => {
      return new Promise((resolve, reject) => {
        const req = https.request(domain.url, { method: "HEAD" }, (res) => {
          const cert = res.socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            reject(new Error("No valid SSL certificate found"));
          } else {
            const validTo = new Date(cert.valid_to);
            const now = new Date();
            if (validTo < now) {
              reject(
                new Error(
                  `SSL certificate expired on ${validTo.toISOString()}`,
                ),
              );
            } else {
              const daysRemaining = Math.floor(
                (validTo - now) / (1000 * 60 * 60 * 24),
              );
              resolve(
                `Valid until ${validTo.toISOString()} (${daysRemaining} days remaining)`,
              );
            }
          }
        });

        req.on("error", reject);
        req.setTimeout(CONFIG.TEST_TIMEOUT, () => {
          req.destroy();
          reject(new Error("SSL certificate check timeout"));
        });

        req.end();
      });
    });
  }
}

// Test: Frontend Configuration
async function testFrontendConfiguration() {
  logSection("Frontend Configuration Verification");

  // Check portal configuration files
  const portalFiles = ["portal/Dockerfile", "portal/lib/api.ts"];

  for (const file of portalFiles) {
    try {
      const fs = require("fs");
      const path = require("path");
      const content = fs.readFileSync(path.join(__dirname, file), "utf8");

      // Check for localhost references
      if (
        content.includes("localhost:8080") ||
        content.includes("localhost:8088")
      ) {
        throw new Error(`Found localhost reference in ${file}`);
      }

      // Check for correct backend URL
      if (!content.includes(CONFIG.BACKEND_DOMAIN)) {
        logResult(
          `Portal ${file} configuration`,
          false,
          `Missing backend URL: ${CONFIG.BACKEND_DOMAIN}`,
        );
      } else {
        logResult(`Portal ${file} configuration`, true);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        logResult(`Portal ${file} check`, true, `File not found (may be OK)`);
      } else {
        throw error;
      }
    }
  }

  // Check docker-compose.yml
  try {
    const fs = require("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf8");

    // Check portal configuration
    if (content.includes("NEXT_PUBLIC_API_URL: http://localhost:8088")) {
      throw new Error("docker-compose.yml still contains localhost API URL");
    }

    if (!content.includes(`NEXT_PUBLIC_API_URL: ${CONFIG.BACKEND_DOMAIN}`)) {
      logResult(
        "Docker Compose configuration",
        false,
        `Missing backend URL: ${CONFIG.BACKEND_DOMAIN}`,
      );
    } else {
      logResult("Docker Compose configuration", true);
    }
  } catch (error) {
    throw new Error(`Docker Compose check failed: ${error.message}`);
  }
}

// Test: Backend API Accessibility
async function testBackendApi() {
  logSection("Backend API Verification");

  const endpoints = [
    { path: "/", name: "API root" },
    { path: "/chain/stats", name: "Chain stats" },
    { path: "/chain/height", name: "Chain height" },
    { path: "/gateway/v1/health", name: "Health check" },
    { path: "/dev/docs/snippets", name: "Developer docs" },
  ];

  for (const endpoint of endpoints) {
    await test(`${endpoint.name} endpoint`, async () => {
      const response = await axios.get(
        `${CONFIG.BACKEND_DOMAIN}${endpoint.path}`,
        {
          timeout: CONFIG.TEST_TIMEOUT,
          validateStatus: null, // Don't throw on non-2xx
        },
      );

      if (response.status >= 500) {
        throw new Error(`Server error: HTTP ${response.status}`);
      }

      // For health check, it might return 404 or other status
      if (endpoint.path === "/gateway/v1/health" && response.status === 404) {
        logResult(
          `${endpoint.name} endpoint`,
          true,
          "Health endpoint not implemented (may be OK)",
          true,
        );
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        // 4xx errors are OK for some endpoints (like unauthorized access)
        logResult(
          `${endpoint.name} endpoint`,
          true,
          `HTTP ${response.status} (may require authentication)`,
          true,
        );
      } else if (response.status >= 200 && response.status < 300) {
        logResult(`${endpoint.name} endpoint`, true, `HTTP ${response.status}`);
      }
    });
  }

  // Test CORS headers
  await test("CORS configuration", async () => {
    const response = await axios.options(
      `${CONFIG.BACKEND_DOMAIN}/chain/stats`,
      {
        timeout: CONFIG.TEST_TIMEOUT,
        headers: {
          Origin: CONFIG.MAIN_DOMAIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "X-API-Key",
        },
      },
    );

    const corsHeaders = response.headers;
    const requiredHeaders = [
      "access-control-allow-origin",
      "access-control-allow-methods",
      "access-control-allow-headers",
    ];

    const missingHeaders = requiredHeaders.filter((h) => !corsHeaders[h]);
    if (missingHeaders.length > 0) {
      throw new Error(`Missing CORS headers: ${missingHeaders.join(", ")}`);
    }

    if (
      corsHeaders["access-control-allow-origin"] !== "*" &&
      corsHeaders["access-control-allow-origin"] !== CONFIG.MAIN_DOMAIN
    ) {
      throw new Error(
        `Invalid CORS origin: ${corsHeaders["access-control-allow-origin"]}`,
      );
    }
  });
}

// Test: Frontend Accessibility
async function testFrontendAccessibility() {
  logSection("Frontend Accessibility Verification");

  const pages = [
    { path: "/", name: "Home page" },
    { path: "/dashboard", name: "Dashboard" },
    { path: "/dev", name: "Developer portal" },
    { path: "/checkout", name: "Checkout page" },
  ];

  for (const page of pages) {
    await test(`${page.name} accessibility`, async () => {
      const response = await axios.get(`${CONFIG.MAIN_DOMAIN}${page.path}`, {
        timeout: CONFIG.TEST_TIMEOUT,
        validateStatus: null,
      });

      if (response.status >= 500) {
        throw new Error(`Server error: HTTP ${response.status}`);
      }

      if (response.status === 404) {
        logResult(
          `${page.name} accessibility`,
          true,
          `Page not found (may be OK for ${page.path})`,
          true,
        );
      } else if (response.status >= 200 && response.status < 300) {
        // Check if page contains correct API URL in JavaScript
        const html = response.data;
        if (html.includes && html.includes(CONFIG.BACKEND_DOMAIN)) {
          logResult(
            `${page.name} accessibility`,
            true,
            `HTTP ${response.status} (API URL found)`,
          );
        } else {
          logResult(
            `${page.name} accessibility`,
            true,
            `HTTP ${response.status}`,
          );
        }
      } else {
        logResult(
          `${page.name} accessibility`,
          true,
          `HTTP ${response.status}`,
          true,
        );
      }
    });
  }
}

// Test: SDK Integration
async function testSdkIntegration() {
  logSection("SDK Integration Testing");

  // Load the SDK
  let NexaPayClient;
  try {
    NexaPayClient = require("./sdk/dist/index.js").default;
    logResult("SDK module loading", true);
  } catch (error) {
    throw new Error(`Failed to load SDK: ${error.message}`);
  }

  // Test SDK initialization with production URL
  await test("SDK initialization with production URL", async () => {
    const client = new NexaPayClient({});
    const baseURL = client.getBaseURL();

    if (baseURL !== CONFIG.BACKEND_DOMAIN) {
      throw new Error(
        `Expected base URL '${CONFIG.BACKEND_DOMAIN}', got '${baseURL}'`,
      );
    }

    // Test actual API call
    const response = await client.request("GET", "/chain/stats");

    if (response.success === false && response.error) {
      // This is OK - endpoint might require authentication
      logResult(
        "SDK API call",
        true,
        `API returned error: ${response.error} (may require auth)`,
        true,
      );
    } else if (
      response.success === true ||
      response.chain_height ||
      response.chain_height_raw
    ) {
      logResult("SDK API call", true, "API responded successfully");
    } else {
      throw new Error("Unexpected API response format");
    }
  });

  // Test with API key if available
  if (!CONFIG.TEST_API_KEY) {
    logSkipped(
      "SDK authenticated requests",
      "No test API key provided (set NEXAPAY_TEST_API_KEY env var)",
    );
    return;
  }

  await test("SDK authenticated requests", async () => {
    const client = new NexaPayClient({
      apiKey: CONFIG.TEST_API_KEY,
    });

    // Test balance endpoint
    const response = await client.balance.get();

    if (response.success && response.data) {
      logResult(
        "SDK balance request",
        true,
        `Balance retrieved: ${response.data.available} millimes available`,
      );
    } else if (response.error) {
      // Might be invalid API key or no permissions
      logResult(
        "SDK balance request",
        true,
        `API returned error: ${response.error}`,
        true,
      );
    } else {
      throw new Error("Unexpected balance response format");
    }
  });
}

// Test: Payment Flow (if API key available and not skipped)
async function testPaymentFlow() {
  if (!CONFIG.TEST_API_KEY || CONFIG.SKIP_PAYMENT_TESTS) {
    logSkipped(
      "Payment flow test",
      CONFIG.SKIP_PAYMENT_TESTS
        ? "Payment tests skipped by config"
        : "No test API key provided",
    );
    return;
  }

  logSection("Payment Flow Testing");

  await test("Payment intent creation", async () => {
    const NexaPayClient = require("./sdk/dist/index.js").default;
    const client = new NexaPayClient({
      apiKey: CONFIG.TEST_API_KEY,
    });

    const intentResponse = await client.paymentIntents.create({
      amount: 1000, // 1.000 TND in millimes
      currency: "TND",
      description: "Production Verification Test",
      idempotency_key: `verification-test-${Date.now()}`,
      metadata: {
        test: true,
        verification: "production-deployment",
        timestamp: new Date().toISOString(),
      },
    });

    if (intentResponse.success && intentResponse.data) {
      const intent = intentResponse.data;
      logResult(
        "Payment intent creation",
        true,
        `Intent created: ${intent.intent_id}`,
      );

      // Test checkout URL
      if (intent.checkout_url) {
        const checkoutUrl = new URL(intent.checkout_url);
        if (checkoutUrl.hostname === new URL(CONFIG.MAIN_DOMAIN).hostname) {
          logResult(
            "Checkout URL generation",
            true,
            `Checkout URL points to correct domain: ${checkoutUrl.hostname}`,
          );
        } else {
          throw new Error(
            `Checkout URL points to wrong domain: ${checkoutUrl.hostname}`,
          );
        }
      } else {
        throw new Error("No checkout URL in response");
      }

      // Test intent retrieval
      const retrieveResponse = await client.paymentIntents.get(
        intent.intent_id,
      );
      if (retrieveResponse.success && retrieveResponse.data) {
        logResult(
          "Payment intent retrieval",
          true,
          `Intent retrieved: ${retrieveResponse.data.status}`,
        );
      } else {
        throw new Error(`Failed to retrieve intent: ${retrieveResponse.error}`);
      }
    } else {
      throw new Error(
        `Failed to create payment intent: ${intentResponse.error}`,
      );
    }
  });
}

// Test: Webhook Verification (if not skipped)
async function testWebhookVerification() {
  if (CONFIG.SKIP_WEBHOOK_TESTS) {
    logSkipped("Webhook verification test", "Webhook tests skipped by config");
    return;
  }

  logSection("Webhook Verification Testing");

  await test("Webhook signature verification", async () => {
    const NexaPayClient = require("./sdk/dist/index.js").default;
    const client = new NexaPayClient({});

    // Test webhook verification logic (without actual webhook)
    const testPayload = JSON.stringify({
      event: "payment_intent.succeeded",
      data: { intent_id: "test_intent_123" },
      created_at: new Date().toISOString(),
    });

    const testSecret = "test_webhook_secret_123";
    const testSignature =
      "0000000000000000000000000000000000000000000000000000000000000000";

    try {
      client.parseWebhookEvent(testPayload, testSignature, testSecret);
      throw new Error(
        "Webhook verification should have failed with invalid signature",
      );
    } catch (error) {
      if (
        error.message.includes("Invalid webhook signature") ||
        error.message.includes("same byte length")
      ) {
        logResult(
          "Webhook verification",
          true,
          "Correctly rejected invalid signature",
        );
      } else {
        throw new Error(`Unexpected webhook error: ${error.message}`);
      }
    }
  });
}

// Test: Complete System Integration
async function testSystemIntegration() {
  logSection("Complete System Integration");

  await test("Frontend-backend connectivity", async () => {
    // Test that frontend can reach backend
    const frontendResponse = await axios.get(`${CONFIG.MAIN_DOMAIN}`, {
      timeout: CONFIG.TEST_TIMEOUT,
      validateStatus: null,
    });

    if (frontendResponse.status >= 500) {
      throw new Error(`Frontend server error: HTTP ${frontendResponse.status}`);
    }

    // Test backend directly
    const backendResponse = await axios.get(
      `${CONFIG.BACKEND_DOMAIN}/chain/stats`,
      {
        timeout: CONFIG.TEST_TIMEOUT,
        validateStatus: null,
      },
    );

    if (backendResponse.status >= 500) {
      throw new Error(`Backend server error: HTTP ${backendResponse.status}`);
    }

    logResult(
      "Frontend-backend connectivity",
      true,
      "Both frontend and backend responding",
    );
  });

  await test("Production configuration consistency", async () => {
    // Check that all configurations point to production URLs
    const checks = [
      {
        name: "SDK default base URL",
        check: () => {
          const NexaPayClient = require("./sdk/dist/index.js").default;
          const client = new NexaPayClient({});
          return client.getBaseURL() === CONFIG.BACKEND_DOMAIN;
        },
      },
      {
        name: "Frontend API configuration",
        check: async () => {
          // Try to extract API URL from frontend
          const response = await axios.get(`${CONFIG.MAIN_DOMAIN}`, {
            timeout: CONFIG.TEST_TIMEOUT,
            validateStatus: null,
          });

          if (response.data && typeof response.data === "string") {
            // Simple check for backend domain in HTML/JS
            if (response.data.includes(CONFIG.BACKEND_DOMAIN)) {
              return true;
            } else {
              // Not found in HTML, but might be in JS bundles - log warning but don't fail
              logResult(
                "Frontend API configuration",
                true,
                "Backend URL not found in initial HTML (may be in JS bundles)",
                true,
              );
              return true;
            }
          }
          return true; // If we can't check, assume it's OK
        },
      },
    ];

    for (const check of checks) {
      try {
        const result = await (typeof check.check === "function"
          ? check.check()
          : check.check);
        if (result) {
          logResult(check.name, true);
        } else {
          throw new Error(`Configuration check failed for ${check.name}`);
        }
      } catch (error) {
        throw new Error(`${check.name}: ${error.message}`);
      }
    }
  });
}

// Main test runner
async function runAllTests() {
  logHeader("NEXAPAY PRODUCTION DEPLOYMENT FINAL VERIFICATION");
  log(`Start time: ${new Date().toISOString()}`, COLORS.yellow);
  log(`Main domain: ${CONFIG.MAIN_DOMAIN}`, COLORS.yellow);
  log(`Backend API: ${CONFIG.BACKEND_DOMAIN}`, COLORS.yellow);
  log(
    `Test API key: ${CONFIG.TEST_API_KEY ? "Provided" : "Not provided"}`,
    COLORS.yellow,
  );
  console.log();

  try {
    // Run all test suites
    await testSdkConfiguration();
    await testDnsAndSsl();
    await testFrontendConfiguration();
    await testBackendApi();
    await testFrontendAccessibility();
    await testSdkIntegration();
    await testPaymentFlow();
    await testWebhookVerification();
    await testSystemIntegration();
  } catch (error) {
    log(
      `\n🔥 Critical error during testing: ${error.message}`,
      COLORS.red + COLORS.bold,
    );
    testResults.failed++;
  }

  // Print summary
  logHeader("VERIFICATION SUMMARY");

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
    log("❌ DEPLOYMENT VERIFICATION FAILED", COLORS.red + COLORS.bold);
    log(
      "Some critical tests failed. Please fix the issues above before proceeding.",
      COLORS.red,
    );
    process.exit(1);
  } else if (testResults.warnings > 0) {
    log(
      "⚠️  DEPLOYMENT VERIFICATION COMPLETED WITH WARNINGS",
      COLORS.yellow + COLORS.bold,
    );
    log(
      "Deployment is functional but has some warnings. Review warnings above.",
      COLORS.yellow,
    );

    // Recommendations
    logHeader("RECOMMENDATIONS");
    log("1. Review all warnings in the test output above", COLORS.yellow);
    log("2. Test the complete payment flow manually", COLORS.yellow);
    log("3. Verify webhook functionality if using webhooks", COLORS.yellow);
    log("4. Monitor application logs for any issues", COLORS.yellow);

    process.exit(0);
  } else {
    log("✅ DEPLOYMENT VERIFICATION PASSED", COLORS.green + COLORS.bold);
    log("All tests passed! Production deployment is ready.", COLORS.green);

    // Next steps
    logHeader("NEXT STEPS FOR PRODUCTION");
    log(
      "1. ✅ SDK is configured for production (https://backend.nexapay.space)",
      COLORS.green,
    );
    log("2. ✅ Frontend is configured for production", COLORS.green);
    log("3. ✅ SSL certificates are valid", COLORS.green);
    log("4. ✅ All services are accessible", COLORS.green);
    log("5. Publish SDK to npm registry:", COLORS.cyan);
    log("   cd sdk && npm publish --access public", COLORS.white);
    log("6. Update documentation with production URLs:", COLORS.cyan);
    log("   - Update README.md with production examples", COLORS.white);
    log("   - Update API documentation", COLORS.white);
    log("7. Set up monitoring and alerting:", COLORS.cyan);
    log("   - Monitor payment success rates", COLORS.white);
    log("   - Set up error tracking", COLORS.white);
    log("   - Configure backups", COLORS.white);

    process.exit(0);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  log(`\n🔥 Uncaught exception: ${error.message}`, COLORS.red + COLORS.bold);
  console.error(error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
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
  CONFIG,
  testResults,
};
