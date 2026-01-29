# Chapter 9: Transaction-Level Rollup Circuits

## What Does "Rollup" Mean?

The term "rollup" comes from "rolling up" many transactions into one proof. Imagine:

```
Without rollup:
  TX1 proof -> verify on L1 (expensive)
  TX2 proof -> verify on L1 (expensive)
  TX3 proof -> verify on L1 (expensive)
  ...
  1000 verifications = 1000x cost

With rollup:
  TX1 + TX2 + TX3 + ... + TX1000
           |
           v
    Single combined proof -> verify on L1 (one-time cost)
```

The rollup circuits are responsible for this "rolling up" process. They take individual transaction proofs and combine them into larger and larger proofs until we have one proof representing an entire epoch.

## Overview

Transaction-level rollup circuits process individual transactions and merge them into larger proofs. They validate transaction proofs against the current chain state and update the state trees.

## Circuit Hierarchy

```
Transaction Level
+------------------------------------------+
|                                          |
|  [TX Base Private]  [TX Base Public]     |
|         \              /                 |
|          \            /                  |
|           [TX Merge]                     |
|               |                          |
|          To Block Level                  |
+------------------------------------------+
```

## TX Base Private

Processes transactions with **only private execution**.

### Valid Previous Circuits
- `hiding-kernel-to-rollup`

### Valid Next Circuits
- `tx-merge`
- `block-root-single-tx` (if only tx in block)
- `block-root-first-single-tx` (if only tx in first block of checkpoint)

### Inputs

```
TX Base Private Inputs
+------------------------------------------+
| hiding_kernel_proof: From hiding kernel  |
| contract_class_log_fields: If deploying  |
| current_chain_state:                     |
|   - archive_tree                         |
|   - note_hash_tree                       |
|   - nullifier_tree                       |
|   - public_data_tree                     |
|   - block_header                         |
+------------------------------------------+
```

### Validation

The circuit validates:

1. **Proof Verification**
   - Hiding kernel proof is valid
   - VK exists at `HIDING_KERNEL_TO_ROLLUP_VK_INDEX` in VK tree

2. **Anchor Block Membership**
   - The transaction's claimed anchor block exists in the archive tree
   - This proves the transaction executed against a valid historical state

3. **Chain Consistency**
   - Chain ID matches
   - Protocol version matches
   - VK tree root matches
   - Protocol contracts hash matches

4. **Gas Requirements**
   - Transaction gas prices meet block minimums
   - Transaction doesn't exceed L2 gas limit

5. **Timestamp Check**
   - Transaction's `include_by_timestamp` hasn't passed

6. **Contract Class Logs**
   - If deploying a contract, validate log hash matches provided fields

### State Updates

The circuit performs critical state updates:

#### Fee Payment

```
Fee Computation:
1. Compute tx_fee = gas_used * gas_prices
2. Find fee_payer's FeeJuice balance in public data tree
3. Decrement balance by tx_fee
4. Create public_data_write for new balance
```

This is rare - protocol circuits directly modifying contract state. It's necessary because FeeJuice is a protocol contract.

#### Tree Insertions

```
Note Hash Tree:
1. Compute subtree from tx's note_hashes
2. Insert subtree at next available position

Nullifier Tree:
1. Check non-existence of new nullifiers
2. Insert new nullifiers

Public Data Tree:
1. Update fee_payer's balance
```

### Output Composition

The circuit produces:

```
TX Base Output
+------------------------------------------+
| end_tree_snapshots: Updated tree roots   |
| tx_hash: Hash of transaction             |
| tx_fee: Computed fee                      |
| out_hash: L2-to-L1 message subtree root  |
| sponge_blob: Updated blob accumulator    |
+------------------------------------------+
```

#### Blob Accumulation

Transaction effects are absorbed into a Poseidon2 sponge:

```
Effects absorbed:
- tx_hash
- revert_code (always 0 for private-only)
- tx_fee
- note_hashes
- nullifiers
- l2_to_l1_msgs
- public_data_writes
- private_logs
- public_logs (empty for private-only)
- contract_class_logs
```

