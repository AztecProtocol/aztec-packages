---
title: Declaring Contract Storage
sidebar_position: 2
tags: [contracts, storage, data-types, smart-contracts]
description: Define and manage storage state in your Aztec smart contracts using various storage types.
---

This guide shows you how to declare storage and use various storage types provided by Aztec.nr for managing contract state.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of Aztec's private and public state model
- Familiarity with Noir struct syntax
- Basic knowledge of maps and data structures

For storage concepts, see [storage overview](../../concepts/storage/index.md).

## Define your storage struct

### Create a storage struct with #[storage]

Declare storage using a struct annotated with `#[storage]`. For example:

```rust
#[storage]
struct Storage<Context> {
    // The admin of the contract
    admin: PublicMutable<AztecAddress, Context>,
}
```

### Context parameter

The `Context` parameter provides execution mode information.

### Access storage in functions

Use the `storage` keyword to access your storage variables in contract functions.

## Use maps for key-value storage

Maps store key-value pairs where keys are `Field` elements and values can be any type.

### Understand map structure

- Keys: Always `Field` or serializable types
- Values: Any type, including other maps
- Multiple maps: Supported in the same contract

### Declare private maps

Specify the note type for private storage maps:

```rust
private_items: Map<AztecAddress, PrivateSet<MyNote, Context>, Context>,
```

### Declare public maps

Use `PublicState` for public storage maps:

```rust
authorized_users: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
```

### Access map values

Use the `.at()` method to access values by key:

```rust
assert(storage.authorized_users.at(context.msg_sender()).read(), "caller is not authorized");
```

:::tip

This is equivalent to Solidity's `authorized_users[msg.sender]` pattern.

:::

## Use private storage types

Aztec.nr provides three private state variable types:

- `PrivateMutable<NoteType>`: Single mutable private value
- `PrivateImmutable<NoteType>`: Single immutable private value
- `PrivateSet<NoteType>`: Collection of private notes

All private storage operates on note types rather than arbitrary data types. Learn how to implement custom notes [here](./how_to_implement_custom_notes.md)

### PrivateMutable

PrivateMutable is a private state variable that is unique in a way. When a PrivateMutable is initialized, a note is created to represent its value. Updating the value means to destroy the current note, and to create a new one with the updated value.

Like for public state, we define the struct to have context and a storage slot. You can view the implementation [here](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/smart-contracts/aztec/src/state_vars/private_mutable.nr).

An example of `PrivateMutable` usage in contracts is keeping track of important values. The `PrivateMutable` is added to the `Storage` struct as follows:

```rust
// #[storage]
// ...etc
my_value: PrivateMutable<MyNote, Context>,
```

#### `initialize`

As mentioned, the PrivateMutable should be initialized to create the first note and value. When this function is called, a nullifier of the storage slot is created, preventing this PrivateMutable from being initialized again.

Unlike public states, which have a default initial value of `0` (or many zeros, in the case of a struct, array or map), a private state (of type `PrivateMutable`, `PrivateImmutable` or `PrivateSet`) does not have a default initial value. The `initialize` method (or `insert`, in the case of a `PrivateSet`) must be called.

#### `is_initialized`

An unconstrained method to check whether the PrivateMutable has been initialized or not. It takes an optional owner and returns a boolean. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/smart-contracts/aztec/src/state_vars/private_mutable.nr).

```rust
let is_initialized = my_value.is_initialized();
```
s
#### `replace`

To update the value of a `PrivateMutable`, we can use the `replace` method. The method takes a function (or closure) that transforms the current note into a new one.

When called, the method will:
- Nullify the old note
- Apply the transform function to produce a new note
- Insert the new note into the data tree

An example of this is seen in an example card game, where an update function is passed in to transform the current note into a new one (in this example, updating a `CardNote` data):

```rust
let new_note = MyNote::new(new_value, owner);
storage.my_value.replace(&mut new_note).emit(encode_and_encrypt_note(&mut context, owner));
```

:::info

Calling `emit(encode_and_encrypt_note())` on the `replace` method will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

If two people are trying to modify the PrivateMutable at the same time, only one will succeed as we don't allow duplicate nullifiers! Developers should put in place appropriate access controls to avoid race conditions (unless a race is intended!).

#### `get_note`

This function allows us to get the note of a PrivateMutable, essentially reading the value.

```rust
let note = my_value.get_note()
```

:::info

To ensure that a user's private execution always uses the latest value of a PrivateMutable, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed (no duplicate nullifiers allowed).

This also makes read operations indistinguishable from write operations and allows the sequencer to verifying correct execution without learning anything about the value of the note.

:::

#### `view_note`

