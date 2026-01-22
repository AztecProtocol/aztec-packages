---
title: Declaring Contract Storage
sidebar_position: 3
tags: [contracts, storage, data-types, smart-contracts]
description: Define and manage storage state in your Aztec smart contracts using various storage types.
---

This guide shows you how to declare storage and use various storage types provided by Aztec.nr for managing contract state.

## Choosing the right storage type

| Need | Use |
|------|-----|
| Public value anyone can read/write | `PublicMutable` |
| Public value set once (contract name, decimals) | `PublicImmutable` |
| Public key-value mapping | `Map<K, PublicMutable<V>>` |
| Private collection per user (token balances) | `Owned<PrivateSet<...>>` |
| Single private value per user | `Owned<PrivateMutable<...>>` |
| Immutable private value per user | `Owned<PrivateImmutable<...>>` |
| Contract-wide private singleton (admin key) | `SinglePrivateMutable` |
| Public value readable in private execution | `DelayedPublicMutable` |

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of Aztec's private and public state model
- Familiarity with Noir struct syntax

For storage concepts, see [storage overview](../../foundational-topics/state_management.md).

## Define your storage struct

Declare storage using a struct annotated with `#[storage]`:

```rust
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,
    balances: Owned<PrivateSet<UintNote, Context>, Context>,
}
```

The `Context` parameter determines which methods are available on state variables based on execution context.

Access storage in functions using `self.storage`:

```rust
#[external("public")]
fn get_admin() -> AztecAddress {
    self.storage.admin.read()
}
```

## Private storage types

Aztec.nr provides private state variables that operate on notes. Private state variables that are "owned" (tied to a specific owner address) must be wrapped in an `Owned` state variable.

For creating custom note types to use with these storage variables, see [how to implement custom notes](./how_to_implement_custom_notes.md).

### Owned state variables

Private state variables like `PrivateMutable`, `PrivateImmutable`, and `PrivateSet` implement the `OwnedStateVariable` trait. You must wrap them in `Owned`:

```rust
use aztec::state_vars::{Owned, PrivateMutable, PrivateImmutable, PrivateSet};

#[storage]
struct Storage<Context> {
    private_value: Owned<PrivateMutable<MyNote, Context>, Context>,
    private_config: Owned<PrivateImmutable<ConfigNote, Context>, Context>,
    private_notes: Owned<PrivateSet<MyNote, Context>, Context>,
}
```

Access the underlying state variable for a specific owner using `.at(owner)`:

```rust
let owner = self.msg_sender().unwrap();
self.storage.private_value.at(owner).initialize(note);
```

### PrivateMutable

`PrivateMutable` holds a single private value per owner that can be updated. When the value changes, the current note is nullified and a new note is inserted.

```rust
private_value: Owned<PrivateMutable<FieldNote, Context>, Context>,
```

#### `initialize`

Creates the first note for this state variable. Can only be called once per owner. Returns a `NoteMessage` that requires you to specify how to deliver the note.

```rust
#[external("private")]
fn initialize_value(value: Field) {
    let owner = self.msg_sender().unwrap();
    let note = FieldNote { value };

    self.storage.private_value.at(owner).initialize(note).deliver(
        MessageDelivery.ONCHAIN_CONSTRAINED,
    );
}
```

:::note MessageDelivery options

Private state operations return a `NoteMessage` that must be delivered. Choose based on your needs:

- **`ONCHAIN_CONSTRAINED`** - Cryptographic guarantees that recipients can decrypt. Use when contracts need to verify message contents.
- **`ONCHAIN_UNCONSTRAINED`** - Faster proving, stored onchain. Use when recipients can verify validity through other means.
- **`OFFCHAIN`** - Lowest cost, requires custom delivery infrastructure. Use for high-volume applications.

:::

#### `replace`

Updates the value by nullifying the current note and inserting a new one. Takes a function that transforms the old note into a new note:

```rust
#[external("private")]
fn update_value(new_value: Field) {
    let owner = self.msg_sender().unwrap();
    self.storage.private_value.at(owner).replace(|_old_note| FieldNote { value: new_value }).deliver(
        MessageDelivery.ONCHAIN_CONSTRAINED,
    );
}

#[external("private")]
fn increment_value() {
    let owner = self.msg_sender().unwrap();
    self.storage.private_value.at(owner).replace(|old_note| {
        FieldNote { value: old_note.value + 1 }
    }).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```

#### `initialize_or_replace`

Handles both initialization and replacement in one call. The function receives `Option::none()` if uninitialized, or `Option::some(note)` if a note exists:

```rust
#[external("private")]
fn set_value(new_value: Field) {
    let owner = self.msg_sender().unwrap();
    self.storage.private_value.at(owner).initialize_or_replace(|maybe_note| {
        // maybe_note is None if uninitialized, Some(note) if exists
        FieldNote { value: new_value }
    }).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```

