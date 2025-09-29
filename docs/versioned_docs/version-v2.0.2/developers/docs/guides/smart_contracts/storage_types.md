---
title: Storage Types
sidebar_position: 2
tags: [data-types, smart-contracts]
description: Learn about how data is stored in Aztec contracts.
---

Interacting with the protocol in a reliable, private manner is simplified by using the storage types described below, provided by the Aztec.nr library for writing contracts.

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

```rust title="private_map" showLineNumbers 
// Contains the NFTs owned by each address in private.
private_nfts: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L52-L55" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L52-L55</a></sub></sup>


#### Public Example

When declaring a public mapping in Storage, we have to specify that the type is public by declaring it as `PublicState` instead of specifying a note type like with private storage above.

```rust title="storage_minters" showLineNumbers 
minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L66-L68" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L66-L68</a></sub></sup>


### Accessing a value

When dealing with a Map, we can access the value at a given key using the `::at` method. This takes the key as an argument and returns the value at that key.

This function behaves similarly for both private and public maps. An example could be if we have a map with `minters`, which is mapping addresses to a flag for whether they are allowed to mint tokens or not.

```rust title="read_minter" showLineNumbers 
assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L192" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L192</a></sub></sup>


Above, we are specifying that we want to get the storage in the Map `at` the `msg_sender()`, read the value stored and check that `msg_sender()` is indeed a minter. Doing a similar operation in Solidity code would look like:

```solidity
require(minters[msg.sender], "caller is not minter");
```

## Private Data Types

To simplify the experience of writing private state, Aztec.nr provides three different types of private state variable:

- [PrivateMutable\<NoteType\>](#privatemutablenotetype)
- [PrivateImmutable\<NoteType\>](#privateimmutablenotetype)
- [PrivateSet\<NoteType\>](#privatesetnotetype)

These three structs abstract-away many of Aztec's protocol complexities, by providing intuitive methods to modify notes in the utxo tree in a privacy-preserving way.

Unlike public state variables, which can be arbitrary types, private state variables operate on `NoteType`. See [Note Types](./note_types.md) for more information about how to define your own note types.

Notes are the fundamental elements of private state.

### PrivateMutable

PrivateMutable is a private state variable that is unique in a way. When a PrivateMutable is initialized, a note is created to represent its value. And the way to update the value is to destroy the current note, and create a new one with the updated value.

Like for public state, we define the struct to have context and a storage slot. You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/state_vars/private_mutable.nr).

An example of `PrivateMutable` usage in the account contracts is keeping track of public keys. The `PrivateMutable` is added to the `Storage` struct as follows:

```rust title="storage-private-mutable-declaration" showLineNumbers 
legendary_card: PrivateMutable<CardNote, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L30-L32" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L30-L32</a></sub></sup>


#### `new`

As part of the initialization of the `Storage` struct, the `PrivateMutable` is created as follows at the specified storage slot.

