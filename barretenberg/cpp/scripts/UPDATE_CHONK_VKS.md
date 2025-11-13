# Updating Pinned Chonk VKs

This document explains how to update the `pinned_short_hash` in `test_chonk_standalone_vks_havent_changed.sh` when verification key (VK) changes are expected.

## Overview

The script pins IVC inputs to a known commit to detect breaking protocol changes by comparing generated VKs with freshly computed ones. When intentional VK changes occur, you need to update the pinned reference.

## Understanding the Update Methods

There are three scenarios, each requiring a different approach:

### Scenario 1: VK-Only Changes (Most Common)
**When**: You modified cryptographic code that changed verification keys, but the circuit structure remains the same.

**What to do**: Use `--update_fast` to update only the VKs within the existing pinned inputs.

### Scenario 2: Circuit Structure Changes
**When**: You modified circuits in a way that changed their structure, inputs, or outputs (not just VKs).

**What to do**: Use `--update_inputs` to regenerate fresh IVC inputs from your current codebase.

### Scenario 3: Pin to Historical Commit
**When**: You want to regenerate inputs from a specific known-good historical commit rather than your current state.

**What to do**: Manually run `AZTEC_CACHE_COMMIT=origin/next~3 FORCE_CACHE_DOWNLOAD=1 ./bootstrap.sh build_bench`, then use either method.

## Prerequisites

### 1. Sync with merge-train/barretenberg

**IMPORTANT**: PRs are merged into `merge-train/barretenberg`, so you must be up to date with that branch first.

```bash
cd barretenberg/cpp
git fetch origin
git merge origin/merge-train/barretenberg
# Or: git rebase origin/merge-train/barretenberg
```

### 2. Build bb binary

After syncing, rebuild bb with the appropriate preset:
```bash
cd barretenberg/cpp
./bootstrap.sh build
# This builds bb to build/bin/bb (or build-no-avm/bin/bb if DISABLE_AZTEC_VM=1)
```

**Note**: You do NOT need to manually regenerate IVC inputs for most updates. The script methods below handle downloading/generating inputs automatically.

## Update Process

### Method 1: Quick VK Update (Recommended for VK-only changes)

**Use this when**: Only VKs changed, circuit structure is unchanged.

```bash
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --update_fast
```

**What it does**:
- Downloads the existing pinned IVC inputs from S3
- Checks VKs against your current bb binary
- Updates only the VKs that changed within those inputs
- Compresses and uploads with a new hash
- The IVC inputs themselves remain from whenever they were last generated

**Advantages**: Fast, preserves existing input structure, most common use case.

### Method 2: Full Regeneration (For circuit structure changes)

**Use this when**: Circuit structure changed, not just VKs.

```bash
cd barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --update_inputs
```

**What it does**:
- Bootstraps the full project from scratch
- Runs `yarn-project/end-to-end/bootstrap.sh build_bench` to generate brand new IVC inputs from your current codebase
- Updates VKs in the newly generated inputs
- Compresses and uploads to S3

**Advantages**: Ensures inputs match current circuit structure.

### Method 3: Pin to Specific Historical Commit

**Use this when**: You want inputs from a specific known-good commit (e.g., to maintain consistency or bisect issues).

```bash
# First, generate inputs from historical commit
cd yarn-project/end-to-end
AZTEC_CACHE_COMMIT=origin/next~3 FORCE_CACHE_DOWNLOAD=1 ./bootstrap.sh build_bench

# Then update VKs for those historical inputs
cd ../../barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --update_inputs
```

**What it does**:
- `AZTEC_CACHE_COMMIT=origin/next~3`: Tells the build system to use artifacts from 3 commits ago on the next branch
- `FORCE_CACHE_DOWNLOAD=1`: Forces download of cached artifacts from that commit
- Generates IVC inputs based on that historical state
- Updates VKs and uploads

**Advantages**: Pins inputs to a stable known commit, useful for release branches or debugging.

## Final Steps

1. **Update the script** with the new hash printed by the command:
   ```bash
   # Edit line 16 in test_chonk_standalone_vks_havent_changed.sh
   pinned_short_hash="[NEW_HASH]"
   ```

2. **Verify** the update worked:
   ```bash
   ./test_chonk_standalone_vks_havent_changed.sh
   ```
   Should output: "No VK changes detected."

## Environment Variables

- `AZTEC_CACHE_COMMIT`: Compute hash for artifacts from an earlier commit (e.g., `origin/next~3`)
- `FORCE_CACHE_DOWNLOAD`: Force download of cached artifacts instead of building
- `DISABLE_AZTEC_VM`: Set to `1` to build without AVM (faster for testing)

## Common Workflows

### Workflow 1: After VK-Only Changes (Most Common)
```bash
# 0. Sync with merge-train (IMPORTANT FIRST STEP!)
cd barretenberg/cpp
git fetch origin
git merge origin/merge-train/barretenberg

# 1. Rebuild bb
./bootstrap.sh build

# 2. Update VKs from existing inputs (fast!)
cd scripts && ./test_chonk_standalone_vks_havent_changed.sh --update_fast

# 3. Script prints new hash (e.g., "Short hash is: a7052e92")
# 4. Update pinned_short_hash in the script with the new hash
# 5. Verify it works
./test_chonk_standalone_vks_havent_changed.sh  # Should output "No VK changes detected"

# 6. Commit the change
```

### Workflow 2: After Circuit Structure Changes
```bash
# 0. Sync with merge-train (IMPORTANT FIRST STEP!)
cd barretenberg/cpp
git fetch origin
git merge origin/merge-train/barretenberg

# 1. Rebuild bb
./bootstrap.sh build

# 2. Regenerate inputs from current codebase
cd scripts && ./test_chonk_standalone_vks_havent_changed.sh --update_inputs

# 3. Update script with new hash and verify (same as above)
```

### Workflow 3: Pin to Specific Historical Commit
```bash
# 0. Sync with merge-train (IMPORTANT FIRST STEP!)
cd barretenberg/cpp
git fetch origin
git merge origin/merge-train/barretenberg

# Generate inputs from 3 commits ago, then update VKs
cd ../../yarn-project/end-to-end
AZTEC_CACHE_COMMIT=origin/next~3 FORCE_CACHE_DOWNLOAD=1 ./bootstrap.sh build_bench

cd ../../barretenberg/cpp/scripts
./test_chonk_standalone_vks_havent_changed.sh --update_inputs

# Update script with new hash and verify
```

## Troubleshooting

- **"VK change detected"** error without `--update_fast`: Expected behavior. Run with `--update_fast` to update.
- **S3 upload failure**: Ensure AWS credentials are configured with access to `aztec-ci-artifacts` bucket.
- **bb binary not found**: Ensure you've built barretenberg first (`./bootstrap.sh build`).
- **"Unexpected token 'with'" error**: Run `docker pull aztecprotocol/build:3.0`.
