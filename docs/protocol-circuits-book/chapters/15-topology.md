# Chapter 15: Circuit Topology and Proof Aggregation

## Overview

This chapter provides a complete map of how all circuits connect, which circuits can follow which, and how proofs are aggregated from individual function calls to epoch-level proofs.

## Complete Circuit Topology

```
        APPLICATION LAYER
              |
     +--------+--------+
     |                 |
[App Circuit]    [App Circuit]

        PRIVATE KERNEL LAYER
              |
  +-----------+-----------+
  |           |           |
[Init]    [Inner]    [Inner]
  |           |           |
  +-----------+-----------+
              |
         [Reset]
              |
     +--------+--------+
     |                 |
  [Tail]        [TailToPublic]
     |                 |
     v                 v

          HIDING LAYER
              |
     +--------+--------+
     |                 |
[Hide-Rollup]   [Hide-Public]
     |                 |
     |                 v
     |         PUBLIC EXECUTION
     |                 |
     |        [Chonk Verifier]
     |                 |
     |              [AVM]
     v                 v

     TRANSACTION ROLLUP LAYER
              |
     +--------+--------+
     |                 |
[TX Base Priv]   [TX Base Pub]
     |                 |
     +--------+--------+
              |
         [TX Merge]
              |
              v

       BLOCK ROLLUP LAYER
              |
     +--------+--------+
     |                 |
[Parity Base]          |
     |                 |
[Parity Root]          |
     |                 |
     +--------+--------+
              |
  +-----------+-----------+
  |           |           |
[BlkFirst] [BlkRoot] [BlkSingleTX]
  |           |           |
  +-----------+-----------+
              |
        [Block Merge]
              |
              v

   CHECKPOINT ROLLUP LAYER
              |
     +--------+--------+
     |                 |
[CP Root]       [CP SingleBlk]
     |                 |
     +--------+--------+
              |
      [Checkpoint Merge]
              |
              v

       EPOCH ROLLUP LAYER
              |
     +--------+--------+
     |                 |
[Root Rollup]   [CP Padding]
     |
     v

      L1 VERIFICATION
```

## Valid Circuit Transitions

### Private Kernel Layer

| From | To | Notes |
|------|-----|-------|
| App Circuit | Init Kernel | First call only |
| Init Kernel | Inner Kernel | Subsequent calls |
| Inner Kernel | Inner Kernel | Chain of calls |
| Any Kernel | Reset Kernel | Optimization pass |
| Reset Kernel | Tail Kernel | Private-only TX |
| Reset Kernel | TailToPublic Kernel | TX with public |

### Hiding Layer

| From | To |
|------|-----|
| Tail Kernel | Hiding-to-Rollup |
| TailToPublic Kernel | Hiding-to-Public |

### Public Execution Layer

| From | To |
|------|-----|
| Hiding-to-Public | Chonk Verifier Public |
| Chonk Verifier Public | TX Base Public (with AVM) |

### Transaction Rollup Layer

| From | To |
|------|-----|
| Hiding-to-Rollup | TX Base Private |
| Chonk Verifier + AVM | TX Base Public |
| TX Base Private | TX Merge |
| TX Base Public | TX Merge |
| TX Merge | TX Merge |
| TX Base/Merge | Block Root |

### Block Rollup Layer

| From | To |
|------|-----|
| Parity Base | Parity Root |
| Parity Root | Block Root First variants |
| TX Merge/Base | Block Root variants |
| Block Root variants | Block Merge |
| Block Merge | Block Merge |
| Block Root/Merge | Checkpoint Root |

### Checkpoint Rollup Layer

| From | To |
|------|-----|
| Block Root/Merge | Checkpoint Root |
| Checkpoint Root | Checkpoint Merge |
| Checkpoint Merge | Checkpoint Merge |
| Checkpoint Root/Merge | Root Rollup |

### Epoch Rollup Layer

| From | To |
|------|-----|
| Checkpoint Root/Merge | Root Rollup |
| Checkpoint Padding | Root Rollup (right only) |

## VK Tree Structure

All verification keys are stored in a Merkle tree:

```
VK Tree Indices (example)
+-------------------------------+
| 0: Private Kernel Init        |
| 1: Private Kernel Inner       |
| 2: Private Kernel Reset       |
| 3: Private Kernel Tail        |
| 4: Private Kernel TailToPublic|
| 5: Hiding to Rollup           |
| 6: Hiding to Public           |
| 7: Chonk Verifier Public      |
| 8: AVM                        |
| 9: TX Base Private            |
| 10: TX Base Public            |
| 11: TX Merge                  |
| 12: Block Root First          |
| 13: Block Root                |
| ...                           |
+-------------------------------+
```

