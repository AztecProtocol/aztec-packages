---
title: Using Capsules
sidebar_position: 3
tags: [functions, oracles]
description: Learn how to use capsules to add data to the private execution environment for use in your Aztec smart contracts.
---

:::info What are Capsules?
Capsules provide per-contract non-volatile storage in the PXE. Data is:

- Stored locally (not onchain)
- Scoped per contract address
- Persistent until explicitly deleted
- Useful for caching computation results

:::

## Available functions

- `store` - Store data at a slot
- `load` - Retrieve data from a slot
- `delete` - Remove data at a slot
- `copy` - Copy contiguous entries between slots

## Basic usage

```rust
use dep::aztec::oracle::capsules;

// Store data at a slot
unconstrained fn store_data(context: &mut PrivateContext) {
    capsules::store(context.this_address(), slot, value);
}

// Load data (returns Option<T>)
unconstrained fn load_data(context: &mut PrivateContext) -> Option<MyStruct> {
    capsules::load(context.this_address(), slot)
}

// Delete data at a slot
unconstrained fn delete_data(context: &mut PrivateContext) {
    capsules::delete(context.this_address(), slot);
}

// Copy multiple contiguous slots
unconstrained fn copy_data(context: &mut PrivateContext) {
    // Copy 3 slots from src_slot to dst_slot
    capsules::copy(context.this_address(), src_slot, dst_slot, 3);
}
```

:::warning Safety
All capsule operations are `unconstrained`. Data loaded from capsules should be validated in constrained contexts. Contracts can only access their own capsules - attempts to access other contracts' capsules will fail.
:::

## CapsuleArray for dynamic storage

```rust
use dep::aztec::capsules::CapsuleArray;

unconstrained fn manage_array(context: &mut PrivateContext) {
    // Create/access array at base_slot
    let array = CapsuleArray::at(context.this_address(), base_slot);

    // Array operations
    array.push(value);              // Append to end
    let value = array.get(index);   // Read at index
    let length = array.len();       // Get current size
    array.remove(index);            // Delete & shift elements

    // Iterate over all elements
    array.for_each(|index, value| {
        // Process each element
        if some_condition(value) {
            array.remove(index); // Safe to remove current element
        }
    });
}
```

:::tip Use Cases

- Caching expensive computations between simulation and execution
- Storing intermediate proof data
- Managing dynamic task lists
- Persisting data across multiple transactions

:::

:::info Storage Layout
CapsuleArray stores the length at the base slot, with elements in consecutive slots:
- Slot N: array length
- Slot N+1: element at index 0
- Slot N+2: element at index 1
- And so on...
:::
