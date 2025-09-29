---
title: Using Capsules
tags: [functions, oracles]
description: Learn how to use capsules to add data to the private execution environment for use in your Aztec smart contracts.
---

Capsules are a per-contract non-volatile database.
It can be used for storing arbitrary data that can be retrieved later.
The data is stored locally in PXE and it is scoped per contract address, so external contracts cannot access it.
The capsule (data stored under a storage slot in the capsules database) persists until explicitly deleted with `delete`.

The capsules module provides these main functions:

- `store<T, N>` - Stores arbitrary data at a slot, overwriting any existing data
- `load<T, N>` - Retrieves previously stored data from a slot
- `delete` - Deletes data at a slot
- `copy` - Efficiently copies contiguous entries between slots

### 1. Import capsules into your smart contract

Import the capsules module:

```rust title="import_capsules" showLineNumbers 
use dep::aztec::oracle::capsules;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/protocol/contract_class_registry/src/main.nr#L32-L34" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/protocol/contract_class_registry/src/main.nr#L32-L34</a></sub></sup>


### 2. Store and load data

You can store any type that implements `Serialize` and `Deserialize`:

```rust title="load_capsule" showLineNumbers 
// Safety: We load the bytecode via a capsule, which is unconstrained. In order to ensure the loaded bytecode
// matches the expected one, we recompute the commitment and assert it matches the one provided by the caller.
let mut packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] = unsafe {
    capsules::load(
        context.this_address(),
        CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
    )
        .unwrap()
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/protocol/contract_class_registry/src/main.nr#L42-L52" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/protocol/contract_class_registry/src/main.nr#L42-L52</a></sub></sup>


The data is stored per contract address and slot. When loading, you'll get back an `Option<T>` - `None` if no data exists at that slot.

### 3. Copying data

You can use `copy` to move contiguous entries between slots without repeated loads and stores.
This supports overlapping source and destination regions.

Note that all values are scoped per contract address, so external contracts cannot access them.

### 4. Using CapsuleArray

The `CapsuleArray<T>` type provides a dynamically sized array backed by capsules.
It handles the storage layout and management automatically.
The array stores its length at a base slot, with elements stored in consecutive slots after it.

Key functions:

- `at(contract_address, base_slot)` - Creates/connects to an array at the given base slot
- `len()` - Returns the number of elements in the array
- `push(value)` - Appends a value to the end of the array
- `get(index)` - Retrieves the value at the given index
- `remove(index)` - Removes an element, shifting subsequent elements to maintain contiguous storage

<!-- TODO: Document actual use case of CapsuleArray here once it's actually used. -->
