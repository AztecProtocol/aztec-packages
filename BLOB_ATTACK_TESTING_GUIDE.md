# Blob Deserialization Vulnerability Testing Guide

## Overview

This guide explains how to test the blob deserialization vulnerability in your sandbox environment. The implementation allows you to inject malformed blob fields during block building to validate the vulnerability and test fixes.

## Implementation Details

**Modified File:** `yarn-project/prover-client/src/orchestrator/block-building-helpers.ts`

The attack is injected at line ~415 in `buildHeaderAndBodyFromTxs()` function, which is the correct exploitation point identified in the security report. This ensures:

1. ✅ Malformed fields are injected **before** header finalization
2. ✅ `blobsHash` is computed from the malformed blobs (passes L1 validation)
3. ✅ Block building succeeds and block is proposed to L1
4. ✅ Archiver nodes crash when attempting to deserialize

## How to Test

### Step 1: Enable the Attack

Set the environment variable before starting your validator/sequencer:

```bash
export ENABLE_BLOB_ATTACK=true
```

### Step 2: Choose Attack Type (Optional)

Select which type of malformed field to inject:

```bash
# Option 1: Invalid revert code (default)
export BLOB_ATTACK_TYPE=invalid_revert_code

# Option 2: Length overflow
export BLOB_ATTACK_TYPE=length_overflow

# Option 3: Invalid prefix
export BLOB_ATTACK_TYPE=invalid_prefix
```

### Step 3: Start Your Sandbox Sequencer

```bash
cd yarn-project
ENABLE_BLOB_ATTACK=true yarn start:sequencer
```

Or if using the full sandbox:

```bash
cd yarn-project/aztec
ENABLE_BLOB_ATTACK=true yarn start
```

### Step 4: Submit a Transaction

Submit any transaction to trigger block building:

```bash
# Example using aztec CLI
aztec-cli send transfer --to <address> --amount 100
```

### Step 5: Observe the Attack

**On the sequencer/validator (attacker) side:**

You should see in the logs:
```
[ATTACK] Injecting invalid revert code (5) in blob fields
[ATTACK] Original field count: 1234
[ATTACK] Malformed field injected at position 0
[ATTACK] Field value: 0x74785f737461727400000100010005
```

The block should be successfully built and proposed to L1.

**On archiver nodes (victim) side:**

When archivers attempt to sync this block from L1, they should crash with:
```
[archiver] FATAL: Unable to sync: failed to decode fetched blob
[archiver] Error: Invalid prefix
[archiver] at getLengthFromFirstField (blob-lib/src/encoding.ts:82)
[archiver] at Blob.toEncodedFields (blob-lib/src/encoding.ts:158)
[archiver] at getBlockFromRollupTx (archiver/src/archiver/data_retrieval.ts:350)
```

## Attack Types Explained

### 1. Invalid Revert Code (Default)

**Field:** `0x74785f737461727400000100010005`

```
Breakdown:
  0x74785f7374617274  - TX_START_PREFIX (valid)
  00                  - padding
  0001                - length = 1 (valid)
  00                  - padding
  01                  - REVERT_CODE_PREFIX (valid)
  00                  - padding
  05                  - revert code = 5 (INVALID! Valid range: 0-4)
```

This passes L1 validation but crashes during deserialization when the archiver validates the revert code range.

### 2. Length Overflow

**Field:** `0x74785f7374617274_00_FFFF_00_01_00_01`

```
Breakdown:
  0x74785f7374617274  - TX_START_PREFIX (valid)
  00                  - padding
  FFFF                - length = 65535 (INVALID! Exceeds BLOB_SIZE_IN_FIELDS)
  00                  - padding
  01                  - REVERT_CODE_PREFIX (valid)
  00                  - padding
  01                  - revert code = 1 (valid)
```

This causes the deserializer to attempt reading beyond the blob boundary.

### 3. Invalid Prefix

