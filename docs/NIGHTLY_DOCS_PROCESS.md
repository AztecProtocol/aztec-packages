# Nightly Documentation Release Process

This document describes the automated nightly documentation release process for the Aztec Packages project.

## Overview

The nightly documentation release process creates versioned documentation snapshots from the `next` branch on a daily basis. This allows users to access documentation that corresponds to the latest nightly builds and development progress.

## How It Works

### 1. Nightly Tag Creation

- **Schedule**: Every night at 2:00 AM UTC
- **Workflow**: `.github/workflows/nightly-release-tag.yml`
- **Tag Format**: `v{version}-nightly.{YYYYMMDD}`
- **Example**: `v3.0.0-nightly.20241201`

### 2. Nightly Documentation Release

- **Schedule**: Every night at 4:00 AM UTC (1 hour after tag creation)
- **Workflow**: `.github/workflows/nightly-docs-release.yml`
- **Trigger**: Automatic detection of new nightly tags

### 3. Documentation Processing

The workflow performs the following steps:

1. **Tag Detection**: Checks for the latest nightly tag created from the `next` branch
2. **Checkout**: Checks out the repository at the specific nightly tag
3. **Aztec Docs**:
   - Builds documentation with the nightly tag context
   - Creates versioned docs using `yarn docusaurus docs:version`
   - Updates `versions.json` to include the new nightly version
4. **Barretenberg Docs**:
   - Same process as Aztec docs but for Barretenberg documentation
5. **Pull Request**: Creates an automated PR with the new documentation
6. **Auto-merge**: Automatically merges the PR back to the `next` branch

## File Structure

After a nightly docs release, the following structure is created:

```
docs/
├── versioned_docs/
│   └── version-v3.0.0-nightly.20241201/
│       └── [all documentation files]
├── versioned_sidebars/
│   └── version-v3.0.0-nightly.20241201-sidebars.json
└── versions.json (updated with new nightly version)

barretenberg/docs/
├── versioned_docs/
│   └── version-v3.0.0-nightly.20241201/
│       └── [all documentation files]
├── versioned_sidebars/
│   └── version-v3.0.0-nightly.20241201-sidebars.json
└── versions.json (updated with new nightly version)
```

## Manual Triggering

The nightly docs workflow can be manually triggered via GitHub Actions with a specific tag:

1. Go to Actions → "Nightly Docs Release"
2. Click "Run workflow"
3. Enter a specific nightly tag (e.g., `v3.0.0-nightly.20241201`)
4. Click "Run workflow"

## Integration with Existing Systems

### Release Please Integration

- Configuration: `.github/release-please-next.json`
- Release PRs for `next` branch will also trigger documentation updates

### CI Integration

- The existing CI system already handles nightly tags appropriately
- Nightly builds are triggered when tags match the `-nightly.` pattern
- Documentation builds use the `COMMIT_TAG` environment variable for version macros

## Version Management

### Nightly Versions

- Format: `v{major}.{minor}.{patch}-nightly.{YYYYMMDD}`
- Based on the current version in `.release-please-manifest.json`
- Automatically incremented daily

### Version Display

- Nightly versions appear in the documentation version dropdown
- They are clearly marked as nightly builds
- Users can switch between stable releases and nightly versions

## Cleanup and Maintenance

### Automatic Cleanup

Currently, nightly documentation versions are replaced daily.

## Related Documentation

- [Main Documentation README](./README.md)
- [CI Documentation](../CI.md)
