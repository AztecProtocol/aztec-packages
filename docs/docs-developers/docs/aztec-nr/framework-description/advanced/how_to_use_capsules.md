---
title: Using Capsules
sidebar_position: 17
tags: [functions, oracles]
description: Learn how to use capsules for per-contract non-volatile storage in the PXE.
references: ["noir-projects/labs/aztec-nr/aztec/src/capsules/*", "noir-projects/labs/aztec-nr/aztec/src/oracle/capsules.nr"]
---

Capsules provide per-contract non-volatile storage in the PXE. Data is stored locally (not onchain), scoped per contract address, and persists until explicitly deleted.

## Basic usage

```rust
use aztec::oracle::capsules;

// Capsule operations are unconstrained, so these values are typically
// passed in as parameters from the calling context.
let contract_address: AztecAddress = /* self.address */;
let slot: Field = 1;
// scope is an AztecAddress used for capsule isolation, allowing multiple
// independent namespaces within the same contract.
let scope: AztecAddress = /* e.g. the account address */;

// Store data at a slot (overwrites existing data)
capsules::store(contract_address, slot, value, scope);

// Load data (returns Option<T>)
let result: Option<MyStruct> = capsules::load(contract_address, slot, scope);

// Delete data at a slot
capsules::delete(contract_address, slot, scope);

// Copy contiguous slots (supports overlapping regions)
// copy(contract_address, src_slot, dst_slot, num_entries: u32, scope)
capsules::copy(contract_address, src_slot, dst_slot, 3, scope);
```

Types must implement `Serialize` and `Deserialize` traits.

:::warning
All capsule operations are `unconstrained`. Data loaded from capsules should be validated in constrained contexts. Contracts can only access their own capsules.
:::

## CapsuleArray

`CapsuleArray` provides dynamic array storage backed by capsules:

```rust
use aztec::capsules::CapsuleArray;
use aztec::protocol::hash::sha256_to_field;

// Use a hash for base_slot to avoid collisions with other storage
global BASE_SLOT: Field = sha256_to_field("MY_CONTRACT::MY_ARRAY".as_bytes());

let array: CapsuleArray<Field> = CapsuleArray::at(contract_address, BASE_SLOT, scope);

array.push(value);             // Append to end
let value = array.get(index);  // Read at index (throws if out of bounds)
let length = array.len();      // Get current size (returns u32)
array.remove(index);           // Delete & shift elements (index is u32)

// Iterate and optionally remove elements
array.for_each(|index, value| {
    if some_condition(value) {
        array.remove(index); // Safe to remove current element only
    }
});
```

:::warning `for_each` Safety
It is safe to remove the current element during `for_each`, but **do not push new elements** during iteration.
:::

:::info Storage Layout
CapsuleArray stores length at the base slot, with elements in consecutive slots (base+1 for index 0, base+2 for index 1, etc.). Ensure sufficient space between different array base slots.
:::