```rust title="start_vars_private_mutable" showLineNumbers 
legendary_card: PrivateMutable::new(context, 3),
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L57-L59" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L57-L59</a></sub></sup>


#### `initialize`

As mentioned, the PrivateMutable is initialized to create the first note and value.

When this function is called, a nullifier of the storage slot is created, preventing this PrivateMutable from being initialized again.

:::danger Privacy-Leak
Beware that because this nullifier is created only from the storage slot without randomness it leaks privacy. This means that it is possible for an external observer to determine when the note is nullified.

For example, if the storage slot depends on the an address then it is possible to link the nullifier to the address. If the PrivateMutable is part of a `map` with an `AztecAddress` as the key then the nullifier will be linked to the address.
:::

Unlike public states, which have a default initial value of `0` (or many zeros, in the case of a struct, array or map), a private state (of type `PrivateMutable`, `PrivateImmutable` or `PrivateSet`) does not have a default initial value. The `initialize` method (or `insert`, in the case of a `PrivateSet`) must be called.

:::info
Extend on what happens if you try to use non-initialized state.
:::

#### `is_initialized`

An unconstrained method to check whether the PrivateMutable has been initialized or not. It takes an optional owner and returns a boolean. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/state_vars/private_mutable.nr).

```rust title="private_mutable_is_initialized" showLineNumbers 
#[utility]
unconstrained fn is_legendary_initialized() -> bool {
    storage.legendary_card.is_initialized()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L137-L142" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L137-L142</a></sub></sup>


#### `replace`

To update the value of a `PrivateMutable`, we can use the `replace` method. The method takes a new note as input and replaces the current note with the new one. It emits a nullifier for the old value, and inserts the new note into the data tree.

An example of this is seen in a example card game, where we create a new note (a `CardNote`) containing some new data, and replace the current note with it:

```rust title="state_vars-PrivateMutableReplace" showLineNumbers 
storage.legendary_card.replace(new_card).emit(encode_and_encrypt_note(
    &mut context,
    context.msg_sender(),
));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L129-L134" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L129-L134</a></sub></sup>


:::info

Calling `emit(encode_and_encrypt_note())` on the `replace` method will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

If two people are trying to modify the PrivateMutable at the same time, only one will succeed as we don't allow duplicate nullifiers! Developers should put in place appropriate access controls to avoid race conditions (unless a race is intended!).

#### `get_note`

This function allows us to get the note of a PrivateMutable, essentially reading the value.

```rust title="state_vars-PrivateMutableGet" showLineNumbers 
let card = storage.legendary_card.get_note().note;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L123-L125" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L123-L125</a></sub></sup>


#### Nullifying Note reads

To ensure that a user's private execution always uses the latest value of a PrivateMutable, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed (no duplicate nullifiers allowed).

This also makes read operations indistinguishable from write operations and allows the sequencer to verifying correct execution without learning anything about the value of the note.

#### `view_note`

Functionally similar to [`get_note`](#get_note), but executed in unconstrained functions and can be used by the wallet to fetch notes for use by front-ends etc.

### PrivateImmutable

`PrivateImmutable` (formerly known as `ImmutableSingleton`) represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/state_vars/private_immutable.nr).

#### `new`

As part of the initialization of the `Storage` struct, the `PrivateMutable` is created as follows, here at storage slot 1.

```rust title="storage-private-immutable-declaration" showLineNumbers 
private_immutable: PrivateImmutable<CardNote, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L38-L40" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L38-L40</a></sub></sup>


#### `initialize`

When this function is invoked, it creates a nullifier for the storage slot, ensuring that the PrivateImmutable cannot be initialized again.

:::danger Privacy-Leak
Beware that because this nullifier is created only from the storage slot without randomness it leaks privacy. This means that it is possible for an external observer to determine when the note is nullified.

For example, if the storage slot depends on the an address then it is possible to link the nullifier to the address. If the PrivateImmutable is part of a `map` with an `AztecAddress` as the key then the nullifier will be linked to the address.
:::

Set the value of an PrivateImmutable by calling the `initialize` method:

```rust title="initialize-private-mutable" showLineNumbers 
#[private]
fn initialize_private_immutable(points: u8) {
    let new_card = CardNote::new(points, context.msg_sender());

    storage.private_immutable.initialize(new_card).emit(encode_and_encrypt_note(
        &mut context,
        context.msg_sender(),
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L99-L109" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L99-L109</a></sub></sup>


:::info

Calling `emit(encode_and_encrypt_note())` on `initialize` will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

Once initialized, an PrivateImmutable's value remains unchangeable. This method can only be called once.

#### `is_initialized`

An unconstrained method to check if the PrivateImmutable has been initialized. Takes an optional owner and returns a boolean. You can find the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/state_vars/private_immutable.nr).

#### `get_note`

Similar to the `PrivateMutable`, we can use the `get_note` method to read the value of an PrivateImmutable.

Use this method to retrieve the value of an initialized PrivateImmutable.

```rust title="get_note-private-immutable" showLineNumbers 
#[private]
fn get_imm_card() -> CardNote {
    storage.private_immutable.get_note()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L144-L149" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L144-L149</a></sub></sup>


Unlike a `PrivateMutable`, the `get_note` function for an PrivateImmutable doesn't nullify the current note in the background. This means that multiple accounts can concurrently call this function to read the value.

This function will throw if the `PrivateImmutable` hasn't been initialized.

#### `view_note`

Functionally similar to `get_note`, but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

### PrivateSet

`PrivateSet` is used for managing a collection of notes. All notes in a `PrivateSet` are of the same `NoteType`. But whether these notes all belong to one entity, or are accessible and editable by different entities, is up to the developer.

For example, adding a mapping of private NFTs to storage, indexed by `AztecAddress`:

```rust title="private_map" showLineNumbers 
// Contains the NFTs owned by each address in private.
private_nfts: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L52-L55" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr#L52-L55</a></sub></sup>


#### `insert`

Allows us to modify the storage by inserting a note into the `PrivateSet`.

A hash of the note will be generated, and inserted into the note hash tree, allowing us to later use in contract interactions. Recall that the content of the note should be shared with the owner to allow them to use it, as mentioned this can be done via an encrypted log or offchain via web2, or completely offline.

```rust title="insert" showLineNumbers 
self.set.insert(addend_note).emit(encode_and_encrypt_note(self.context, owner));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L45-L47" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L45-L47</a></sub></sup>


:::info

Calling `emit(encode_and_encrypt_note())` on `insert` will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

#### `insert_from_public`

The `insert_from_public` allow public function to insert notes into private storage. This is very useful when we want to support private function calls that have been initiated in public.

The usage is similar to using the `insert` method with the difference that this one is called in public functions.

#### `pop_notes`

This function pops (gets, removes and returns) the notes the account has access to based on the provided filter.

The kernel circuits are constrained to a maximum number of notes this function can return at a time. Check [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr) and look for `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` for the up-to-date number.

Because of this limit, we should always consider using the second argument `NoteGetterOptions` to limit the number of notes we need to read and constrain in our programs. This is quite important as every extra call increases the time used to prove the program and we don't want to spend more time than necessary.

An example of such options is using the [filter_notes_min_sum (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/value-note/src/filter.nr) to get "enough" notes to cover a given value. Essentially, this function will return just enough notes to cover the amount specified such that we don't need to read all our notes. For users with a lot of notes, this becomes increasingly important.

```rust title="pop_notes" showLineNumbers 
let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend as Field);
let notes = self.set.pop_notes(options);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L52-L55" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L52-L55</a></sub></sup>


#### `get_notes`

This function has the same behavior as `pop_notes` above but it does not delete the notes.

#### `remove`

Will remove a note from the `PrivateSet` if it previously has been read from storage, e.g. you have fetched it through a `get_notes` call. This is useful when you want to remove a note that you have previously read from storage and do not have to read it again.

Note that if you obtained the note you are about to remove via `get_notes` it's much better to use `pop_notes` as `pop_notes` results in significantly fewer constraints since it doesn't need to check that the note has been previously read, as it reads and deletes at once.

#### `view_notes`

Functionally similar to [`get_notes`](#get_notes), but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

```rust title="view_notes" showLineNumbers 
let mut options = NoteViewerOptions::new();
let notes = set.view_notes(options.set_offset(offset));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/value-note/src/balance_utils.nr#L15-L18" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/balance_utils.nr#L15-L18</a></sub></sup>


There's also a limit on the maximum number of notes that can be returned in one go. To find the current limit, refer to [this file (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/note/constants.nr) and look for `MAX_NOTES_PER_PAGE`.

The key distinction is that this method is unconstrained. It does not perform a check to verify if the notes actually exist, which is something the [`get_notes`](#get_notes) method does under the hood. Therefore, it should only be used in an unconstrained contract function.

This function requires a `NoteViewerOptions`. The `NoteViewerOptions` is essentially similar to the [`NoteGetterOptions`](#notegetteroptions), except that it doesn't take a custom filter.

## Public Data Types

### PublicMutable

The `PublicMutable` struct is generic over the variable type `T`.

The struct contains a `storage_slot` which, similar to Ethereum, is used to figure out _where_ in storage the variable is located.

For a version of `PublicMutable` that can also be read in private, head to [`DelayedPublicMutable`](#delayed-public-mutable).

:::info
An example using a larger struct can be found in the [lending example](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/lending_contract)'s use of an [`Asset`](https://github.com/AztecProtocol/aztec-packages/tree/v2.0.2/noir-projects/noir-contracts/contracts/app/lending_contract/src/asset.nr).
:::

##### Single value example

To add `admin` public state variable into our storage struct, we can define it as:

```rust title="storage-leader-declaration" showLineNumbers 
leader: PublicMutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L27-L29" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L27-L29</a></sub></sup>


#### Mapping example

To add a group of `minters` that are able to mint assets in our contract, and we want them in public storage:

```rust title="storage-minters-declaration" showLineNumbers 
minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L44-L46" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L44-L46</a></sub></sup>


#### `read`

On the `PublicMutable` structs we have a `read` method to read the value at the location in storage.

##### Reading from our `admin` example

For our `admin` example from earlier, this could be used as follows to check that the stored value matches the `msg_sender()`.

```rust title="read_admin" showLineNumbers 
assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L178-L180" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L178-L180</a></sub></sup>


##### Reading from our `minters` example

As we saw in the Map earlier, a very similar operation can be done to perform a lookup in a map.

```rust title="read_minter" showLineNumbers 
assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L192" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L190-L192</a></sub></sup>


#### `write`

We have a `write` method on the `PublicMutable` struct that takes the value to write as an input and saves this in storage. It uses the serialization method to serialize the value which inserts (possibly multiple) values into storage.

##### Writing to our `admin` example

```rust title="write_admin" showLineNumbers 
storage.admin.write(new_admin);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L101-L103" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L101-L103</a></sub></sup>


##### Writing to our `minters` example

```rust title="write_minter" showLineNumbers 
storage.minters.at(minter).write(approve);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L181-L183" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L181-L183</a></sub></sup>


### PublicImmutable

`PublicImmutable` is a type that is initialized from public once, typically during a contract deployment, but which can later be read from public, private and utility execution contexts. This state variable is useful for stuff that you would usually have in `immutable` values in Solidity, e.g. this can be the name of a token or its number of decimals.

Just like the `PublicMutable` it is generic over the variable type `T`. The type `MUST` implement the `Serialize` and `Deserialize` traits.

```rust title="storage-public-immutable-declaration" showLineNumbers 
public_immutable: PublicImmutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43</a></sub></sup>


You can find the details of `PublicImmutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/state_vars/public_immutable.nr).

#### `new`

Is done exactly like the `PublicMutable` struct, but with the `PublicImmutable` struct.

```rust title="storage-public-immutable-declaration" showLineNumbers 
public_immutable: PublicImmutable<Leader, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L41-L43</a></sub></sup>


#### `initialize`

This function sets the immutable value. It can only be called once.

```rust title="initialize_decimals" showLineNumbers 
storage.decimals.initialize(decimals);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L91-L93" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L91-L93</a></sub></sup>


:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

```rust title="initialize_public_immutable" showLineNumbers 
#[public]
fn initialize_public_immutable(points: u8) {
    let mut new_leader = Leader { account: context.msg_sender(), points };
    storage.public_immutable.initialize(new_leader);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L84-L89" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L84-L89</a></sub></sup>


#### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

```rust title="read_public_immutable" showLineNumbers 
#[utility]
unconstrained fn get_public_immutable() -> Leader {
    storage.public_immutable.read()
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L92-L96" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L92-L96</a></sub></sup>


## Delayed Public Mutable

A typical use case for "Delayed Public Mutable" state is some kind of system configuration, such as a protocol fee or access control permissions. These values are public (known by everyone) and mutable. Reading them in private however is tricky: private execution is always asynchronous and performed over _historical_ state, and hence one cannot easily prove that a given public value is current.

A naive way to solve this is to enqueue a public call that will assert the current public value, but this leaks _which_ public value is being read, severely reducing privacy. Even if the value itself is already public, the fact that we're using it because we're interacting with some related contract is not. For example, we may leak that we're interacting with a certain DeFi protocol by reading its fee.

An alternative approach is to create notes in public that are then nullified in private, but this introduces contention: only a single user may use the note and therefore read the state, since nullifying it will prevent all others from doing the same. In some schemes there's only one account that will read the state anyway, but this is not the general case.

Delayed Public Mutable state works around this by introducing **delays**: while public values are mutable, they cannot change _immediately_. Instead, a value change must be scheduled ahead of time, and some minimum amount of time must pass between the scheduling and the new value taking effect. This means that we can privately prove that a historical public value cannot possibly change before some point in the future (due to the minimum delay), and therefore that our transaction will be valid **as long as it gets included before this future time**.

This results in the following key properties of `DelayedPublicMutable` state:

- public values can only be changed after a certain delay has passed, never immediately
- the scheduling of value changes is itself public, including both the new value and the time at which the change will take effect
- transactions that read `DelayedPublicMutable` state become invalid after some time if not included in a block

### Privacy Considerations

While `DelayedPublicMutable` state variables are much less leaky than the assertion in public approach, they do reveal some information to external observers by setting the `include_by_timestamp` property of the transaction request. The impact of this can be mitigated with proper selection of the delay value and schedule times.

### Choosing Delays

The `include_by_timestamp` transaction property will be set to a value close to the current timestamp plus the duration of the delay in seconds. The exact value depends on the historical block over which the private proof is constructed. For example, if current timestamp is `X` and a `DelayedPublicMutable` state variable has a delay of 3000 seconds, then transactions that read this value privately will set `include_by_timestamp` to a value close to 'X + 3000' (clients building proofs on older state will select a lower `include_by_timestamp`). This implicitly leaks the duration of the delay.

Applications using similar delays will therefore be part of the same privacy set. It is expected for social coordination to result in small set of predetermined delays that developers choose from depending on their needs, as an example a viable set might be: 12 hours (for time-sensitive operations, such as emergency mechanisms), 5 days (for middle-of-the-road operations) and 2 weeks (for operations that require lengthy public scrutiny). These delays can be changed during the contract lifetime as the application's needs evolve.

Additionally, users might choose to coordinate and constrain their transactions to set `include_by_timestamp` to a value lower than would be strictly needed by the applications they interact with (if any!) using some common delay, and by doing so prevent privacy leakage.

### Choosing Epochs

If a value change is scheduled in the near future, then transactions that access this `DelayedPublicMutable` state will be forced to set a lower `include_by_timestamp` right before the value change. For example, if the current timestamp is 'x' and a `DelayedPublicMutable` state variable with a delay of 3000 seconds has a value change scheduled for timestamp 'x + 50', then transactions that read this value privately will set `include_by_timestamp` to 'x + 50 - 1'. Since the timestamps at which `DelayedPublicMutable` state values change are public, it might be deduced that transactions with an `include_by_timestamp` value close to the current timestamp are reading some state variable with a changed scheduled at `include_by_timestamp + 1`.

Applications that schedule value changes at the same time will therefore be part of the same privacy set. It is expected for social coordination to result in ways to achieve this, e.g. by scheduling value changes so that they land on timestamps that are multiples of some value - we call these epochs.

There is a tradeoff between frequent and infrequent epochs: frequent epochs means more of them, and therefore fewer updates on each, shrinking the privacy set. But infrequent epochs result in the effective delay of value changes being potentially larger than desired - though an application can always choose to do an out-of-epoch update if needed.

Note that wallets can also warn users that a value change will soon take place and that sending a transaction at that time might result in reduced privacy, allowing them to choose to wait until after the epoch.

### Network Cooperation

Even though only transactions that interact with `DelayedPublicMutable` state _need_ to set the `include_by_timestamp` property, there is no reason why transactions that do not wouldn't also set this value. If indeed most applications converge on a small set of delays, then wallets could opt to select any of those to populate the `include_by_timestamp` field, as if they were interacting with a `DelayedPublicMutable` state variable with that delay.

This prevents the network-wide privacy set from being split between transactions that read `DelayedPublicMutable` state and those that don't, which is beneficial to everyone.

### DelayedPublicMutable

`DelayedPublicMutable` provides capabilities to read the same state both in private and public, and to schedule value changes after a delay. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/aztec/src/state_vars/delayed_public_mutable/delayed_public_mutable.nr).

Unlike other state variables, `DelayedPublicMutable` receives not only a type parameter for the underlying datatype, but also a `DELAY` type parameter with the value change delay as a number of seconds.

```rust title="delayed_public_mutable_storage" showLineNumbers 
authorized: DelayedPublicMutable<AztecAddress, CHANGE_AUTHORIZED_DELAY, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L22-L24" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L22-L24</a></sub></sup>


:::note
`DelayedPublicMutable` requires that the underlying type `T` implements both the `ToField` and `FromField` traits, meaning it must fit in a single `Field` value. There are plans to extend support by requiring instead an implementation of the `Serialize` and `Deserialize` traits, therefore allowing for multi-field variables, such as complex structs.
:::

Since `DelayedPublicMutable` lives in public storage, by default its contents are zeroed-out. Intialization is performed by calling `schedule_value_change`, resulting in initialization itself being delayed.

### `schedule_value_change`

This is the means by which a `DelayedPublicMutable` variable mutates its contents. It schedules a value change for the variable at a future timestamp after the `DELAY` has elapsed from the current timestamp, at which point the scheduled value becomes the current value automatically and without any further action, both in public and in private. If a pending value change was scheduled but not yet effective (because insufficient time had elapsed), then the previous schedule value change is replaced with the new one and eliminated. There can only be one pending value change at a time.

This function can only be called in public, typically after some access control check:

```rust title="delayed_public_mutable_schedule" showLineNumbers 
#[public]
fn set_authorized(authorized: AztecAddress) {
    assert_eq(storage.admin.read(), context.msg_sender(), "caller is not admin");
    storage.authorized.schedule_value_change(authorized);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L34-L39" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L34-L39</a></sub></sup>


If one wishes to schedule a value change from private, simply enqueue a public call to a public `internal` contract function. Recall that **all scheduled value changes, including the new value and scheduled timestamp are public**.

:::warning
A `DelayedPublicMutable`'s storage **must** only be mutated via `schedule_value_change`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

### `get_current_value`

Returns the current value in a public, private or utility execution context. Once a value change is scheduled via `schedule_value_change` and the delay time passes, this automatically returns the new value.

```rust title="delayed_public_mutable_get_current_public" showLineNumbers 
storage.authorized.get_current_value()
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L46-L48" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L46-L48</a></sub></sup>


Also, calling in private will set the `include_by_timestamp` property of the transaction request, introducing a new validity condition to the entire transaction: it cannot be included in any block with a timestamp larger than `include_by_timestamp`. This could [potentially leak some privacy](#privacy-considerations).

```rust title="delayed_public_mutable_get_current_private" showLineNumbers 
let authorized = storage.authorized.get_current_value();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L77-L79" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L77-L79</a></sub></sup>


### `get_scheduled_value`

Returns the last scheduled value change, along with the timestamp at which the scheduled value becomes the current value. This may either be a pending change, if the timestamp is in the future, or the last executed scheduled change if the timestamp is in the past (in which case there are no pending changes).

```rust title="delayed_public_mutable_get_scheduled_public" showLineNumbers 
storage.authorized.get_scheduled_value()
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L55-L57" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L55-L57</a></sub></sup>


It is not possible to call this function in private: doing so would not be very useful at it cannot be asserted that a scheduled value change will not be immediately replaced if `shcedule_value_change` where to be called.
