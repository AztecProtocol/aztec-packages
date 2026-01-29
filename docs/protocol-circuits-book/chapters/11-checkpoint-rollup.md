# Chapter 11: Checkpoint-Level Rollup Circuits

## Overview

Checkpoint-level circuits aggregate blocks and finalize blob data. This is where the Poseidon2 sponge is finally "squeezed" and KZG commitments are computed for data availability.

## Circuit Hierarchy

```
Checkpoint Level
+------------------------------------------+
|                                          |
|  [Block Merge]  [Block Root]             |
|        \           /                     |
|     [Checkpoint Root]                    |
|            |                             |
|     [Checkpoint Merge]                   |
|            |                             |
|     To Epoch Level                       |
+------------------------------------------+
```

## Checkpoint Root

The main circuit that creates a checkpoint from blocks.

### Valid Previous Circuits

```rust
ALLOWED_PREVIOUS_VK_INDICES = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];
```

Notice that first-block variants are only valid for single-block checkpoints (otherwise they'd be merged first).

### Validation

```
Checkpoint Root Validation
+------------------------------------------+
| 1. Verify left and right block proofs    |
| 2. Validate consecutiveness              |
|    - Greedy tree rules                   |
|    - Constants match                     |
|    - left.end_state == right.start_state |
|    - left.timestamp <= right.timestamp   |
| 3. Verify left started with empty state  |
|    - Empty sponge_blob                   |
|    - State matches previous checkpoint   |
| 4. Verify right.in_hash == 0             |
|    (L1->L2 only in first block)          |
| 5. Validate previous block header        |
+------------------------------------------+
```

### Blob Finalization

This is where blob data is finalized:

```
Blob Finalization Steps
+------------------------------------------+
| 1. Compute checkpoint end marker         |
| 2. Absorb marker into sponge             |
| 3. Verify total fields <= max (6 * 4096) |
| 4. Squeeze the sponge                    |
| 5. Validate blob_fields match squeeze    |
| 6. For each blob (6 total):              |
|    - Evaluate polynomial at z            |
|    - Compute KZG commitment contribution |
|    - Update batch challenges             |
+------------------------------------------+
```

### The Blob Protocol

A checkpoint can have up to **6 blobs** (per EIP-4844), each containing **4096 field elements**:

```
Checkpoint Blob Structure
+------------------------------------------+
| Blob 0: [field_0, field_1, ..., field_4095] |
| Blob 1: [field_0, field_1, ..., field_4095] |
| Blob 2: [field_0, field_1, ..., field_4095] |
| Blob 3: [field_0, field_1, ..., field_4095] |
| Blob 4: [field_0, field_1, ..., field_4095] |
| Blob 5: [field_0, field_1, ..., field_4095] |
+------------------------------------------+
Total: 24,576 fields per checkpoint
```

### KZG Commitment Computation

For each blob, the circuit:

1. **Interprets data as polynomial coefficients**
   ```
   p(X) = field_0 + field_1*X + field_2*X^2 + ... + field_4095*X^4095
   ```

2. **Evaluates at challenge point z**
   ```
   y = p(z)
   ```

3. **Contributes to batched commitment**
   ```
   C_batched += gamma^i * C_i
   y_batched += gamma^i * y_i
   ```

### Batch Challenges

To efficiently verify multiple blobs, challenges are computed:

```
z = hash(all blob commitments, ...)
gamma = hash(z, all blob commitments, ...)
```

These challenges allow verifying all blobs with a single pairing check on L1.

### Checkpoint Header

The circuit produces a checkpoint header:

```
Checkpoint Header
+------------------------------------------+
| start_block_number                       |
| end_block_number                         |
| start_archive_root                       |
| end_archive_root                         |
| in_hash (L1->L2 messages)                |
| out_hash (L2->L1 messages)               |
| accumulated_fees                         |
| blob_commitments_hash                    |
+------------------------------------------+
```

## Checkpoint Root Single Block

Optimized variant for checkpoints with only one block.

### Difference

- Takes single block proof
- No merge operation
- Same blob finalization

```
Valid Previous (must be first-block variant):
  BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX
  BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX
  BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
```

## Checkpoint Merge

Merges checkpoint proofs within an epoch.

### Valid Previous Circuits

```rust
ALLOWED_VK_INDICES = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];
```

### Validation

```
Checkpoint Merge Validation
+------------------------------------------+
| 1. Verify left and right proofs          |
| 2. Validate consecutiveness              |
|    - Greedy tree rules                   |
|    - Constants match                     |
|    - State continuity                    |
| 3. Verify same final blob challenges     |
+------------------------------------------+
```

### Merging

```
Checkpoint Merge Output
+------------------------------------------+
| num_checkpoints = left + right           |
| checkpoint_header_hashes merged          |
| fees arrays merged                       |
| blob_accumulator propagated              |
+------------------------------------------+
```

## Checkpoint Padding

A special circuit for epochs with only one checkpoint.

### Purpose

The root rollup expects two checkpoint proofs. If there's only one actual checkpoint, a padding proof fills the right side:

```
Single checkpoint epoch:

    [Root Rollup]
       /      \
[Checkpoint]  [Padding]  <- Special padding proof
```

### Behavior

- Produces a "no-op" proof
- Doesn't modify state
- Allows root rollup to complete

## Blob Data Flow Summary

```
TX Base:
  absorb(tx_effects) -> sponge

TX Merge:
  propagate(sponge)

Block Root:
  absorb(block_end_data) -> sponge

Block Merge:
  propagate(sponge)

Checkpoint Root:
  absorb(checkpoint_end_marker)
  squeeze(sponge) -> blob_hash
  compute KZG commitments
  
Checkpoint Merge:
  merge checkpoint data
  
Root Rollup:
  validate blob challenges
  finalize commitments for L1
```

## State at Checkpoint Boundaries

At checkpoint root:

```
Start State (must match prev checkpoint end):
  - archive_root
  - note_hash_tree
  - nullifier_tree
  - public_data_tree
  
End State:
  - Updated trees after all blocks
  - New archive entries for each block
```

## Fees and Rewards

Checkpoint circuits accumulate fees:

```
Block 1 fees: 100
Block 2 fees: 150
Block 3 fees: 200
---
Checkpoint total: 450

These fees are distributed to:
  - Block proposers (for proposing)
  - Provers (for generating proofs)
```

## Summary

| Circuit | Purpose | Key Operation |
|---------|---------|---------------|
| `checkpoint-root` | Finalize checkpoint | Squeeze sponge, compute KZG |
| `checkpoint-root-single-block` | Single-block checkpoint | Same, optimized |
| `checkpoint-merge` | Combine checkpoints | Merge headers/fees |
| `checkpoint-padding` | Fill empty slot | No-op proof |

\newpage
