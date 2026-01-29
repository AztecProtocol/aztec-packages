# Chapter 12: Epoch-Level Rollup Circuits (Root Rollup)

## Overview

The epoch level is the final stage before L1 submission. The **Root Rollup** circuit produces the proof that gets verified on Ethereum, representing an entire epoch of Aztec activity.

## Circuit Hierarchy

```
Epoch Level
+------------------------------------------+
|                                          |
|  [Checkpoint Merge]  [Checkpoint Root]   |
|           \              /               |
|          [Root Rollup]                   |
|               |                          |
|          To L1 Verifier                  |
+------------------------------------------+
```

## Root Rollup Circuit

The culmination of all rollup processing.

### Valid Previous Circuits

```rust
// Left child
ALLOWED_LEFT_ROLLUP_VK_INDICES = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];

// Right child (can also be padding)
ALLOWED_RIGHT_ROLLUP_VK_INDICES = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
    CHECKPOINT_PADDING_ROLLUP_VK_INDEX,  // Only valid on right
];
```

### Padding Proof

If the epoch has only one checkpoint, the right child is a padding proof:

```
Epoch with 1 checkpoint:

    [Root Rollup]
       /      \
[Checkpoint]  [Padding]
```

The circuit verifies conditions that permit padding:
- Left subtree represents a single checkpoint
- Right proof is from padding circuit
- State is properly propagated

### Validation

```
Root Rollup Validation
+------------------------------------------+
| 1. Verify left checkpoint proof          |
|    - VK in allowed left set              |
| 2. Verify right proof (or padding)       |
|    - VK in allowed right set             |
| 3. Validate consecutiveness              |
|    - Greedy tree rules                   |
|    - Constants match                     |
|    - left.end_state == right.start_state |
| 4. Verify blob challenges match          |
|    - Both claim same z and gamma         |
| 5. Validate starting blob accumulator    |
|    - Must be empty at epoch start        |
+------------------------------------------+
```

### Blob Challenge Validation

The root rollup validates that blob batching challenges were correctly computed:

```
Blob Challenge Verification
+------------------------------------------+
| 1. Recompute expected z from commitments |
| 2. Recompute expected gamma              |
| 3. Compare against propagated values     |
| 4. Verify batched commitment is correct  |
+------------------------------------------+
```

This ensures the KZG commitments match what will be submitted to L1.

### Final Blob Commitment

The circuit compresses the final batched blob commitment:

```
C_final = sum(gamma^i * C_i) for all blobs in epoch
y_final = sum(gamma^i * y_i) for all evaluations
```

These values enable single-pairing verification on L1.

### Output Composition

```
Root Rollup Output
+------------------------------------------+
| Merging:                                 |
| - num_checkpoints = left + right         |
| - checkpoint_header_hashes combined      |
| - fees arrays merged                     |
|                                          |
| Assertions:                              |
| - Starting blob_accumulator was empty    |
| - Sum checkpoints <= max per epoch       |
|                                          |
| Final output:                            |
| - previous_archive_root                  |
| - new_archive_root                       |
| - checkpoint_header_hashes[]             |
| - fees[]                                 |
| - blob_public_inputs                     |
+------------------------------------------+
```

## Root Rollup Public Inputs

The public inputs submitted to L1:

```
RootRollupPublicInputs
+------------------------------------------+
| Archive Roots:                           |
|   previous_archive: Root before epoch    |
|   new_archive: Root after epoch          |
|                                          |
| Checkpoint Data:                         |
|   checkpoint_header_hashes: [Hash; N]    |
|   Each contains: block range, state,     |
|                  in_hash, out_hash       |
|                                          |
| Fees:                                    |
|   fees: [FeeRecipient; M]                |
|   Who gets paid and how much             |
|                                          |
| Blob Data:                               |
|   blob_public_inputs:                    |
|     - z (evaluation point)               |
|     - y (batched evaluation)             |
|     - C (batched commitment)             |
+------------------------------------------+
```

## L1 Verification

On Ethereum, the `EpochProofLib.sol` contract verifies:

```solidity
EpochProofLib Verification
+------------------------------------------+
| 1. Verify SNARK proof                    |
|    - Root rollup proof is valid          |
|                                          |
| 2. Verify state transition               |
|    - previous_archive matches stored     |
|    - new_archive is correctly computed   |
|                                          |
| 3. Verify blob commitments               |
|    - KZG point evaluation check          |
|    - Blobs match commitments             |
|                                          |
| 4. Process checkpoint headers            |
|    - Validate in_hash (L1->L2 msgs)      |
|    - Store out_hash (L2->L1 msgs)        |
|                                          |
| 5. Distribute fees                       |
|    - Pay proposers and provers           |
+------------------------------------------+
```

## Epoch Constraints

An epoch has limits:

```
Constraints
+------------------------------------------+
| MAX_CHECKPOINTS_PER_EPOCH                |
| MAX_BLOCKS_PER_CHECKPOINT                |
| MAX_TXS_PER_BLOCK                        |
| MAX_BLOBS_PER_CHECKPOINT = 6             |
| FIELDS_PER_BLOB = 4096                   |
+------------------------------------------+
```

The root rollup asserts these aren't exceeded.

## Complete Proof Tree

A full epoch proof tree:

```
                          [Root Rollup]
                               |
              +----------------+----------------+
              |                                 |
      [Checkpoint Merge]               [Checkpoint Merge]
              |                                 |
      +-------+-------+                 +-------+-------+
      |               |                 |               |
  [CP Root]      [CP Root]          [CP Root]      [CP Root]
      |               |                 |               |
  [Block     ...   [Block          [Block     ...   [Block
   Merge]           Root]           Merge]           Root]
      |               |                 |               |
  [TX        ...    [TX             [TX        ...    [TX
   Merge]           Base]           Merge]           Base]
```

Each level aggregates proofs from below, with the root rollup producing the final proof.

## Proof Compression

The root rollup proof may need further compression for L1:

```
Proof Pipeline
+------------------------------------------+
| Root Rollup (Honk proof)                 |
|           |                              |
|           v                              |
| Squisher Circuit (if needed)             |
|           |                              |
|           v                              |
| SNARK suitable for L1 verification       |
+------------------------------------------+
```

This compression reduces verification costs on Ethereum.

## Data Availability Verification

L1 verifies blob data matches proofs:

```
DA Verification Flow
+------------------------------------------+
| 1. Blobs posted to L1 (via EIP-4844)     |
| 2. Blob commitments extracted            |
| 3. Root rollup's C compared              |
| 4. Point evaluation: C opens to y at z   |
| 5. If match, data is available           |
+------------------------------------------+
```

This ensures anyone can reconstruct Aztec state from L1 data.

## Finality

After the epoch proof is verified on L1:

```
Finality Stages
+------------------------------------------+
| 1. Epoch proof submitted to L1           |
| 2. L1 verifier contract checks proof     |
| 3. State roots updated on L1             |
| 4. Blob commitments recorded             |
| 5. Fees distributed                      |
|                                          |
| => All transactions in epoch are FINAL   |
+------------------------------------------+
```

Transactions become irreversible after epoch proof verification.

## Summary

The Root Rollup is the capstone of the entire proof hierarchy:

| Aspect | Description |
|--------|-------------|
| **Input** | Two checkpoint proofs (or one + padding) |
| **Output** | Public inputs for L1 verification |
| **Key Function** | Finalize blob commitments, produce epoch proof |
| **Next Step** | L1 verification and finality |

```
Complete Flow:
TX -> Block -> Checkpoint -> Epoch -> L1 Verification -> Finality
```

\newpage