## TX Base Public

Processes transactions with **public execution**.

### Valid Previous Circuits
- Both `chonk-verifier-public` AND `avm` proofs are required

### Key Differences from TX Base Private

1. **Two proofs verified**: Chonk verifier + AVM
2. **Revert handling**: May discard revertible side effects
3. **Public logs included**: From AVM execution
4. **Tree updates from AVM**: AVM already performed tree insertions

### Revert Handling

```
If AVM reverted:
  - Keep non-revertible data (from private setup phase)
  - Discard revertible private logs
  - Discard revertible contract class logs
  - revert_code = 1 in blob data
```

### Validation Flow

```
1. Verify chonk-verifier-public proof
   - VK at PUBLIC_CHONK_VERIFIER_VK_INDEX
   
2. Verify AVM proof
   - VK at AVM_VK_INDEX
   
3. Validate chain consistency (same as TX Base Private)

4. Validate anchor block membership

5. Compose output (using AVM's tree snapshots)
```

## TX Merge

Merges two transaction rollup proofs into one.

### Purpose

Enables parallel proof generation:

```
[TX1]  [TX2]  [TX3]  [TX4]
   \    /       \    /
  [Merge]     [Merge]
      \         /
      [Merge]
```

Four transactions can be proved in parallel, then merged in two levels.

### Valid Previous Circuits
- `tx-base-private`
- `tx-base-public`
- `tx-merge` (recursive)

### Validation

```
TX Merge Validation
+------------------------------------------+
| 1. Verify left proof (allowed VK)        |
| 2. Verify right proof (allowed VK)       |
| 3. Validate consecutiveness:             |
|    - left.end_state == right.start_state |
|    - Greedy tree rules followed          |
|    - Constants match                     |
+------------------------------------------+
```

### Greedy Tree Rules

The merge must follow binary tree structure:

```
Valid:
    [A]   [B]
      \   /
     [Merge]

Invalid (unbalanced without justification):
    [A]
     |
   [Merge]  <- Can't merge single item
```

### Output Composition

```
TX Merge Output
+------------------------------------------+
| num_txs: left.num_txs + right.num_txs    |
| out_hash: sha256(left.out_hash,          |
|                  right.out_hash)          |
| accumulated_fees: left + right           |
| accumulated_mana: left + right           |
| end_tree_snapshots: right.end_snapshots  |
| sponge_blob: right.sponge_blob           |
+------------------------------------------+
```

## L2-to-L1 Messages (out_hash)

Transaction-level circuits build up the `out_hash`:

```
TX1: messages [M1, M2]  -> out_hash_1 = merkle_root([M1, M2])
TX2: messages [M3]      -> out_hash_2 = merkle_root([M3])

Merge: out_hash = sha256(out_hash_1, out_hash_2)
```

This creates a greedy Merkle tree of all L2-to-L1 messages, eventually stored on L1.

## Blob Sponge

The blob sponge accumulates data through transactions:

```
TX1: sponge.absorb(tx1_effects) -> sponge_1
TX2: sponge_1.absorb(tx2_effects) -> sponge_2
TX3: sponge_2.absorb(tx3_effects) -> sponge_3
...
```

The sponge is passed through all transaction and block circuits, only being "squeezed" at the checkpoint level.

## State Continuity

A critical property is **state continuity**:

```
TX1.end_note_hash_tree_root == TX2.start_note_hash_tree_root
TX1.end_nullifier_tree_root == TX2.start_nullifier_tree_root
TX1.end_public_data_tree_root == TX2.start_public_data_tree_root
```

Each transaction picks up exactly where the previous left off.

## Summary

| Circuit | Input | Output | Key Function |
|---------|-------|--------|--------------|
| TX Base Private | Hiding proof | TX rollup data | Validate TX, update trees |
| TX Base Public | Chonk + AVM proofs | TX rollup data | Validate TX, handle reverts |
| TX Merge | Two TX rollups | Merged rollup | Aggregate proofs |

\newpage