#### `get_note`

Reads the current note. The read nullifies the note and creates a new one with the same value to ensure you're reading the latest value.

```rust
#[external("private")]
fn read_value() {
    let owner = self.msg_sender().unwrap();
    let note_message = self.storage.private_value.at(owner).get_note();
    // Access the note content via note_message.get_new_note()
    note_message.deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```

:::info

Reading a `PrivateMutable` nullifies and recreates the note. This makes reads indistinguishable from writes and ensures the sequencer cannot learn the note's value.

:::

#### `is_initialized`

An unconstrained method to check whether the `PrivateMutable` has been initialized:

```rust
#[external("utility")]
unconstrained fn is_initialized(owner: AztecAddress) -> bool {
    self.storage.private_value.at(owner).is_initialized()
}
```

#### `view_note`

An unconstrained method to read the note without nullifying it. Use in utility functions only:

```rust
#[external("utility")]
unconstrained fn view_value(owner: AztecAddress) -> FieldNote {
    self.storage.private_value.at(owner).view_note()
}
```

### PrivateImmutable

`PrivateImmutable` holds a single private value per owner that cannot be changed after initialization.

```rust
private_config: Owned<PrivateImmutable<ConfigNote, Context>, Context>,
```

#### `initialize`

Sets the permanent value. Can only be called once per owner:

```rust
#[external("private")]
fn set_config(value: Field) {
    let owner = self.msg_sender().unwrap();
    let note = ConfigNote { value };

    self.storage.private_config.at(owner).initialize(note).deliver(
        MessageDelivery.ONCHAIN_CONSTRAINED,
    );
}
```

#### `get_note`

Returns the note directly (not a `NoteMessage`) since immutable notes don't need to be recreated. Multiple callers can read concurrently:

```rust
#[external("private")]
fn read_config() -> ConfigNote {
    let owner = self.msg_sender().unwrap();
    self.storage.private_config.at(owner).get_note()
}
```

### PrivateSet

`PrivateSet` manages a collection of notes for each owner. All notes share the same storage slot but can have different values.

```rust
balances: Owned<PrivateSet<UintNote, Context>, Context>,
```

#### `insert`

Adds a new note to the set:

```rust
let note = UintNote { value: amount };
self.storage.balances.at(owner).insert(note).deliver(
    MessageDelivery.ONCHAIN_CONSTRAINED,
);
```

#### `pop_notes`

Retrieves and nullifies notes matching the filter options:

```rust
let options = NoteGetterOptions::new();
let notes = self.storage.balances.at(owner).pop_notes(options);
```

Use filters to limit the notes retrieved:

```rust
use value_note::filter::filter_notes_min_sum;

let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount as Field);
let notes = self.storage.balances.at(owner).pop_notes(options);
```

#### `get_notes`

Similar to `pop_notes` but does not nullify the notes. Use when you need to read without consuming:

```rust
let options = NoteGetterOptions::new();
let notes = self.storage.balances.at(owner).get_notes(options);
```

#### `remove`

Removes a previously retrieved note:

```rust
self.storage.balances.at(owner).remove(hinted_note);
```

:::tip

Prefer `pop_notes` over `get_notes` followed by `remove` as it results in fewer constraints.

:::

#### `view_notes`

An unconstrained method to view notes without constraints:

```rust
#[external("utility")]
unconstrained fn view_balance(owner: AztecAddress) -> BoundedVec<UintNote, MAX_NOTES_PER_PAGE> {
    let options = NoteViewerOptions::new();
    self.storage.balances.at(owner).view_notes(options)
}
```

### SinglePrivateMutable and SinglePrivateImmutable

For contract-wide private values (not per-owner), use `SinglePrivateMutable` or `SinglePrivateImmutable`. These store exactly one value for the entire contract - a global singleton - rather than separate values per owner.

| Type | Use Case | Access Pattern |
|------|----------|----------------|
| `Owned<PrivateMutable<...>>` | Per-owner private state (like balances) | `.at(owner).get_note()` |
| `SinglePrivateMutable` | Contract-wide singleton (like admin) | `.get_note()` directly |

Since there's only one value at the storage slot, there's no need to specify an owner to look it up:

```rust
#[storage]
struct Storage<Context> {
    admin: SinglePrivateMutable<AddressNote, Context>,
    config: SinglePrivateImmutable<ConfigNote, Context>,
}

// Access directly without .at(owner)
let note_message = self.storage.admin.get_note();
let config = self.storage.config.get_note();
```

When initializing, you still pass an owner address - but this specifies who can decrypt the note, not the storage location:

```rust
// owner_address determines who can see the note, not where it's stored
self.storage.admin.initialize(note, owner_address).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
```

## Public storage types

Public storage works similarly to Ethereum's storage model - values are stored directly and are visible to everyone.

