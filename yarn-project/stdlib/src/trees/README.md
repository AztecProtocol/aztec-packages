# Trees Module

The trees module provides functionality for working with Merkle trees and cryptographic witnesses in the Aztec protocol. It handles tree snapshots, membership proofs, and witnesses for both private (nullifier) and public (state) data.

## Overview

This module handles:

- **Merkle Tree Operations**: Working with various Merkle trees in Aztec
- **Membership Witnesses**: Proving data exists in a tree
- **Nullifier Witnesses**: Proving nullifier membership/non-inclusion
- **Public Data Witnesses**: Proving public state values
- **Tree Snapshots**: Capturing tree state at specific points

## Core Concepts

### Aztec's Merkle Trees

Aztec maintains several Merkle trees to track different types of state:

1. **Note Hash Tree**: Stores commitments to private notes
2. **Nullifier Tree**: Stores nullifiers (spent note markers)
3. **Public Data Tree**: Stores public contract state
4. **L1→L2 Message Tree**: Stores pending L1 messages

Each tree provides cryptographic proofs that data exists (or doesn't exist) at a specific point in time.

## Merkle Tree IDs

```typescript
import { MerkleTreeId } from '@aztec/stdlib';

// Available trees
MerkleTreeId.NULLIFIER_TREE         // Nullifiers (spent notes)
MerkleTreeId.NOTE_HASH_TREE         // Note commitments
MerkleTreeId.PUBLIC_DATA_TREE       // Public state
MerkleTreeId.L1_TO_L2_MESSAGE_TREE  // L1 messages
MerkleTreeId.ARCHIVE                // Historical roots
```

## Tree Snapshots

Capture the state of a tree at a specific block:

```typescript
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib';

// Tree snapshot contains:
const snapshot = new AppendOnlyTreeSnapshot(
  root,        // Current tree root
  nextAvailableLeafIndex  // Number of leaves in tree
);

// Access properties
console.log(snapshot.root);                    // Fr - tree root
console.log(snapshot.nextAvailableLeafIndex);  // number - leaf count

// Serialize/deserialize
const buffer = snapshot.toBuffer();
const restored = AppendOnlyTreeSnapshot.fromBuffer(buffer);

// Field representation
const fields = snapshot.toFields();
const fromFields = AppendOnlyTreeSnapshot.fromFields(fields);
```

**Use Cases:**
- Historical state queries
- Rollback verification
- Cross-block consistency checks

## Nullifier Membership Witness

Prove that a nullifier exists in the nullifier tree (or prove non-inclusion via low nullifier):

```typescript
import { NullifierMembershipWitness, NullifierLeafPreimage } from '@aztec/stdlib';

const witness = new NullifierMembershipWitness(
  index,          // Leaf index in tree
  leafPreimage,   // Nullifier leaf data
  siblingPath     // Merkle proof path
);

// Components:
console.log(witness.index);         // bigint - position in tree
console.log(witness.leafPreimage);  // NullifierLeafPreimage
console.log(witness.siblingPath);   // Merkle authentication path

// Convert to field array for circuits
const fields = witness.toFields();

// Noir representation (for circuit oracles)
const noirData = witness.toNoirRepresentation();

// Without preimage (just the Merkle proof)
const membership = witness.withoutPreimage();
```

### Nullifier Leaf Structure

Nullifier leaves form a linked list for efficient non-inclusion proofs:

```typescript
import { NullifierLeafPreimage } from '@aztec/stdlib';

const leaf = new NullifierLeafPreimage(
  nullifier,    // The nullifier value
  nextNullifier, // Next higher nullifier (linked list)
  nextIndex     // Index of next nullifier leaf
);

// This structure allows proving non-inclusion:
// If a nullifier X doesn't exist, we can prove a leaf Y where:
// - Y.nullifier < X < Y.nextNullifier
// - This proves X is not in the tree
```

**Use Cases:**
- Proving a note has been spent (inclusion)
- Proving a note hasn't been spent yet (non-inclusion via low nullifier)
- Validating transaction execution

## Public Data Witness

Prove the value of public state or prove a slot is empty:

```typescript
import { PublicDataWitness, PublicDataTreeLeafPreimage } from '@aztec/stdlib';

const witness = new PublicDataWitness(
  index,          // Leaf index
  leafPreimage,   // Public data leaf
  siblingPath     // Merkle proof
);

// Access components
console.log(witness.index);         // bigint
console.log(witness.leafPreimage);  // PublicDataTreeLeafPreimage
console.log(witness.siblingPath);   // SiblingPath

// Convert to fields for circuits
const fields = witness.toFields();

// Noir representation
const noirData = witness.toNoirRepresentation();

// Serialize
const buffer = witness.toBuffer();
const hex = witness.toString();
```

### Public Data Leaf Structure

Public data leaves also form a linked list (sparse tree):

```typescript
import { PublicDataTreeLeafPreimage, PublicDataTreeLeaf } from '@aztec/stdlib';

const leaf = new PublicDataTreeLeaf(
  slot,    // Storage slot
  value    // Current value
);

const leafPreimage = new PublicDataTreeLeafPreimage(
  leaf,      // Slot and value
  nextIndex, // Next leaf index
  nextKey    // Next slot in linked list
);

// Use cases:
// 1. Prove slot X has value Y (exact match)
// 2. Prove slot X is empty (falls in range of leaf)
```

**How it works:**
- Leaves are sorted by slot number
- Each leaf points to the next higher slot
- To prove slot X is empty, find a leaf where:
  - `leaf.slot < X < leaf.nextKey`
  - This proves X has no explicit value (is zero)

## Common Patterns

### 1. Verify Nullifier Membership

```typescript
// Get witness from node
const witness = await node.getNullifierMembershipWitness(
  'latest',
  nullifier
);

if (witness) {
  console.log('Nullifier exists at index:', witness.index);

  // Verify in circuit
  const fields = witness.toFields();
  // Pass to circuit for verification
}
```

### 2. Prove Note Not Spent

```typescript
// Get low nullifier witness
const lowNullifierWitness = await node.getLowNullifierMembershipWitness(
  'latest',
  noteNullifier
);

// lowNullifierWitness.leafPreimage contains:
// - nullifier: value less than noteNullifier
// - nextNullifier: value greater than noteNullifier
// - Proves noteNullifier doesn't exist in tree
```

### 3. Read Public State

```typescript
// Get current value of a public storage slot
const witness = await node.getPublicDataTreeWitness('latest', slot);

if (witness) {
  const currentValue = witness.leafPreimage.leaf.value;
  console.log(`Slot ${slot} has value ${currentValue}`);
}
```

### 4. Prove Public Slot is Empty

```typescript
// Get witness for slot
const witness = await node.getPublicDataTreeWitness('latest', slot);

// Check if slot is in the range (empty) or exact match (has value)
const leafSlot = witness.leafPreimage.leaf.slot;
const nextSlot = witness.leafPreimage.nextKey;

if (leafSlot.lt(slot) && slot.lt(nextSlot)) {
  console.log(`Slot ${slot} is empty (falls in range)`);
} else if (leafSlot.equals(slot)) {
  console.log(`Slot ${slot} has value: ${witness.leafPreimage.leaf.value}`);
}
```

### 5. Historical State Queries

```typescript
// Get tree state at specific block
const snapshot = await node.getTreeSnapshot(
  blockNumber,
  MerkleTreeId.NOTE_HASH_TREE
);

console.log('Root at block', blockNumber, ':', snapshot.root);
console.log('Tree size:', snapshot.nextAvailableLeafIndex);

// Use historical root for time-travel queries
```

### 6. Verify Merkle Proofs

```typescript
import { computeMerkleRoot } from '@aztec/foundation/trees';

// Verify nullifier witness
const computedRoot = computeMerkleRoot(
  witness.leafPreimage.hash(),
  witness.siblingPath,
  witness.index
);

if (computedRoot.equals(expectedRoot)) {
  console.log('Witness is valid');
}
```

## Performance Considerations

### 1. Tree Height Matters

```typescript
// Tree heights (fixed by protocol)
import {
  NULLIFIER_TREE_HEIGHT,      // ~20-40 levels
  NOTE_HASH_TREE_HEIGHT,       // ~20-40 levels
  PUBLIC_DATA_TREE_HEIGHT,     // ~20-40 levels
  L1_TO_L2_MSG_TREE_HEIGHT    // ~16 levels
} from '@aztec/constants';

// Larger trees = longer sibling paths = more proof data
// Each level adds one hash to the proof
```

### 2. Witness Size

```typescript
// Nullifier witness size
const witness = new NullifierMembershipWitness(/*...*/);
const fields = witness.toFields();
// Size = 1 (index) + leaf fields + sibling path fields
// ~ 1 + 3 + TREE_HEIGHT fields

// Public data witness size
const pdWitness = new PublicDataWitness(/*...*/);
const pdFields = pdWitness.toFields();
// Size = 1 (index) + 4 (leaf) + TREE_HEIGHT fields
```

### 3. Caching Witnesses

```typescript
// Witnesses are specific to a tree state
// Cache witnesses per block/root

const witnessCache = new Map<string, NullifierMembershipWitness>();

function getCachedWitness(nullifier: Fr, root: Fr) {
  const key = `${nullifier.toString()}-${root.toString()}`;
  if (!witnessCache.has(key)) {
    const witness = await node.getNullifierMembershipWitness('latest', nullifier);
    witnessCache.set(key, witness);
  }
  return witnessCache.get(key);
}
```

## Security Considerations

### 1. Tree Root Validation

```typescript
// Always verify the tree root matches expected state
const witness = await node.getNullifierMembershipWitness('latest', nullifier);
const currentRoot = await node.getTreeRoot(MerkleTreeId.NULLIFIER_TREE);

// Compute root from witness
const computedRoot = computeMerkleRoot(
  witness.leafPreimage.hash(),
  witness.siblingPath,
  witness.index
);

if (!computedRoot.equals(currentRoot)) {
  throw new Error('Witness root mismatch - tree may have changed');
}
```

### 2. Historical Consistency

```typescript
// Ensure witnesses are from the same block
const blockNumber = await node.getBlockNumber();

const nullifierWitness = await node.getNullifierMembershipWitness(
  blockNumber,
  nullifier
);
const publicWitness = await node.getPublicDataTreeWitness(
  blockNumber,
  slot
);

// Both witnesses now represent state at the same point
```

### 3. Non-Inclusion Proofs

```typescript
// For low nullifier non-inclusion, verify the range
const lowWitness = await node.getLowNullifierMembershipWitness(
  'latest',
  targetNullifier
);

// Verify low nullifier < target < next nullifier
const low = lowWitness.leafPreimage.nullifier;
const next = lowWitness.leafPreimage.nextNullifier;

if (!(low.lt(targetNullifier) && targetNullifier.lt(next))) {
  throw new Error('Invalid non-inclusion proof');
}
```

## Integration with Circuits

### Passing Witnesses to Noir

```typescript
// Nullifier witness
const witness = await getNullifierWitness(nullifier);
const noirData = witness.toNoirRepresentation();

// In Noir circuit:
// unconstrained fn get_nullifier_membership_witness() -> NullifierMembershipWitness {
//   oracle::get_nullifier_membership_witness()
// }

// The oracle receives data from noirData
```

### Witness Format for Circuits

```typescript
// Nullifier witness → Noir struct
{
  index: Field,
  nullifier: Field,
  next_nullifier: Field,
  next_index: Field,
  sibling_path: [Field; TREE_HEIGHT]
}

// Public data witness → Noir struct
{
  index: Field,
  slot: Field,
  value: Field,
  next_key: Field,
  next_index: Field,
  sibling_path: [Field; TREE_HEIGHT]
}
```

## Related Modules

- **note/**: Notes that create note hashes in the tree
- **hash/**: Hash functions for computing Merkle roots
- **interfaces/**: MerkleTreeOperations interface
- **aztec-address/**: Addresses used in tree leaves

## Additional Resources

- [Aztec State Model](https://docs.aztec.network/learn/concepts/storage/state_model)
- [Merkle Trees](https://docs.aztec.network/protocol-specs/state/trees)
- [Nullifier Trees](https://docs.aztec.network/protocol-specs/state/nullifier-tree)
- [Public State Tree](https://docs.aztec.network/protocol-specs/state/public-state-tree)
