# State Variables

State variables come in two flavours: [**public** state](#publicstatet-t_serialised_len) and [**private** state](#private-state-variables).

## `PublicState<T, T_SERIALISED_LEN>`

Public state is persistent state that is _publicly visible_ to anyone in the world.

For developers coming from other blockchain ecosystems (such as Ethereum), this will be a familiar concept, because there, _all_ state is _publicly visible_.

Aztec public state follows an account-based model. That is, each state occupies a leaf in an account-based merkle tree: the _public state tree_ (LINK). See here (LINK) for more of the technical details.

The `PublicState<T, T_SERIALISED_LEN>` struct serves as a wrapper around conventional Noir types `T`, allowing these types to be written to and read from the public state tree.

The Aztec stdlib provides serialization methods for some common types. Check [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-libs/noir-aztec/src/types/type_serialisation) for the complete list.

### `::new`

To declare a type `T` as a persistent, public state variable, use the `PublicState::new()` constructor.

In the following example, we define a public state with a boolean type:

#include_code state_vars-PublicState /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/locked.nr rust

### Custom types

It's possible to create a public state for any types. For example, to create a public state for the following struct:

#include_code state_vars-CustomStruct /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/types/queen.nr rust

First, define how to serialise and deserialise the struct. And then initialise the PublicState with it:

#include_code state_vars-PublicStateCustomStruct /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/queen.nr rust

### `.read`

Reading the currently-stored value of a public state variable is straightforward:

#include_code state_vars-PublicStateRead /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

It returns the type the public state was declared with. The above example returns a boolean. And the following example returns a custom struct.

#include_code state_vars-PublicStateReadCustom /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

### `.write`

The currently-stored value of a private state variable can be overwritten with `.write()`.

Due to the way public states are [declared](#new), a public state knows how to serialise a given value and store it in the protocol's public state tree.

We can pass the associated type directly to the `write()` method:

#include_code state_vars-PublicStateWrite /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust
#include_code state_vars-PublicStateWriteCustom /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

#### Writing before calling

**Important note:**
Before making a call to an external function, it is important to remember to `.write` state variables that have been edited, so as to persist their new values. This is particularly important if the call to the external function might result in re-entrancy into your contract, later in the transaction. If state variables aren't written before making such an external call, then upon re-entrancy, the 'current values' of your state variables will equal the values as at the start of the original function call.

E.g.

## Private State Variables

In contrast to public state, private state is persistent state that is _not_ visible to the whole world. Depending on the logic of the smart contract, a _private_ state variable's current value will only be known to one entity, or a closed group of entities.

The value of a private state variable can either be shared via an [encrypted log](INSERT_LINK_HERE), or offchain via web2, or completely offline: it's up to the app developer.

Aztec private state follows a utxo-based model. That is, a private state's current value is represented as one or many [notes](#notes). Each note is stored as an individual leaf in a utxo-based merkle tree: the [_private state tree_](INSERT_LINK_HERE).

To greatly simplify the experience of writing private state, Aztec.nr provides three different types of private state variable:

- [Singleton<NoteType\>](#singletonnotetype)
- [ImmutableSingleton<NoteType\>](#immutablesingletonnotetype)
- [Set<NoteType\>](#setnotetype)

These three structs abstract-away many of Aztec's protocol complexities, by providing intuitive methods to modify notes in the utxo tree in a privacy-preserving way.

> Note that an app can also choose to emit data via unencrypted log, or to define a note whose data is easy to figure out, then the information is technically not private and could be visible to anyone.

### Notes

Unlike public state variables, which can be arbitrary types, private state variables operate on `NoteType`.

Notes are the fundamental elements in the private world.

A note should conform to the following interface:

#include_code NoteInterface /yarn-project/noir-libs/noir-aztec/src/note/note_interface.nr rust

The interplay between a private state variable and its notes can be confusing. Here's a summary to aid intuition:

- A private state variable (of type `Singleton`, `ImmutableSingleton` or `Set`) may be declared in [Storage](./storage.md).
- Every note contains (as a 'header') the contract address and storage slot of the state variable to which it "belongs". A note is said to "belong" to a private state if the storage slot of the private state matches the storage slot contained in the note's header.
  - Management of this 'header' is abstracted-away from developers who use the `ImmutableSingleton`, `Singleton` and `Set` types.
- A private state variable is colloquially said to "point" to one or many notes (depending on the type), if those note(s) all "belong" to that private state, and those note(s) haven't-yet been nullified.
- An `ImmutableSingleton` will point to _one_ note over the lifetime of the contract. ("One", hence "Singleton"). This note is a struct of information that is persisted forever.
- A `Singleton` may point to _one_ note at a time. ("One", hence "Singleton"). But since it's not "immutable", the note that it points to may be [replaced](#replace) by functions of the contract, over time. The "current value" of a `Singleton` is interpreted as the one note which has not-yet been nullified. The act of 'replacing' a Singleton's note is how a `Singleton` state may be modified by functions.
  - `Singleton` is a useful type when declaring a private state which may only ever be modified by those who are privy to the current value of that state.
- A `Set` may point to _multiple_ notes at a time. The "current value" of a private state variable of type `Set` is some 'accumulation' of all not-yet nullified notes which "belong" to the `Set`.
  - The term "some accumulation" is intentionally vague. The interpretation of the "current value" of a `Set` must be expressed by the smart contract developer. A common use case for a `Set` is to represent the sum of a collection of values (in which case 'accumulation' is 'summation').
    - Think of a ZCash balance (or even a Bitcoin balance). The "current value" of a user's ZCash balance is the sum of all unspent (not-yet nullified) notes belonging to that user.
  - To modify the "current value" of a `Set` state variable, is to [`insert`](#insert) new notes into the `Set`, or [`remove`](#remove) notes from that set.
  - Interestingly, if a developer requires a private state to be modifiable by users who _aren't_ privy to the value of that state, a `Set` is a very useful type. The `insert` method allows new notes to be added to the `Set` without knowing any of the other notes in the set! (Like posting an envelope into a post box, you don't know what else is in there!).

## `Singleton<NoteType>`

Singleton is a private state variable that is unique in a way. When a singleton is initialised, a note is created to represent its value. And the way to update the value is to destroy the current note, and create a new one with the updated value.

### `::new`

Here we define a singleton for storing a Card note:

#include_code state_vars-Singleton /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/legendary_card.nr rust

### `.initialise`

The initial value of a singleton is set via calling `initialise`:

#include_code state_vars-SingletonInit /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

When this function is called, a nullifier of the storage slot is created, preventing this singleton from being initialised again.

Unlike public states, which have a default initial value of `0` (or many zeros, in the case of a struct, array or map), a private state (of type `Singleton`, `ImmutableSingleton` or `Set`) does not have a default initial value. The `initialise` method (or `insert`, in the case of a `Set`) must be called.

### `.replace`

The 'current value' of a `Singleton` state variable may be overwritten via the `.replace` method.

To modify the 'current value' of a singleton, we may create a new note (a Card in the following example) containing some new data, and replace the current note with it:

#include_code state_vars-SingletonReplace /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

This function will destroy the old note under the hood. If two people are trying to modify the singleton at the same time, only one will succeed. Developers should put in place appropriate access controls to avoid race conditions (unless a race is intended!).

### `.get_note`

This function allows us to get the note of a singleton:

#include_code state_vars-SingletonGet /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

However, it's possible that at the time this function is called, the system hasn't synched to the block where the latest note was created. Or a malicious user might feed an old state to this function, tricking the proving system into thinking that the value hasn't changed. To avoid an attack around it, this function will destroy the current note, and replace it with a duplicated note that has the same fields. Because the nullifier of the latest note will be emitted, if two people are trying to use this function against the same note, only one will succeed.

## `ImmutableSingleton<NoteType>`

Immutable singleton is unique and, as the name suggests, immutable. Once it has been initialised, its value can't be changed anymore.

### `::new`

#include_code state_vars-ImmutableSingleton /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/game_rules.nr rust

### `.initialise`

#include_code state_vars-ImmutableSingletonInit /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

### `.get_note`

#include_code state_vars-ImmutableSingletonGet /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

Unlike a [`singleton`](#get_note-1), when you call the `get_note` function on an immutable singleton to read the value, the current note is not destroyed in the background. This means that multiple accounts can call this function simultaneously.

## `Set<NoteType>`

Set is used for managing a collection of notes. All notes in a set are of the same `NoteType`. But whether these notes all belong to one entity, or are accessible and editable by different entities, is totally up to the developer.

### `::new`

In the following example, we define a set of cards:

#include_code state_vars-Set /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/cards.nr rust

### `.insert`

We can call `insert` for as many times as we need to add new notes to a `Set`. A `Set` is unbounded in size.

#include_code state_vars-SetInsert /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

### `.remove`

We can also remove a note from a set:

#include_code state_vars-SetRemove /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

Note that the transaction won't fail if the note we are removing does not exist in the set. As a best practice, we should fetch the notes by calling [`get_notes`](#get_notes), which does a membership check under the hood to make sure the notes exist, and then feed the returned notes to the `remove` function.

### `.get_notes`

This function returns the notes the account has access to:

#include_code state_vars-SetGet /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

There's a limit on the maxinum number of notes this function can return at a time. Check [here](INSERT_LINK_HERE) and look for `MAX_READ_REQUESTS_PER_CALL` for the up-to-date number.

Because of this limit, we should always consider using the second argument `NoteGetterOptions` to target the notes we need, and to reduce the time required to recursively call this function.

### NoteGetterOptions

`NoteGetterOptions` encapsulates a set of configurable options for filtering and retrieving a selection of notes from a database:

#include_code NoteGetterOptions /yarn-project/noir-libs/noir-aztec/src/note/note_getter_options.nr rust

Developers can design instances of `NoteGetterOptions`, to determine how notes should be filtered and returned to the functions of their smart contracts.

For example, the following function outputs an instance of `NoteGetterOptions`, which has been configured to find the cards that belong to `account_address`. The returned cards are sorted by their points in descending order, and the first `offset` cards with the highest points are skipped.

#include_code state_vars-NoteGetterOptionsSelectSortOffset /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/options.nr rust

The first value of `.select` and `.sort` is the index of a field in a note type. For the note type `Card` that has the following fields:

#include_code state_vars-NoteCard /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/types/card.nr rust

The indices are: 0 for `points`, 1 for `secret`, and 2 for `owner`.

In the previous example,

`.select(2, account_address)` matches the 2nd field of `Card`, which is `owner`, and returns the cards whose `owner` field equals `account_address`.

`.sort(0, SortOrder.DESC)` sorts the 0th field of `Card`, which is `points`, in descending order.

There can be as many conditions as the number of fields a note type has. The following example finds cards whose fields match the three given values:

#include_code state_vars-NoteGetterOptionsMultiSelects /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/options.nr rust

While `selects` lets us find notes with specific values, `filter` lets us find notes in a more dynamic way. The function below picks the cards whose points are at least `min_points`:

#include_code state_vars-OptionFilter /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/options.nr rust

We can use it as a filter to further reduce the number of the final notes:

#include_code state_vars-NoteGetterOptionsFilter /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/options.nr rust

One thing to remember is, `filter` will be applied on the notes after they are picked from the database. Therefor, it's possible that the actual notes we end up getting are fewer than the limit.

The limit is `MAX_READ_REQUESTS_PER_CALL` by default. But we can set it to any value "smaller" than that:

#include_code state_vars-NoteGetterOptionsPickOne /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/options.nr rust

The process of applying the options to get the final notes is not constrained. It's necessary to always check the returned notes even when some conditions have been specified in the options.

#include_code state_vars-check_return_notes /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/main.nr rust

## `Map<T>`

`Map` is a state variable that maps a `Field` to another state variable, which can be [`PublicState`](#publicstatet-t_serialised_len), all the [private state variables](#private-state-variables), and even another Map.

> `Map` can map from `Field` or any native Noir type which is convertible to `Field`.

### `::new`

The following declares a mapping from a `Field` to a `Singleton`:

#include_code state_vars-MapSingleton /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/profiles.nr rust

The second argument `|slot| Singleton::new(slot, ProfileMethods)` is a Noir closure function. It teaches this instance of `Map` how to create a new instance of a `Singleton` whenever the `.at` method is called to access a state variable at a particular mapping key. The `slot` argument will be derived when `.at` is called, based on the lookup key provided.

### `.at`

The only api of a map is `.at`. It returns the underlying type that occupies a specific storage slot, which is generated by the field passed to `.at`.

#include_code state_vars-MapAtSingletonInit /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

#include_code state_vars-MapAtSingletonGet /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

In both code snippets, `state_var.at(account)` returns a singleton that is linked to the requested account.
