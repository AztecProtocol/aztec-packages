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
        │
        │ handleFinalizedBlock()
        ▼
┌─────────────────────────────────────┐
│             DELETED                 │
│   (optionally archived)             │
└─────────────────────────────────────┘
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

### TxMetaData (`tx_metadata.ts`)

Lightweight metadata stored alongside each transaction:
- `txHash`: Transaction identifier
- `state`: Current state (pending, protected, mined)
- `priorityFee`: For priority ordering
- `feePayer`: For balance-based eviction
- `nullifiers`: For conflict detection
- `estimatedTxFee`: For balance calculations
- `blockId`: Block info when mined
- `protectedSlot`: Slot number when protected

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
| `FeePayerBalanceEvictionRule` | `block_mined` | Evicts txs when fee payer balance decreases. |
| `InvalidTxsAfterMiningRule` | `block_mined` | Evicts pending txs with nullifiers that were just mined. |
| `InvalidTxsAfterReorgRule` | `chain_pruned` | Evicts txs with invalid anchor blocks after reorg. |

## Usage

### Creating a Pool

```typescript
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';

const pool = new AztecKVTxPoolV2(txStore, archiveStore, {
  l2BlockSource: archiver,
  worldStateSynchronizer: worldState,
  pendingTxValidator: validator,
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
# Unit tests (131 tests)
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2.test.ts

# Compatibility tests (25 tests)
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2.compat.test.ts

# Eviction rule tests
yarn test src/mem_pools/tx_pool_v2/eviction/

# Benchmarks
yarn test src/mem_pools/tx_pool_v2/tx_pool_v2_bench.test.ts
```
