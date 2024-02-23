---
title: Private State
---

On this page we will look at how to manage private state in Aztec contracts. We will look at how to declare private state, how to read and write to it, and how to use it in your contracts.

For a higher level overview of the state model in Aztec, see the [hybrid state model](../../../../learn/concepts/hybrid_state/main.md) page, or jump back to the previous page on [Storage](./main.md).

## Overview

In contrast to public state, private state is persistent state that is **not** visible to the whole world. Depending on the logic of the smart contract, a private state variable's current value will only be known to one entity, or a closed group of entities.

The value of a private state variable can either be shared via an [encrypted log](../../writing_contracts/events/emit_event.md#encrypted-events), or offchain via web2, or completely offline: it's up to the app developer.

Aztec private state follows a [utxo](https://en.wikipedia.org/wiki/Unspent_transaction_output)-based model. That is, a private state's current value is represented as one or many [notes](#notes). Each note is stored as an individual leaf in a utxo-based merkle tree: the [private state tree](../../../../learn/concepts/storage/trees/main.md).

To greatly simplify the experience of writing private state, Aztec.nr provides three different types of private state variable:

- [Singleton<NoteType\>](#singletonnotetype)
- [ImmutableSingleton<NoteType\>](#immutablesingletonnotetype)
- [Set<NoteType\>](#setnotetype)

These three structs abstract-away many of Aztec's protocol complexities, by providing intuitive methods to modify notes in the utxo tree in a privacy-preserving way.

:::info
An app can also choose to emit data via unencrypted log, or to define a note whose data is easy to figure out, then the information is technically not private and could be visible to anyone.
:::

### Notes

Unlike public state variables, which can be arbitrary types, private state variables operate on `NoteType`.

Notes are the fundamental elements in the private world.

A note should implement the following traits:

#include_code note_interface /noir-projects/aztec-nr/aztec/src/note/note_interface.nr rust

#include_code serialize /noir-projects/noir-protocol-circuits/src/crates/types/src/traits.nr rust

#include_code deserialize /noir-projects/noir-protocol-circuits/src/crates/types/src/traits.nr rust

The interplay between a private state variable and its notes can be confusing. Here's a summary to aid intuition:

A private state variable (of type `Singleton`, `ImmutableSingleton` or `Set`) may be declared in storage.

Every note contains a header, which contains the contract address and storage slot of the state variable to which it is associated. A note is associated with a private state variable if the storage slot of the private state variable matches the storage slot contained in the note's header. The header provides information that helps the user interpret the note's data.

Management of the header is abstracted-away from developers who use the `ImmutableSingleton`, `Singleton` and `Set` types.

A private state variable points to one or many notes (depending on the type). The note(s) are all valid private state if the note(s) haven't yet been nullified.

An `ImmutableSingleton` will point to _one_ note over the lifetime of the contract. This note is a struct of information that is persisted forever.

A `Singleton` may point to _one_ note at a time. But since it's not "immutable", the note that it points to may be [replaced](#replace) by functions of the contract. The current value of a `Singleton` is interpreted as the one note which has not-yet been nullified. The act of replacing a Singleton's note is how a `Singleton` state may be modified by functions.

`Singleton` is a useful type when declaring a private state variable which may only ever be modified by those who are privy to the current value of that state.

A `Set` may point to _multiple_ notes at a time. The "current value" of a private state variable of type `Set` is some accumulation of all not-yet nullified notes which belong to the `Set`.

:::note
The term "some accumulation" is intentionally vague. The interpretation of the "current value" of a `Set` must be expressed by the smart contract developer. A common use case for a `Set` is to represent the sum of a collection of values (in which case 'accumulation' is 'summation').

Think of a ZCash balance (or even a Bitcoin balance). The "current value" of a user's ZCash balance is the sum of all unspent (not-yet nullified) notes belonging to that user. To modify the "current value" of a `Set` state variable, is to [`insert`](#insert) new notes into the `Set`, or [`remove`](#remove) notes from that set.
:::

Interestingly, if a developer requires a private state to be modifiable by users who _aren't_ privy to the value of that state, a `Set` is a very useful type. The `insert` method allows new notes to be added to the `Set` without knowing any of the other notes in the set! (Like posting an envelope into a post box, you don't know what else is in there!).

## `Singleton<NoteType>`

Singleton is a private state variable that is unique in a way. When a Singleton is initialized, a note is created to represent its value. And the way to update the value is to destroy the current note, and create a new one with the updated value.

Like for public state, we define the struct to have context and a storage slot. You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/state_vars/singleton.nr).

An example of singleton usage in the account contracts is keeping track of public keys. The `Singleton` is added to the `Storage` struct as follows:

#include_code storage-singleton-declaration /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `new`

As part of the initialization of the `Storage` struct, the `Singleton` is created as follows at the specified storage slot.

#include_code start_vars_singleton /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `initialize`

As mentioned, the Singleton is initialized to create the first note and value.

When this function is called, a nullifier of the storage slot is created, preventing this Singleton from being initialized again.

:::danger Privacy-Leak
Beware that because this nullifier is created only from the storage slot without randomness it leaks privacy. This means that it is possible for an external observer to determine when the note is nullified.

For example, if the storage slot depends on the an address then it is possible to link the nullifier to the address. If the singleton is part of a `map` with an `AztecAddress` as the key then the nullifier will be linked to the address.
:::

Unlike public states, which have a default initial value of `0` (or many zeros, in the case of a struct, array or map), a private state (of type `Singleton`, `ImmutableSingleton` or `Set`) does not have a default initial value. The `initialize` method (or `insert`, in the case of a `Set`) must be called.

:::info
Extend on what happens if you try to use non-initialized state.
:::

### `is_initialized`

An unconstrained method to check whether the Singleton has been initialized or not. It takes an optional owner and returns a boolean. You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/singleton.nr).

#include_code singleton_is_initialized /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `replace`

To update the value of a `Singleton`, we can use the `replace` method. The method takes a new note as input, and replaces the current note with the new one. It emits a nullifier for the old value, and inserts the new note into the data tree.

An example of this is seen in a example card game, where we create a new note (a `CardNote`) containing some new data, and replace the current note with it:

#include_code state_vars-SingletonReplace /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

If two people are trying to modify the Singleton at the same time, only one will succeed as we don't allow duplicate nullifiers! Developers should put in place appropriate access controls to avoid race conditions (unless a race is intended!).

### `get_note`

This function allows us to get the note of a Singleton, essentially reading the value.

#include_code state_vars-SingletonGet /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### Nullifying Note reads

To ensure that a user's private execution always uses the latest value of a Singleton, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed (no duplicate nullifiers allowed).

This also makes read operations indistinguishable from write operations and allows the sequencer to verifying correct execution without learning anything about the value of the note.

### `view_note`

Functionally similar to [`get_note`](#get_note), but executed in unconstrained functions and can be used by the wallet to fetch notes for use by front-ends etc.

## `ImmutableSingleton<NoteType>`

`ImmutableSingleton` represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/immutable_singleton.nr).

### `new`

As part of the initialization of the `Storage` struct, the `Singleton` is created as follows, here at storage slot 1.

#include_code storage-immutable-singleton-declaration /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `initialize`

When this function is invoked, it creates a nullifier for the storage slot, ensuring that the ImmutableSingleton cannot be initialized again.

:::danger Privacy-Leak
Beware that because this nullifier is created only from the storage slot without randomness it leaks privacy. This means that it is possible for an external observer to determine when the note is nullified.

For example, if the storage slot depends on the an address then it is possible to link the nullifier to the address. If the singleton is part of a `map` with an `AztecAddress` as the key then the nullifier will be linked to the address.
:::

Set the value of an ImmutableSingleton by calling the `initialize` method:

#include_code initialize-immutable-singleton /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Once initialized, an ImmutableSingleton's value remains unchangeable. This method can only be called once.

### `is_initialized`

An unconstrained method to check if the ImmutableSingleton has been initialized. Takes an optional owner and returns a boolean. You can find the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/immutable_singleton.nr).

### `get_note`

Similar to the `Singleton`, we can use the `get_note` method to read the value of an ImmutableSingleton.

Use this method to retrieve the value of an initialized ImmutableSingleton.

#include_code get_note-immutable-singleton /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

Unlike a `Singleton`, the `get_note` function for an ImmutableSingleton doesn't nullify the current note in the background. This means that multiple accounts can concurrently call this function to read the value.

This function will throw if the `ImmutableSingleton` hasn't been initialized.

### `view_note`

Functionally similar to `get_note`, but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

## `Set<NoteType>`

Set is used for managing a collection of notes. All notes in a Set are of the same `NoteType`. But whether these notes all belong to one entity, or are accessible and editable by different entities, is up to the developer. The set is a collection of notes inserted into the data-tree, but notes are never removed from the tree itself, they are only nullified.

You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/state_vars/set.nr).

