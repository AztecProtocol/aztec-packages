# State Variables

State variables come in two flavours: [**public** state](#publicstatet-t_serialised_len) and [**private** state](#private-state-variables).

## `PublicState<T, T_SERIALISED_LEN>`

Public state is persistent state that is _publicly visible_ to anyone in the world.

For developers coming from other blockchain ecosystems (such as Ethereum), this will be a familiar concept, because there, _all_ state is _publicly visible_.

Aztec public state follows an account-based model. That is, each state occupies a leaf in an account-based merkle tree: the _public state tree_ (LINK). See here (LINK) for more of the technical details.

The `PublicState<T, T_SERIALISED_LEN>` struct serves as a wrapper around conventional Noir types `T`, allowing these types to be written to and read from the public state tree.

The Aztec stdlib provides serialization methods for some common types. Check [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/noir-libs/noir-aztec/src/types/type_serialisation) for the complete list.

### `::new`

In the following example, we define a public state with a boolean value.

#include_code state_vars-PublicState /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/locked.nr rust

### Custom value

It's possible to create a public state for any types. For example, to create a public state for the following struct:

#include_code state_vars-CustomStruct /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/types/queen.nr rust

First, define how to serialise and deserialise the struct. And then initialise the PublicState with it:

#include_code state_vars-PublicStateCustomStruct /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/queen.nr rust

### `.write`

We can pass the associated type directly to a public state. It knows how to serialise the given value to store in the public state tree.

#include_code state_vars-PublicStateWrite /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust
#include_code state_vars-PublicStateWriteCustom /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

### `.read`

Reading a value from a public state is straightforward:

#include_code state_vars-PublicStateRead /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

It returns the type the public state was declared with. The above example returns a boolean. And the following example returns a custom struct.

#include_code state_vars-PublicStateReadCustom /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

## Private State Variables

There are 3 different types of private state variables:

- [Singleton<NoteType\>](#singletonnotetype)
- [ImmutableSingleton<NoteType\>](#immutablesingletonnotetype)
- [Set<NoteType\>](#setnotetype)

In contrast to public state variables, private state variables are only visible to specific relevant parties. The value of a private state variable can either be shared via (log)[INSERT_LINK_HERE] or completely offline.

Note that an app can choose to emit the data via unencrypted log, or define a note whose data is easy to figure out, then the information is technically not private and could be visible to anyone.

### Notes

Unlike public state variables, which can be arbitrary types. Private state variables operate on `NoteType`.

Notes are the fundamental elements in the private world.

A note should confine to the following interface:

#include_code NoteInterface /yarn-project/noir-libs/noir-aztec/src/note/note_interface.nr rust

## `Singleton<NoteType>`

Singleton is a private state variable that is unique in a way. When a singleton is initialised, a note is created to represent its value. And the way to update the value is to destroy the current note, and create a new one with the updated value.

### `::new`

Here we define a singleton for storing a Card note:

#include_code state_vars-Singleton /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/legendary_card.nr rust

### `.initialise`

The initial value of a singleton is set via calling `initialise`:

#include_code state_vars-SingletonInit /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

When this function is called, a nullifier of the storage slot is created, preventing this singleton from being initialised again.

### `.replace`

To modify the value of a singleton, we will create a note (a Card in the following example) that has the new data, and replace the current note with it:

#include_code state_vars-SingletonReplace /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

This function will destroy the old note under the hood. If two people are trying to modify the singleton at the same time, only one will succeed.

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

Different to singleton, calling the `get_note` function on an immutable singleton to read the value doesn't destroy the current note behind the scene. Which means this function can be called simultaneously.

## `Set<NoteType>`

Set is used for managing a collection of notes. All notes in a set should be the same type. But whether they belong to one single account, or are accessible by different entities, is totally up to the developer.

### `::new`

In the following example, we define a set of cards:

#include_code state_vars-Set /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/cards.nr rust

### `.insert`

We can call `insert` for as many times as we need to add new notes to a set:

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

`NoteGetterOptions` encapsulates a set of configurable options for retrieving notes from a database:

#include_code NoteGetterOptions /yarn-project/noir-libs/noir-aztec/src/note/note_getter_options.nr rust

For example, the following configs let us find the cards that belong to `account_address`. The returned cards are sorted by their points in descending order, and the first `offset` cards with the highest points are skipped.

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

`Map` is a state variable that maps a field to another state variable, which can be [`PublicState`](#publicstatet-t_serialised_len), all the [private state variables](#private-state-variables), and even another Map.

### `::new`

The following map uses singleton as its value:

#include_code state_vars-MapSingleton /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/storage/profiles.nr rust

### `.at`

The only api of a map is `.at`. It returns the underlying type that occupies a specific storage slot, which is generated by the field passed to `.at`.

#include_code state_vars-MapAtSingletonInit /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

#include_code state_vars-MapAtSingletonGet /yarn-project/noir-contracts/src/contracts/docs_example_contract/src/actions.nr rust

In both code snippets, `state_var.at(account)` returns a singleton that is linked to the requested account.
