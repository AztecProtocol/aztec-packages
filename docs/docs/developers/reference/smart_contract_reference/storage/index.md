---
title: Storage
---

Smart contracts rely on storage, acting as the persistent memory on the blockchain. In Aztec, because of its hybrid, privacy-first architecture, the management of this storage is more complex than other blockchains like Ethereum.

To learn how to define a storage struct, read [this guide](../../../guides/smart_contracts/writing_contracts/storage/index.md).
To learn more about storage slots, read [this explainer in the Concepts section](../../../../aztec/concepts/storage/index.md).

You control this storage in Aztec using a struct annotated with `#[storage]`. This struct serves as the housing unit for all your smart contract's state variables - the data it needs to keep track of and maintain.

These state variables come in two forms: [public](./public_state.md) and [private](./private_state.md). Public variables are visible to anyone, and private variables remain hidden within the contract. A state variable with both public and private components is said to be [shared](./shared_state.md).

Aztec.nr has a few abstractions to help define the type of data your contract holds. These include PrivateMutable, PrivateImmutable, PublicMutable, PublicImmutable, PrivateSet, and SharedMutable.

On this and the following pages in this section, you’ll learn:

- How to manage a smart contract's storage structure
- The distinctions and applications of public and private state variables
- How to use PrivateMutable, PrivateImmutable, PrivateSet, PublicMutable, SharedMutable and Map
- An overview of 'notes' and the UTXO model
- Practical implications of Storage in real smart contracts
  In an Aztec.nr contract, storage is to be defined as a single struct, that contains both public and private state variables.

## The `Context` parameter

Aztec contracts have three different modes of execution: private, public, and utility. How storage is accessed depends on the execution mode: for example, `PublicImmutable` can be read in all execution modes but only initialized in public, while `PrivateMutable` is entirely unavailable in public.

Aztec.nr prevents developers from calling functions unavailable in the current execution mode via the `Context` variable that is injected into all contract functions. Its type indicates the current execution mode:

- `&mut PrivateContext` for private execution
- `&mut PublicContext` for public execution
- `UtilityContext` for utility execution

All state variables are generic over this `Context` type, and expose different methods in each execution mode.

## Map

A `map` is a state variable that "maps" a key to a value. It can be used with private or public storage variables.

:::info
In Aztec.nr, keys are always `Field`s, or types that can be serialized as Fields, and values can be any type - even other maps. `Field`s are finite field elements, but you can think of them as integers.
:::

It includes a `Context` to specify the private or public domain, a `storage_slot` to specify where in storage the map is stored, and a `start_var_constructor` which tells the map how it should operate on the underlying type. This includes how to serialize and deserialize the type, as well as how commitments and nullifiers are computed for the type if it's private.

You can view the implementation in the Aztec.nr library [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr).

You can have multiple `map`s in your contract that each have a different underlying note type, due to note type IDs. These are identifiers for each note type that are unique within a contract.

#### As private storage

When declaring a mapping in private storage, we have to specify which type of Note to use. In the example below, we are specifying that we want to use the `PrivateMutable` note which will hold `ValueNote` types.

In the Storage struct:

```rust
numbers: Map<AztecAddress, PrivateMutable<ValueNote>>,
```

#### Public Example

When declaring a public mapping in Storage, we have to specify that the type is public by declaring it as `PublicState` instead of specifying a note type like with private storage above.

#include_code storage_minters /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

### `at`

When dealing with a Map, we can access the value at a given key using the `::at` method. This takes the key as an argument and returns the value at that key.

This function behaves similarly for both private and public maps. An example could be if we have a map with `minters`, which is mapping addresses to a flag for whether they are allowed to mint tokens or not.

#include_code read_minter /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

Above, we are specifying that we want to get the storage in the Map `at` the `msg_sender()`, read the value stored and check that `msg_sender()` is indeed a minter. Doing a similar operation in Solidity code would look like:

```solidity
require(minters[msg.sender], "caller is not minter");
```

## Further Reading

- [Public State](./public_state.md)
- [Private State](./private_state.md)
- [Shared State](./shared_state.md)

## Concepts mentioned

- [State Model](../../../../aztec/concepts/storage/state_model.md)
- [Public-private execution](../../../../aztec/smart_contracts/functions/public_private_calls.md)
- [Function Contexts](../../../../aztec/smart_contracts/functions/context.md)
