# Transaction Pool (Mempool)

This module implements the transaction pool (mempool) for the Aztec P2P network. The mempool holds unconfirmed transactions awaiting inclusion in a block.

## Overview

The transaction pool serves as a staging area for transactions before they are included in blocks. It manages the lifecycle of transactions from initial submission through mining, handling duplicates, priority ordering, and eviction of invalid or low-priority transactions.

## Interface: `TxPool`

The [`TxPool`](tx_pool.ts) interface defines the contract that all transaction pool implementations must fulfill:

### Transaction Lifecycle

The lifecycle of transactions in the pool is summarised in the following table:

| State | Meaning | Possible Future States |
| --- | --- | --- |
| Pending | Available to be added to a block, can be evicted | Protected, Mined, Soft Deleted |
| Protected | Added to a proposal, must not be evicted | Mined, Pending |
| Mined | Confirmed as added to a block | Soft Deleted, Pending |
| Soft Deleted | Awaiting full deletion once state has been finalised on L1 | Pending, Deleted |
| Deleted | Removed from the pool | N/A |

**Note on why Soft Delete:**
Mined transactions are soft-deleted rather than permanently removed to support:
1. Reorg handling — If a chain reorganization occurs, soft-deleted transactions are still available in the mempool
2. Slash condition detection — The epoch prune watcher needs access to transactions from pruned epochs to correctly identify data withholding slash conditions. Without soft-delete, transactions invalidated by reorgs (e.g., built on removed blocks) would be lost, causing false positives for data withholding violations.

Mined transactions are permanently deleted via `cleanupDeletedMinedTxs()` once their original block is finalized on L1, ensuring theyremain available during the uncertainty window.
Alternatively, mined transactions can be permanently deleted immediately by passing the `permanent: true` option to `deleteTxs()`.

#### Transaction Lifecycle Methods

| Method | Description |
|--------|-------------|
| `addTxs(txs, opts?)` | Adds transactions to the pool. Duplicates and nullifier conflicts are handled. Returns count of newly added txs. |
| `deleteTxs(txHashes, opts?)` | Removes transactions from the pool. Supports soft-delete for mined txs. |
| `markAsMined(txHashes, blockHeader)` | Marks transactions as included in a block. |
| `markMinedAsPending(txHashes, blockNumber)` | Reverts mined transactions to pending (used during reorgs). |
| `getArchivedTxByHash(txHash)` | Retrieves archived (historical) transactions. |
| `getTxStatus(txHash)` | Returns status: `'pending'`, `'mined'`, `'deleted'`, or `undefined`. |

### Transaction Fetching

| Method | Description |
|--------|-------------|
| `hasTx(txHash)` / `hasTxs(txHashes)` | Checks if transaction(s) exist in the pool. |
| `getTxByHash(txHash)` | Retrieves a transaction by its hash. |
| `getTxsByHash(txHashes)` | Batch retrieval of transactions by hash. |
| `getAllTxs()` / `getAllTxHashes()` | Returns all transactions or their hashes. |
| `getPendingTxHashes()` | Returns pending tx hashes **sorted by priority** (highest first). |
| `getPendingTxCount()` | Returns count of pending transactions. |
| `getMinedTxHashes()` | Returns mined tx hashes with their block numbers. |

### Pool Management

| Method | Description |
|--------|-------------|
| `updateConfig(config)` | Updates pool configuration (max size, archive limit). |
| `markTxsAsNonEvictable(txHashes)` | Protects transactions from eviction. |
| `clearNonEvictableTxs()` | Clears non-evictable flag from all transactions. |
| `cleanupDeletedMinedTxs(blockNumber)` | Permanently removes soft-deleted txs from blocks ≤ blockNumber. |
| `isEmpty()` | Checks if the pool has no transactions. |

### Events

The pool emits a `txs-added` event when new transactions are successfully added, allowing subscribers to react to pool changes.

## `AztecKVTxPool`

The [`AztecKVTxPool`](aztec_kv_tx_pool.ts) is the production-grade implementation backed by a persistent key-value store. It provides:

- **Persistent storage** via `AztecAsyncKVStore`
- **Multiple indexes** for efficient queries
- **Automatic eviction** of invalid and low-priority transactions
- **Transaction archival** for historical lookups
- **Soft-delete semantics** for mined transactions

#### Storage Structure

The pool maintains several KV maps and indexes:

| Store | Purpose |
|-------|---------|
| `#txs` | Primary storage: tx hash → serialized tx buffer |
| `#minedTxHashToBlock` | Index of mined txs: tx hash → block number |
| `#pendingTxPriorityToHash` | Priority-ordered index of pending txs |
| `#deletedMinedTxHashes` | Soft-deleted mined txs: tx hash → original block number |
| `#blockToDeletedMinedTxHash` | Reverse index for cleanup: block → deleted tx hashes |
| `#txHashToHistoricalBlockHeaderHash` | Anchor block reference for each tx |
| `#historicalHeaderToTxHash` | Index from historical block → tx hashes |
| `#feePayerToTxHash` | Index from fee payer address → tx hashes |
| `#pendingNullifierToTxHash` | Index from nullifier → tx hash |
| `#archivedTxs` | Archived transactions for historical lookup |

#### In-Memory Caches

| Cache | Purpose |
|-------|---------|
| `#pendingTxs` | Hydrated pending transactions for fast access |
| `#nonEvictableTxs` | Set of tx hashes protected from eviction |

## Transaction Priority

Transactions are prioritized based on their **total priority fees** (see [`priority.ts`](priority.ts)):

```typescript
priorityFee = maxPriorityFeesPerGas.feePerDaGas + maxPriorityFeesPerGas.feePerL2Gas
```

