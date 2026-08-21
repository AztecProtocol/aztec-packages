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
  bucketRef?           // Inbox bucket reference for the block's L1-to-L2 message bundle
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

The `checkpointHeader` contains aggregated data: `blockHeadersHash` (hash of all block headers), `contentCommitment` (blobsHash, inboxRollingHash, outHash), and shared global variables.

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
3. **Inbox consumption moves forward**: Each block's bucket reference consumes at or past its parent block's Inbox position (AZIP-22 Fast Inbox)
4. **Sequential indexWithinCheckpoint**: Block N must have `indexWithinCheckpoint = parent.indexWithinCheckpoint + 1`
5. **One proposer per slot**: Each slot has exactly one designated proposer. Sending multiple proposals for the same position (slot, indexWithinCheckpoint) with different content is equivocation and slashable
6. **One attestation per slot**: Validators should only attest to one checkpoint per slot. Attesting to different proposals (different archives) for the same slot is equivocation and slashable

## Validation Flow

### Block Proposal Validation

When a `BlockProposal` is received via P2P, the `BlockProposalHandler` performs:

```
1. Verify proposer signature
2. Check proposal is from current/next slot proposer (via BlockProposalValidator)
3. Detect duplicate proposals (same slot + indexWithinCheckpoint, different archive) slashing proposer on equivocation
4. Find parent block by archive root (wait/retry if not synced)
5. Compute checkpoint number from parent
6. If indexWithinCheckpoint > 0, then validate global variables match parent (chainId, version, slotNumber, timestamp, coinbase, feeRecipient, gasFees)
7. Run the streaming Inbox acceptance checks on the proposal's bucket reference and derive the block's L1-to-L2 message bundle (AZIP-22 Fast Inbox)
8. Collect transactions from pool/network/proposal
9. Re-execute transactions (if enabled)
10. Compare re-execution result with proposal
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

| Flag                                               | Purpose                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `fishermanMode`                                    | Validate proposals but don't broadcast attestations (monitoring only) |
| `alwaysReexecuteBlockProposals`                    | Force re-execution even when not in committee                         |
| `slashBroadcastedInvalidBlockPenalty`              | Penalty amount for invalid proposals (0 = disabled)                   |
| `slashBroadcastedInvalidCheckpointProposalPenalty` | Penalty amount for invalid checkpoint proposals (0 = disabled)        |
| `slashDuplicateProposalPenalty`                    | Penalty amount for duplicate proposals (0 = disabled)                 |
| `slashDuplicateAttestationPenalty`                 | Penalty amount for duplicate attestations (0 = disabled)              |
| `attestationPollingIntervalMs`                     | How often to poll for attestations when collecting                    |
| `disabledValidators`                               | Validator addresses to exclude from duties                            |

### High Availability (HA) Keystore

When running multiple validator nodes with the same validator keys in a high-availability setup, enable HA signing to prevent double-signing:

| Environment Variable                   | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `VALIDATOR_HA_SIGNING_ENABLED`         | Enable HA signing / slashing protection (default: false)               |
| `VALIDATOR_HA_DATABASE_URL`            | PostgreSQL connection string for coordination (required when enabled)  |
| `VALIDATOR_HA_NODE_ID`                 | Unique identifier for this validator node (required when enabled)      |
| `VALIDATOR_HA_POLLING_INTERVAL_MS`     | How often to check duty status (default: 100)                          |
| `VALIDATOR_HA_SIGNING_TIMEOUT_MS`      | Max wait for in-progress signing (default: 3000)                       |
| `VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS` | Max age of stuck duties before cleanup (default: 2\*aztecSlotDuration) |

When `VALIDATOR_HA_SIGNING_ENABLED=true`, the validator client automatically:

- Creates an HA signer using the provided configuration
- Wraps the base keystore with `HAKeyStore` for HA-protected signing
- Coordinates signing across nodes via PostgreSQL to prevent double-signing
- Provides slashing protection to block conflicting signatures

See [`@aztec/validator-ha-signer`](../validator-ha-signer/README.md) for more details.

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

## Block Building Limits

L1 enforces gas and blob capacity per checkpoint. The node enforces these during block building to avoid L1 rejection. Three dimensions are metered: L2 gas (mana), DA gas, and blob fields. DA gas maps to blob fields today (`daGas = blobFields * 32`) but both are tracked independently.

The full per-tx → per-block → per-checkpoint limits hierarchy, including how the per-block budgets relate to the network admission limits, is documented in [`stdlib/src/gas/README.md`](../stdlib/src/gas/README.md) under "Gas and Data Limits".

### Checkpoint limits

| Dimension | Source | Budget |
| --- | --- | --- |
| L2 gas (mana) | `rollup.getManaLimit()` | Fetched from L1 at startup |
| DA gas | `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` | 786,432 (6 blobs × 4096 fields × 32 gas/field) |
| Blob fields | `BLOBS_PER_CHECKPOINT × FIELDS_PER_BLOB` | 24,576 minus checkpoint/block-end overhead |

### Per-block budgets

Per-block budgets prevent one block from consuming the entire checkpoint budget. The checkpoint builder dynamically computes per-block limits before each block based on the remaining checkpoint budget and the number of remaining blocks.

**Proposer**: When building a proposal (`isBuildingProposal: true`), the `CheckpointProposalJob` passes `maxBlocksPerCheckpoint` (from the timetable) and `perBlockAllocationMultiplier` (default 1.2) via opts to `CheckpointBuilder.buildBlock`. The builder computes a fair share as `min(perBlockLimit, ceil(remainingBudget / remainingBlocks * multiplier), remainingBudget)`. The multiplier greater than 1 allows early blocks to use more than their even share, since different blocks hit different limit dimensions (L2 gas, DA gas, blob fields) — a strict even split would waste capacity. As prior blocks consume budget, later blocks see tightened limits. This applies to all four dimensions (L2 gas, DA gas, blob fields, transaction count). Operators can set hard per-block caps via `SEQ_MAX_L2_BLOCK_GAS` / `SEQ_MAX_DA_BLOCK_GAS` / `SEQ_MAX_TX_PER_BLOCK` (capped at checkpoint limits at startup); these act as additional upper bounds alongside the redistribution.

**Validator**: When re-executing a proposal (`isBuildingProposal` unset), `capLimitsByCheckpointBudgets` only caps by the per-block limit and the total remaining checkpoint budget — no redistribution or multiplier is applied. This avoids false rejections due to differences between proposer and validator fair-share calculations. Validators can optionally set hard per-block limits via `VALIDATOR_MAX_L2_BLOCK_GAS`, `VALIDATOR_MAX_DA_BLOCK_GAS`, and `VALIDATOR_MAX_TX_PER_BLOCK`. When unset, no per-block limit is enforced (checkpoint-level protocol limits still apply). These are independent of the `SEQ_` vars so operators can tune proposer and validation limits separately.

### Per-transaction enforcement

**Mempool entry** (`MaxGasLimitsValidator` / `MinGasLimitsValidator`): L2 gas must be ≤ `MAX_PROCESSABLE_L2_GAS` (6,540,000) and ≥ fixed minimums.

**Block building** (`PublicProcessor.process`): Before processing, txs are skipped if their estimated blob fields or gas limits would exceed the block budget. After processing, actual values are checked and the tx is reverted if limits are exceeded.

### Gas limit configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SEQ_MAX_L2_BLOCK_GAS` | *none* | Hard per-block L2 gas cap. Capped at `rollupManaLimit` at startup. When unset, redistribution dynamically computes per-block limits. |
| `SEQ_MAX_DA_BLOCK_GAS` | *none* | Hard per-block DA gas cap. Capped at `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` at startup. When unset, redistribution handles it. |
| `SEQ_MAX_TX_PER_BLOCK` | *none* | Hard per-block tx count cap. Capped at `SEQ_MAX_TX_PER_CHECKPOINT` at startup (if set). |
| `SEQ_MAX_TX_PER_CHECKPOINT` | *none* | Total txs across all blocks in a checkpoint. When set, checkpoint-level capping and redistribution are enforced for tx count. |
| `SEQ_PER_BLOCK_ALLOCATION_MULTIPLIER` | 1.2 | Multiplier for per-block budget redistribution. Passed via opts to the checkpoint builder during proposal building. |
| `SEQ_REDISTRIBUTE_CHECKPOINT_BUDGET` | true | Legacy flag; redistribution is now always active during proposal building and inactive during validation. |
| `VALIDATOR_MAX_L2_BLOCK_GAS` | *none* | Per-block L2 gas limit for validation. Proposals exceeding this are rejected. |
| `VALIDATOR_MAX_DA_BLOCK_GAS` | *none* | Per-block DA gas limit for validation. Proposals exceeding this are rejected. |
| `VALIDATOR_MAX_TX_PER_BLOCK` | *none* | Per-block tx count limit for validation. Proposals exceeding this are rejected. |
| `VALIDATOR_MAX_TX_PER_CHECKPOINT` | *none* | Per-checkpoint tx count limit for validation. Proposals exceeding this are rejected. |

## Testing Patterns

### Common Mocks

Tests typically mock these dependencies:

```typescript
let epochCache: MockProxy<EpochCache>;
let blockSource: MockProxy<L2BlockSource>;
let txProvider: MockProxy<TxProvider>;
let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
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
import { makeBlockHeader, makeBlockProposal, makeCheckpointHeader, makeCheckpointProposal } from '@aztec/stdlib/testing';

// These are async - always await
const blockProposal = await makeBlockProposal({
  blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(100), slotNumber: SlotNumber(100) }),
  indexWithinCheckpoint: 0,
  signer: Secp256k1Signer.random(),
});

const checkpointProposal = await makeCheckpointProposal({
  checkpointHeader: makeCheckpointHeader(1, { slotNumber: SlotNumber(100) }),
  signer: proposer,
  lastBlock: { blockHeader: makeBlockHeader(1), txs },
});
```

### Mocking for Re-execution Tests

For tests that exercise re-execution:

```typescript
// Mock parent block lookup
blockSource.getBlockHeaderByArchive.mockResolvedValue(parentBlockHeader);
blockSource.getL2Block.mockResolvedValue({
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
