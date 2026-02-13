# TxPoolV2

Transaction pool implementation with explicit state management and pluggable eviction rules.

## Overview

TxPoolV2 manages transactions through a state machine with clear transitions:

```
              addPendingTxs()
                    │
                    ▼
┌─────────────────────────────────────┐
│              PENDING                │◄──────────────────┐
│   (awaiting block inclusion)        │                   │
└─────────────────────────────────────┘                   │
        │                                                 │
        │ protectTxs() / addProtectedTxs()               │
        ▼                                                 │
┌─────────────────────────────────────┐                   │
│            PROTECTED                │───────────────────┘
│   (in a block proposal)             │  prepareForSlot()
└─────────────────────────────────────┘  (slot passed without mining)
        │                                                 │
        │ handleMinedBlock()                              │
        ▼                                                 │
┌─────────────────────────────────────┐                   │
│              MINED                  │───────────────────┘
│   (included in a block)             │  handlePrunedBlocks()
└─────────────────────────────────────┘  (reorg)
        │                                     │
        │ handleFinalizedBlock()              │ eviction after reorg
        │ / eviction / failed exec            │ (validation failure)
        ▼                                     ▼
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│       SLOT-SOFT-DELETED             │  │       PRUNE-SOFT-DELETED            │
│  (kept in DB until next slot)       │  │  (kept in DB until finalized)       │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
        │                                        │
        │ prepareForSlot()                       │ handleFinalizedBlock()
        │ (slot advanced)                        │ (mined block finalized)
        ▼                                        ▼
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│          HARD-DELETED               │  │          HARD-DELETED               │
│   (permanently removed from DB)     │  │   (permanently removed from DB)     │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
```

## Key Components

### TxPoolV2 (`tx_pool_v2.ts`)

The public API wrapper that serializes all operations through a queue to prevent race conditions. Delegates to `TxPoolV2Impl` for actual logic.

### TxPoolV2Impl (`tx_pool_v2_impl.ts`)

Core implementation containing:
- KV store persistence for transactions and metadata
- In-memory indices for fast lookups (by nullifier, fee payer, priority)
- State transition logic
- Pre-add rule execution
- Post-event eviction rule execution

### DeletedPool (`deleted_pool.ts`)

Manages all transaction deletions in the pool with two soft-deletion mechanisms:
- **Slot-based**: Non-pruned txs are kept in DB until the next slot, allowing other nodes to fetch them via reqresp
- **Prune-based**: Txs from pruned blocks are kept in DB until their original mined block is finalized

All deletions go through `DeletedPool.deleteTx()`, which routes to the appropriate path based on whether the tx is tracked as being from a pruned block.

### TxMetaData (`tx_metadata.ts`)

Lightweight metadata stored alongside each transaction:
- `txHash`: Transaction identifier
- `anchorBlockHeaderHash`: Hash of the anchor block header
- `priorityFee`: For priority ordering and challenges
- `feePayer`: For balance-based eviction
- `claimAmount`: Fee payer's claim from bridging
- `feeLimit`: Maximum fee the tx can pay
- `nullifiers`: For conflict detection
- `includeByTimestamp`: Expiration timestamp
- `minedL2BlockId`: Set when mined (undefined otherwise)

State is derived by TxPoolIndices:
- `mined` if `minedL2BlockId` is set
- `protected` if in protection map
- `deleted` if soft-deleted (slot-based or prune-based, evicted but kept in DB)
- `pending` otherwise

## Soft Deletion

Deleted transactions are kept in the database for a grace period before being permanently removed. There are two soft-deletion mechanisms:

### Slot-Based Soft Deletion

When a transaction is deleted from the pool (eviction, validation failure, failed execution) and is **not** from a pruned block, it is "slot-soft-deleted":

1. **Soft Delete**: The tx is removed from indices but kept in the database, tagged with the current slot number
2. **Retrieval**: Slot-soft-deleted txs can still be retrieved via `getTxByHash` and return status `'deleted'` from `getTxStatus`
3. **Hard Delete**: When `prepareForSlot` advances to a new slot, txs deleted in earlier slots are permanently removed
4. **Re-addition**: If a slot-soft-deleted tx is re-added to the pool, the slot-deleted tracking is cleared

This allows other nodes to still fetch recently-deleted transactions via reqresp during the current slot.

### Prune-Based Soft Deletion

When a chain reorganization occurs, transactions that were mined in pruned blocks are handled with longer retention:

1. **Tracking**: When `handlePrunedBlocks` is called, all un-mined transactions are tracked by their original mined block number
2. **Soft Delete**: If these transactions are later evicted (failed validation, nullifier conflict, etc.), they are "prune-soft-deleted" - removed from indices but kept in the database
3. **Retrieval**: Prune-soft-deleted txs can still be retrieved via `getTxByHash` and return status `'deleted'` from `getTxStatus`
4. **Hard Delete**: When `handleFinalizedBlock` is called and the finalized block number reaches or exceeds the transaction's original mined block, the transaction is permanently removed
5. **Re-addition**: If a prune-soft-deleted tx is re-added, the `softDeleted` flag is reset to `false` but the prune tracking is preserved, so a subsequent deletion still uses the prune path

Prune-soft-deleted transactions are **not** affected by slot cleanup - they survive across slot boundaries until finalized.

