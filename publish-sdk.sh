#!/bin/bash

# NexaPay SDK Publishing Script
# Interactive script to publish the NexaPay Node.js SDK to npm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="@nexapay/node-sdk"
SDK_DIR="sdk"
ROOT_DIR=$(pwd)
TWO_FACTOR_ENABLED=false

# Print colored message
log() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if running from correct directory
check_directory() {
    if [ ! -d "$SDK_DIR" ]; then
        error "SDK directory '$SDK_DIR' not found."
        error "Please run this script from the project root directory."
        exit 1
    fi

    if [ ! -f "$SDK_DIR/package.json" ]; then
        error "package.json not found in $SDK_DIR"
        exit 1
    fi

    success "Running from correct directory"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        exit 1
    fi
    success "Node.js $(node --version) installed"

    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        exit 1
    fi
    success "npm $(npm --version) installed"

    # Check git
    if ! command -v git &> /dev/null; then
        error "git is not installed"
        exit 1
    fi
    success "git $(git --version | cut -d' ' -f3) installed"

    # Check npm login
    if ! npm whoami &> /dev/null; then
        warning "Not logged in to npm"
        read -p "Do you want to login to npm now? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            npm login
        else
            error "You must be logged in to npm to publish"
            exit 1
        fi
    else
        success "Logged in to npm as $(npm whoami)"
    fi

    # Check 2FA status
    info "Checking 2FA status..."
    if npm profile get 2>/dev/null | grep -q '"tfa": true'; then
        warning "Two-factor authentication is enabled on your npm account."
        warning "You will need to provide a one-time password when publishing."
        TWO_FACTOR_ENABLED=true
    else
        info "2FA is not enabled on your npm account."
        TWO_FACTOR_ENABLED=false
    fi

    # Check git status
    if [ -n "$(git status --porcelain)" ]; then
        warning "Git working directory is not clean"
        git status --short
        read -p "Continue anyway? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Please commit or stash your changes before publishing"
            exit 0
        fi
    else
        success "Git working directory is clean"
    fi
}

# Build and test
build_and_test() {
    log "Building and testing SDK..."

    cd "$SDK_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        info "Installing dependencies..."
        npm ci
    fi

    # Run linting
    info "Running linting..."
    if npm run lint &> /dev/null; then
        success "Linting passed"
    else
        warning "Linting failed or not configured"
    fi

    # Build the SDK
    info "Building SDK..."
    if npm run build; then
        success "Build successful"
    else
        error "Build failed"
        exit 1
    fi

    # Check build output
    if [ ! -f "dist/index.js" ]; then
        error "Build output not found in dist/"
        exit 1
    fi
    success "Build output verified"

    # Run tests if available
    info "Checking for tests..."
    if grep -q '"test"' package.json; then
        if npm test; then
            success "Tests passed"
        else
            error "Tests failed"
            exit 1
        fi
    else
        warning "No tests configured in package.json"
    fi

    cd "$ROOT_DIR"
}

# Show current version and get new version
get_version() {
    cd "$SDK_DIR"

    CURRENT_VERSION=$(node -p "require('./package.json').version")
    info "Current version: $CURRENT_VERSION"

    echo
    echo "Select version bump:"
    echo "1) Patch (0.0.X) - bug fixes"
    echo "2) Minor (0.X.0) - new features, backwards compatible"
    echo "3) Major (X.0.0) - breaking changes"
    echo "4) Custom version"
    echo "5) Cancel"

    read -p "Enter choice [1-5]: " choice

    case $choice in
        1)
            NEW_VERSION=$(npm version patch --no-git-tag-version)
            success "Bumping to patch version: $NEW_VERSION"
            ;;
        2)
            NEW_VERSION=$(npm version minor --no-git-tag-version)
            success "Bumping to minor version: $NEW_VERSION"
            ;;
        3)
            NEW_VERSION=$(npm version major --no-git-tag-version)
            success "Bumping to major version: $NEW_VERSION"
            ;;
        4)
            read -p "Enter custom version (e.g., 1.2.3): " custom_version
            if [[ ! $custom_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                error "Invalid version format. Must be X.Y.Z"
                exit 1
            fi
            NEW_VERSION=$(npm version $custom_version --no-git-tag-version)
            success "Setting custom version: $NEW_VERSION"
            ;;
        5)
            info "Publishing cancelled"
            exit 0
            ;;
        *)
            error "Invalid choice"
            exit 1
            ;;
    esac

    # Remove 'v' prefix if present
    NEW_VERSION=${NEW_VERSION#v}

    cd "$ROOT_DIR"
}

