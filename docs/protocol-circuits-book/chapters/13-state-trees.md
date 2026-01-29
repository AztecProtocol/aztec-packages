# Chapter 13: State Trees

## Overview

Aztec maintains multiple Merkle trees to track different types of state. Understanding these trees is essential for understanding how the protocol stores and validates data.

## What is a Merkle Tree?

Before diving into Aztec's specific trees, let's understand what a Merkle tree is and why it's useful.

### The Problem: Verifying Large Datasets

Imagine you have a database with millions of entries. You want to:
1. Prove a specific entry exists
2. Do this without sending the entire database
3. Detect if anyone tampered with the data

### The Solution: Hash Trees

A Merkle tree organizes data into a binary tree where:
- **Leaves** contain the actual data (or hashes of data)
- **Internal nodes** contain hashes of their children
- **Root** is a single hash representing ALL the data

```
                    [Root Hash]
                    /          \
              [Hash AB]      [Hash CD]
              /      \        /      \
          [Hash A] [Hash B] [Hash C] [Hash D]
             |        |        |        |
           Data A   Data B   Data C   Data D
```

### Why Merkle Trees Are Powerful

**Compact Proofs**: To prove "Data B exists," you only need:
- Data B itself
- Hash A (sibling)
- Hash CD (sibling of parent)

That's just 3 items, regardless of how many leaves exist! For a tree with 1 million leaves, you only need ~20 hashes.

**Tamper Detection**: If anyone changes Data B:
- Hash B changes
- Hash AB changes  
- Root Hash changes

The root acts as a "fingerprint" of the entire dataset.

### Merkle Trees in Aztec

Aztec uses Merkle trees to:
- **Prove note existence**: "This note hash is in the tree"
- **Prove note non-existence**: "This nullifier is NOT in the tree" (prevents double-spending)
- **Track state**: A single root hash represents all of Aztec's state

## Tree Types

| Tree | Type | Purpose | Height |
|------|------|---------|--------|
| Note Hash Tree | Append-only | Store note commitments | 42 |
| Nullifier Tree | Indexed | Track spent notes | 42 |
| Public Data Tree | Indexed | Store public state | 40 |
| L1-to-L2 Message Tree | Append-only | Store incoming messages | 36 |
| Archive Tree | Append-only | Store block headers | 30 |

## Append-Only Trees

Append-only trees only allow adding new leaves; existing leaves cannot be modified.

### Structure

```
Append-Only Tree
              [Root]
             /      \
          [H12]    [H34]
          /   \    /   \
        [H1] [H2] [H3] [H4]  <- Leaves
```

### Operations

**Insert**: Add leaf at `next_available_index`, recompute root

```
Before: [L1, L2, L3, _, _, _, _, _]  index = 3
After:  [L1, L2, L3, L4, _, _, _, _] index = 4
```

**Membership Proof**: Prove a leaf exists at a specific index

```
Proof for L2:
- Leaf value: L2
- Index: 1
- Sibling path: [H1, H34]
- Root verification: hash(H1, L2) -> H12, hash(H12, H34) -> Root
```

### Note Hash Tree

Stores commitments to private notes.

```
Note Hash Computation:
1. App computes: base_note_hash = hash(note_contents)
2. Kernel siloes: siloed = poseidon2([contract_address, base_note_hash])
3. Kernel uniquifies: unique = poseidon2([nonce, siloed])
4. Rollup inserts: unique_note_hash -> tree
```

**Capacity**: 2^42 = ~4.4 trillion note hashes

**Subtree Insertion**: Notes are inserted in batches (subtrees) for efficiency:

```
Subtree insertion (64 notes at once):
                    [Root]
                   /      \
               [...]      [...]
              /    \
          [...]   [Subtree]  <- 64 new notes
```

### L1-to-L2 Message Tree

Stores messages sent from Ethereum to Aztec.

```
Message Flow:
1. User calls L1 contract to send message
2. Message added to L1 inbox
3. At checkpoint boundary, messages form subtree
4. Subtree inserted into L1-to-L2 tree
5. Aztec contracts can consume messages
```

**Subtree Height**: 10 (1024 messages per checkpoint)

### Archive Tree

Stores block header hashes.

```
Archive Entry:
  leaf = hash(block_header)
  
Block Header contains:
  - Previous archive root
  - State tree roots
  - Content commitment (txs, messages)
  - Global variables (block number, timestamp)
```

