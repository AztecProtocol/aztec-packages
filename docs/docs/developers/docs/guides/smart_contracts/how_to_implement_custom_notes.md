---
title: Implementing custom notes
description: Learn how to create and use custom note types for specialized private data storage in Aztec contracts
sidebar_position: 7
tags: [smart contracts, notes, privacy]
keywords: [implementing note, note, custom note]
---

This guide shows you how to create custom note types for storing specialized private data in your Aztec contracts. Notes are the fundamental data structure in Aztec when working with private state.

## Prerequisites

- Basic understanding of [Aztec private state](../../concepts/storage/state_model.md)
- Familiarity with [notes and UTXOs](../../concepts/storage/index.md)
- Aztec development environment set up

## Why create custom notes?

You may want to create your own note type if you need to:

- Use a specific type of private data or struct not already implemented in Aztec.nr
- Experiment with custom note hashing and nullifier schemes
- Store multiple pieces of related data together (e.g., a card in a game with multiple attributes)
- Optimize storage by combining data that's used together


:::info Built-in Note Types
Aztec.nr provides pre-built note types for common use cases:

**ValueNote** - For numeric values like token balances:
```toml
# In Nargo.toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/smart-contracts/value-note" }
```
```rust
use value_note::value_note::ValueNote;
let note = ValueNote::new(100, owner);
```

**AddressNote** - For storing Aztec addresses:
```toml
# In Nargo.toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/smart-contracts/address-note" }
```
```rust
use address_note::address_note::AddressNote;
let note = AddressNote::new(stored_address, owner);
```

If these don't meet your needs, continue reading to create your own custom note type.
:::


## Standard note implementation

### Creating a custom note struct

Define your custom note with the `#[note]` macro:

```rust
use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::Packable},
};

// The #[note] macro marks this struct as a note type
// Required traits:
// - Eq: Allows equality comparisons between notes
// - Packable: Enables efficient packing/unpacking of the note's data
#[derive(Eq, Packable)]
#[note]
pub struct CustomNote {
    // Application-specific data
    value: Field,
    data: u32,
    // Required fields for all notes
    owner: AztecAddress,  // Used for access control and nullifier generation
    randomness: Field,    // Prevents brute-force attacks on note contents
}
```

The `#[note]` macro automatically implements other required traits for your note type (ex. the `NoteHash` trait).

### Required fields

Every custom note needs these essential fields:

1. **Application data**: Your specific fields (e.g., `value`, `amount`, `token_id`)
2. **Owner**: Used for nullifier generation and access control (must be `AztecAddress` type)
3. **Randomness**: Prevents brute-force attacks on note contents (must be `Field` type)

The order of fields doesn't matter, but convention is to put application data first, then owner, then randomness:

```rust
#[derive(Eq, Packable)]
#[note]
pub struct MyNote {
    // Application-specific data
    data: Field,
    amount: u128,

    // Required fields
    owner: AztecAddress,
    randomness: Field,
}
```

### Why randomness matters

Without randomness, note contents can be guessed through brute force. For example, if you know someone's Aztec address, you could try hashing it with many potential values to find which note hash in the tree belongs to them.

### Why owner is important

The `owner` field provides two critical functions:

1. **Access control**: Ensures only the owner can spend the note
2. **Privacy from sender**: Prevents the sender from tracking when a note is spent

Without using the owner's nullifier key, a sender could derive the nullifier offchain and monitor when it appears in the nullifier tree, breaking privacy.

### Implementing note methods

A note is just a Struct, so you can add whatever methods you need. For example, you can add a constructor and helper methods:

```rust
impl CustomNote {
    pub fn new(value: Field, data: u32, owner: AztecAddress) -> Self {
        // Safety: We use randomness to preserve privacy. The sender already knows
        // the full note pre-image, so we trust them to cooperate in random generation
        let randomness = unsafe { random() };

        CustomNote { value, data, owner, randomness }
    }

    pub fn get_value(self) -> Field {
        self.value
    }

    pub fn get_data(self) -> u32 {
        self.data
    }
}
```

## Custom note with custom hashing

For complete control over note hashing and nullifier generation, use the `#[custom_note]` macro:

```rust
use dep::aztec::{
    context::PrivateContext,
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    protocol_types::{
        constants::{GENERATOR_INDEX__NOTE_HASH, GENERATOR_INDEX__NOTE_NULLIFIER},
        hash::poseidon2_hash_with_separator,
        traits::Packable,
    },
};

// TransparentNote for public-to-private transitions
// No owner field needed - security comes from secret knowledge
#[derive(Eq, Packable)]
#[custom_note]
pub struct TransparentNote {
    amount: u128,
    secret_hash: Field,  // Hash of a secret that must be known to spend
}

impl NoteHash for TransparentNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        let inputs = self.pack().concat([storage_slot]);
        poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__NOTE_HASH)
    }

    // Custom nullifier that doesn't use owner's key
    // Security is enforced by requiring the secret preimage
    fn compute_nullifier(
        self,
        _context: &mut PrivateContext,
        note_hash_for_nullification: Field,
    ) -> Field {
        poseidon2_hash_with_separator(
            [note_hash_for_nullification],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(
        self,
        note_hash_for_nullification: Field
    ) -> Field {
        self.compute_nullifier(zeroed(), note_hash_for_nullification)
    }
}
```

This pattern is useful for "shielding" tokens - creating notes in public that can be redeemed in private by anyone who knows the secret.

## Using custom notes in storage

Declare your custom note type in contract storage:

```rust
#[storage]
struct Storage<Context> {
    // Map from owner address to their notes
    private_notes: Map<AztecAddress, PrivateSet<CustomNote, Context>, Context>,

    // Single immutable note
    config_note: PrivateImmutable<ConfigNote, Context>,
}
```

## Working with custom notes

### Creating and storing notes

```rust
#[private]
fn create_note(owner: AztecAddress, value: Field, data: u32) {
    // Create the note
    let note = CustomNote::new(value, data, owner);

    // Store it in the owner's note set
    storage.private_notes.at(owner).insert(note);
}
```

### Reading notes

```rust
use aztec::note::note_getter_options::NoteGetterOptions;

#[private]
fn get_notes(owner: AztecAddress) -> BoundedVec<CustomNote, MAX_NOTES_PER_PAGE> {
    // Get all notes for the owner
    let notes = storage.private_notes.at(owner).get_notes(
        NoteGetterOptions::new()
    );

    notes
}

#[private]
fn find_note_by_value(owner: AztecAddress, target_value: Field) -> CustomNote {
    let options = NoteGetterOptions::new()
        .select(CustomNote::properties().value, target_value, Option::none())
        .set_limit(1);

    let notes = storage.private_notes.at(owner).get_notes(options);
    assert(notes.len() == 1, "Note not found");

    notes.get(0)
}
```

### Transferring notes

To transfer a custom note between users:

```rust
#[private]
fn transfer_note(from: AztecAddress, to: AztecAddress, value: Field) {
    // Find and remove from sender (nullifies the old note)
    let note = find_note_by_value(from, value);
    storage.private_notes.at(from).remove(note);

    // Create new note for recipient with same value but new owner
    let new_note = CustomNote::new(note.value, note.data, to);
    storage.private_notes.at(to).insert(new_note);
}
```

## Common patterns

### Singleton notes

For data that should have only one instance per user:

```rust
#[note]
pub struct ProfileNote {
    owner: AztecAddress,
    data: Field,
    randomness: Field,
}

#[private]
fn update_profile(new_data: Field) {
    let owner = context.msg_sender();

    // Remove old profile if exists
    let old_notes = storage.profiles.at(owner).get_notes(
        NoteGetterOptions::new().set_limit(1)
    );
    if old_notes.len() > 0 {
        storage.profiles.at(owner).remove(old_notes[0]);
    }

    // Create new profile
    let new_profile = ProfileNote::new(owner, new_data);
    storage.profiles.at(owner).insert(new_profile);
}
```

### Filtering notes

For efficient lookups by specific fields:

```rust
use aztec::note::note_getter_options::{NoteGetterOptions, PropertySelector};

#[derive(Eq, Packable)]
#[note]
pub struct OrderNote {
    order_id: Field,      // Field we want to filter by
    amount: u128,
    owner: AztecAddress,
    randomness: Field,
}

// Usage - filter by order_id
fn get_order(owner: AztecAddress, target_id: Field) -> OrderNote {
    let options = NoteGetterOptions::new()
        .select(OrderNote::properties().order_id, target_id, Option::none())
        .set_limit(1);

    let notes = storage.orders.at(owner).get_notes(options);
    assert(notes.len() == 1, "Order not found");
    notes.get(0)
}
```

## Further reading

- [What the `#[note]` macro does](../../concepts/smart_contracts/functions/attributes.md#implementing-notes)
- [Note lifecycle and nullifiers](../../concepts/advanced/storage/indexed_merkle_tree.mdx)
- [Advanced note patterns](./advanced/how_to_retrieve_filter_notes.md)
- [Note portals for L1 communication](./how_to_communicate_cross_chain.md)
- [Macros reference](../../reference/smart_contract_reference/macros.md)
- [Keys, including npk_m_hash](../../concepts/accounts/keys.md)
