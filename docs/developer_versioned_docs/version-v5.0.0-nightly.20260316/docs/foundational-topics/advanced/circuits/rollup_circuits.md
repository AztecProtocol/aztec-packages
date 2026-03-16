---
title: Rollup Circuits
sidebar_position: 2
tags: [protocol, circuits]
description: Learn how Rollup Circuits compress transactions into a single proof using a hierarchical tree topology for efficient verification on Ethereum.
---

The rollup circuits compress thousands of transactions into a single SNARK proof for verification on Ethereum. They aggregate proofs from private kernel and AVM execution, validate state transitions, and produce the final epoch proof submitted to L1.

:::note
The rollup circuits use a "binary tree of proofs" topology. This allows proof generation to be parallelized across prover instances—each layer of the tree can be computed in parallel, or subtrees can be distributed to different provers.
:::

## Circuit Hierarchy

Rollup circuits operate at four levels, each producing outputs consumed by the next:

| Level | Circuits | Input | Output |
|-------|----------|-------|--------|
| **Transaction** | TX Base (Private/Public), TX Merge | Kernel proofs | Transaction rollup data |
| **Block** | Block Root, Block Merge | Transaction rollups | Block rollup data |
| **Checkpoint** | Checkpoint Root, Checkpoint Merge | Block rollups | Checkpoint data |
| **Epoch** | Root Rollup | Checkpoint rollups | Final epoch proof |

## Transaction Level

### TX Base Rollups

Process individual transactions from kernel proofs:

- **TX Base Private** - Processes transactions with only private execution. Validates the private kernel proof, updates tree snapshots (note hash, nullifier), and accumulates fees and mana usage.
- **TX Base Public** - Processes transactions that include public (AVM) execution. Validates the AVM proof, which has already performed tree updates and fee/mana accumulation during public execution.

### TX Merge Rollup

Merges pairs of transaction rollup proofs in binary fashion. Can chain recursively to aggregate many transactions into a single proof. Validates proof correctness and consecutive transaction ordering.

## Block Level

### Block Root Rollups

Transition from transaction-level to block-level outputs. Several variants handle different scenarios:

- **Block Root First** - First block of a checkpoint (validates parity root and L1-to-L2 tree)
- **Block Root** - Subsequent blocks in a checkpoint
- **Block Root Single TX** - Optimized variant for single-transaction blocks
- **Block Root Empty TX First** - Handles empty blocks

These circuits update the archive tree, compute block headers, and accumulate L2-to-L1 message hashes.

### Block Merge Rollup

Merges pairs of block rollup proofs within a checkpoint. Validates archive continuity and state consistency between blocks.

## Checkpoint Level

### Checkpoint Root Rollups

Transition from block-level to checkpoint-level outputs:

- **Checkpoint Root** - Standard checkpoint containing multiple blocks
- **Checkpoint Root Single Block** - Optimized for single-block checkpoints

These circuits validate previous block headers, compute blob commitments, and accumulate fee recipients.

### Checkpoint Merge Rollup

Merges pairs of checkpoint proofs. Validates checkpoint continuity and blob accumulator consistency.

### Checkpoint Padding

A special circuit for epochs with only one checkpoint. Provides an empty right child for the binary tree structure.

## Epoch Level (Root Rollup)

The final circuit that completes an epoch proof. It:

- Merges two checkpoint rollup proofs
- Validates epoch-level blob batching challenges
- Produces the final `RootRollupPublicInputs` for L1 submission

The root rollup output includes:

- Previous and new archive roots
- Checkpoint header hashes
- Accumulated fees across all checkpoints
- Final blob public inputs for data availability

## Flexible Tree Topology

The architecture supports asymmetric "wonky trees" for efficiency:

- Transactions can be grouped variably into blocks
- Not all branches need the same depth
- Single-element optimizations reduce proof overhead
- Padding circuits handle partial epochs

This flexibility allows sequencers to optimize proving costs based on actual workload.

## Related Pages

- [Private Kernel](./private_kernel.md) - How private function proofs are generated
- [Public Execution](./public_execution.md) - How the AVM produces public execution proofs
