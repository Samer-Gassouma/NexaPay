# NexaPay SDK Publishing Guide

This guide provides step-by-step instructions for publishing the NexaPay Node.js SDK to the npm registry.

## Prerequisites

Before publishing, ensure you have:

1. **Node.js and npm installed**: Version 14.0.0 or higher
2. **npm account**: Registered at [npmjs.com](https://www.npmjs.com/)
3. **Authentication**: Logged in to npm via `npm login`
4. **Repository access**: Push access to the GitHub repository
5. **Version control**: Clean git working directory

## 1. Pre-Publish Checklist

Before publishing a new version, complete these checks:

### ✅ Code Quality
- [ ] All TypeScript compilation passes (`npm run build`)
- [ ] No linting errors (`npm run lint`)
- [ ] Test suite passes (if tests exist)
- [ ] No localhost references in production code
- [ ] All configuration points to production URLs

### ✅ Documentation
- [ ] README.md is up-to-date with correct examples
- [ ] CHANGELOG.md is updated with version changes
- [ ] TypeScript definitions are complete and accurate
- [ ] All public APIs are documented

### ✅ Version Management
- [ ] Package.json version is updated
- [ ] Git tag is ready for the new version
- [ ] No breaking changes without major version bump
- [ ] Backward compatibility considered

## 2. Building the SDK

Build the SDK to ensure all TypeScript compiles correctly:

```bash
# Navigate to SDK directory
cd sdk

# Clean previous builds
rm -rf dist/

# Install dependencies (if needed)
npm install

# Build the SDK
npm run build

# Verify build output
ls -la dist/
```

Expected output in `dist/` directory:
- `index.js` - Main entry point
- `index.d.ts` - TypeScript definitions
- `client.js`, `client.d.ts` - Client class
- `types.js`, `types.d.ts` - Type definitions
- `resources.js`, `resources.d.ts` - Resource classes
- `errors.js`, `errors.d.ts` - Error classes

## 3. Versioning Strategy

Follow Semantic Versioning (SemVer):

### Version Format: `MAJOR.MINOR.PATCH`

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backward-compatible
- **PATCH** (0.0.X): Bug fixes, backward-compatible

### Update Package Version

```bash
# Check current version
npm version

# Update to new version (choose one):
npm version patch  # 0.1.1 → 0.1.2 (bug fixes)
npm version minor  # 0.1.1 → 0.2.0 (new features)
npm version major  # 0.1.1 → 1.0.0 (breaking changes)

# Or set specific version
npm version 0.2.0
```

### Update CHANGELOG.md

For each release, update `CHANGELOG.md` with:

1. Version number and release date
2. Sections: Added, Changed, Deprecated, Removed, Fixed, Security
3. Links to compare changes
4. Migration notes for breaking changes

Example:
```markdown
## [0.1.1] - 2026-04-21

### Changed
- Updated default base URL to https://backend.nexapay.space

### Fixed
- Portal configuration for production deployment
```

## 4. Testing Before Publishing

Run comprehensive tests before publishing:

### Local Testing
```bash
# Test SDK compilation
npm run build

# Run linting
npm run lint

# Test with example scripts
node examples/basic.js
node examples/typescript-usage.ts

# Test production connectivity
cd ..
node test-sdk-production.js
```

### Integration Testing
1. Create a test project that imports the SDK
2. Test all major API endpoints
3. Verify TypeScript type definitions work correctly
4. Test error handling and edge cases

## 5. Publishing to npm

### Authentication
Ensure you're logged in to npm:

```bash
# Check login status
npm whoami

# Login if needed
npm login

# Enter credentials when prompted:
# - Username
# - Password
# - Email
# - One-time password (if 2FA enabled)
```

### Dry Run
Test the publish process without actually publishing:

```bash
npm publish --dry-run
```

This will show what files would be published without uploading them.

### Actual Publication
Publish to the public npm registry:

```bash
npm publish --access public
```

Successful output should show:
```
+ @nexapay/node-sdk@0.1.1
```

### Publishing Options

- `--access public`: Required for scoped packages (`@nexapay/node-sdk`)
- `--tag beta`: Publish as beta version (`npm publish --tag beta`)
- `--otp <code>`: Two-factor authentication code

## 6. Post-Publishing Steps

### Verify Publication
1. Check package on npmjs.com: https://www.npmjs.com/package/@nexapay/node-sdk
2. Verify version number and publication date
3. Check that all files are included

### Git Tagging
Create a git tag for the release:

```bash
# Tag the release
git tag -a v0.1.1 -m "Release version 0.1.1"

# Push tag to remote
git push origin v0.1.1
```

### Update Repository
```bash
# Commit version changes
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release v0.1.1"
git push origin main
```

### Create GitHub Release
1. Go to GitHub repository
2. Click "Releases" → "Draft a new release"
3. Select the tag (v0.1.1)
4. Add release title and description
5. Copy CHANGELOG entries for this version
6. Attach any release assets
7. Publish release

## 7. Troubleshooting

### Common Issues

#### "You do not have permission to publish"
- Ensure you're logged in (`npm whoami`)
- Check if you're a collaborator on the package
- Verify package name doesn't conflict with existing package

#### "Package name already exists"
- Scoped packages (@nexapay/node-sdk) are unique to your organization
- Unscoped packages may have naming conflicts

#### "Two-factor authentication required"
- Use `--otp` flag: `npm publish --otp 123456`

#### "Incorrect access level"
- Scoped packages default to private
- Use `--access public` for public packages

#### "Build errors"
- Ensure TypeScript compiles without errors
- Check `tsconfig.json` configuration
- Verify all dependencies are installed

### Recovery Steps

#### Unpublishing (Within 72 hours)
```bash
npm unpublish @nexapay/node-sdk@0.1.1
```

#### Deprecating a version
```bash
npm deprecate @nexapay/node-sdk@0.1.0 "Use version 0.1.1 instead"
```

## 8. Best Practices

### Publishing Checklist
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Build passes without errors
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Git working directory clean
- [ ] npm authentication verified
- [ ] Dry run successful
- [ ] GitHub release prepared

### Quality Assurance
1. **Test in isolation**: Create a clean test project
2. **Verify dependencies**: Check for vulnerable packages (`npm audit`)
3. **Check bundle size**: Ensure reasonable package size
4. **TypeScript compatibility**: Test with strict TypeScript settings
5. **Backward compatibility**: Verify no breaking changes in minor/patch releases

### Security Considerations
- Never publish with API keys or secrets
- Use `.npmignore` to exclude sensitive files
- Regularly update dependencies
- Monitor for security vulnerabilities
- Use 2FA for npm account

### Communication
- Announce new releases to stakeholders
- Update API documentation if needed
- Notify users of breaking changes in advance
- Provide migration guides for major versions

## 9. Automated Publishing (Optional)

For CI/CD pipeline, create a `.github/workflows/publish.yml`:

```yaml
name: Publish to npm
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: cd sdk && npm ci
      - run: cd sdk && npm run build
      - run: cd sdk && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 10. Support and Maintenance

### Post-Release Monitoring
1. Monitor npm download statistics
2. Watch GitHub issues for bug reports
3. Check error tracking systems
4. Monitor dependency updates

### Handling Issues
1. **Critical bugs**: Hotfix and patch release
2. **Security vulnerabilities**: Immediate patch release
3. **Feature requests**: Consider for next minor release
4. **Documentation issues**: Update without version bump

### Deprecation Policy
- Announce deprecation at least one major version in advance
- Provide clear migration paths
- Maintain deprecated features for reasonable period
- Update documentation with deprecation notices

---

## Quick Reference

### One-Command Publishing (After all checks)
```bash
cd sdk && npm publish --access public
```

### Version Management
```bash
# View current version
npm version

# Bump versions
npm version patch  # 0.1.1 → 0.1.2
npm version minor  # 0.1.1 → 0.2.0
npm version major  # 0.1.1 → 1.0.0
```

### Useful Commands
```bash
# Check npm login
npm whoami

# View package info
npm view @nexapay/node-sdk

# List published versions
npm view @nexapay/node-sdk versions

# Dry run publication
npm publish --dry-run
```

---

## Contact

For publishing issues or questions:
- **Technical Support**: dev@nexapay.tn
- **GitHub Issues**: https://github.com/nexapay/nexapay-node-sdk/issues
- **Documentation**: https://nexapay.tn/docs

*Last updated: April 2026*