Each circuit that verifies a previous proof checks:
1. The proof is valid
2. The VK is at an allowed index
3. The VK exists in the VK tree

## Proof Aggregation Patterns

### Binary Tree Aggregation

Most layers use binary tree aggregation:

```
Level 0: [P1] [P2] [P3] [P4] [P5] [P6] [P7] [P8]
              \  /     \  /     \  /     \  /
Level 1:     [M1]     [M2]     [M3]     [M4]
                \     /           \     /
Level 2:        [M5]               [M6]
                    \             /
Level 3:             [Root Proof]
```

Benefits:
- Parallelizable (each level can be computed simultaneously)
- Logarithmic depth (O(log n) levels for n leaves)
- Flexible (handles any number of inputs)

### Greedy Tree Construction

Trees don't need to be perfectly balanced:

```
Greedy tree for 5 proofs:
              [M4]
             /    \
          [M3]    [P5]
         /    \
      [M2]    [P4]
     /    \
  [M1]    [P3]
 /    \
[P1]  [P2]

Construction order:
1. Merge P1 + P2 -> M1
2. Merge M1 + P3 -> M2
3. Merge M2 + P4 -> M3
4. Merge M3 + P5 -> M4
```

The greedy approach allows merging as soon as two adjacent proofs are available.

### Greedy Tree Rules

Circuits validate greedy tree structure:

```
Valid merge:
  left.height == right.height  (balanced)
  OR
  left.height == right.height + 1 AND right is single-element
  (greedy extension)

Invalid:
  left.height < right.height
  (would break greedy property)
```

## State Threading

State flows through the proof tree:

```
State Flow:
[TX1]           [TX2]           [TX3]
  |               |               |
  v               v               v
start=S0  ->  start=S1  ->  start=S2  -> end=S3
end=S1        end=S2        end=S3

Merge [TX1,TX2]:
  start=S0, end=S2

Merge [TX1-2, TX3]:
  start=S0, end=S3
```

Each proof carries:
- `start_state`: State at beginning of its scope
- `end_state`: State at end of its scope

Validation ensures: `left.end_state == right.start_state`

## Constant Propagation

Certain values must be identical across all proofs:

```
Propagated Constants:
- chain_id
- version
- vk_tree_root
- protocol_contracts_hash
- global_variables (per block)
```

Validation ensures these match across merged proofs.

## Proof Size Hierarchy

Proof sizes at each level:

| Level | Typical Proof Count | Aggregated Size |
|-------|--------------------|-----------------| 
| App | 1-50 per TX | Small |
| Kernel | 1-50 per TX | Medium |
| TX Rollup | 10-1000 per block | Medium |
| Block Rollup | 1-100 per checkpoint | Medium |
| Checkpoint | 1-10 per epoch | Large |
| Root | 1 per epoch | Final size |

Recursive verification keeps proof size manageable regardless of transaction count.

## Parallelization Strategy

```
Optimal Parallelization:

1. TX Level (most parallel)
   - All TX proofs can be computed simultaneously
   - Independent of each other
   
2. Block Level (moderately parallel)
   - TX merges can be done in parallel
   - Block roots depend on TX merges
   
3. Checkpoint Level (limited parallel)
   - Block merges can be parallel within checkpoint
   - Checkpoint root depends on all blocks
   
4. Epoch Level (sequential)
   - Root rollup must wait for all checkpoints
```

## Error Propagation

If any proof fails:

```
Proof Failure Cascade:
[TX3 invalid] 
     |
     v
[TX Merge fails] - Cannot merge TX2 with invalid TX3
     |
     v
[Block Root fails] - Cannot include invalid merge
     |
     v
[Block cannot be finalized]
```

Invalid proofs are rejected at the earliest possible point.

## Summary Diagram

```
+-------------------------------------+
|           EPOCH PROOF               |
+-------------------------------------+
| +-------------+ +-------------+     |
| | CHECKPOINT  | | CHECKPOINT  |     |
| | +---+ +---+ | | +---+ +---+ |     |
| | |BLK| |BLK| | | |BLK| |BLK| |     |
| | |TX | |TX | | | |TX | |TX | |     |
| | |TX | |TX | | | |TX | |TX | |     |
| | +---+ +---+ | | +---+ +---+ |     |
| +-------------+ +-------------+     |
+-------------------------------------+
```

\newpage
