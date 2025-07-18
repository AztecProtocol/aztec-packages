---
title: Public State
---

On this page we will look at how to manage public state in Aztec contracts. We will look at how to declare public state, how to read and write to it, and how to use it in your contracts.

For a higher level overview of the state model in Aztec,  see the [state model](../../../../aztec/concepts/storage/state_model.md) concepts page.

## `PublicMutable`

The `PublicMutable` (formerly known as `PublicState`) struct is generic over the variable type `T`. The type _must_ implement Serialize and Deserialize traits, as specified here:

#include_code serialize /noir-projects/noir-protocol-circuits/crates/types/src/traits.nr rust
#include_code deserialize /noir-projects/noir-protocol-circuits/crates/types/src/traits.nr rust

The struct contains a `storage_slot` which, similar to Ethereum, is used to figure out _where_ in storage the variable is located. Notice that while we don't have the exact same state model as EVM chains it will look similar from the contract developers point of view.

You can find the details of `PublicMutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/public_mutable.nr).

For a version of `PublicMutable` that can also be read in private, head to [`DelayedPublicMutable`](./delayed_public_mutable.md#delayedpublicmutable).

:::info
An example using a larger struct can be found in the [lending example (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/lending_contract)'s use of an [`Asset` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/app/lending_contract/src/asset.nr).
:::

### `new`

When declaring the storage for `T` as a persistent public storage variable, we use the `PublicMutable::new()` constructor. As seen below, this takes the `storage_slot` and the `serialization_methods` as arguments along with the `Context`, which in this case is used to share interface with other structures. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/public_mutable.nr).

#### Single value example

Say that we wish to add `admin` public state variable into our storage struct. In the struct we can define it as:

#include_code storage-leader-declaration /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

#### Mapping example

Say we want to have a group of `minters` that are able to mint assets in our contract, and we want them in public storage, because access control in private is quite cumbersome. In the `Storage` struct we can add it as follows:

#include_code storage-minters-declaration /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

### `read`

On the `PublicMutable` structs we have a `read` method to read the value at the location in storage.

#### Reading from our `admin` example

For our `admin` example from earlier, this could be used as follows to check that the stored value matches the `msg_sender()`.

#include_code read_admin /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

#### Reading from our `minters` example

As we saw in the Map earlier, a very similar operation can be done to perform a lookup in a map.

#include_code read_minter /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

### `write`

We have a `write` method on the `PublicMutable` struct that takes the value to write as an input and saves this in storage. It uses the serialization method to serialize the value which inserts (possibly multiple) values into storage.

#### Writing to our `admin` example

#include_code write_admin /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

#### Writing to our `minters` example

#include_code write_minter /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

---

## `PublicImmutable`

`PublicImmutable` is a type that is initialized from public once, typically during a contract deployment, but which can later be read from public, private and utility execution contexts. This state variable is useful for stuff that you would usually have in `immutable` values in Solidity, e.g. this can be the name of a token or its number of decimals.

Just like the `PublicMutable` it is generic over the variable type `T`. The type `MUST` implement the `Serialize` and `Deserialize` traits.

#include_code storage-public-immutable-declaration /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

You can find the details of `PublicImmutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/public_immutable.nr).

### `new`

Is done exactly like the `PublicMutable` struct, but with the `PublicImmutable` struct.

#include_code storage-public-immutable-declaration /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

### `initialize`

This function sets the immutable value. It can only be called once.

#include_code initialize_decimals /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

#include_code initialize_public_immutable /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust

### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

#include_code read_public_immutable /noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr rust