# Update CHANGELOG
update_changelog() {
    log "Updating CHANGELOG.md..."

    if [ ! -f "$SDK_DIR/CHANGELOG.md" ]; then
        warning "CHANGELOG.md not found, creating..."
        cat > "$SDK_DIR/CHANGELOG.md" << EOF
# Changelog

All notable changes to the NexaPay Node.js SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Fixed
- Nothing yet

### Deprecated
- Nothing yet

### Removed
- Nothing yet

### Security
- Nothing yet

## [$NEW_VERSION] - $(date '+%Y-%m-%d')

### Added
- Initial release

EOF
        success "Created CHANGELOG.md"
        return
    fi

    # Ask for changelog entries
    echo
    info "Please enter changelog entries for version $NEW_VERSION"
    echo "Press Ctrl+D when finished (empty line to skip a section)"
    echo

    # Create temporary file for new release notes
    TEMP_FILE=$(mktemp)

    echo "## [$NEW_VERSION] - $(date '+%Y-%m-%d')" >> "$TEMP_FILE"
    echo "" >> "$TEMP_FILE"

    # Get Added section
    echo "### Added"
    echo "(Enter each item on a new line, empty line to finish)"
    while IFS= read -r line; do
        [ -z "$line" ] && break
        echo "- $line" >> "$TEMP_FILE"
    done
    echo "" >> "$TEMP_FILE"

    # Get Changed section
    echo "### Changed"
    echo "(Enter each item on a new line, empty line to finish)"
    while IFS= read -r line; do
        [ -z "$line" ] && break
        echo "- $line" >> "$TEMP_FILE"
    done
    echo "" >> "$TEMP_FILE"

    # Get Fixed section
    echo "### Fixed"
    echo "(Enter each item on a new line, empty line to finish)"
    while IFS= read -r line; do
        [ -z "$line" ] && break
        echo "- $line" >> "$TEMP_FILE"
    done
    echo "" >> "$TEMP_FILE"

    # Insert new release at top of changelog (after # Changelog and ## [Unreleased])
    awk -v new_content="$(cat "$TEMP_FILE")" '
    /^## \[Unreleased\]/ {
        print $0
        print ""
        print new_content
        next
    }
    { print }
    ' "$SDK_DIR/CHANGELOG.md" > "$SDK_DIR/CHANGELOG.md.tmp"

    mv "$SDK_DIR/CHANGELOG.md.tmp" "$SDK_DIR/CHANGELOG.md"
    rm "$TEMP_FILE"

    success "CHANGELOG.md updated"
}

# Show what will be published
show_package_contents() {
    log "Package contents that will be published:"

    cd "$SDK_DIR"

    # Show package.json info
    echo
    info "Package information:"
    echo "Name:    $(node -p "require('./package.json').name")"
    echo "Version: $(node -p "require('./package.json').version")"
    echo "Description: $(node -p "require('./package.json').description")"

    # Show files to be published
    echo
    info "Files to be published:"
    npm pack --dry-run 2>/dev/null | grep -A 100 "=== Tarball Contents ===" | tail -n +2

    cd "$ROOT_DIR"
}

# Dry run publish
dry_run_publish() {
    log "Running dry publish (no actual publish)..."

    cd "$SDK_DIR"

    if npm publish --dry-run --access public; then
        success "Dry run successful"
    else
        error "Dry run failed"
        exit 1
    fi

    cd "$ROOT_DIR"
}

