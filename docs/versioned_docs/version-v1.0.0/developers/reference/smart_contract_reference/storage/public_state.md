---
title: Public State
---

On this page we will look at how to manage public state in Aztec contracts. We will look at how to declare public state, how to read and write to it, and how to use it in your contracts.

For a higher level overview of the state model in Aztec,  see the [state model](../../../../aztec/concepts/storage/state_model.md) concepts page.

## `PublicMutable`

The `PublicMutable` (formerly known as `PublicState`) struct is generic over the variable type `T`. The type _must_ implement Serialize and Deserialize traits, as specified here:

```rust title="serialize" showLineNumbers 
/// Trait for serializing Noir types into arrays of Fields.
///
/// An implementation of the Serialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait (and Deserialize) are
/// typically used to communicate between Noir and TypeScript (via oracles and function arguments).
///
/// # On Following Noir's Intrinsic Serialization
/// When calling a Noir function from TypeScript (TS), first the function arguments are serialized into an array
/// of fields. This array is then included in the initial witness. Noir's intrinsic serialization is then used
/// to deserialize the arguments from the witness. When the same Noir function is called from Noir this Serialize trait
/// is used instead of the serialization in TS. For this reason we need to have a match between TS serialization,
/// Noir's intrinsic serialization and the implementation of this trait. If there is a mismatch, the function calls
/// fail with an arguments hash mismatch error message.
///
/// # Type Parameters
/// * `N` - The length of the output Field array, known at compile time
///
/// # Example
/// ```
/// impl<let N: u32> Serialize<N> for str<N> {
///     fn serialize(self) -> [Field; N] {
///         let bytes = self.as_bytes();
///         let mut fields = [0; N];
///         for i in 0..bytes.len() {
///             fields[i] = bytes[i] as Field;  // Each byte gets its own Field
///         }
///         fields
///     }
/// }
/// ```
#[derive_via(derive_serialize)]
pub trait Serialize<let N: u32> {
    fn serialize(self) -> [Field; N];
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-protocol-circuits/crates/types/src/traits.nr#L195-L230" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/traits.nr#L195-L230</a></sub></sup>

```rust title="deserialize" showLineNumbers 
/// Trait for deserializing Noir types from arrays of Fields.
///
/// An implementation of the Deserialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait is typically used when
/// deserializing return values from function calls in Noir. Since the same function could be called from TypeScript
/// (TS), in which case the TS deserialization would get used, we need to have a match between the 2.
///
/// # Type Parameters
/// * `N` - The length of the input Field array, known at compile time
///
/// # Example
/// ```
/// impl<let N: u32> Deserialize<N> for str<N> {
///     fn deserialize(fields: [Field; N]) -> Self {
///         str<N>::from(fields.map(|value| value as u8))
///     }
/// }
/// ```
#[derive_via(derive_deserialize)]
pub trait Deserialize<let N: u32> {
    fn deserialize(fields: [Field; N]) -> Self;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-protocol-circuits/crates/types/src/traits.nr#L309-L332" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-protocol-circuits/crates/types/src/traits.nr#L309-L332</a></sub></sup>


The struct contains a `storage_slot` which, similar to Ethereum, is used to figure out _where_ in storage the variable is located. Notice that while we don't have the exact same state model as EVM chains it will look similar from the contract developers point of view.

You can find the details of `PublicMutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/aztec/src/state_vars/public_mutable.nr).

For a version of `PublicMutable` that can also be read in private, head to [`SharedMutable`](./shared_state.md#sharedmutable).

:::info
An example using a larger struct can be found in the [lending example (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/lending_contract)'s use of an [`Asset` (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0/noir-projects/noir-contracts/contracts/app/lending_contract/src/asset.nr).
:::

### `new`

When declaring the storage for `T` as a persistent public storage variable, we use the `PublicMutable::new()` constructor. As seen below, this takes the `storage_slot` and the `serialization_methods` as arguments along with the `Context`, which in this case is used to share interface with other structures. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/aztec/src/state_vars/public_mutable.nr).

#### Single value example

Say that we wish to add `admin` public state variable into our storage struct. In the struct we can define it as:

```rust title="storage-leader-declaration" showLineNumbers 
leader: PublicMutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L27-L29" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L27-L29</a></sub></sup>


#### Mapping example

Say we want to have a group of `minters` that are able to mint assets in our contract, and we want them in public storage, because access control in private is quite cumbersome. In the `Storage` struct we can add it as follows:

```rust title="storage-minters-declaration" showLineNumbers 
minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L44-L46" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L44-L46</a></sub></sup>


### `read`

On the `PublicMutable` structs we have a `read` method to read the value at the location in storage.

#### Reading from our `admin` example

For our `admin` example from earlier, this could be used as follows to check that the stored value matches the `msg_sender()`.

```rust title="read_admin" showLineNumbers 
assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L181-L183" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L181-L183</a></sub></sup>


#### Reading from our `minters` example

As we saw in the Map earlier, a very similar operation can be done to perform a lookup in a map.

```rust title="read_minter" showLineNumbers 
assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L193-L195" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L193-L195</a></sub></sup>


### `write`

We have a `write` method on the `PublicMutable` struct that takes the value to write as an input and saves this in storage. It uses the serialization method to serialize the value which inserts (possibly multiple) values into storage.

#### Writing to our `admin` example

```rust title="write_admin" showLineNumbers 
storage.admin.write(new_admin);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L104-L106" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L104-L106</a></sub></sup>


#### Writing to our `minters` example

```rust title="write_minter" showLineNumbers 
storage.minters.at(minter).write(approve);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L184-L186" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L184-L186</a></sub></sup>


---

## `PublicImmutable`

`PublicImmutable` is a type that is initialized from public once, typically during a contract deployment, but which can later be read from public, private and utility execution contexts. This state variable is useful for stuff that you would usually have in `immutable` values in Solidity, e.g. this can be the name of a token or its number of decimals.

Just like the `PublicMutable` it is generic over the variable type `T`. The type `MUST` implement the `Serialize` and `Deserialize` traits.

```rust title="storage-public-immutable-declaration" showLineNumbers 
public_immutable: PublicImmutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43</a></sub></sup>


You can find the details of `PublicImmutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/aztec/src/state_vars/public_immutable.nr).

### `new`

Is done exactly like the `PublicMutable` struct, but with the `PublicImmutable` struct.

```rust title="storage-public-immutable-declaration" showLineNumbers 
public_immutable: PublicImmutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43</a></sub></sup>


### `initialize`

This function sets the immutable value. It can only be called once.

```rust title="initialize_decimals" showLineNumbers 
storage.decimals.initialize(decimals);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L94-L96" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L94-L96</a></sub></sup>


:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

```rust title="initialize_public_immutable" showLineNumbers 
#[public]
fn initialize_public_immutable(points: u8) {
    let mut new_leader = Leader { account: context.msg_sender(), points };
    storage.public_immutable.initialize(new_leader);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L84-L89" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L84-L89</a></sub></sup>


### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

```rust title="read_public_immutable" showLineNumbers 
#[utility]
unconstrained fn get_public_immutable() -> Leader {
    storage.public_immutable.read()
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L92-L96" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L92-L96</a></sub></sup>

