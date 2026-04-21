# Quick Publish Instructions for NexaPay SDK

## Current Status
- **SDK Version**: 0.1.1
- **Production Ready**: ✅ Configured for `https://backend.nexapay.space`
- **2FA Status**: Enabled on npm account (`auth-and-writes` mode)
- **All Tests Pass**: Production connectivity verified

## Step 1: Get a Fresh One-Time Password (OTP)
1. Open your authenticator app (Google Authenticator, Authy, etc.)
2. Get a fresh 6-digit code for npm
3. **Important**: OTP expires in 30 seconds - be ready to use it immediately

## Step 2: Publish with OTP
Run this command in the SDK directory:
```bash
cd sdk
npm publish --access public --otp YOUR_OTP_CODE
```

Example with actual OTP:
```bash
npm publish --access public --otp 123456
```

## Step 3: Verify Publication
After successful publish, verify with:
```bash
# Check package on npm
npm view @nexapay/node-sdk

# Test installation
npm pack --dry-run
```

## Step 4: Create Git Tag (Optional but Recommended)
```bash
# Tag the release
git tag -a v0.1.1 -m "Release v0.1.1 - Production deployment"

# Push tag to GitHub
git push origin v0.1.1
```

## Step 5: Update GitHub Release
1. Go to: https://github.com/Samer-Gassouma/NexaPay/releases/new
2. Tag: `v0.1.1`
3. Title: "Release v0.1.1 - Production Deployment"
4. Description: Copy from `sdk/CHANGELOG.md`
5. Publish release

---

## Alternative: Create Publish Token (For Future Use)
If you want to avoid OTP for future publishes:

### Create Token with OTP:
```bash
cd sdk
npm token create "nexapay-publish-token" --cidr 0.0.0.0/0 --otp YOUR_OTP_CODE
```

### Save and Use Token:
```bash
# Save token to npm config
npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN_VALUE

# Now publish without OTP
npm publish --access public
```

---

## Troubleshooting

### "Invalid OTP" Error
- Get a fresh OTP (they expire every 30 seconds)
- Check if using email OTP - verify your email
- Try again with new code

### "403 Forbidden" Error
- Verify login: `npm whoami` (should show `n3on404`)
- Check permissions: `npm access list packages @nexapay`
- Ensure you're in the correct directory (`NexaPay/sdk`)

### "Package Already Exists" Error
- Version 0.1.1 doesn't exist yet - this shouldn't happen
- If publishing fails, you can retry with same OTP within 30 seconds

### Build/Test Failures
- SDK already built successfully: `dist/` directory exists
- Tests passing: connectivity to production verified
- You can skip tests: `npm publish --access public --otp OTP --ignore-scripts`

---

## Quick Reference Commands

```bash
# Check npm login
npm whoami

# Check 2FA status
npm profile get

# Dry run (no actual publish)
npm publish --dry-run --access public

# Publish with OTP (MAIN COMMAND)
cd sdk && npm publish --access public --otp YOUR_OTP_CODE

# Verify after publish
npm view @nexapay/node-sdk
```

---

## What's Being Published
- **Package**: `@nexapay/node-sdk@0.1.1`
- **Files**: 13 files (17.4 kB)
- **Changes**: Production base URL updated to `https://backend.nexapay.space`
- **Status**: Ready for developer use

---

## Support
- **Email**: dev@nexapay.tn
- **GitHub**: https://github.com/Samer-Gassouma/NexaPay/issues
- **Documentation**: https://nexapay.tn/docs

*Last updated: April 21, 2026*