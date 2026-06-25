---
title: State Variables
sidebar_position: 3
tags: [contracts, storage, data-types, smart-contracts]
description: Define and manage storage state in your Aztec smart contracts using various storage types.
---

# State Variables

A contract's state is defined by multiple values. For example, in a token contract, these include the total supply, user balances, outstanding approvals, accounts with minting permission, etc. Each of these persisting values is called a _state variable_.

One of the first design considerations for any smart contract is how it'll store its state. This is doubly true in Aztec due to there being **both public and private state** - the tradeoff space is large, so there's room for lots of decisions.

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

## The Storage Struct

State variables are declared in Solidity by simply listing them inside of the contract, like so:

```solidity
contract MyContract {
    uint128 public my_public_state_variable;
}
```

In Aztec.nr, we define a [`struct`](https://noir-lang.org/docs/noir/concepts/data_types/structs) that holds _all_ state variables. This struct is called **the storage struct**, and it is identified by having the [`#[storage]` macro](pathname:///aztec-nr-api/mainnet/noir_aztec/macros/storage/fn.storage) applied to it.

```rust
use aztec::macros::aztec;

#[aztec]
contract MyContract {
    use aztec::macros::storage;

    #[storage]
    struct Storage<Context> {
        // state variables go here e.g, the admin of the contract
        admin: PublicMutable<AztecAddress, Context>,
    }
}
```

This struct must also have a generic type called `C` or `Context` - an unfortunate boilerplate parameter that provides execution mode information.

The `#[storage]` macro can only be used once, so all contract state must be in a **single** struct.

### Accessing Storage

The contract's storage is accessed via `self.storage` in any contract function. It will automatically be tailored to the execution context of that function, hiding all methods that cannot be invoked there.

Consider, for example, a `PublicMutable` state variable, which is a value that is fully accessible in public functions, read-only in utility functions, and not accessible in private functions:

```rust
#[storage]
struct Storage<Context> {
    my_public_variable: PublicMutable<Field, Context>,
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

Public state variables are stored in the network's public storage tree and can only be written to by public contract functions. You can read _historic_ values of a public state variable in a private contract function, but the current values in the network's public state tree are not accessible in private functions. This means that most public state variables cannot be read from a private function, though there are some exceptions documented in the table below.

Below is a table comparing the key properties of the different public state variables that Aztec.nr offers:

| State variable         | Mutable?            | Readable in private? | Writable in private? | Example use case                                                                   |
| ---------------------- | ------------------- | -------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| [`PublicMutable`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PublicMutable)        | yes                 | no                   | no                   | Configuration of admins, global state (e.g. token total supply, total votes) |
| [`PublicImmutable`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PublicImmutable)      | no                  | yes                  | no                   | Fixed configuration, one-way actions (e.g. initialization settings for a proposal) |
| [`DelayedPublicMutable`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.DelayedPublicMutable) | yes (after a delay) | yes                  | no                   | Non time sensitive system configuration                                            |

### PublicMutable

`PublicMutable` is the simplest kind of public state variable: a value that can be read and written. It is essentially the same as a non-`immutable` or `constant` Solidity state variable.

It **cannot be read or written to privately**, but it is possible to have private functions enqueue a public call in which a `PublicMutable` is accessed. For example, a voting contract may allow private submission of votes which then enqueue a public call in which the vote count, represented as a `PublicMutable<u128>`, is incremented. This would let anyone see how many votes have been cast, while preserving the privacy of the account that cast the vote.

#### Declaration

Store mutable public state using `PublicMutable<T>` for values that need to be updated throughout the contract's lifecycle.

For example, storing the address of the collateral asset in a lending contract:

```rust title="public_mutable" showLineNumbers 
collateral_asset: PublicMutable<AztecAddress, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L33-L35" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L33-L35</a></sub></sup>


#### `read`

`PublicMutable` variables have a `read` method to read the value at the location in storage:

```rust title="public_mutable_read" showLineNumbers 
#[external("public")]
#[view]
fn get_assets() -> pub [AztecAddress; 2] {
    [self.storage.collateral_asset.read(), self.storage.stable_coin.read()]
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L260-L266" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L260-L266</a></sub></sup>


#### `write`

The `write` method on `PublicMutable` variables takes the value to write as an input and saves this in storage:

```rust title="public_mutable_write" showLineNumbers 
self.storage.collateral_asset.write(collateral_asset);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L61-L63" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/lending_contract/src/main.nr#L61-L63</a></sub></sup>


### PublicImmutable

`PublicImmutable` is a simplified version of `PublicMutable`: it's a public state variable that can only be written (initialized) once, at which point it can only be read. Unlike Solidity `immutable` state variables, which must be set in the contract's constructor, a `PublicImmutable` can be initialized _at any point in time_ during the contract's lifecycle. Attempts to read it prior to initialization will revert.

Due to the value being immutable, you can also read it during private execution - once a circuit proves that the value was set in the past, it knows it cannot have possibly changed. This makes this state variable suitable for immutable public contract configuration or one-off public actions, such as user registration status.

#### Declaration

For example, in the `Storage` struct in a simple token contract, the name, symbol, and decimals are `PublicImmutable` variables:

```rust title="public_immutable" showLineNumbers 
symbol: PublicImmutable<FieldCompressedString, Context>,
name: PublicImmutable<FieldCompressedString, Context>,
decimals: PublicImmutable<u8, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L45-L49" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L45-L49</a></sub></sup>


#### `initialize`

This function sets the immutable value. It can only be called once.

```rust title="public_immutable_initialize" showLineNumbers 
self.storage.name.initialize(FieldCompressedString::from_string(name));
self.storage.symbol.initialize(FieldCompressedString::from_string(symbol));
self.storage.decimals.initialize(decimals);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L55-L59" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L55-L59</a></sub></sup>


:::warning
A `PublicImmutable`'s storage **must** only be set once via `initialize`. Attempting to override this by manually accessing the underlying storage slots breaks all properties of the data structure, rendering it useless.
:::

#### `read`

Returns the stored immutable value. This function is available in public, private and utility contexts.

```rust title="public_immutable_read" showLineNumbers 
#[external("public")]
#[view]
fn public_get_name() -> FieldCompressedString {
    self.storage.name.read()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L62-L68" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/simple_token_contract/src/main.nr#L62-L68</a></sub></sup>


### DelayedPublicMutable

It is sometimes necessary to read public mutable state in private. For example, a decentralized exchange might have a configurable swap fee that some admin sets, but which needs to be read by users in their private swaps. This is where `DelayedPublicMutable` comes in.

`DelayedPublicMutable` is the same as a `PublicMutable` in that it is a public value that can be read and written, but with a caveat: writes only take effect _after some time delay_. These delays are configurable, but they're typically on the order of a couple hours, if not days, making this state variable unsuitable for actions that must be executed immediately - such as an emergency shutdown. It is these very delays that enable private contract functions to _read the current value of a public state variable_, which is otherwise typically impossible.

The existence of minimum delays means that a private function that reads a public value at an anchor block has a guarantee that said historical value will remain the current value until _at least_ some time in the future - before the delay elapses. As long as the transaction gets included in a block before that time (by using the `expiration_timestamp` tx property), the read value is valid.

#### Declaration

Unlike other state variables, `DelayedPublicMutable` receives not only a type parameter for the underlying datatype, but also a `DELAY` type parameter with the value change delay as a number of seconds.

```rust title="delayed_public_mutable_storage" showLineNumbers 
// Authorizing a new address has a certain delay before it goes into effect. Set to 180 seconds.
pub(crate) global CHANGE_AUTHORIZED_DELAY: u64 = 180;

#[storage]
struct Storage<Context> {
    // Admin can change the value of the authorized address via set_authorized()
    admin: PublicImmutable<AztecAddress, Context>,
    authorized: DelayedPublicMutable<AztecAddress, CHANGE_AUTHORIZED_DELAY, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L16-L26" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L16-L26</a></sub></sup>


#### `schedule_value_change`

This is the means by which a `DelayedPublicMutable` variable mutates its contents. It schedules a value change for the variable at a future timestamp after the `DELAY` has elapsed.

```rust title="schedule_value_change" showLineNumbers 
#[external("public")]
fn set_authorized(authorized: AztecAddress) {
    assert_eq(self.storage.admin.read(), self.msg_sender(), "caller is not admin");
    self.storage.authorized.schedule_value_change(authorized);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L35-L41" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L35-L41</a></sub></sup>


#### `get_current_value`

Returns the current value in a public, private or utility execution context.

```rust title="get_current_value" showLineNumbers 
#[external("public")]
#[view]
fn get_authorized() -> AztecAddress {
    self.storage.authorized.get_current_value()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L43-L49" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L43-L49</a></sub></sup>


:::warning Privacy Consideration
Reading `DelayedPublicMutable` in private sets the `expiration_timestamp` property, which may reveal timing information. Choose delays that align with common values to maximize privacy sets.
:::

#### `get_scheduled_value`

Returns the scheduled value and when it takes effect:

```rust title="get_scheduled_value" showLineNumbers 
#[external("public")]
#[view]
fn get_scheduled_authorized() -> (AztecAddress, u64) {
    self.storage.authorized.get_scheduled_value()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L51-L57" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/auth_contract/src/main.nr#L51-L57</a></sub></sup>


## Private State Variables

Private state variables have _private_ content meaning that only some people know what is stored in them. These work _very_ differently from public state variables and are unlike anything in languages such as Solidity, since they are built from fundamentally different primitives (UTXO-based notes and nullifiers instead of a key-value updatable public database).

Aztec.nr provides three private state variable types:

- `Owned<PrivateMutable<NoteType, Context>, Context>`: Single mutable private value
- `Owned<PrivateImmutable<NoteType, Context>, Context>`: Single immutable private value
- `Owned<PrivateSet<NoteType, Context>, Context>`: Collection of private notes

These private state variables are "owned" and must be wrapped in the `Owned<>` container, which enables owner-specific access via the `.at(owner)` method. Each also requires a `NoteType`. To understand this, let's go through notes and nullifiers and how they can be used so we can understand how private state works.

### Notes and Nullifiers

Just as public state is stored in a single public data tree (equivalent to the `key-value` store used for state on the EVM), private state is managed using two separate trees:

- **The note hash tree**: stores hashes of the private data, called notes, which are just structs containing private data with some methods.
- **The nullifier tree**: the nullifier for a certain note is deterministic, and the presence of the nullifier in the nullifier tree determines that the note has been spent/used.

Understanding these primitives and how they can be used is key to understanding how private state works.

#### Notes

Notes are user-defined data that can be stored privately on the blockchain. A note can represent any private data, such as an amount (e.g., some token balance), an ID (e.g., a vote proposal ID), or an address (e.g., an authorized account).

They also have some metadata, including a storage slot to avoid collisions with other notes, a `randomness` value that helps hide the content, and an `owner` who can nullify the note.

The note content plus the metadata are all hashed together, and it is this hash that gets stored onchain in the note hash tree. This hash is called a commitment. The underlying note content (the note hash preimage) is not stored anywhere onchain, so third parties cannot access it and it remains private. The note hash tree is append-only - if it wasn't, when a note was spent, external observers would notice that the tree leaf inserted in some transaction was modified in a second transaction, linking them together and leaking privacy. For example, when a user made a payment to a third party, the recipient would be able to know when they spent the received funds. Nullifiers exist to solve this issue.

Note: Aztec.nr comes with some prebuilt note types, including [`UintNote`](https://github.com/AztecProtocol/aztec-packages/tree/v4.3.1/noir-projects/aztec-nr/uint-note) and [`AddressNote`](https://github.com/AztecProtocol/aztec-packages/tree/v4.3.1/noir-projects/aztec-nr/address-note), but users are also free to create their own with the `#[note]` macro.

##### Note Lifecycle

Notes are more complicated than public state, and so it helps to see the different stages one goes through, and when and where each stage happens:

- **Creation**: an account executing a private contract function creates a new note according to contract logic, e.g., transferring tokens to a recipient. Note values (e.g., a token amount) and metadata are set, the note hash is computed, and inserted as one of the effects of the transaction.

- **Encryption**: the content of the note is encrypted with a key only the sender and intended recipient know - no other account can decrypt this message.

- **Delivery**: the encrypted message is delivered to the recipient via some means. Options include storing it onchain as a transaction log, or sending it offchain, e.g., via email or by having the recipient scan a QR code on the sender's device.

- **Insertion**: the transaction is sent to the network and gets included in a block. The note hash is inserted into the note hash tree - this is visible to the entire network, but the content of the note remains private.

- **Discovery**: the recipient processes the encrypted message they were sent, decrypting it and finding the note's content (i.e., the hash preimage). They verify that the note's hash exists onchain in the note hash tree. They store the note's content in their own private database and can now spend the note.

- **Reading**: while executing a private contract function, the recipient fetches the note's content and metadata from their private database (in their PXE) and shows that its hash exists in the note hash tree as part of the zero-knowledge proof.

- **Nullification**: the recipient computes the note's nullifier and inserts it as one of the effects of the transaction, preventing the note from being read again.

#### Nullifiers

A nullifier is a value which indicates a resource has been spent. Nullifiers are unique and stored onchain in the nullifier tree. The protocol forbids the same nullifier from being inserted into the tree twice. Spending the same resource therefore results in a duplicate nullifier, which invalidates the transaction.

The nullifier tree is **append-only** for the same reason that the note hash tree is append-only.

Most often, nullifiers are used to mark a note as being spent, which prevents note double spends. This requires two properties from the function that computes a note's nullifier:

- **Deterministic**: the nullifier **must** be deterministic given a note, so that the same nullifier value is computed every time the note is attempted to be spent. A non-deterministic nullifier would result in a note being spendable more than once because the nullifiers would not be duplicates.
- **Secret**: the nullifier **must** not be computable by anyone except the owner, _even by someone who knows the full note content_. This is because some third parties _do_ know the note content: when paying someone and creating a note for them, the payer creates the note on their device and thus has access to all of its data and metadata.

There are multiple ways to compute nullifiers that fulfill this property, but typically they are computed as a **hash of the note contents concatenated with a private key of the note's owner**. These values are **immutable**, and only the owner knows their private keys, ensuring both determinism and secrecy. These nullifiers are sometimes called 'zcash-style nullifiers' because this is the format ZCash uses for their note nullifiers.

### Note Messages and Discovery

Because notes are private, not even the intended recipient is aware of their existence, and therefore they must be somehow notified. For example, when making a payment and creating a note for the payee with the intended amount, they must be shown the preimage of the note that was inserted in the note hash tree in a given transaction in order to acknowledge the payment.

Recipients learning about notes created for them is known as 'note discovery', which is a process Aztec.nr handles efficiently and automatically. However, it does mean that when a note is created, a _message_ with the content of the note is created and needs to be delivered to a recipient via one of multiple means detailed below.

When working with private state variables, many operations return a `NoteMessage<Note>` type rather than the note directly. This is a type-safe wrapper that ensures you explicitly decide how to deliver the note to its recipient.

#### Delivery Methods

Private notes need to be communicated to their recipients so they know the note exists and can use it. The [`NoteMessage`](pathname:///aztec-nr-api/mainnet/noir_aztec/note/struct.NoteMessage) wrapper forces you to make an explicit choice about how this happens:
  - [`MessageDelivery.ONCHAIN_CONSTRAINED`](pathname:///aztec-nr-api/mainnet/noir_aztec/messages/message_delivery/struct.MessageDeliveryEnum#structfield.ONCHAIN_CONSTRAINED): Verified in the circuit (most secure, but highest cost) - Use when the sender cannot be trusted to deliver correctly (e.g., protocol fees, multisig config updates). **Warning:** Currently [not fully constrained](https://github.com/AztecProtocol/aztec-packages/issues/14565) - the log's tag is unconstrained.
  - [`MessageDelivery.ONCHAIN_UNCONSTRAINED`](pathname:///aztec-nr-api/mainnet/noir_aztec/messages/message_delivery/struct.MessageDeliveryEnum#structfield.ONCHAIN_UNCONSTRAINED): Message stored onchain but no guarantees on content - Use when the sender is incentivized to deliver correctly but may not have an offchain channel to the recipient.
  - [`MessageDelivery.OFFCHAIN`](pathname:///aztec-nr-api/mainnet/noir_aztec/messages/message_delivery/struct.MessageDeliveryEnum#structfield.OFFCHAIN): Lowest cost, no onchain data - Use when the sender and recipient can communicate and the sender is incentivized to deliver correctly.

```rust title="note_delivery" showLineNumbers 
#[external("private")]
fn mint(amount: u128, recipient: AztecAddress) {
    let replacement_note_message = self.storage.admin.get_note();
    let admin = replacement_note_message.get_note().address;
    assert(admin == self.msg_sender(), "Only admin can mint");

    // We deliver the new note message to the admin using unconstrained delivery, since the admin is motivated to
    // deliver the message to themselves (hence no need to constrain it).
    replacement_note_message.deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);
    // We increase the total supply and once again use unconstrained delivery, since the admin is motivated to
    // deliver the message (he's the owner of the new note as well).
    self.storage.total_supply.replace(|current| UintNote { value: current.value + amount }, admin).deliver(
        MessageDelivery.ONCHAIN_UNCONSTRAINED,
    );

    // At last we mint the tokens to the recipient.
    self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/private_token_contract/src/main.nr#L46-L65" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/private_token_contract/src/main.nr#L46-L65</a></sub></sup>


Methods that return `NoteMessage` include `initialize()`, `get_note()`, and `replace()` on `PrivateMutable`, `initialize()` on `PrivateImmutable`, and `insert()` on `PrivateSet` (more on these methods and private state variable types shortly).

### How Aztec.nr Abstracts Private State Variables

Implementing a private state variable requires careful coordination of multiple primitives and concepts (creating notes, encrypting, delivering, discovering and processing messages, reading notes, and computing their nullifiers). Aztec.nr provides convenient types and functions that handle all of these low-level details to allow developers to write safe code without having to understand the nitty-gritty.

By applying the `#[note]` [macro](pathname:///aztec-nr-api/mainnet/noir_aztec/macros/notes/fn.note) to a [noir struct](https://noir-lang.org/docs/noir/concepts/data_types/structs), users can define values that will be storable in notes. Private state variables can then hold these notes and be used to read, write, and deliver note messages to the intended recipient.

:::note
Advanced users can change this default behavior by either defining their [own custom note](./custom_notes.md) hash and nullifier functions, implementing their own state variables, or even accessing the note hash and nullifiers tree directly.
:::

The snippet below shows a contract with two private state variables: an admin address (stored in an `AddressNote`) and a counter of how many calls the admin has made (stored in a `UintNote`). These values will be private and therefore not known except by the accounts that own these notes (the admin). In the `perform_admin_action` private function, the contract checks that it is being called by the correct admin and updates the call count by incrementing it by one.

(Note that this is not a real snippet, it's missing some small irrelevant details - but the gist of it is correct)

```rust
#[note]
struct AddressNote {
    value: AztecAddress,
}

#[note]
struct UintNote {
    value: u128,
}

#[storage]
struct Storage {
    admin: Owned<PrivateImmutable<AddressNote, Context>, Context>,
    admin_call_count: Owned<PrivateMutable<UintNote, Context>, Context>,
}

#[external("private")]
fn perform_admin_action() {
    // Read the contract's admin address and check against the caller
    let admin = self.storage.admin.get_note().value;
    assert(self.msg_sender() == admin);
    // Update the call count by replacing (updating - rename soon) the current note with a new one that equals the
    // current value + 1 - this requires knowing what the current value is in the first place, i.e., reading the variable.
    //
    // We then deliver the encrypted message with the note's content to the admin so that they become aware of the new
    // value of the counter and can update it again in the future.
    self.storage.admin_call_count
        .replace(|current| UintNote{ value: current.value + 1 }) // wouldn't it be great if we didn't have to deal with this wrapping and unwrapping?
        .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

    // ...
}
```

### Choosing a Private State Variable

Due to the complexities of Aztec's private state model, private state variables do not map 1:1 with public state variables. Understanding these differences between the different private state variables is important when it comes to designing private smart contracts.

Below is a table comparing certain key properties of the different private state variables Aztec.nr offers:

| State variable     | Mutable? | Cost to read? | Writable by third parties? | Example use case                                                                                               |
| ------------------ | -------- | ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`PrivateMutable`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateMutable)   | yes      | yes           | no                         | Mutable user state only accessible by them (e.g. user settings or keys)                                        |
| [`PrivateImmutable`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateImmutable) | no       | no            | no                         | Fixed configuration, one-way actions (e.g. initialization settings for a proposal)                             |
| [`PrivateSet`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateSet)       | yes      | yes           | yes                        | Aggregated state others can add to, e.g. token balance (set of amount notes), nft collections (set of nft ids) |

### Owned State Variables

Private state variables like `PrivateMutable`, `PrivateImmutable`, and `PrivateSet` implement the `OwnedStateVariable` trait. You must wrap them in `Owned`.

Access the underlying state variable for a specific owner using `.at(owner)`

### PrivateMutable

`PrivateMutable` is conceptually similar to `PublicMutable` and regular Solidity state variables in that it is a variable that has exactly one value at any point in time that can be read and written. However, for `PrivateMutable`:

- The value is, of course, _private_, meaning only the account the value belongs to can read it.
- _Only ONE account can read and write the state variable_. It is not possible, for example, to use a `PrivateMutable` to store user settings and then have some admin account alter these settings.
- Reading the current value results in the state variable being updated, increasing tx costs and requiring delivery of a note message.
- There is no `write` function - the current value is instead `replace`d.

#### Declaration

```rust title="owned_private_mutable" showLineNumbers 
subscriptions: Owned<PrivateMutable<SubscriptionNote, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L61-L63" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L61-L63</a></sub></sup>


#### `is_initialized`

An unconstrained method to check whether the `PrivateMutable` has been initialized or not:

```rust title="owned_private_mutable_is_initialized" showLineNumbers 
#[external("utility")]
unconstrained fn is_initialized(subscriber: AztecAddress) -> bool {
    self.storage.subscriptions.at(subscriber).is_initialized()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L166-L171" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L166-L171</a></sub></sup>


#### `initialize` and `initialize_or_replace`

The `PrivateMutable` should be initialized to create the first note and value. This can be done with either `initialize` or `initialize_or_replace`:

```rust title="owned_private_mutable_initialize" showLineNumbers 
self
    .storage
    .subscriptions
    .at(subscriber)
    .initialize_or_replace(|_| SubscriptionNote { expiry_block_number, remaining_txs: tx_count })
    .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L156-L163" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/app_subscription_contract/src/main.nr#L156-L163</a></sub></sup>


#### `get_note`

This function allows us to get the note of a `PrivateMutable`, essentially reading the value:

```rust
#[external("private")]
fn read_settings() {
    let owner = self.msg_sender();
    self.storage.user_settings.at(owner).get_note().deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```

:::info
To ensure that a user's private execution always uses the latest value of a `PrivateMutable`, the `get_note` function will nullify the note that it is reading. This means that if two people are trying to use this function with the same note, only one will succeed.

Reading a `PrivateMutable` nullifies and recreates the note. This makes reads indistinguishable from writes and ensures the sequencer cannot learn the note's value.
:::

#### `replace`

To update the value of a `PrivateMutable`, we can use the `replace` method:

```rust title="owned_single_private_mutable_replace" showLineNumbers 
#[external("private")]
fn transfer_admin(new_admin: AztecAddress) {
    self
        .storage
        .admin
        .replace(
            |old| {
                assert(old.address == self.msg_sender(), "Only admin can transfer admin privileges");
                AddressNote { address: new_admin }
            },
            new_admin,
        )
        .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/app/private_token_contract/src/main.nr#L68-L83" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/private_token_contract/src/main.nr#L68-L83</a></sub></sup>


### PrivateImmutable

`PrivateImmutable` represents a unique private state variable that, as the name suggests, is immutable. Once initialized, its value cannot be altered. This is the private equivalent of `PublicImmutable`, except the value is only known to its owner.

Unlike `PrivateMutable`, the `get_note` function for a `PrivateImmutable` doesn't nullify the current note and returns the `Note` directly (not wrapped in `NoteMessage`). This means that multiple accounts can concurrently call this function to read the value.

#### Declaration

```rust title="private_immutable" showLineNumbers 
note_in_private_immutable: Owned<PrivateImmutable<TestNote, Context>, Context>,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L81-L83" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L81-L83</a></sub></sup>


`PrivateImmutable` variables also have the `initialize` and `get_note` functions on them but no `initialize_or_replace` since they cannot be modified.

### PrivateSet

`PrivateSet` is used for managing a collection of notes. Like `PrivateMutable`, this is a private state variable that can be modified. There are two key differences:

- A `PrivateSet` is not a single value but a _set_ (a collection) of values (represented by notes)
- Any account can insert values into someone else's set.

The set's current value is the collection of notes in the set that have not yet been nullified. These notes can have any type: they could be NFT IDs representing a user's NFT collection, or they might be token amounts, in which case _the sum_ of all values in the set would be the user's current balance.

#### Declaration

For example, to add private token balances to storage:

```rust title="private_set" showLineNumbers 
#[storage]
struct Storage<Context> {
    balances: Owned<PrivateSet<FieldNote, Context>, Context>,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L27-L32" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L27-L32</a></sub></sup>


#### `insert`

Allows us to modify the storage by inserting a note into the `PrivateSet`:

```rust title="private_set_insert" showLineNumbers 
owner_balance.insert(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L47-L49" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L47-L49</a></sub></sup>


Note: The `Owned` wrapper requires calling `.at(owner)` to access the underlying `PrivateSet` for a specific owner. This binds the owner to the state variable instance.

#### `get_notes`

Retrieves notes the account has access to. You can optionally provide filtering options. Returns `ConfirmedNote` instances:

```rust title="private_set_get_notes" showLineNumbers 
let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount);
// get note (note inserted at bottom of function shouldn't exist yet)
let notes = owner_balance.get_notes(options);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L66-L70" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L66-L70</a></sub></sup>


#### `pop_notes`

This function pops (gets, removes and returns) the notes the account has access to. Unlike `get_notes`, this immediately nullifies the notes and returns them directly (not wrapped in `ConfirmedNote`):

```rust title="private_set_pop_notes" showLineNumbers 
let options = NoteGetterOptions::new().set_limit(1);
let note = owner_balance.pop_notes(options).get(0);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.1/noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L133-L136" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/pending_note_hashes_contract/src/main.nr#L133-L136</a></sub></sup>


#### `remove`

Will remove a note from the `PrivateSet` if it previously has been read from storage. Takes a `ConfirmedNote` as returned by `get_notes`:

```rust
let options = NoteGetterOptions::new();
let confirmed_notes = self.storage.balances.at(owner).get_notes(options);
// ... select a note to remove ...
self.storage.balances.at(owner).remove(confirmed_notes.get(0));
```

Note that if you obtained the note via `get_notes`, it's much better to use `pop_notes`, as `pop_notes` results in significantly fewer constraints due to avoiding an extra hash and read request check.

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

When initializing, you still pass an owner address, but this specifies who can decrypt the note, not the storage location:

```rust
// owner_address determines who can see the note, not where it's stored
self.storage.admin.initialize(note, owner_address).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
```

:::warning
`SinglePrivateMutable` uses a nullify-and-recreate pattern when reading. Unless the caller is incentivized to deliver the note message correctly, you should use `MessageDelivery.ONCHAIN_CONSTRAINED` to prevent malicious actors from bricking the contract by failing to deliver the note.
:::

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

:::note
Maps can only be used with public state variables (`PublicMutable`, `PublicImmutable`, `DelayedPublicMutable`) or other `Map`s. For private state, use the `Owned` wrapper described above.
:::

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
    let new_note = UintNote { value: amount };
    self.storage.balances.at(to).insert(new_note).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);
}
```

The `Owned` wrapper is essential for private state variables because it binds the owner's address to the state variable instance, enabling proper note encryption, nullifier computation, and access control.

## Custom Structs in Public Storage

Both `PublicMutable` and `PublicImmutable` are generic over any serializable type, which means you can store custom structs in public storage.

### Define a Custom Struct

To use a custom struct in public storage, it must implement the `Packable` trait:

```rust
use aztec::protocol::{
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

The purpose of slots is the same for both domains: they keep the values of different state variables _separate_ so that they do not interfere with one another.

Storage slots are a low-level detail that developers don't typically need to concern themselves with. They are automatically allocated to each state variable by Aztec.nr. Utilizing storage slots directly can be dangerous as it may accidentally result in data collisions across state variables or invariants being broken.

In some advanced use cases, it can be useful to have access to these low-level details, such as when implementing [contract upgrades](./contract_upgrades.md) or when interacting with protocol contracts.