**Prune example:**
1. Tx mined at block 10
2. Chain prunes to block 5 (tx becomes un-mined, tracked as minedAtBlock=10)
3. Tx fails validation and is prune-soft-deleted
4. Block 9 finalized → tx still in DB (minedAtBlock=10 > finalized=9)
5. Block 10 finalized → tx hard-deleted (minedAtBlock=10 ≤ finalized=10)

If the tx is re-mined at a higher block before being soft-deleted:
1. Tx mined at block 10, pruned (tracked as minedAtBlock=10)
2. Tx re-mined at block 15, pruned again (updated to minedAtBlock=15)
3. Tx soft-deleted
4. Block 10 finalized → tx still in DB
5. Block 15 finalized → tx hard-deleted

### Hydration

On node restart, slot-soft-deleted transactions are immediately hard-deleted (they are stale by definition). Prune-soft-deleted transactions are loaded from the database and tracked normally.

## Architecture: Pre-add vs Post-event Rules

**Pre-add rules** (run during `addPendingTxs`):
- Used for external transactions entering the pool
- Can reject the incoming tx entirely
- Can evict lower-priority existing txs to make room
- Rules: NullifierConflictRule, FeePayerBalancePreAddRule, LowPriorityPreAddRule

**Post-event rules** (run after state transitions):
- Used for internal state changes (block mined, reorg, slot change)
- Only evict txs already in the pool
- Rules: InvalidTxsAfterMiningRule, InvalidTxsAfterReorgRule, FeePayerBalanceEvictionRule, LowPriorityEvictionRule

This design choice means restored txs (from protected/mined states) use post-event rules only, because they were already validated on initial submission.

## Eviction Rules

The pool uses a pluggable rule system for managing transactions.

### Pre-Add Rules

Checked before adding a transaction to the pending pool:

| Rule | Purpose |
|------|---------|
| `NullifierConflictRule` | Handles transactions with conflicting nullifiers. Higher priority tx wins. |
| `FeePayerBalancePreAddRule` | Ensures fee payer has sufficient balance for all their pending txs. |
| `LowPriorityPreAddRule` | Rejects txs when pool is full and new tx has lowest priority. |

### Post-Event Eviction Rules

Run after events to clean up the pool:

| Rule | Trigger | Purpose |
|------|---------|---------|
| `LowPriorityEvictionRule` | `txs_added` | Evicts lowest priority txs when pool exceeds limit. |
| `FeePayerBalanceEvictionRule` | `txs_added`, `block_mined`, `chain_pruned` | Evicts txs when fee payer has insufficient balance. |
| `InvalidTxsAfterMiningRule` | `block_mined` | Evicts pending txs with: (1) nullifiers in mined block, (2) expired timestamp. |
| `InvalidTxsAfterReorgRule` | `chain_pruned` | Evicts txs with invalid anchor blocks after reorg. |

## Usage

### Creating a Pool

```typescript
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

const pool = new AztecKVTxPoolV2(txStore, archiveStore, {
  l2BlockSource: archiver,
  worldStateSynchronizer: worldState,
  createTxValidator: () => validator,
});

await pool.start();
```

### Adding Transactions

```typescript
// Add to pending pool (validates and runs pre-add rules)
const result = await pool.addPendingTxs(txs, { source: 'gossip' });
// result: { accepted: TxHash[], ignored: TxHash[], rejected: TxHash[] }

// Check without modifying pool
const canAdd = await pool.canAddPendingTx(tx);
// canAdd: 'accepted' | 'ignored' | 'rejected'
```

### Block Building Flow

```typescript
// 1. Proposer protects txs for their block
await pool.protectTxs(selectedTxHashes, blockHeader);

// 2. On successful mining
await pool.handleMinedBlock(minedTxHashes, blockHeader);

// 3. If slot passes without mining
await pool.prepareForSlot(nextSlotNumber);

// 4. On finalization
await pool.handleFinalizedBlock(finalizedBlockHeader);
```

### Handling Reorgs

```typescript
// When blocks are pruned, un-mine affected transactions
await pool.handlePrunedBlocks(latestValidBlockId);
```

## Configuration

```typescript
await pool.updateConfig({
  maxPendingTxCount: 10000,  // 0 = unlimited
  archivedTxLimit: 1000,     // 0 = disabled
});
```

## Return Values

### AddTxsResult

When adding pending transactions, each tx is categorized:

| Status | Meaning |
|--------|---------|
| `accepted` | Successfully added to the pool |
| `ignored` | Valid but not added (duplicate, lost nullifier conflict, insufficient balance) |
| `rejected` | Failed validation (invalid proof, expired, etc.) |

## Archive

Finalized transactions can optionally be archived for historical queries:

```typescript
const archivedTx = await pool.getArchivedTxByHash(txHash);
```

The archive uses FIFO eviction when `archivedTxLimit` is reached.

## Testing

```bash
# Unit tests (177 tests)
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2.test.ts

# Deleted pool tests (17 tests)
yarn test src/mem_pools/tx_pool_v2/deleted_pool.test.ts

# Compatibility tests (25 tests)
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2.compat.test.ts

# Eviction rule tests
yarn test src/mem_pools/tx_pool_v2/eviction/

# Benchmarks
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2_bench.test.ts
```
