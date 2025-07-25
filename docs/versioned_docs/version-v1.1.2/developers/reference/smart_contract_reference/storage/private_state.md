---
title: Private State
---

On this page we will look at how to manage private state in Aztec contracts. We will look at how to declare private state, how to read and write to it, and how to use it in your contracts.

For a higher level overview of the state model in Aztec, see the [hybrid state model](../../../../aztec/concepts/storage/state_model.md) page.

## Overview

In contrast to public state, private state is persistent state that is **not** visible to the whole world. Depending on the logic of the smart contract, a private state variable's current value will only be known to one entity, or a closed group of entities.

The value of a private state variable can either be shared via an encrypted log, or offchain via web2, or completely offline: it's up to the app developer.

Aztec private state follows a [UTXO](https://en.wikipedia.org/wiki/Unspent_transaction_output)-based model. That is, a private state's current value is represented as one or many notes.

To greatly simplify the experience of writing private state, Aztec.nr provides three different types of private state variable:

- [PrivateMutable\<NoteType\>](#privatemutablenotetype)
- [PrivateImmutable\<NoteType\>](#privateimmutablenotetype)
- [PrivateSet\<NoteType\>](#privatesetnotetype)

These three structs abstract-away many of Aztec's protocol complexities, by providing intuitive methods to modify notes in the utxo tree in a privacy-preserving way.

:::info
An app can also choose to emit data via unencrypted log, or to define a note whose data is easy to figure out, then the information is technically not private and could be visible to anyone.
:::

### Notes

Unlike public state variables, which can be arbitrary types, private state variables operate on `NoteType`.

Notes are the fundamental elements in the private world.

A note has to implement the following traits:

```rust title="note_interfaces" showLineNumbers 
pub trait NoteType {
    /// Returns the unique identifier for the note type. This is typically used when processing note logs.
    fn get_id() -> Field;
}

pub trait NoteHash {
    /// Returns the non-siloed note hash, i.e. the inner hash computed by the contract during private execution. Note
    /// hashes are later siloed by contract address and hashed with note nonce by the kernels before being committed to
    /// the state tree.
    ///
    /// This should be a commitment to the packed note, including the storage slot (for indexing) and some random
    /// value (to prevent brute force trial-hashing attacks).
    fn compute_note_hash(self, storage_slot: Field) -> Field;

    /// Returns the non-siloed nullifier (also called inner-nullifier), which will be later siloed by contract address
    /// by the kernels before being committed to the state tree.
    ///
    /// This function MUST be called with the correct note hash for consumption! It will otherwise silently fail and
    /// compute an incorrect value. The reason why we receive this as an argument instead of computing it ourselves
    /// directly is because the caller will typically already have computed this note hash, and we can reuse that value
    /// to reduce the total gate count of the circuit.
    ///
    /// This function receives the context since nullifier computation typically involves proving nullifying keys, and
    /// we require the kernel's assistance to do this in order to prevent having to reveal private keys to application
    /// circuits.
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field;

    /// Like `compute_nullifier`, except this variant is unconstrained: there are no guarantees on the returned value
    /// being correct. Because of that it doesn't need to take a context (since it won't perform any kernel key
    /// validation requests).
    unconstrained fn compute_nullifier_unconstrained(self, note_hash_for_nullify: Field) -> Field;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/note/note_interface.nr#L5-L38" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/note/note_interface.nr#L5-L38</a></sub></sup>


The interplay between a private state variable and its notes can be confusing. Here's a summary to aid intuition:

A private state variable (of type `PrivateMutable`, `PrivateImmutable` or `PrivateSet`) may be declared in storage and the purpose of private state variables is to manage notes (inserting their note hashes into the note hash tree, obtaining the notes, grouping the notes together using the storage slot etc.).

:::info
Note that storage slots in private state are not real.
They do not point to a specific leaf in a merkle tree (as is the case in public).
Instead, in the case of notes they can be understood only as a tag that is used to associate notes with a private state variable.
The state variable storage slot can commonly represent an owner, as is the case when using the `at(...)` function of a `Map<>` with an `AztecAddress` as the key.
:::

A private state variable points to one or many notes (depending on the type). The note(s) are all valid private state if the note(s) haven't yet been nullified.

An `PrivateImmutable` will point to _one_ note over the lifetime of the contract. This note is a struct of information that is persisted forever.

A `PrivateMutable` may point to _one_ note at a time. But since it's not "immutable", the note that it points to may be [replaced](#replace) by functions of the contract. The current value of a `PrivateMutable` is interpreted as the one note which has not-yet been nullified. The act of replacing a PrivateMutable's note is how a `PrivateMutable` state may be modified by functions.

`PrivateMutable` is a useful type when declaring a private state variable which may only ever be modified by those who are privy to the current value of that state.

A `PrivateSet` may point to _multiple_ notes at a time. The "current value" of a private state variable of type `PrivateSet` is some accumulation of all not-yet nullified notes which belong to the `PrivateSet`.

:::note
The term "some accumulation" is intentionally vague. The interpretation of the "current value" of a `PrivateSet` must be expressed by the smart contract developer. A common use case for a `PrivateSet` is to represent the sum of a collection of values (in which case 'accumulation' is 'summation').

Think of a ZCash balance (or even a Bitcoin balance). The "current value" of a user's ZCash balance is the sum of all unspent (not-yet nullified) notes belonging to that user. To modify the "current value" of a `PrivateSet` state variable, is to [`insert`](#insert) new notes into the `PrivateSet`, or [`remove`](#remove) notes from that set.
:::

Interestingly, if a developer requires a private state to be modifiable by users who _aren't_ privy to the value of that state, a `PrivateSet` is a very useful type. The `insert` method allows new notes to be added to the `PrivateSet` without knowing any of the other notes in the set! (Like posting an envelope into a post box, you don't know what else is in there!).

## `PrivateMutable<NoteType>`

PrivateMutable (formerly known as `Singleton`) is a private state variable that is unique in a way. When a PrivateMutable is initialized, a note is created to represent its value. And the way to update the value is to destroy the current note, and create a new one with the updated value.

Like for public state, we define the struct to have context and a storage slot. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/state_vars/private_mutable.nr).

An example of `PrivateMutable` usage in the account contracts is keeping track of public keys. The `PrivateMutable` is added to the `Storage` struct as follows:

```rust title="storage-private-mutable-declaration" showLineNumbers 
legendary_card: PrivateMutable<CardNote, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L30-L32" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L30-L32</a></sub></sup>


### `new`

As part of the initialization of the `Storage` struct, the `PrivateMutable` is created as follows at the specified storage slot.

```rust title="start_vars_private_mutable" showLineNumbers 
legendary_card: PrivateMutable::new(context, 3),
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L57-L59" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L57-L59</a></sub></sup>


### `initialize`

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

### `is_initialized`

An unconstrained method to check whether the PrivateMutable has been initialized or not. It takes an optional owner and returns a boolean. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/state_vars/private_mutable.nr).

```rust title="private_mutable_is_initialized" showLineNumbers 
#[utility]
unconstrained fn is_legendary_initialized() -> bool {
    storage.legendary_card.is_initialized()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L139-L144" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L139-L144</a></sub></sup>


### `replace`

To update the value of a `PrivateMutable`, we can use the `replace` method. The method takes a new note as input, and replaces the current note with the new one. It emits a nullifier for the old value, and inserts the new note into the data tree.

An example of this is seen in a example card game, where we create a new note (a `CardNote`) containing some new data, and replace the current note with it:

```rust title="state_vars-PrivateMutableReplace" showLineNumbers 
storage.legendary_card.replace(new_card).emit(encode_and_encrypt_note(
    &mut context,
    context.msg_sender(),
    context.msg_sender(),
));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L130-L136" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L130-L136</a></sub></sup>


If two people are trying to modify the PrivateMutable at the same time, only one will succeed as we don't allow duplicate nullifiers! Developers should put in place appropriate access controls to avoid race conditions (unless a race is intended!).

### `get_note`

This function allows us to get the note of a PrivateMutable, essentially reading the value.

```rust title="state_vars-PrivateMutableGet" showLineNumbers 
let card = storage.legendary_card.get_note().note;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L124-L126" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L124-L126</a></sub></sup>


#### Nullifying Note reads

To ensure that a user's private execution always uses the latest value of a PrivateMutable, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed (no duplicate nullifiers allowed).

This also makes read operations indistinguishable from write operations and allows the sequencer to verifying correct execution without learning anything about the value of the note.

### `view_note`

Functionally similar to [`get_note`](#get_note), but executed in unconstrained functions and can be used by the wallet to fetch notes for use by front-ends etc.

## `PrivateImmutable<NoteType>`

`PrivateImmutable` (formerly known as `ImmutableSingleton`) represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/state_vars/private_immutable.nr).

### `new`

As part of the initialization of the `Storage` struct, the `PrivateMutable` is created as follows, here at storage slot 1.

```rust title="storage-private-immutable-declaration" showLineNumbers 
private_immutable: PrivateImmutable<CardNote, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L38-L40" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L38-L40</a></sub></sup>


### `initialize`

When this function is invoked, it creates a nullifier for the storage slot, ensuring that the PrivateImmutable cannot be initialized again.

:::danger Privacy-Leak
Beware that because this nullifier is created only from the storage slot without randomness it leaks privacy. This means that it is possible for an external observer to determine when the note is nullified.

For example, if the storage slot depends on the an address then it is possible to link the nullifier to the address. If the PrivateImmutable is part of a `map` with an `AztecAddress` as the key then the nullifier will be linked to the address.
:::

Set the value of an PrivateImmutable by calling the `initialize` method:

```rust title="initialize-private-mutable" showLineNumbers 
#[private]
fn initialize_private_immutable(randomness: Field, points: u8) {
    let new_card = CardNote::new(points, randomness, context.msg_sender());

    storage.private_immutable.initialize(new_card).emit(encode_and_encrypt_note(
        &mut context,
        context.msg_sender(),
        context.msg_sender(),
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L99-L110" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L99-L110</a></sub></sup>


Once initialized, an PrivateImmutable's value remains unchangeable. This method can only be called once.

### `is_initialized`

An unconstrained method to check if the PrivateImmutable has been initialized. Takes an optional owner and returns a boolean. You can find the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/state_vars/private_immutable.nr).

### `get_note`

Similar to the `PrivateMutable`, we can use the `get_note` method to read the value of an PrivateImmutable.

Use this method to retrieve the value of an initialized PrivateImmutable.

```rust title="get_note-private-immutable" showLineNumbers 
#[private]
fn get_imm_card() -> CardNote {
    storage.private_immutable.get_note()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L146-L151" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L146-L151</a></sub></sup>


Unlike a `PrivateMutable`, the `get_note` function for an PrivateImmutable doesn't nullify the current note in the background. This means that multiple accounts can concurrently call this function to read the value.

This function will throw if the `PrivateImmutable` hasn't been initialized.

### `view_note`

Functionally similar to `get_note`, but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

## `PrivateSet<NoteType>`

`PrivateSet` is used for managing a collection of notes. All notes in a `PrivateSet` are of the same `NoteType`. But whether these notes all belong to one entity, or are accessible and editable by different entities, is up to the developer. The set is a collection of notes inserted into the data-tree, but notes are never removed from the tree itself, they are only nullified.

You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/state_vars/private_set.nr).

And can be added to the `Storage` struct as follows. Here adding a set for a custom note.

```rust title="storage-set-declaration" showLineNumbers 
set: PrivateSet<CardNote, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L35-L37" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L35-L37</a></sub></sup>


### `new`

The `new` method tells the contract how to operate on the underlying storage.

We can initialize the set as follows:

```rust title="storage-set-init" showLineNumbers 
set: PrivateSet::new(context, 5),
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L68-L70" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L68-L70</a></sub></sup>


### `insert`

Allows us to modify the storage by inserting a note into the `PrivateSet`.

A hash of the note will be generated, and inserted into the note hash tree, allowing us to later use in contract interactions. Recall that the content of the note should be shared with the owner to allow them to use it, as mentioned this can be done via an encrypted log or offchain via web2, or completely offline.

```rust title="insert" showLineNumbers 
self.set.insert(addend_note).emit(encode_and_encrypt_note(self.context, owner, sender));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L36-L38" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L36-L38</a></sub></sup>


### `insert_from_public`

The `insert_from_public` allow public function to insert notes into private storage. This is very useful when we want to support private function calls that have been initiated in public.

The usage is similar to using the `insert` method with the difference that this one is called in public functions.

### `pop_notes`

This function pops (gets, removes and returns) the notes the account has access to based on the provided filter.

The kernel circuits are constrained to a maximum number of notes this function can return at a time. Check [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr) and look for `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` for the up-to-date number.

Because of this limit, we should always consider using the second argument `NoteGetterOptions` to limit the number of notes we need to read and constrain in our programs. This is quite important as every extra call increases the time used to prove the program and we don't want to spend more time than necessary.

An example of such options is using the [filter_notes_min_sum (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/value-note/src/filter.nr) to get "enough" notes to cover a given value. Essentially, this function will return just enough notes to cover the amount specified such that we don't need to read all our notes. For users with a lot of notes, this becomes increasingly important.

```rust title="pop_notes" showLineNumbers 
let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend as Field);
let notes = self.set.pop_notes(options);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L43-L46" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr#L43-L46</a></sub></sup>


### `get_notes`

This function has the same behavior as `pop_notes` above but it does not delete the notes.

### `remove`

Will remove a note from the `PrivateSet` if it previously has been read from storage, e.g. you have fetched it through a `get_notes` call. This is useful when you want to remove a note that you have previously read from storage and do not have to read it again.

Note that if you obtained the note you are about to remove via `get_notes` it's much better to use `pop_notes` as `pop_notes` results in significantly fewer constraints since it doesn't need to check that the note has been previously read, as it reads and deletes at once.

### `view_notes`

Functionally similar to [`get_notes`](#get_notes), but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

```rust title="view_notes" showLineNumbers 
let mut options = NoteViewerOptions::new();
let notes = set.view_notes(options.set_offset(offset));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/value-note/src/balance_utils.nr#L15-L18" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/balance_utils.nr#L15-L18</a></sub></sup>


There's also a limit on the maximum number of notes that can be returned in one go. To find the current limit, refer to [this file (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/note/constants.nr) and look for `MAX_NOTES_PER_PAGE`.

The key distinction is that this method is unconstrained. It does not perform a check to verify if the notes actually exist, which is something the [`get_notes`](#get_notes) method does under the hood. Therefore, it should only be used in an unconstrained contract function.

This function requires a `NoteViewerOptions`. The `NoteViewerOptions` is essentially similar to the [`NoteGetterOptions`](#notegetteroptions), except that it doesn't take a custom filter.

## `NoteGetterOptions`

`NoteGetterOptions` encapsulates a set of configurable options for filtering and retrieving a selection of notes from a data oracle. Developers can design instances of `NoteGetterOptions`, to determine how notes should be filtered and returned to the functions of their smart contracts.

You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/aztec-nr/aztec/src/note/note_getter_options.nr).

### `selects: BoundedVec<Option<Select>, N>`

`selects` is a collection of filtering criteria, specified by `Select { property_selector: PropertySelector, comparator: u8, value: Field }` structs. It instructs the data oracle to find notes whose serialized field (as specified by the `PropertySelector`) matches the provided `value`, according to the `comparator`. The PropertySelector is in turn specified as having an `index` (nth position of the selected field in the serialized note), an `offset` (byte offset inside the selected serialized field) and `length` (bytes to read of the field from the offset). These values are not expected to be manually computed, but instead specified by passing functions autogenerated from the note definition.

### `sorts: BoundedVec<Option<Sort>, N>`

`sorts` is a set of sorting instructions defined by `Sort { property_selector: PropertySelector, order: u2 }` structs. This directs the data oracle to sort the matching notes based on the value of the specified PropertySelector and in the indicated order. The value of order is **1** for _DESCENDING_ and **2** for _ASCENDING_.

### `limit: u32`

When the `limit` is set to a non-zero value, the data oracle will return a maximum of `limit` notes.

### `offset: u32`

This setting enables us to skip the first `offset` notes. It's particularly useful for pagination.

### `preprocessor: fn ([Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], PREPROCESSOR_ARGS) -> [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]`

Developers have the option to provide a custom preprocessor.
This allows specific logic to be applied to notes that meet the criteria outlined above.
The preprocessor takes the notes returned from the oracle and `preprocessor_args` as its parameters.

An important distinction from the filter function described below is that preprocessor is applied first and unlike filter it is applied in an unconstrained context.

### `preprocessor_args: PREPROCESSOR_ARGS`

`preprocessor_args` provides a means to furnish additional data or context to the custom preprocessor.

### `filter: fn ([Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]`

Just like preprocessor just applied in a constrained context (correct execution is proven) and applied after the preprocessor.

### `filter_args: FILTER_ARGS`

`filter_args` provides a means to furnish additional data or context to the custom filter.

### `status: u2`

`status` allows the caller to retrieve notes that have been nullified, which can be useful to prove historical data. Note that when querying for both active and nullified notes the caller cannot know if each note retrieved has or has not been nullified.

### Methods

Several methods are available on `NoteGetterOptions` to construct the options in a more readable manner:

### `fn new() -> NoteGetterOptions<Note, N, Field>`

This function initializes a `NoteGetterOptions` that simply returns the maximum number of notes allowed in a call.

### `fn with_filter(filter, filter_args) -> NoteGetterOptions<Note, N, FILTER_ARGS>`

This function initializes a `NoteGetterOptions` with a [`filter`](#filter-fn-optionnote-max_note_hash_read_requests_per_call-filter_args---optionnote-max_note_hash_read_requests_per_call) and [`filter_args`](#filter_args-filter_args).

### `.select`

This method adds a [`Select`](#selects-boundedvecoptionselect-n) criterion to the options.

### `.sort`

This method adds a [`Sort`](#sorts-boundedvecoptionsort-n) criterion to the options.

### `.set_limit`

This method lets you set a limit for the maximum number of notes to be retrieved.

### `.set_offset`

This method sets the offset value, which determines where to start retrieving notes.

### `.set_status`

This method sets the status of notes to retrieve (active or nullified).

### Examples

#### Example 1

The following code snippet creates an instance of `NoteGetterOptions`, which has been configured to find the cards that belong to an account with nullifying key hash equal to `account_npk_m_hash`. The returned cards are sorted by their points in descending order, and the first `offset` cards with the highest points are skipped.

```rust title="state_vars-NoteGetterOptionsSelectSortOffset" showLineNumbers 
pub fn create_npk_card_getter_options<let N: u32>(
    account: AztecAddress,
    offset: u32,
) -> NoteGetterOptions<CardNote, N, Field, Field>
where
    CardNote: Packable<N>,
{
    let mut options = NoteGetterOptions::new();
    options
        .select(CardNote::properties().owner, Comparator.EQ, account)
        .sort(CardNote::properties().points, SortOrder.DESC)
        .set_offset(offset)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L14-L28" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L14-L28</a></sub></sup>


The first value of `.select` and `.sort` indicates the property of the note we're looking for. For this we use helper functions that are autogenerated from the note definition. `CardNote` that has the following fields:

```rust title="state_vars-CardNote" showLineNumbers 
// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[note]
#[derive(Eq, Serialize, Deserialize)]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L6-L17" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L6-L17</a></sub></sup>


`CardNote::properties()` will return a struct with the values to pass for each field, which are related to their indices inside the `CardNote` struct, internal offset and length.

In the example, `.select(CardNote::properties().npk_m_hash, Comparator.EQ, account_npk_m_hash)` matches notes which have the `npk_m_hash` field set to `account_npk_m_hash`. In this case we're using the equality comparator, but other operations exist in the `Comparator` utility struct.

`.sort(0, SortOrder.DESC)` sorts the 0th field of `CardNote`, which is `points`, in descending order.

There can be as many conditions as the number of fields a note type has. The following example finds cards whose fields match the three given values:

```rust title="state_vars-NoteGetterOptionsMultiSelects" showLineNumbers 
pub fn create_exact_card_getter_options<let N: u32>(
    points: u8,
    secret: Field,
    account: AztecAddress,
) -> NoteGetterOptions<CardNote, N, Field, Field>
where
    CardNote: Packable<N>,
{
    let mut options = NoteGetterOptions::new();
    options
        .select(CardNote::properties().points, Comparator.EQ, points as Field)
        .select(CardNote::properties().randomness, Comparator.EQ, secret)
        .select(CardNote::properties().owner, Comparator.EQ, account)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L30-L45" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L30-L45</a></sub></sup>


While `selects` lets us find notes with specific values, `filter` lets us find notes in a more dynamic way. The function below picks the cards whose points are at least `min_points`, although this now can be done by using the select function with a GTE comparator:

```rust title="state_vars-OptionFilter" showLineNumbers 
pub fn filter_min_points(
    cards: [Option<RetrievedNote<CardNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_points: u8,
) -> [Option<RetrievedNote<CardNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected_cards = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut num_selected = 0;
    for i in 0..cards.len() {
        if cards[i].is_some() & cards[i].unwrap_unchecked().note.points >= min_points {
            selected_cards[num_selected] = cards[i];
            num_selected += 1;
        }
    }
    selected_cards
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L47-L62" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L47-L62</a></sub></sup>


We can use it as a filter to further reduce the number of the final notes:

```rust title="state_vars-NoteGetterOptionsFilter" showLineNumbers 
pub fn create_cards_with_min_points_getter_options<let N: u32>(
    min_points: u8,
) -> NoteGetterOptions<CardNote, N, Field, u8>
where
    CardNote: Packable<N>,
{
    NoteGetterOptions::with_filter(filter_min_points, min_points).sort(
        CardNote::properties().points,
        SortOrder.ASC,
    )
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L64-L76" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L64-L76</a></sub></sup>


One thing to remember is, `filter` will be applied on the notes after they are picked from the database, so it is more efficient to use select with comparators where possible. Another side effect of this is that it's possible that the actual notes we end up getting are fewer than the limit.

The limit is `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` by default. But we can set it to any value **smaller** than that:

```rust title="state_vars-NoteGetterOptionsPickOne" showLineNumbers 
pub fn create_largest_card_getter_options<let N: u32>() -> NoteGetterOptions<CardNote, N, Field, Field>
where
    CardNote: Packable<N>,
{
    let mut options = NoteGetterOptions::new();
    options.sort(CardNote::properties().points, SortOrder.DESC).set_limit(1)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L78-L86" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/options.nr#L78-L86</a></sub></sup>


#### Example 2

An example of how we can use a Comparator to select notes when calling a Noir contract from aztec.js is below.

```typescript title="state_vars-NoteGetterOptionsComparatorExampleTs" showLineNumbers 
contract.methods.read_note_values(Comparator.GTE, 5).simulate(),
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/yarn-project/end-to-end/src/e2e_note_getter.test.ts#L49-L51" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_note_getter.test.ts#L49-L51</a></sub></sup>


In this example, we use the above typescript code to invoke a call to our Noir contract below. This Noir contract function takes an input to match with, and a comparator to use when fetching and selecting notes from storage.

```rust title="state_vars-NoteGetterOptionsComparatorExampleNoir" showLineNumbers 
#[utility]
unconstrained fn read_note(comparator: u8, amount: Field) -> BoundedVec<CardNote, 10> {
    let mut options = NoteViewerOptions::new();
    storage.set.view_notes(options.select(CardNote::properties().points, comparator, amount))
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L112-L118" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/main.nr#L112-L118</a></sub></sup>