Functionally similar to [`get_note`](#get_note), but executed in unconstrained functions and can be used by the wallet to fetch notes for use by front-ends etc.

### PrivateImmutable

`PrivateImmutable` represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. You can view the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/smart-contracts/aztec/src/state_vars/private_immutable.nr).

#### `initialize`

When this function is invoked, it creates a nullifier for the storage slot, ensuring that the PrivateImmutable cannot be initialized again.

Set the value of an PrivateImmutable by calling the `initialize` method:

```rust
#[private]
fn initialize_private_immutable(my_value: u8) {
    let new_note = MyNote::new(my_value, context.msg_sender());

    storage.my_private_immutable.initialize(new_note).emit(encode_and_encrypt_note(
        &mut context,
        context.msg_sender(),
    ));
}
```

:::info

Calling `emit(encode_and_encrypt_note())` on `initialize` will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

Once initialized, an PrivateImmutable's value remains unchangeable. This method can only be called once.

#### `is_initialized`

An unconstrained method to check if the PrivateImmutable has been initialized. Takes an optional owner and returns a boolean. You can find the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/smart-contracts/aztec/src/state_vars/private_immutable.nr).

#### `get_note`

Similar to the `PrivateMutable`, we can use the `get_note` method to read the value of an PrivateImmutable.

Use this method to retrieve the value of an initialized PrivateImmutable.

```rust
#[private]
fn get_immutable_note() -> MyNote {
    storage.my_private_immutable.get_note()
}
```

Unlike a `PrivateMutable`, the `get_note` function for an PrivateImmutable doesn't nullify the current note in the background. This means that multiple accounts can concurrently call this function to read the value.

This function will throw if the `PrivateImmutable` hasn't been initialized.

#### `view_note`

Functionally similar to `get_note`, but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

### PrivateSet

`PrivateSet` is used for managing a collection of notes. All notes in a `PrivateSet` are of the same `NoteType`. But whether these notes all belong to one entity, or are accessible and editable by different entities, is up to the developer.

For example, adding a mapping of private items to storage, indexed by `AztecAddress`:

```rust
private_items: Map<AztecAddress, PrivateSet<MyNote, Context>, Context>,
```

#### `insert`

Allows us to modify the storage by inserting a note into the `PrivateSet`.

A hash of the note will be generated, and inserted into the note hash tree, allowing us to later use in contract interactions. Recall that the content of the note should be shared with the owner to allow them to use it, as mentioned this can be done via an encrypted log or offchain via web2, or completely offline.

```rust
storage.set.at(aztec_address).insert(new_note).emit(encode_and_encrypt_note(&mut context, aztec_address));
```

:::info

Calling `emit(encode_and_encrypt_note())` on `insert` will encrypt the new note and post it to the data availability layer so that the note information is retrievable by the recipient.

:::

#### `pop_notes`

This function pops (gets, removes and returns) the notes the account has access to based on the provided filter.

The kernel circuits are constrained to a maximum number of notes this function can return at a time. Check [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr) and look for `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` for the up-to-date number.

Because of this limit, we should always consider using the second argument `NoteGetterOptions` to limit the number of notes we need to read and constrain in our programs. This is quite important as every extra call increases the time used to prove the program and we don't want to spend more time than necessary.

An example of such options is using the filter functions from the value note library (like `filter_notes_min_sum`) to get "enough" notes to cover a given value. Essentially, this function will return just enough notes to cover the amount specified such that we don't need to read all our notes. For users with a lot of notes, this becomes increasingly important.

```rust
use value_note::filter::filter_notes_min_sum;

// etc...
let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend as Field);
let notes = self.set.pop_notes(options);
```

#### `get_notes`

This function has the same behavior as `pop_notes` above but it does not delete the notes.

#### `remove`

Will remove a note from the `PrivateSet` if it previously has been read from storage, e.g. you have fetched it through a `get_notes` call. This is useful when you want to remove a note that you have previously read from storage and do not have to read it again.

Note that if you obtained the note you are about to remove via `get_notes` it's much better to use `pop_notes` as `pop_notes` results in significantly fewer constraints since it doesn't need to check that the note has been previously read, as it reads and deletes at once.

#### `view_notes`

