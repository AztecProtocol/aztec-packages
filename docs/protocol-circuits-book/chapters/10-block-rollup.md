# Chapter 10: Block-Level Rollup Circuits

## Overview

Block-level circuits transition from transaction rollups to block rollups. They create block headers, insert them into the archive tree, and handle L1-to-L2 messages for the first block in a checkpoint.

## Circuit Hierarchy

```
Block Level
+------------------------------------------+
|                                          |
|  [TX Merge]  [TX Base]                   |
|       \         /                        |
|     [Block Root]                         |
|          |                               |
|     [Block Merge]                        |
|          |                               |
|     To Checkpoint Level                  |
+------------------------------------------+
```

## Block Root Circuits

There are several block root variants to handle different scenarios:

| Variant | First Block? | TX Count | Use Case |
|---------|--------------|----------|----------|
| `block-root` | No | Multiple | Standard block |
| `block-root-single-tx` | No | 1 | Single-tx block |
| `block-root-first` | Yes | Multiple | First block with L1->L2 msgs |
| `block-root-first-single-tx` | Yes | 1 | First single-tx block |
| `block-root-first-empty-tx` | Yes | 0 | Empty first block (rewards only) |

## Block Root First Variants

The first block in a checkpoint is special - it must process L1-to-L2 messages.

### Parity Proof

Before `block-root-first` can run, a **parity proof** must be generated:

```
L1-to-L2 Message Processing
+------------------------------------------+
| 1. L1 sends messages to Aztec            |
| 2. Messages accumulated into subtree     |
| 3. Parity circuits prove subtree valid   |
| 4. Block-root-first inserts subtree      |
+------------------------------------------+
```

### Parity Base Circuit

Creates proofs for batches of L1-to-L2 messages:

```
Parity Base
+------------------------------------------+
| Input: Batch of L1-to-L2 messages        |
| Output: Subtree root proof               |
|                                          |
| - Hashes messages using SHA-256          |
| - Builds Merkle subtree                  |
+------------------------------------------+
```

### Parity Root Circuit

Aggregates parity base proofs:

```
Parity Root
+------------------------------------------+
| Input: Parity base proofs                |
| Output: Full L1-to-L2 subtree proof      |
|                                          |
| - Combines subtree proofs                |
| - Produces in_hash (subtree root)        |
+------------------------------------------+
```

### Block Root First Processing

```
Block Root First
+------------------------------------------+
| 1. Verify parity root proof              |
| 2. Insert L1-to-L2 subtree into tree     |
| 3. Process transactions (like block-root)|
| 4. Create block header                   |
+------------------------------------------+
```

The `in_hash` from the parity proof is included in the checkpoint data.

## Standard Block Root

For non-first blocks (no L1-to-L2 messages to process).

### Valid Previous Circuits

```rust
ALLOWED_PREVIOUS_VK_INDICES = [
    TX_MERGE_ROLLUP_VK_INDEX,
    PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
    PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
];
```

### Processing Steps

```
Block Root Processing
+------------------------------------------+
| Validator:                               |
| 1. Verify left and right TX proofs       |
| 2. Check VKs are in allowed set          |
| 3. Validate consecutiveness              |
|    - Left end state == Right start state |
|    - Greedy tree rules followed          |
|    - Constants match                     |
|                                          |
| Composer:                                |
| 4. Merge transaction data                |
| 5. Absorb block end data into sponge     |
| 6. Create block header                   |
| 7. Insert header into archive tree       |
+------------------------------------------+
```

### Merging Transaction Data

```
Merge Operation:
  num_txs = left.num_txs + right.num_txs
  out_hash = sha256(left.out_hash, right.out_hash)
  accumulated_fees = left.fees + right.fees
  accumulated_mana = left.mana + right.mana
```

### Block Header Creation

The block header contains:

```
Block Header
+------------------------------------------+
| last_archive: Previous archive root      |
| content_commitment:                      |
|   - num_txs                              |
|   - in_hash (L1->L2 msgs, 0 if not first)|
|   - out_hash (L2->L1 msgs)               |
|   - sponge_blob_hash (squeezed sponge)   |
| state:                                   |
|   - l1_to_l2_message_tree                |
|   - partial: note_hash, nullifier,       |
|              public_data trees           |
| global_variables:                        |
|   - block_number, timestamp, version,    |
|     fee_recipient, etc.                  |
+------------------------------------------+
```

### Archive Tree Insertion

```
Archive Tree Update:
1. Compute block_header_hash = hash(block_header)
2. Insert at next_available_leaf_index
3. Recompute archive root
```

The archive tree stores the history of all blocks.

## Block Root Single TX

Optimized variant when a block has only one transaction.

### Difference from Standard

- Takes single TX proof instead of two
- No merge operation needed
- Same block header creation and archive insertion

```
Valid Previous:
  PRIVATE_TX_BASE_ROLLUP_VK_INDEX
  PUBLIC_TX_BASE_ROLLUP_VK_INDEX
```

## Block Root Empty TX (First Only)

For when there are no transactions but block rewards are still needed.

### Processing

```
Empty Block Processing
+------------------------------------------+
| - No transaction proofs to verify        |
| - Still processes L1-to-L2 messages      |
| - Creates block header with num_txs = 0  |
| - Propagates unchanged state trees       |
| - Inserts header into archive            |
+------------------------------------------+
```

This enables block proposers to claim rewards even with no transactions.

## Block Merge

Merges block rollup proofs within a checkpoint.

### Valid Previous Circuits

```rust
ALLOWED_PREVIOUS_VK_INDICES = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];
```

### Processing

```
Block Merge
+------------------------------------------+
| 1. Verify left and right block proofs    |
| 2. Validate consecutiveness              |
|    - Archive continuity                  |
|    - State tree continuity               |
| 3. Merge block data                      |
|    - Combine fees, mana                  |
|    - Chain out_hashes                    |
| 4. Propagate sponge_blob (unsqueezed)    |
+------------------------------------------+
```

### Sponge Propagation

The blob sponge is **not squeezed** at block level:

```
Block 1: sponge absorbs block_1_data
Block 2: sponge absorbs block_2_data
Block 3: sponge absorbs block_3_data
...
Checkpoint Root: sponge.squeeze() -> blob commitment
```

This allows all blocks in a checkpoint to contribute to the same blob.

## Block End Data

Each block absorbs "block end data" into the sponge:

```
Block End Data
+------------------------------------------+
| block_number                             |
| block_header_hash                        |
| timestamp                                |
| note_hash_tree_root                      |
| nullifier_tree_root                      |
| public_data_tree_root                    |
+------------------------------------------+
```

This creates checkpoints in the blob data for recovery purposes.

## Greedy Tree Structure

Blocks form a "greedy tree" within a checkpoint:

```
Checkpoint with 5 blocks:

      [Block Merge]
         /      \
   [Block Merge] [Block 5]
      /    \
 [Block 1]  [Block Merge]
               /    \
          [Block 2] [Block Merge]
                       /    \
                   [Block 3] [Block 4]
```

The tree is built greedily - merge as soon as two adjacent proofs are available.

## State Tree Continuity

Block-level circuits ensure state continuity:

```
Block N:
  end_note_hash_root = R1
  end_nullifier_root = R2
  end_archive_root = R3

Block N+1:
  start_note_hash_root = R1  (must match)
  start_nullifier_root = R2  (must match)
  start_archive_root = R3    (must match)
```

Any break in continuity causes proof verification to fail.

## Summary

| Circuit | Purpose | Special Handling |
|---------|---------|------------------|
| `parity-base` | Hash L1->L2 message batches | - |
| `parity-root` | Combine parity proofs | - |
| `block-root-first*` | First block in checkpoint | L1->L2 messages |
| `block-root*` | Subsequent blocks | - |
| `block-merge` | Combine block proofs | - |

\newpage