And can be added to the `Storage` struct as follows. Here adding a set for a custom note, the TransparentNote (useful for [public -> private communication](../../writing_contracts/functions/call_functions.md)).

#include_code storage-set-declaration /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `new`

The `new` method tells the contract how to operate on the underlying storage.

We can initialize the set as follows:

#include_code storage-set-init /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust

### `insert`

Allows us to modify the storage by inserting a note into the set.

A hash of the note will be generated, and inserted into the note hash tree, allowing us to later use in contract interactions. Recall that the content of the note should be shared with the owner to allow them to use it, as mentioned this can be done via an [encrypted log](../../writing_contracts/events/emit_event.md#encrypted-events), or offchain via web2, or completely offline.

#include_code insert /noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr rust

### `insert_from_public`

The `insert_from_public` allow public function to insert notes into private storage. This is very useful when we want to support private function calls that have been initiated in public, such as shielding in the [example token contract](../../../tutorials/writing_token_contract.md#shield).

The usage is similar to using the `insert` method with the difference that this one is called in public functions.

#include_code insert_from_public /noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

### `remove`

Will remove a note from the set if it previously has been read from storage, e.g. you have fetched it through a `get_notes` call. This is useful when you want to remove a note that you have previously read from storage and do not have to read it again.

Nullifiers are emitted when reading values to make sure that they are up to date.

An example of how to use this operation is visible in the `easy_private_state`:

#include_code remove /noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr rust

### `get_notes`

This function returns the notes the account has access to.

The kernel circuits are constrained to a maximum number of notes this function can return at a time. Check [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/src/crates/types/src/constants.nr) and look for `MAX_READ_REQUESTS_PER_CALL` for the up-to-date number.

Because of this limit, we should always consider using the second argument `NoteGetterOptions` to limit the number of notes we need to read and constrain in our programs. This is quite important as every extra call increases the time used to prove the program and we don't want to spend more time than necessary.

An example of such options is using the [filter_notes_min_sum](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/value-note/src/filter.nr) to get "enough" notes to cover a given value. Essentially, this function will return just enough notes to cover the amount specified such that we don't need to read all our notes. For users with a lot of notes, this becomes increasingly important.

#include_code get_notes /noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr rust

### `view_notes`

Functionally similar to [`get_notes`](#get_notes), but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

#include_code view_notes /noir-projects/aztec-nr/value-note/src/balance_utils.nr rust

There's also a limit on the maximum number of notes that can be returned in one go. To find the current limit, refer to [this file](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-protocol-circuits/src/crates/types/src/constants.nr) and look for `MAX_NOTES_PER_PAGE`.

The key distinction is that this method is unconstrained. It does not perform a check to verify if the notes actually exist, which is something the [`get_notes`](#get_notes) method does under the hood. Therefore, it should only be used in an unconstrained contract function.

This function requires a `NoteViewerOptions`. The `NoteViewerOptions` is essentially similar to the [`NoteGetterOptions`](#notegetteroptions), except that it doesn't take a custom filter.

## `NoteGetterOptions`

`NoteGetterOptions` encapsulates a set of configurable options for filtering and retrieving a selection of notes from a [data oracle](../../writing_contracts/oracles/main.md). Developers can design instances of `NoteGetterOptions`, to determine how notes should be filtered and returned to the functions of their smart contracts.

You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_getter_options.nr).

### `selects: BoundedVec<Option<Select>, N>`

`selects` is a collection of filtering criteria, specified by `Select { field_index: u8, value: Field, comparator: u3 }` structs. It instructs the data oracle to find notes whose (`field_index`)th field matches the provided `value`, according to the `comparator`.

### `sorts: BoundedVec<Option<Sort>, N>`

`sorts` is a set of sorting instructions defined by `Sort { field_index: u8, order: u2 }` structs. This directs the data oracle to sort the matching notes based on the value of the specified field index and in the indicated order. The value of order is **1** for _DESCENDING_ and **2** for _ASCENDING_.

### `limit: u32`

When the `limit` is set to a non-zero value, the data oracle will return a maximum of `limit` notes.

### `offset: u32`

This setting enables us to skip the first `offset` notes. It's particularly useful for pagination.

### `filter: fn ([Option<Note>; MAX_READ_REQUESTS_PER_CALL], FILTER_ARGS) -> [Option<Note>; MAX_READ_REQUESTS_PER_CALL]`

Developers have the option to provide a custom filter. This allows specific logic to be applied to notes that meet the criteria outlined above. The filter takes the notes returned from the oracle and `filter_args` as its parameters.

It's important to note that the process of applying the custom filter to get the final notes is not constrained. It's crucial to verify the returned notes even if certain assumptions are made in the custom filter.

### `filter_args: FILTER_ARGS`

`filter_args` provides a means to furnish additional data or context to the custom filter.

### `status: u2`

`status` allows the caller to retrieve notes that have been nullified, which can be useful to prove historical data. Note that when querying for both active and nullified notes the caller cannot know if each note retrieved has or has not been nullified.

### Methods

Several methods are available on `NoteGetterOptions` to construct the options in a more readable manner:

### `fn new() -> NoteGetterOptions<Note, N, Field>`

This function initializes a `NoteGetterOptions` that simply returns the maximum number of notes allowed in a call.

### `fn with_filter(filter, filter_args) -> NoteGetterOptions<Note, N, FILTER_ARGS>`

This function initializes a `NoteGetterOptions` with a [`filter`](#filter-fn-optionnote-max_read_requests_per_call-filter_args---optionnote-max_read_requests_per_call) and [`filter_args`](#filter_args-filter_args).

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

The following code snippet creates an instance of `NoteGetterOptions`, which has been configured to find the cards that belong to `account_address`. The returned cards are sorted by their points in descending order, and the first `offset` cards with the highest points are skipped.

#include_code state_vars-NoteGetterOptionsSelectSortOffset /noir-projects/noir-contracts/contracts/docs_example_contract/src/options.nr rust

The first value of `.select` and `.sort` is the index of a field in a note type. For the note type `CardNote` that has the following fields:

#include_code state_vars-CardNote /noir-projects/noir-contracts/contracts/docs_example_contract/src/types/card_note.nr rust

The indices are: 0 for `points`, 1 for `secret`, and 2 for `owner`.

In the example, `.select(2, account_address, Option::none())` matches the 2nd field of `CardNote`, which is `owner`, and returns the cards whose `owner` field equals `account_address`, equality is the comparator used because because including no comparator (the third argument) defaults to using the equality comparator. The current possible values of Comparator are specified in the Note Getter Options implementation linked above.

`.sort(0, SortOrder.DESC)` sorts the 0th field of `CardNote`, which is `points`, in descending order.

There can be as many conditions as the number of fields a note type has. The following example finds cards whose fields match the three given values:

#include_code state_vars-NoteGetterOptionsMultiSelects /noir-projects/noir-contracts/contracts/docs_example_contract/src/options.nr rust

While `selects` lets us find notes with specific values, `filter` lets us find notes in a more dynamic way. The function below picks the cards whose points are at least `min_points`, although this now can be done by using the select function with a GTE comparator:

#include_code state_vars-OptionFilter /noir-projects/noir-contracts/contracts/docs_example_contract/src/options.nr rust

We can use it as a filter to further reduce the number of the final notes:

#include_code state_vars-NoteGetterOptionsFilter /noir-projects/noir-contracts/contracts/docs_example_contract/src/options.nr rust

One thing to remember is, `filter` will be applied on the notes after they are picked from the database, so it is more efficient to use select with comparators where possible. Another side effect of this is that it's possible that the actual notes we end up getting are fewer than the limit.

The limit is `MAX_READ_REQUESTS_PER_CALL` by default. But we can set it to any value **smaller** than that:

#include_code state_vars-NoteGetterOptionsPickOne /noir-projects/noir-contracts/contracts/docs_example_contract/src/options.nr rust

#### Example 2

An example of how we can use a Comparator to select notes when calling a Noir contract from aztec.js is below.

#include_code state_vars-NoteGetterOptionsComparatorExampleTs /yarn-project/end-to-end/src/e2e_note_getter.test.ts typescript

In this example, we use the above typescript code to invoke a call to our Noir contract below. This Noir contract function takes an input to match with, and a comparator to use when fetching and selecting notes from storage.

#include_code state_vars-NoteGetterOptionsComparatorExampleNoir /noir-projects/noir-contracts/contracts/docs_example_contract/src/main.nr rust