**Field:** `0x0000000100010001`

```
Breakdown:
  0x00000001          - Invalid prefix (should be 0x74785f7374617274)
  00010001            - rest of field
```

This immediately fails the prefix check in `getLengthFromFirstField()`.

## Expected Results

### Without Fixes (Current State)

1. ✅ Block building succeeds with malformed fields
2. ✅ Block is proposed to L1 (passes validation)
3. ✅ L1 accepts the block (blob hash is consistent)
4. ❌ Archiver nodes crash when syncing from L1
5. ❌ Network halts (no nodes can sync past this block)

### With Priority 1 Fix (Block Building Validation)

1. ❌ Block building fails with error: "Invalid blob field structure"
2. ❌ Block is NOT proposed to L1
3. ✅ Network continues operating normally

### With Priority 2 Fix (Archiver Error Handling)

1. ✅ Block building succeeds (if Priority 1 fix not deployed)
2. ✅ Block is proposed to L1
3. ✅ Archivers log error but continue syncing
4. ✅ Invalid block is marked in database
5. ✅ Network continues operating (degraded but functional)

## Testing the Fixes

### Test Priority 1 Fix (Validation During Block Building)

After implementing the validation in `buildHeaderAndBodyFromTxs()`:

```bash
ENABLE_BLOB_ATTACK=true yarn start:sequencer
```

Expected: Block building should fail immediately with clear error message.

### Test Priority 2 Fix (Graceful Error Handling in Archiver)

1. Deploy the attack code and publish a malicious block
2. Start an archiver with the error handling fix
3. Expected: Archiver logs error but continues syncing subsequent blocks

## Disabling the Attack

To disable the attack and return to normal operation:

```bash
unset ENABLE_BLOB_ATTACK
unset BLOB_ATTACK_TYPE
```

Or restart your sequencer without the environment variables.

## Safety Notes

⚠️ **SANDBOX ONLY** - This code should ONLY be used in isolated sandbox environments

⚠️ **DO NOT DEPLOY** to testnet or mainnet - This will cause network-wide outage

⚠️ **REMOVE BEFORE PR** - Ensure all attack code is removed before submitting fixes

## Monitoring and Debugging

### Check if Attack is Enabled

```bash
# On sequencer
echo $ENABLE_BLOB_ATTACK
echo $BLOB_ATTACK_TYPE
```

### View Attack Logs

```bash
# Sequencer logs (attacker side)
yarn-project/aztec logs | grep ATTACK

# Archiver logs (victim side)
yarn-project/archiver logs | grep -A 5 "Invalid prefix"
```

### Inspect Block Data

After publishing a malicious block, you can inspect the blob fields:

```bash
# Get block from L1
cast block <block_number> --rpc-url $L1_RPC_URL

# Decode blob data (if you have the txhash)
cast tx <txhash> --rpc-url $L1_RPC_URL
```

## Next Steps

After validating the vulnerability:

1. ✅ Confirm archivers crash with malformed fields
2. ✅ Implement Priority 1 fix (validation during block building)
3. ✅ Implement Priority 2 fix (graceful error handling)
4. ✅ Test that fixes prevent the attack
5. ✅ Add comprehensive test suite (see security report)
6. ✅ **Remove all attack code** before committing fixes
7. ✅ Deploy fixes to testnet
8. ✅ Deploy fixes to mainnet

## References

- **Security Report:** `BLOB_DESERIALIZATION_VULNERABILITY.md`
- **Vulnerability Location:** `yarn-project/blob-lib/src/encoding.ts:79-86`
- **Exploitation Point:** `yarn-project/prover-client/src/orchestrator/block-building-helpers.ts:415`
- **Crash Location:** `yarn-project/archiver/src/archiver/data_retrieval.ts:350`

## Contact

For questions about this testing setup:
- Check the security report: `BLOB_DESERIALIZATION_VULNERABILITY.md`
- Internal: #security-incidents Slack channel
