---
title: State Variables
sidebar_position: 3
tags: [contracts, storage, data-types, smart-contracts]
description: Define and manage storage state in your Aztec smart contracts using various storage types.
---

# State Variables

A contract's state is defined by multiple values, e.g. in a token it'd be the total supply, user balances, outstanding approvals, accounts with minting permission, etc. Each of these persisting values is called a _state variable_.

One of the first design considerations for any smart contract is how it'll store its state. This is doubly true in Aztec due to there being **both public and private state** - the tradeoff space is large, so there's room for lots of decisions.

## The Storage Struct

State variables are declared in Solidity by simply listing them inside of the contract, like so:

```solidity
contract MyContract {
    uint128 public my_public_state_variable;
}
```

In Aztec.nr, we define a [`struct`](https://noir-lang.org/docs/noir/concepts/data_types/structs) that holds _all_ state variables. This struct is called **the storage struct**, and it is identified by having the `#[storage]` macro applied to it.

```rust
use aztec::macros::aztec;

#[aztec]
contract MyContract {
    use aztec::macros::storage;

    #[storage]
    struct Storage<C> {
        // state variables go here e.g, the admin of the contract
        admin: PublicMutable<AztecAddress, C>,
    }
}
```

The storage struct can have _any_ name, but it is _typically_ named `Storage`. This struct must also have a generic type called `C` or `Context` - this is an unfortunate boilerplate parameter that provides execution mode information.

The `#[storage]` macro can only be used once so all contract state must be in a **single** struct.

### Accessing Storage

The contract's storage is accessed via `self.storage` in any contract function. It will automatically be tailored to the execution context of that function, hiding all methods that cannot be invoked there.

Consider, for example, a `PublicMutable` state variable, which is a value that is fully accessible in public functions, read-only in utility functions and not accessible in a private function:

```rust
#[storage]
struct Storage<C> {
    my_public_variable: PublicMutable<u128, C>,
}

#[external("public")]
fn my_public_function() {
    let current = self.storage.my_public_variable.read();
    self.storage.my_public_variable.write(current + 1);
}

#[external("private")]
fn my_private_function() {
    let current = self.storage.my_public_variable.read(); // compilation error - 'read' is not available in private
    self.storage.my_public_variable.write(current + 1); // compilation error - 'write' is not available in private
}

#[external("utility")]
fn my_utility_function() {
    let current = self.storage.my_public_variable.read();
    self.storage.my_public_variable.write(current + 1); // compilation error - 'write' is not available in utility
}
```

## Public State Variables

These are state variables that have _public_ content: everyone on the network can see the values they store. They can be considered to be equivalent to Solidity state variables.

### Choosing a Public State Variable

Public state variables are stored in the network's public storage tree and they can only be written to by public contract functions. It is possible to read _historic_ values of a public state variable in a private contract function, but the current values in the network's public state tree are not accessible in private functions. This means that most public state variables cannot be read from a private function, though there are some exceptions that are documented in the table below.

Below is a table comparing the key properties of the different public state variables that Aztec.nr offers:

| State variable         | Mutable?            | Readable in private? | Writable in private? | Example use case                                                                   |
| ---------------------- | ------------------- | -------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `PublicMutable`        | yes                 | no                   | no                   | Configuration of admins, global state (e.g. token total supply, total votes)       |
| `PublicImmutable`      | no                  | yes                  | no                   | Fixed configuration, one-way actions (e.g. initialization settings for a proposal) |
| `DelayedPublicMutable` | yes (after a delay) | yes                  | no                   | Non time sensitive system configuration                                            |

### PublicMutable

`PublicMutable` is the simplest kind of public state variable: a value that can be read and written. It is essentially the same as a non-`immutable` or `constant` Solidity state variable.

It **cannot be read or written to privately**, but it is possible to call private functions that enqueue a public call in which a `PublicMutable` is accessed. For example, a voting contract may allow private submission of votes which then enqueue a public call in which the vote count, represented as a `PublicMutable<u128>`, is incremented. This would let anyone see how many votes have been cast, while preserving the privacy of the account that cast the vote.

#### Declaration

Store mutable public state using `PublicMutable<T>` for values that need to be updated throughout the contract's lifecycle.

```rust
#[storage]
struct Storage<Context> {
    admin: PublicMutable<AztecAddress, Context>,
    total_supply: PublicMutable<u128, Context>,
}
```

To add a group of `authorized_users` that are able to perform actions in our contract in public storage:

```rust
#[storage]
struct Storage<Context> {
    authorized_users: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
}
```

#### `read`

`PublicMutable` variables have a `read` method to read the value at the location in storage:

```rust
#[external("public")]
fn check_admin() {
    let admin = self.storage.admin.read();
    assert(admin == self.msg_sender().unwrap(), "caller is not admin");
}
```

#### `write`

The `write` method on `PublicMutable` variables takes the value to write as an input and saves this in storage:

```rust
#[external("public")]
fn set_admin(new_admin: AztecAddress) {
    self.storage.admin.write(new_admin);
}
```

### PublicImmutable

`PublicImmutable` is a simplified version `PublicMutable`: it's a public state variable that can only be written (initialized) once, at which point it can only be read. Unlike Solidity `immutable` state variables, which must be set in the contract's constructor, a `PublicImmutable` can be initialized _at any point in time_ during the contract's lifecycle and attempts to read it prior to initialization will revert.

Due to the value being immutable, it is also possible to read it during private execution - once a circuit proves that the value was set in the past, it knows it cannot have possibly changed. This makes this state variable suitable for immutable public contract configuration or one-off public actions, such as whether a user has signed up or not.

#### Declaration

```rust
#[storage]
struct Storage<Context> {
    contract_version: PublicImmutable<u32, Context>,
}
```

#### `initialize`

This function sets the immutable value. It can only be called once.

```rust
#[external("public")]
fn initialize_version(version: u32) {
    self.storage.contract_version.initialize(version);
}
```

:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

#### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

```rust
#[external("public")]
fn get_version() -> u32 {
    self.storage.contract_version.read()
}
```

### DelayedPublicMutable

It is sometimes necessary to read public mutable state in private. For example, a decentralized exchange might have a configurable swap fee that some admin sets, but which needs to be read by users in their private swaps. This is where `DelayedPublicMutable` comes in.

`DelayedPublicMutable` is the same as a `PublicMutable` in that it is a public value that can be read and written, but with a caveat: writes only take effect _after some time delay_. These delays are configurable, but they're typically on the order of a couple hours, if not days, making this state variable unsuitable for actions that must be executed immediately - such as an emergency shut down. It is these very delays that enable private contract functions to _read the current value of a public state variable_, which is otherwise typically impossible.

The existence of minimum delays means that a private function that reads a public value at an anchor block has a guarantee that said historical value will remain the current value until _at least_ some time in the future - before the delay elapses. As long as the transaction gets included in a block before that time (by using the `include_by_timestamp` tx property), the read value is valid.

#### Declaration

Unlike other state variables, `DelayedPublicMutable` receives not only a type parameter for the underlying datatype, but also a `DELAY` type parameter with the value change delay as a number of seconds.

```rust
global MY_DELAY: u32 = 3600; // 1 hour delay

#[storage]
struct Storage<Context> {
    swap_fee: DelayedPublicMutable<u128, MY_DELAY, Context>,
}
```

#### `schedule_value_change`

This is the means by which a `DelayedPublicMutable` variable mutates its contents. It schedules a value change for the variable at a future timestamp after the `DELAY` has elapsed.

```rust
#[external("public")]
fn set_swap_fee(new_fee: u128) {
    assert(self.storage.admin.read() == self.msg_sender().unwrap(), "caller is not admin");
    self.storage.swap_fee.schedule_value_change(new_fee);
}
```

#### `get_current_value`

Returns the current value in a public, private or utility execution context.

```rust
#[external("private")]
fn use_swap_fee() {
    let current_fee = self.storage.swap_fee.get_current_value();
    // Use the fee in calculations
}
```

## Private State Variables

Private state variables have _private_ content meaning that only some people know what is stored in them. These work _very_ differently from public state variables and are unlike anything in languages such as Solidity, since they are built from fundamentally different primitives (UTXO-based notes and nullifiers instead of a key-value updatable public database).

Aztec.nr provides three private state variable types:

- `Owned<PrivateMutable<NoteType, Context>, Context>`: Single mutable private value
- `Owned<PrivateImmutable<NoteType, Context>, Context>`: Single immutable private value
- `Owned<PrivateSet<NoteType, Context>, Context>`: Collection of private notes

These private state variables are "owned" and must be wrapped in the `Owned<>` container, which enables owner-specific access via the `.at(owner)` method. Each also requires a `NoteType`. To understand this, let's go through notes and nullifiers and how they can be used so we can understand how private state works.

### Notes and Nullifiers

Just as public state is stored in a single public data tree (equivalent to the `key-value` store used for state on the EVM), private state is stored in two separate trees:

- The note hash tree: stores hashes of the private data, called notes, which are just structs containing private data, with some methods.
- The nullifier tree: the nullifier for a certain note is deterministic and presence of the nullifier in the nullifier tree determines that the note has been spent/used.

#### Notes

Notes are user-defined data that can be stored privately on the blockchain. A note can represent any private data e.g., an amount (e.g. some token balance), an ID (e.g. a vote proposal Id) or an address (e.g. an authorized account).

They also have some metadata, including a storage slot to avoid collisions with other notes, a `randomness` value that helps hide the content, and an `owner` who can nullify the note.

The note content, plus the metadata, are all hashed together, and it is this hash that gets stored onchain in the note hash tree. This hash is called a commitment. The underlying note content (the note hash preimage) is not stored anywhere onchain, and so third parties cannot access it and it remains private.

Note: Aztec.nr comes with some prebuilt note types, including [`UintNote`](https://github.com/AztecProtocol/aztec-packages/tree/08935f75dbc3052ce984add225fc7a0dac863050/noir-projects/aztec-nr/uint-note) and [`AddressNote`](https://github.com/AztecProtocol/aztec-packages/tree/08935f75dbc3052ce984add225fc7a0dac863050/noir-projects/aztec-nr/address-note), but users are also free to create their own with the `#[note]` macro.

#### Nullifiers

A nullifier is a value which indicates a resource has been spent. Nullifiers are unique, and the protocol forbids the same nullifier from being inserted into the tree twice. Spending the same resource therefore results in a duplicate nullifier, which invalidates the transaction.

Most often, nullifiers are used to mark a note as being spent, which prevents note double spends. The nullifier is typically computed as a **hash of the note contents concatenated with a private key of the note's owner**. These values are **immutable**, and only the owner knows their private keys, ensuring both determinism and secrecy.

### Note Messages

When working with private state variables, many operations return a `NoteMessage<Note>` type rather than the note directly. This is a type-safe wrapper that ensures you explicitly decide how to deliver the note to its recipient.

#### Why NoteMessage?

Private notes need to be communicated to their recipients so they know the note exists and can use it. The `NoteMessage` wrapper forces you to make an explicit choice about how this happens:

- **`.deliver(MessageDelivery)`**: Delivers the note so the recipient can discover it. You must specify a `MessageDelivery` option:
  - `MessageDelivery.CONSTRAINED_ONCHAIN`: Verified in the circuit (most secure)
  - `MessageDelivery.UNCONSTRAINED_ONCHAIN`: Cheaper but less secure
  - `MessageDelivery.UNCONSTRAINED_OFFCHAIN`: Suitable when recipients can verify message validity through other means

#### Accessing the Note

The `NoteMessage` type contains a `new_note` field that you can access if needed:

```rust
// Get the note and deliver it
let note_message = self.storage.user_settings.at(owner).get_note();
note_message.deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
```

Methods that return `NoteMessage` include `initialize()`, `get_note()`, and `replace()` on `PrivateMutable`, `initialize()` on `PrivateImmutable`, and `insert()` on `PrivateSet`.

### Choosing a Private State Variable

Due to the complexities of Aztec's private state model, private state variables do not map 1:1 with public state variables. Understanding these differences between the different private state variables is important when it comes to designing private smart contracts.

Below is a table comparing certain key properties of the different private state variables Aztec.nr offers:

| State variable     | Mutable? | Cost to read? | Writable by third parties? | Example use case                                                                                               |
| ------------------ | -------- | ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PrivateMutable`   | yes      | yes           | no                         | Mutable user state only accessible by them (e.g. user settings or keys)                                        |
| `PrivateImmutable` | no       | no            | no                         | Fixed configuration, one-way actions (e.g. initialization settings for a proposal)                             |
| `PrivateSet`       | yes      | yes           | yes                        | Aggregated state others can add to, e.g. token balance (set of amount notes), nft collections (set of nft ids) |

### PrivateMutable

`PrivateMutable` is conceptually similar to `PublicMutable` and regular Solidity state variables in that it is a variable that has exactly one value at any point in time that can be read and written. However, for `PrivateMutable`:

- The value is, of course, _private_, meaning only the account the value belongs to can read it.
- _Only ONE account can read and write the state variable_. It is not possible for example to use a `PrivateMutable` to store user settings and then have some admin account alter these settings.
- Reading the current value results in the state variable being updated, increasing tx costs and requiring delivery of a note message.
- There is no `write` function - the current value is instead `replace`d.

#### Declaration

```rust
#[storage]
struct Storage<Context> {
    user_settings: Owned<PrivateMutable<SettingsNote, Context>, Context>,
}
```

#### `is_initialized`

An unconstrained method to check whether the `PrivateMutable` has been initialized or not:

```rust
let is_initialized = self.storage.user_settings.at(owner).is_initialized();
```

#### `initialize`

The `PrivateMutable` should be initialized to create the first note and value:

```rust
use aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn initialize_settings(value: u8) {
    let owner = self.msg_sender().unwrap();
    let note = SettingsNote::new(value, owner);
    self.storage.user_settings.at(owner).initialize(note).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

#### `get_note`

This function allows us to get the note of a `PrivateMutable`, essentially reading the value:

```rust
#[external("private")]
fn read_settings() {
    let owner = self.msg_sender().unwrap();
    self.storage.user_settings.at(owner).get_note().deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

:::info
To ensure that a user's private execution always uses the latest value of a `PrivateMutable`, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed.
:::

#### `replace`

To update the value of a `PrivateMutable`, we can use the `replace` method:

```rust
#[external("private")]
fn update_settings(new_value: u8) {
    let owner = self.msg_sender().unwrap();
    self.storage.user_settings.at(owner).replace(|_| SettingsNote::new(new_value, owner)).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

### PrivateImmutable

`PrivateImmutable` represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. This is the private equivalent of `PublicImmutable`, except the value is only known to its owner.

#### Declaration

```rust
#[storage]
struct Storage<Context> {
    signing_key: Owned<PrivateImmutable<KeyNote, Context>, Context>,
}
```

#### `initialize`

When this function is invoked, it creates a nullifier for the storage slot, ensuring that the `PrivateImmutable` cannot be initialized again:

```rust
#[external("private")]
fn initialize_key(key_value: Field) {
    let owner = self.msg_sender().unwrap();
    let note = KeyNote::new(key_value, owner);
    self.storage.signing_key.at(owner).initialize(note).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

#### `get_note`

Similar to the `PrivateMutable`, we can use the `get_note` method to read the value:

```rust
#[external("private")]
fn get_key() -> KeyNote {
    let owner = self.msg_sender().unwrap();
    self.storage.signing_key.at(owner).get_note()
}
```

Unlike a `PrivateMutable`, the `get_note` function for a `PrivateImmutable` doesn't nullify the current note and returns the `Note` directly (not wrapped in `NoteMessage`). This means that multiple accounts can concurrently call this function to read the value.

### PrivateSet

`PrivateSet` is used for managing a collection of notes. Like `PrivateMutable`, this is a private state variable that can be modified. There are two key differences:

- A `PrivateSet` is not a single value but a _set_ (a collection) of values (represented by notes)
- Any account can insert values into someone else's set.

The set's current value is the collection of notes in the set that have not yet been nullified. These notes can have any type: they could be nft IDs, representing a user's nft collection, or they might be token amounts, in which case _the sum_ of all values in the set would be the user's current balance.

#### Declaration

For example, to add private token balances to storage:

```rust
#[storage]
struct Storage<Context> {
    balances: Owned<PrivateSet<UintNote, Context>, Context>,
}
```

#### `insert`

Allows us to modify the storage by inserting a note into the `PrivateSet`:

```rust
#[external("private")]
fn mint_tokens(to: AztecAddress, amount: u128) {
    let note = UintNote::new(amount, to);
    self.storage.balances.at(to).insert(note).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);
}
```

Note: The `Owned` wrapper requires calling `.at(owner)` to access the underlying `PrivateSet` for a specific owner. This binds the owner to the state variable instance.

#### `get_notes`

Retrieves notes the account has access to. You can optionally provide filtering options. Returns `RetrievedNote` instances:

```rust
// Get all notes (with default options)
let options = NoteGetterOptions::new();
let retrieved_notes = self.storage.balances.at(owner).get_notes(options);

// Or with custom options (e.g., limit the number of notes)
let options = NoteGetterOptions::new().set_limit(5);
let retrieved_notes = self.storage.balances.at(owner).get_notes(options);
```

#### `pop_notes`

This function pops (gets, removes and returns) the notes the account has access to. Unlike `get_notes`, this immediately nullifies the notes and returns them directly (not wrapped in `RetrievedNote`):

```rust
// Pop notes with a limit
let options = NoteGetterOptions::new().set_limit(10);
let notes = self.storage.balances.at(owner).pop_notes(options);
```

#### `remove`

Will remove a note from the `PrivateSet` if it previously has been read from storage. Takes a `RetrievedNote` as returned by `get_notes`:

```rust
let options = NoteGetterOptions::new();
let retrieved_notes = self.storage.balances.at(owner).get_notes(options);
// ... select a note to remove ...
self.storage.balances.at(owner).remove(retrieved_notes.get(0));
```

## Containers

### Map

A `Map` is a key-value container that maps keys to state variables - just like Solidity's `mapping`. It can be used with any state variable to create independent instances for each key.

For example, a `Map<AztecAddress, PublicMutable<u128>>` can be accessed with an address to obtain the `PublicMutable` that corresponds to it. This is exactly equivalent to a Solidity `mapping (address => uint)`.

#### Declaration

```rust
#[storage]
struct Storage<Context> {
    // Map of addresses to public balances
    public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,

    // Map of addresses to authorized users
    authorized_users: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
}
```

#### Usage

Use the `.at()` method to access values by key:

```rust
#[external("public")]
fn increase_balance(account: AztecAddress, amount: u128) {
    let current = self.storage.public_balances.at(account).read();
    self.storage.public_balances.at(account).write(current + amount);
}
```

### Owned

The `Owned` wrapper is used with private state variables (`PrivateMutable`, `PrivateImmutable`, and `PrivateSet`) to associate them with a specific owner. This is necessary because private state variables need to know which address owns the notes they manage.

#### Declaration

```rust
#[storage]
struct Storage<Context> {
    // Single owner's private balance
    balances: Owned<PrivateSet<UintNote, Context>, Context>,

    // Single owner's private settings
    user_settings: Owned<PrivateMutable<SettingsNote, Context>, Context>,
}
```

#### Usage

Use the `.at(owner)` method to access the underlying state variable for a specific owner:

```rust
#[external("private")]
fn transfer(from: AztecAddress, to: AztecAddress, amount: u128) {
    // Access the balance for the 'from' address
    let options = NoteGetterOptions::new();
    let notes = self.storage.balances.at(from).pop_notes(options);

    // Access the balance for the 'to' address
    let new_note = UintNote::new(amount, to);
    self.storage.balances.at(to).insert(new_note).deliver(MessageDelivery.UNCONSTRAINED_ONCHAIN);
}
```

The `Owned` wrapper is essential for private state variables because it binds the owner's address to the state variable instance, enabling proper note encryption, nullifier computation, and access control.

## Custom Structs in Public Storage

Both `PublicMutable` and `PublicImmutable` are generic over any serializable type, which means you can store custom structs in public storage.

### Define a Custom Struct

To use a custom struct in public storage, it must implement the `Packable` trait:

```rust
use dep::aztec::protocol_types::{
    address::AztecAddress,
    traits::{Deserialize, Packable, Serialize}
};

#[derive(Deserialize, Packable, Serialize)]
pub struct Asset {
    pub interest_accumulator: u128,
    pub last_updated_ts: u64,
    pub loan_to_value: u128,
    pub oracle: AztecAddress,
}
```

### Store and Use Custom Structs

```rust
#[storage]
struct Storage<Context> {
    assets: Map<Field, PublicMutable<Asset, Context>, Context>,
}

#[external("public")]
fn update_asset(asset_id: Field, new_accumulator: u128) {
    let mut asset = self.storage.assets.at(asset_id).read();
    asset.interest_accumulator = new_accumulator;
    self.storage.assets.at(asset_id).write(asset);
}
```

## Storage Slots

Each state variable gets assigned a different numerical value for their **storage slot**. How they are used depends on the kind of state variable:

- For public state variables, storage slots are related to slots in the public data tree
- For private state variables, storage slots are metadata that gets included in the note hash

The purpose of slots is the same for both domains: they keep the values of different state values _separate_ so that they do not interfere with one another.

Storage slots are a low-level detail that developers don't typically need to concern themselves with. They are automatically allocated to each state variable by Aztec.nr.