The priority is stored as a hex string derived from a 32-byte buffer representation of the fee amount, enabling lexicographic ordering in the KV store. Pending transactions are returned in **descending priority order** (highest fees first).

## Transaction Lifecycle in AztecKVTxPool

### 1. Adding Transactions

When `addTxs()` is called:

1. Check for duplicates (skip if tx already exists)
2. Check for nullifier conflicts (see Nullifier Deduplication below)
3. Store the serialized tx in `#txs`
4. Index the tx by its anchor block hash
5. If not already mined, add to pending indexes:
   - Priority-to-hash index (for ordering)
   - Historical header index (for reorg handling)
   - Fee payer index (for balance validation)
   - Nullifier-to-tx-hash index (for conflict detection)
6. Record metrics
7. Trigger eviction rules for `TXS_ADDED` event
8. Emit `txs-added` event

### 2. Marking as Mined

When a block is finalized, `markAsMined()`:

1. Move tx from pending to mined status
2. If previously soft-deleted, restore to mined status
3. Trigger eviction rules for `BLOCK_MINED` event

### 3. Handling Reorgs

When blocks are pruned, `markMinedAsPending()`:

1. Remove tx from mined index
2. Rehydrate pending indexes
3. Trigger eviction rules for `CHAIN_PRUNED` event

### 4. Deleting Transactions

The `deleteTxs()` method handles two cases:

- **Pending transactions**: Permanently deleted (transactions and all indexes to the transaction)
- **Mined transactions**: Soft-deleted by default (moved to `#deletedMinedTxHashes`), with option for permanent deletion

Soft-deleted mined transactions are retained for potential future reference and can be permanently cleaned up later via `cleanupDeletedMinedTxs()`.

### Nullifier Deduplication

The pool prevents nullifier spam attacks by ensuring only one pending transaction can reference each unique nullifier. When an incoming transaction shares nullifiers with existing pending transactions:

- **Higher fee wins**: If the incoming tx has a higher priority fee than ALL conflicting txs, those conflicting txs are replaced
- **Existing tx wins on tie**: If any conflicting tx has an equal or higher fee, the incoming tx is rejected
- **Partial overlap counts**: Even a single shared nullifier triggers conflict resolution

This is enforced at entry time via the `#pendingNullifierToTxHash` index, which maps each nullifier to the tx hash that references it. The index is maintained atomically with tx additions and removals.

## Eviction System

The eviction system automatically removes invalid or low-priority transactions based on configurable rules. See the [`eviction/`](eviction/) subdirectory for implementation details.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      EvictionManager                            │
│  Orchestrates eviction rules based on pool events               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │EvictionRule #1  │  │EvictionRule #2  │  │EvictionRule #N  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ TxPoolOperations│
                    │   (interface)   │
                    └─────────────────┘
```

The [`EvictionManager`](eviction/eviction_manager.ts) coordinates eviction by:

1. Registering multiple `EvictionRule` implementations
2. Calling each rule when tx pool events occur
3. Propagating configuration updates to all rules

### Eviction Events

| Event | Trigger | Purpose |
|-------|---------|---------|
| `TXS_ADDED` | New transactions added | Enforce pool size limits |
| `BLOCK_MINED` | Block finalized | Remove invalidated transactions |
| `CHAIN_PRUNED` | Chain reorganization | Remove txs referencing pruned blocks and re-evaluate fee payer balances |

### Eviction Rules

#### 1. `InvalidTxsAfterMiningRule`

**Triggers on:** `BLOCK_MINED`

Evicts transactions that become invalid after a block is mined:

- Duplicate nullifiers: Txs with nullifiers already included in the mined block
- Expired transactions: Txs with `includeByTimestamp` ≤ mined block timestamp

#### 2. `InvalidTxsAfterReorgRule`

**Triggers on:** `CHAIN_PRUNED`

Evicts transactions that reference blocks no longer in the canonical chain:

- Checks each pending tx's anchor block hash against the archive tree
- Removes txs whose anchor blocks are not found (pruned)

#### 3. `FeePayerBalanceEvictionRule`

**Triggers on:** `TXS_ADDED`, `BLOCK_MINED`, `CHAIN_PRUNED`

Evicts low-priority transactions when a fee payer's pending fee limits exceed their Fee Juice balance:

- Evaluates transactions in priority order so higher-priority claims can fund lower-priority spends
- Accounts for self-funding claims made during setup
- Removes evictable txs that do not fit within the running balance

#### 4. `LowPriorityEvictionRule`

**Triggers on:** `TXS_ADDED`

Enforces maximum pool size by evicting lowest-priority (by fee) transactions:

- Configured via `maxPendingTxCount` option (0 = disabled)
- Uses `getLowestPriorityEvictable()` to find txs to evict

### Non-Evictable Transactions

Transactions can be marked as non-evictable via `markTxsAsNonEvictable()`. This protects them from all eviction rules, typically used during block building to ensure transactions being processed aren't evicted mid-operation. The flag is cleared after block processing via `clearNonEvictableTxs()`.
The `clearNonEvictableTxs` is called upon getting new L2 block.

## Configuration

The pool accepts configuration via `TxPoolOptions`:

```typescript
type TxPoolOptions = {
  maxPendingTxCount?: number;  // Max pending txs (0 = unlimited)
  archivedTxLimit?: number;    // Number of archived txs to retain
};
```

Configuration can be updated at runtime via `updateConfig()`.

## Telemetry

The pool integrates with the telemetry system to report:

- Transaction counts (pending vs mined)
- Transaction sizes
- Store size estimates
