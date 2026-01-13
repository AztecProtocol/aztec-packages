# Validator Client

The validator client handles consensus duties for Aztec validators: validating block proposals, attesting to checkpoints, and detecting slashable some offenses. Validators do NOT attest to individual blocks. Attestations are only created for checkpoint proposals that aggregate an entire slot's worth of blocks.

## Key Concepts

### Slots, Blocks, and Checkpoints

- **Slot**: A fixed time window (e.g., 72 seconds) during which a designated proposer builds blocks
- **Block**: A single batch of transactions executed and validated within a slot
- **Checkpoint**: The collection of all blocks built in a slot, attested by validators and published to L1
- **Sub-slot**: A fixed-duration window within a slot for building each block (e.g., 8 seconds)

A proposer builds several blocks during their slot. These blocks share the same `slotNumber` but have incrementing `blockNumber` and `indexWithinCheckpoint` values.

### Block Proposals

A `BlockProposal` is broadcast by the proposer for each block **except the last one** in a slot:

```
BlockProposal {
  blockHeader          // Per-block header with global variables
  indexWithinCheckpoint // 0, 1, 2, ... position within checkpoint
  inHash               // L1-to-L2 messages hash (constant across checkpoint)
  archive              // Archive root after this block
  txHashes             // Transaction hashes in order
  signature            // Proposer's signature
  signedTxs?           // Optional full transactions for DA
}
```

Validators receive block proposals, validate them, and re-execute transactions—but they do **not** create attestations for individual blocks.

### Checkpoint Proposals

A `CheckpointProposal` is broadcast at the end of a slot along with the last block:

```
CheckpointProposal {
  checkpointHeader     // Aggregated header for consensus
  archive              // Final archive root after all blocks
  signature            // Proposer's signature over checkpoint
  lastBlock? {         // Last block info (extracted as BlockProposal)
    blockHeader
    indexWithinCheckpoint
    txHashes
    signature
    signedTxs?
  }
}
```

The `checkpointHeader` contains aggregated data: `blockHeadersHash` (hash of all block headers), `contentCommitment` (blobsHash, inHash, outHash), and shared global variables.

### Checkpoint Attestations

Validators who have validated all blocks in a checkpoint create a `CheckpointAttestation`:

```
CheckpointAttestation {
  payload {            // What's being attested to
    checkpointHeader   // The checkpoint header
    archive            // The final archive root
  }
  signature            // Validator's signature
  proposerSignature    // Copy of proposer's signature (for verification)
}
```

Attestations are collected by the proposer and submitted to L1 along with the checkpoint.

## Key Invariants

These rules must always hold:

1. **Attestations are checkpoint-only**: Validators never attest to individual `BlockProposal`s
2. **Global variables match within checkpoint**: All blocks within the same checkpoint must have identical global variables (except `blockNumber`), which includes the slot number
3. **inHash is constant**: All blocks in a checkpoint share the same L1-to-L2 messages hash
4. **Sequential indexWithinCheckpoint**: Block N must have `indexWithinCheckpoint = parent.indexWithinCheckpoint + 1`

## Validation Flow

### Block Proposal Validation

When a `BlockProposal` is received via P2P, the `BlockProposalHandler` performs:

```
1. Verify proposer signature
2. Check proposal is from current/next slot proposer (via BlockProposalValidator)
3. Find parent block by archive root (wait/retry if not synced)
4. Compute checkpoint number from parent
5. If indexWithinCheckpoint > 0:
   - Validate global variables match parent (chainId, version, slotNumber,
     timestamp, coinbase, feeRecipient, gasFees)
6. Verify inHash matches computed from L1-to-L2 messages
7. Collect transactions from pool/network/proposal
8. Re-execute transactions (if enabled)
9. Compare re-execution result with proposal
```

### Checkpoint Proposal Validation

When a `CheckpointProposal` is received, before creating attestations:

```
1. Verify proposer signature
2. Wait for last block to sync (by archive root)
3. Collect all blocks in this slot
4. Recompute blockHeadersHash from collected headers
5. Verify blockHeadersHash matches checkpointHeader
6. Verify checkpoint header fields match last block's global variables:
   - slotNumber, coinbase, feeRecipient, gasFees
7. Verify lastArchiveRoot matches first block's lastArchive
```

### Attestation Creation

After successful checkpoint validation:

```
1. Check if any of our validator addresses are in the committee
2. For each address in committee:
   - Sign ConsensusPayload (checkpointHeader + archive)
   - Create CheckpointAttestation with our signature + proposer signature
3. Add attestations to attestation pool
4. Broadcast attestations to peers
```

## Sequence Diagram