# Actual publish
publish() {
    log "Publishing to npm registry..."

    cd "$SDK_DIR"

    info "Publishing $PACKAGE_NAME@$NEW_VERSION"

    # Check if we should ask for OTP (2FA)
    OTP=""
    MAX_RETRIES=3
    ATTEMPT=1
    PUBLISH_SUCCESS=false

    while [ $ATTEMPT -le $MAX_RETRIES ] && [ "$PUBLISH_SUCCESS" = false ]; do
        OTP=""
        if [ "$TWO_FACTOR_ENABLED" = true ] || [ $ATTEMPT -gt 1 ]; then
            warning "Two-factor authentication is required to publish."
            read -p "Attempt $ATTEMPT/$MAX_RETRIES - Enter 2FA one-time password: " OTP
            echo
            if [ -z "$OTP" ]; then
                warning "No OTP provided. Skipping 2FA..."
            fi
        fi

        # Build publish command
        PUBLISH_CMD="npm publish --access public"
        if [ -n "$OTP" ]; then
            PUBLISH_CMD="$PUBLISH_CMD --otp $OTP"
            info "Using 2FA one-time password"
        fi

        info "Publishing attempt $ATTEMPT/$MAX_RETRIES..."
        if eval "$PUBLISH_CMD"; then
            success "Successfully published $PACKAGE_NAME@$NEW_VERSION"
            PUBLISH_SUCCESS=true
        else
            error "Publishing attempt $ATTEMPT failed"

            # Check if error is related to 2FA
            if [ $ATTEMPT -lt $MAX_RETRIES ]; then
                echo
                warning "The error may be due to:"
                warning "1. Incorrect or expired one-time password"
                warning "2. 2FA requirement not met"
                warning "3. Network or permission issues"
                echo
                info "Retrying..."
                echo
            fi
            ATTEMPT=$((ATTEMPT + 1))
        fi
    done

    if [ "$PUBLISH_SUCCESS" = false ]; then
        error "Publishing failed after $MAX_RETRIES attempts"
        echo
        info "Troubleshooting steps:"
        info "1. Check your 2FA one-time password (it refreshes every 30 seconds)"
        info "2. Verify npm login: npm whoami"
        info "3. Check package permissions: npm access ls-packages"
        info "4. Try publishing manually:"
        info "   cd sdk && npm publish --access public --otp YOUR_OTP"
        info "5. If 2FA issues persist, consider creating a granular token:"
        info "   npm token create --read-write"
        info "   Then use: npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN"
        exit 1
    fi

    cd "$ROOT_DIR"
}

# Git operations
git_operations() {
    log "Performing git operations..."

    # Commit changes
    git add "$SDK_DIR/package.json" "$SDK_DIR/package-lock.json" "$SDK_DIR/CHANGELOG.md"

    if git commit -m "Release v$NEW_VERSION"; then
        success "Git commit created"
    else
        warning "Git commit failed or no changes to commit"
    fi

    # Create and push tag
    read -p "Create git tag v$NEW_VERSION? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"; then
            success "Git tag created"
        else
            error "Failed to create git tag"
        fi
    fi

    # Push changes
    read -p "Push changes and tags to remote? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if git push; then
            success "Pushed changes to remote"
        else
            error "Failed to push changes"
        fi

        if git tag -l | grep -q "v$NEW_VERSION"; then
            if git push origin "v$NEW_VERSION"; then
                success "Pushed tag to remote"
            else
                error "Failed to push tag"
            fi
        fi
    fi
}

# Show next steps
show_next_steps() {
    log "Publishing complete! Next steps:"
    echo
    echo "1. Verify publication on npm:"
    echo "   https://www.npmjs.com/package/$PACKAGE_NAME"
    echo
    echo "2. Create GitHub release:"
    echo "   - Go to: https://github.com/nexapay/nexapay-node-sdk/releases/new"
    echo "   - Tag: v$NEW_VERSION"
    echo "   - Title: Release v$NEW_VERSION"
    echo "   - Description: Copy from CHANGELOG.md"
    echo
    echo "3. Announce the release:"
    echo "   - Update documentation if needed"
    echo "   - Notify stakeholders"
    echo "   - Share on relevant channels"
    echo
    echo "4. Monitor for issues:"
    echo "   - Watch npm download statistics"
    echo "   - Monitor GitHub issues"
    echo "   - Check error reports"
}

# Main function
main() {
    echo -e "${GREEN}"
    cat << "EOF"
 _   _                 ____  _  __          _____ _  __
| \ | | _____      __ |  _ \| |/ /    /\   / ____| |/ /
|  \| |/ _ \ \ /\ / / | |_) | ' /    /  \ | |    | ' /
| |\  |  __/\ V  V /  |  __/|  <    / /\ \| |    |  <
|_| \_|\___| \_/\_/   |_|   |_|\_\ /_/  \_\_|    |_|\_\

EOF
    echo -e "${NC}"
    echo "NexaPay SDK Publishing Script"
    echo "============================="
    echo

    # Run all steps
    check_directory
    check_prerequisites
    build_and_test
    get_version

    echo
    info "Summary of changes:"
    echo "  Version: $CURRENT_VERSION → $NEW_VERSION"
    echo "  Package: $PACKAGE_NAME"
    echo

    read -p "Continue with publishing? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Publishing cancelled"
        exit 0
    fi

    update_changelog
    show_package_contents

    echo
    read -p "Run dry publish? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        dry_run_publish
    fi

    echo
    read -p "Ready to publish to npm? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Publishing cancelled"
        exit 0
    fi

    publish
    git_operations
    show_next_steps

    echo
    success "SDK publishing process completed!"
}

# Run main function
main "$@"