**Purpose**: Provides historical state references for transactions

## Indexed Trees

Indexed trees support efficient non-membership proofs by maintaining sorted leaves with pointers.

### Structure

Each leaf contains:
- `value`: The actual data
- `next_index`: Pointer to the next leaf (by value order)
- `next_value`: Value of the next leaf

```
Indexed Tree Leaf:
+------------------------+
| value: 100             |
| next_index: 5          |
| next_value: 150        |
+------------------------+
```

### Non-Membership Proof

To prove a value `V` doesn't exist:

```
Find low_leaf where:
  low_leaf.value < V < low_leaf.next_value

Proof contains:
- low_leaf data
- Membership proof for low_leaf

Verification:
- Verify low_leaf exists in tree
- Verify low_leaf.value < V
- Verify V < low_leaf.next_value
- Therefore V is not in tree
```

### Nullifier Tree

Tracks which notes have been "spent" (nullified).

```
Nullifier Computation:
1. User computes: inner_nullifier = hash(note_hash, secret_key)
2. Kernel siloes: siloed = poseidon2([contract_address, inner_nullifier])
3. Rollup checks: siloed NOT in tree (non-membership)
4. Rollup inserts: siloed -> tree
```

**Why Indexed?** Must prove nullifiers don't exist before inserting (prevents double-spend).

```
Double-Spend Prevention:
1. User tries to spend note
2. Compute nullifier N
3. Prove N not in nullifier tree
4. If N exists, proof fails -> double-spend blocked
5. If N doesn't exist, insert N -> note spent
```

### Public Data Tree

Stores public contract state.

```
Leaf Structure:
+------------------------+
| slot: hash(contract, storage_slot) |
| value: state_value     |
+------------------------+
```

**Why Indexed?** Enables efficient lookups and updates:

```
State Update:
1. Compute slot = hash(contract_address, storage_slot)
2. If slot exists: update value
3. If slot doesn't exist: insert new leaf
```

**Capacity**: 2^40 = ~1 trillion storage slots

## Tree Snapshots

Trees are tracked using snapshots:

```rust
struct AppendOnlyTreeSnapshot {
    root: Field,
    next_available_leaf_index: u32,
}
```

Circuits validate state transitions using snapshots:

```
TX 1:
  start_snapshot = { root: R1, index: 100 }
  end_snapshot = { root: R2, index: 110 }  // Added 10 notes

TX 2:
  start_snapshot = { root: R2, index: 110 }  // Must match TX 1's end
  end_snapshot = { root: R3, index: 115 }
```

## Hash Functions

Different trees use different hash functions:

| Tree | Hash Function | Reason |
|------|---------------|--------|
| Note Hash | Poseidon2 | ZK-friendly |
| Nullifier | Poseidon2 | ZK-friendly |
| Public Data | Poseidon2 | ZK-friendly |
| Archive | SHA-256 | L1 compatibility |
| L1-to-L2 | SHA-256 | L1 compatibility |

## Batch Operations

For efficiency, circuits perform batch insertions:

```
Batch Note Hash Insertion:
1. Compute subtree from 64 note hashes
2. Insert subtree at next_available_index
3. Update root with single subtree insertion

Cost: O(log N) instead of O(64 * log N)
```

## Merkle Proof Verification

Standard verification pattern:

```rust
fn verify_membership(
    leaf: Field,
    index: u32,
    path: [Field; HEIGHT],
    root: Field
) {
    let mut current = leaf;
    for i in 0..HEIGHT {
        let sibling = path[i];
        if index & (1 << i) == 0 {
            current = hash(current, sibling);
        } else {
            current = hash(sibling, current);
        }
    }
    assert(current == root);
}
```

## State Recovery

All tree data can be recovered from blobs:

```
Recovery Process:
1. Fetch blobs from L1 (or archives)
2. Parse transaction effects
3. Replay note hash insertions
4. Replay nullifier insertions
5. Replay public data updates
6. Rebuild all trees
```

This ensures Aztec state is never lost.

## Summary

| Tree | Insert | Query | Special Feature |
|------|--------|-------|-----------------|
| Note Hash | Append | Membership | Subtree batching |
| Nullifier | Insert (indexed) | Non-membership | Double-spend prevention |
| Public Data | Update (indexed) | Membership | Key-value storage |
| L1-to-L2 | Subtree append | Membership | Cross-chain messages |
| Archive | Append | Membership | Block history |

\newpage