### PublicMutable

Stores mutable public state that can be read and written in public functions:

```rust
admin: PublicMutable<AztecAddress, Context>,
total_supply: PublicMutable<u128, Context>,
```

:::note

Unlike private state which must be explicitly initialized, uninitialized `PublicMutable` returns the default value (zero for numbers, empty for addresses). This matches Ethereum's behavior.

:::

#### `read`

```rust
let admin = self.storage.admin.read();
```

#### `write`

```rust
self.storage.admin.write(new_admin);
```

### PublicImmutable

Stores public state that is set once and can be read from public, private, and utility contexts:

```rust
name: PublicImmutable<FieldCompressedString, Context>,
decimals: PublicImmutable<u8, Context>,
```

#### `initialize`

Can only be called once, typically in the constructor:

```rust
#[external("public")]
#[initializer]
fn constructor(name: str<31>, decimals: u8) {
    self.storage.name.initialize(FieldCompressedString::from_string(name));
    self.storage.decimals.initialize(decimals);
}
```

#### `read`

Can be called from any context (public, private, or utility):

```rust
// In public
#[external("public")]
fn get_name() -> FieldCompressedString {
    self.storage.name.read()
}

// In private (reads from historical state)
#[external("private")]
fn get_name_private() -> FieldCompressedString {
    self.storage.name.read()
}

// In utility
#[external("utility")]
unconstrained fn get_name_unconstrained() -> FieldCompressedString {
    self.storage.name.read()
}
```

### Maps

Maps store key-value pairs where keys implement the `ToField` trait and values are public state variables:

```rust
#[storage]
struct Storage<Context> {
    minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
}
```

Use the `.at()` method to access the state variable for a given key:

```rust
#[external("public")]
fn is_minter(minter: AztecAddress) -> bool {
    self.storage.minters.at(minter).read()
}

#[external("public")]
fn set_minter(minter: AztecAddress, approve: bool) {
    self.storage.minters.at(minter).write(approve);
}
```

This is equivalent to Solidity's `minters[minter]` pattern.

Maps can contain other maps for multi-dimensional lookups:

```rust
// Map game_id -> player_address -> score
games: Map<Field, Map<AztecAddress, PublicMutable<u32, Context>, Context>, Context>,

// Access: self.storage.games.at(game_id).at(player).read()
```

:::note

Maps can only be used with public state variables (`PublicMutable`, `PublicImmutable`, `DelayedPublicMutable`) or other `Map`s. For private state, use the `Owned` wrapper described above.

:::

### Custom structs in public storage

Custom structs can be stored in `PublicMutable` and `PublicImmutable` if they implement the required traits:

```rust
use aztec::protocol_types::traits::{Deserialize, Packable, Serialize};

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub admin: AztecAddress,
    pub fee: u128,
    pub enabled: bool,
}

#[storage]
struct Storage<Context> {
    config: PublicMutable<Config, Context>,
}

#[external("public")]
fn update_config(new_config: Config) {
    self.storage.config.write(new_config);
}

#[external("public")]
fn get_config() -> Config {
    self.storage.config.read()
}
```

## DelayedPublicMutable

Use `DelayedPublicMutable` when you need to read public values in private execution. Changes to the value are delayed, allowing private proofs to remain valid for a known time window.

### Declare with initial delay

The delay is specified as a const generic parameter (in seconds):

```rust
// 5 days = 432000 seconds
global CONFIG_DELAY: u64 = 432000;

#[storage]
struct Storage<Context> {
    fee: DelayedPublicMutable<u128, CONFIG_DELAY, Context>,
}
```

### `schedule_value_change`

Schedules a value change that takes effect after the delay:

```rust
#[external("public")]
fn set_fee(new_fee: u128) {
    assert(self.storage.admin.read() == self.msg_sender().unwrap(), "not admin");
    self.storage.fee.schedule_value_change(new_fee);
}
```

### `get_current_value`

Returns the current value. In private, this sets the transaction's `include_by_timestamp` to ensure the proof remains valid:

```rust
// In public
#[external("public")]
fn get_fee_public() -> u128 {
    self.storage.fee.get_current_value()
}

// In private
#[external("private")]
fn get_fee_private() -> u128 {
    self.storage.fee.get_current_value()
}
```

### `get_scheduled_value`

Returns the scheduled value and when it takes effect:

```rust
let (scheduled_value, effective_timestamp) = self.storage.fee.get_scheduled_value();
```

:::warning Privacy Consideration

Reading `DelayedPublicMutable` in private sets the `include_by_timestamp` property, which may reveal timing information. Choose delays that align with common values to maximize privacy sets.

:::

### Recommended delays

- **12 hours** - Time-sensitive operations like emergency mechanisms
- **5 days** - Standard operations
- **2 weeks** - Operations requiring lengthy public scrutiny
