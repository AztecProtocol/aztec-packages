---
title: Using Capsules
sidebar_position: 5
tags: [functions, oracles]
---

Capsules provide a per-contract non-volatile database for storing arbitrary data that can be retrieved later. The data is scoped per contract address, so external contracts cannot access it.

The capsules module provides these main functions:

- `store<T, N>` - Stores arbitrary data at a slot, overwriting any existing data
- `load<T, N>` - Retrieves previously stored data from a slot
- `delete` - Deletes data at a slot
- `copy` - Efficiently copies contiguous entries between slots

### 1. Import capsules into your smart contract

Import the capsules module:

#include_code import_capsules noir-projects/noir-contracts/contracts/contract_class_registerer_contract/src/main.nr rust

### 2. Store and load data

You can store any type that implements `Serialize` and `Deserialize`:

#include_code load_capsule noir-projects/noir-contracts/contracts/contract_class_registerer_contract/src/main.nr rust

The data is stored per contract address and slot. When loading, you'll get back an `Option<T>` - `None` if no data exists at that slot.

### 3. Copying data

You can use `copy` to move contiguous entries between slots without repeated loads and stores. This supports overlapping source and destination regions.

Note that all values are scoped per contract address, so external contracts cannot access them. The data persists until explicitly deleted with `delete`.

### 4. Using CapsulesArray

The `CapsulesArray<T>` type provides a dynamically sized array backed by capsules. It handles the storage layout and management automatically. The array stores its length at a base slot, with elements stored in consecutive slots after it.

Key functions:

- `at(contract_address, base_slot)` - Creates/connects to an array at the given base slot
- `len()` - Returns the number of elements in the array
- `push(value)` - Appends a value to the end of the array
- `get(index)` - Retrieves the value at the given index
- `remove(index)` - Removes an element, shifting subsequent elements to maintain contiguous storage

<!-- TODO: Document actual use case of CapsulesArray here once it's actually used. -->