Functionally similar to [`get_notes`](#get_notes), but executed unconstrained and can be used by the wallet to fetch notes for use by front-ends etc.

```rust
let mut options = NoteViewerOptions::new();
let notes = set.view_notes(options.set_offset(offset));
```

There's also a limit on the maximum number of notes that can be returned in one go. To find the current limit, refer to [this file (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/smart-contracts/aztec/src/note/constants.nr) and look for `MAX_NOTES_PER_PAGE`.

The key distinction is that this method is unconstrained. It does not perform a check to verify if the notes actually exist, which is something the [`get_notes`](#get_notes) method does under the hood. Therefore, it should only be used in an unconstrained contract function.

This function requires a `NoteViewerOptions`. The `NoteViewerOptions` is essentially similar to the [`NoteGetterOptions`](#notegetteroptions), except that it doesn't take a custom filter.

## Use public storage types

Aztec.nr provides two public state variable types that work similarly to Ethereum's storage model:

- `PublicMutable<T>`: Mutable public value that can be updated
- `PublicImmutable<T>`: Immutable public value that can only be set once

Both types are generic over any serializable type `T`, allowing you to store simple values like integers and booleans, as well as complex structs. Public storage is transparent - all values are visible to anyone observing the blockchain.

### PublicMutable

Store mutable public state using `PublicMutable<T>` for values that need to be updated throughout the contract's lifecycle.

:::info
An example using a larger struct can be found in the [lending example](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/lending_contract)'s use of an [`Asset`](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/noir-contracts/contracts/app/lending_contract/src/asset.nr).
:::

For example, to add `config_value` public state variable into our storage struct, we can define it as:

```rust
config_value: PublicMutable<MyStruct, Context>,
```

To add a group of `authorized_users` that are able to perform actions in our contract, and we want them in public storage:

```rust
authorized_users: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
```

#### `read`

On the `PublicMutable` structs we have a `read` method to read the value at the location in storage. For our `config_value` example from earlier, this could be used as follows to check that the stored value matches the `msg_sender()`:

```rust
let admin = storage.admin.read();
assert(admin == context.msg_sender(), "caller is not admin");
```

#### `write`

We have a `write` method on the `PublicMutable` struct that takes the value to write as an input and saves this in storage. It uses the serialization method to serialize the value which inserts (possibly multiple) values into storage:

```rust
storage.admin.write(new_admin);
```

### PublicImmutable

`PublicImmutable` is a type that is initialized from public once, typically during a contract deployment, but which can later be read from public, private and utility execution contexts. This state variable is useful for stuff that you would usually have in `immutable` values in Solidity, e.g. this can be the name of a contract or its version number.

Just like the `PublicMutable` it is generic over the variable type `T`. The type must implement the `Serialize` and `Deserialize` traits.

```rust
my_public_immutable: PublicImmutable<MyStruct, Context>,
```

You can find the details of `PublicImmutable` in the implementation [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/noir-projects/smart-contracts/aztec/src/state_vars/public_immutable.nr).

#### `new`

Is done exactly like the `PublicMutable` struct, but with the `PublicImmutable` struct.

```rust
my_public_immutable: PublicImmutable<MyStruct, Context>,
```

#### `initialize`

This function sets the immutable value. It can only be called once.

```rust
storage.my_public_immutable.initialize(my_value);
```

:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

```rust
#[public]
fn initialize_public_immutable(my_value: u8) {
    let mut new_struct = MyStruct { account: context.msg_sender(), value: my_value };
    storage.my_public_immutable.initialize(new_struct);
}
```

#### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

```rust
#[utility]
unconstrained fn get_public_immutable() -> MyStruct {
    storage.my_public_immutable.read()
}
```

## Delayed Public Mutable

This storage type is used if you want to use public values in private execution.

A typical use case is some kind of system configuration, such as a protocol fee or access control permissions. These values are public (known by everyone) and mutable. Reading them in private however is tricky: private execution is always asynchronous and performed over _historical_ state, and hence one cannot easily prove that a given public value is current.

:::note Alternative approaches

A naive way to solve this is to enqueue a public call that will assert the current public value, but this leaks _which_ public value is being read, severely reducing privacy. Even if the value itself is already public, the fact that we're using it because we're interacting with some related contract is not. For example, we may leak that we're interacting with a certain DeFi protocol by reading its fee.

An alternative approach is to create notes in public that are then nullified in private, but this introduces contention: only a single user may use the note and therefore read the state, since nullifying it will prevent all others from doing the same. In some schemes there's only one account that will read the state anyway, but this is not the general case.

:::

Delayed Public Mutable state works around this by introducing **delays**:

- Instead, a value change is be scheduled ahead of time, and some minimum amount of time must pass between the scheduling and the new value taking effect.
- This means that we can privately prove that a historical public value cannot possibly change before some point in the future (due to the minimum delay), and therefore that our transaction will be valid **as long as it gets included before this future time**.
- In other words, we're saying "this value is public but can't change until ___".

This results in the following key properties of `DelayedPublicMutable` state:

- public values can only be changed after a certain delay has passed, never immediately
- the scheduling of value changes is itself public, including both the new value and the time at which the change will take effect
- transactions that read `DelayedPublicMutable` state become invalid after some time if not included in a block

:::warning Privacy Consideration

While `DelayedPublicMutable` state variables are much less leaky than the assertion in public approach, they do reveal some information to external observers by setting the `include_by_timestamp` property of the transaction request. The impact of this can be mitigated with proper selection of the delay value and schedule times.

:::

### Choosing Delays

The `include_by_timestamp` transaction property will be set to a value close to the current timestamp plus the duration of the delay in seconds. The exact value depends on the anchor block over which the private proof is constructed. For example, if current timestamp is `X` and a `DelayedPublicMutable` state variable has a delay of 3000 seconds, then transactions that read this value privately will set `include_by_timestamp` to a value close to 'X + 3000' (clients building proofs on older state will select a lower `include_by_timestamp`).

These delays can be changed during the contract lifetime as the application's needs evolve.

:::tip Delay duration

Applications using similar delays will therefore be part of the same privacy set. It is recommended to look for industry standards for these delays. For example:

- 12 hours for time-sensitive operations, such as emergency mechanisms
- 5 days for middle-of-the-road operations
- 2 weeks for operations that require lengthy public scrutiny.

Smaller delays are fine too. As a rule of thumb, the smaller the delay, the smaller the privacy set, so your mileage may vary.

Additionally, you may choose to coordinate and constrain your transactions to set `include_by_timestamp` to a value lower than would be strictly needed by the applications you interact with (if any!) using some common delay, and by doing so prevent privacy leakage.

Note that wallets can also warn users that a value change will soon take place and that sending a transaction at that time might result in reduced privacy, allowing them to choose to wait until after the epoch.

:::

:::info

Even though only transactions that interact with `DelayedPublicMutable` state _need_ to set the `include_by_timestamp` property, there is no reason why transactions that do not wouldn't also set this value.

If indeed most applications converge on a small set of delays, then wallets could opt to select any of those to populate the `include_by_timestamp` field, as if they were interacting with a `DelayedPublicMutable` state variable with that delay.

This prevents the network-wide privacy set from being split between transactions that read `DelayedPublicMutable` state and those that don't, which is beneficial to everyone.

:::

### DelayedPublicMutable

Unlike other state variables, `DelayedPublicMutable` receives not only a type parameter for the underlying datatype, but also a `DELAY` type parameter with the value change delay as a number of seconds.

```rust
my_delayed_value: DelayedPublicMutable<MyType, MY_DELAY, Context>,
```

:::note
`DelayedPublicMutable` requires that the underlying type `T` implements both the `ToField` and `FromField` traits, meaning it must fit in a single `Field` value. There are plans to extend support by requiring instead an implementation of the `Serialize` and `Deserialize` traits, therefore allowing for multi-field variables, such as complex structs.
:::

Since `DelayedPublicMutable` lives in public storage, by default its contents are zeroed-out. Intialization is performed by calling `schedule_value_change`, resulting in initialization itself being delayed.

### `schedule_value_change`

This is the means by which a `DelayedPublicMutable` variable mutates its contents. It schedules a value change for the variable at a future timestamp after the `DELAY` has elapsed from the current timestamp, at which point the scheduled value becomes the current value automatically and without any further action, both in public and in private. If a pending value change was scheduled but not yet effective (because insufficient time had elapsed), then the previous schedule value change is replaced with the new one and eliminated. There can only be one pending value change at a time.

This function can only be called in public, typically after some access control check:

```rust
#[public]
fn set_my_value(new_value: MyType) {
    assert_eq(storage.admin.read(), context.msg_sender(), "caller is not admin");
    storage.my_delayed_value.schedule_value_change(new_value);
}
```

If one wishes to schedule a value change from private, simply enqueue a public call to a public `internal` contract function. Recall that **all scheduled value changes, including the new value and scheduled timestamp are public**.

:::warning

A `DelayedPublicMutable`'s storage **must** only be mutated via `schedule_value_change`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.

:::

### `get_current_value`

Returns the current value in a public, private or utility execution context. Once a value change is scheduled via `schedule_value_change` and the delay time passes, this automatically returns the new value.

```rust
storage.my_delayed_value.get_current_value()
```

Also, calling in private will set the `include_by_timestamp` property of the transaction request, introducing a new validity condition to the entire transaction: it cannot be included in any block with a timestamp larger than `include_by_timestamp`.

```rust
let current_value = storage.my_delayed_value.get_current_value();
```

### `get_scheduled_value`

Returns the last scheduled value change, along with the timestamp at which the scheduled value becomes the current value. This may either be a pending change, if the timestamp is in the future, or the last executed scheduled change if the timestamp is in the past (in which case there are no pending changes).

```rust
storage.my_delayed_value.get_scheduled_value()
```

It is not possible to call this function in private: doing so would not be very useful at it cannot be asserted that a scheduled value change will not be immediately replaced if `shcedule_value_change` where to be called.