```
Time | Proposer                     | Validator
-----|------------------------------|------------------------------------
 2s  | Build Block 0                |
10s  | Broadcast BlockProposal 0    |
     | Build Block 1                |
12s  |                              | Receive BlockProposal 0
     |                              | Validate + re-execute Block 0
18s  | Broadcast BlockProposal 1    |
     | Build Block 2                |
20s  |                              | Receive BlockProposal 1
     |                              | Validate + re-execute Block 1
...  |                              |
42s  | Build Block 4 (last)         |
     | Assemble CheckpointProposal  |
     | Broadcast CheckpointProposal |
44s  |                              | Receive CheckpointProposal
     |                              | Extract + validate Block 4
     |                              | Validate checkpoint (blockHeadersHash)
52s  |                              | Create CheckpointAttestations
     |                              | Broadcast attestations
54s  | Receive attestations         |
55s  | Finalize + publish to L1     |
```

## Configuration

| Flag | Purpose |
|------|---------|
| `validatorReexecute` | Re-execute transactions to verify proposals |
| `fishermanMode` | Validate proposals but don't broadcast attestations (monitoring only) |
| `alwaysReexecuteBlockProposals` | Force re-execution even when not in committee |
| `slashBroadcastedInvalidBlockPenalty` | Penalty amount for invalid proposals (0 = disabled) |
| `validatorReexecuteDeadlineMs` | Time reserved at end of slot for propagation/publishing |
| `attestationPollingIntervalMs` | How often to poll for attestations when collecting |
| `disabledValidators` | Validator addresses to exclude from duties |

### Fisherman Mode

When `fishermanMode: true`, the validator:
- Validates all proposals (block and checkpoint)
- Re-executes transactions
- Creates attestations internally for validation
- Does **not** broadcast attestations to the network
- Does **not** add attestations to the pool

This is useful for monitoring network health without participating in consensus.

### Key Methods

**ValidatorClient** (`validator.ts`):
- `validateBlockProposal(proposal, sender)` → `boolean`: Validates block, optionally re-executes, emits slash events
- `attestToCheckpointProposal(proposal, sender)` → `CheckpointAttestation[]?`: Validates checkpoint and creates attestations
- `collectAttestations(proposal, required, deadline)` → `CheckpointAttestation[]`: Waits for attestations from other validators
- `createBlockProposal(...)` → `BlockProposal`: Creates and signs a block proposal (used by sequencer)
- `createCheckpointProposal(...)` → `CheckpointProposal`: Creates and signs a checkpoint proposal

**BlockProposalHandler** (`block_proposal_handler.ts`):
- `handleBlockProposal(proposal, sender, shouldReexecute)` → `ValidationResult`: Full block validation pipeline
- `reexecuteTransactions(proposal, blockNumber, txs, messages)` → `ReexecutionResult`: Re-runs transactions and compares state

**ValidationService** (`duties/validation_service.ts`):
- `createBlockProposal(...)` → `BlockProposal`: Signs block proposal with validator key
- `createCheckpointProposal(...)` → `CheckpointProposal`: Signs checkpoint proposal
- `attestToCheckpointProposal(proposal, attestors)` → `CheckpointAttestation[]`: Creates attestations for given addresses

## Testing Patterns

### Common Mocks

Tests typically mock these dependencies:

```typescript
let epochCache: MockProxy<EpochCache>;
let blockSource: MockProxy<L2BlockSource>;
let txProvider: MockProxy<TxProvider>;
let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
let p2pClient: MockProxy<P2P>;

beforeEach(() => {
  epochCache = mock<EpochCache>();
  blockSource = mock<L2BlockSource>();
  // ... etc
});
```

### Creating Test Proposals

Use factory functions from `@aztec/stdlib/testing`:

```typescript
import { makeBlockProposal, makeCheckpointProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';

// These are async - always await
const blockProposal = await makeBlockProposal({
  blockHeader: makeL2BlockHeader(1, 100, 100), // epoch, block, slot
  indexWithinCheckpoint: 0,
  signer: Secp256k1Signer.random(),
});

const checkpointProposal = await makeCheckpointProposal({
  checkpointHeader: makeL2BlockHeader(1, 100, 100).toCheckpointHeader(),
  signer: proposer,
  lastBlock: { blockHeader, txs },
});
```

### Mocking for Re-execution Tests

For tests that exercise re-execution:

```typescript
// Mock parent block lookup
blockSource.getBlockHeaderByArchive.mockResolvedValue(parentBlockHeader);
blockSource.getL2BlockNew.mockResolvedValue({
  checkpointNumber: CheckpointNumber(1),
  indexWithinCheckpoint: 0,
  header: { globalVariables: parentGlobalVariables },
});

// Mock block builder result
blockBuilder.buildBlock.mockResolvedValue({
  block: expectedBlock,
  failedTxs: [],
});
```
