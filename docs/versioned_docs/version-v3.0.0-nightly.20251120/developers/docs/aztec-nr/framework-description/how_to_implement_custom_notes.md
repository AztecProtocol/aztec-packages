---
title: Implementing custom notes
description: Learn how to create and use custom note types for specialized private data storage in Aztec contracts
sidebar_position: 6
tags: [smart contracts, notes, privacy]
keywords: [implementing note, note, custom note]
---

This guide shows you how to create custom note types for storing specialized private data in your Aztec contracts. Notes are the fundamental data structure in Aztec when working with private state.

## Prerequisites

- Basic understanding of [Aztec private state](../../foundational-topics/state_management.md)
- Familiarity with [notes and UTXOs](../../foundational-topics/state_management.md)
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
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v3.0.0-nightly.20251120", directory="noir-projects/smart-contracts/value-note" }
```

```rust
use value_note::value_note::ValueNote;
let note = ValueNote::new(100, owner);
```

**AddressNote** - For storing Aztec addresses:

```toml
# In Nargo.toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v3.0.0-nightly.20251120", directory="noir-projects/smart-contracts/address-note" }
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

## Basic usage in storage

Before diving into Maps, let's understand basic custom note usage.

### Declare storage

```rust
use dep::aztec::state_vars::{PrivateSet, PrivateImmutable};

#[storage]
struct Storage<Context> {
    // Collection of notes for a single owner
    balances: PrivateSet<CustomNote, Context>,

    // Single immutable configuration
    config: PrivateImmutable<ConfigNote, Context>,
}
```

### Insert notes

```rust
use dep::aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn create_note(value: Field, data: u32) {
    let owner = context.msg_sender().unwrap();
    let note = CustomNote::new(value, data, owner);

    storage.balances
        .insert(note)
        .emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

### Read notes

```rust
use dep::aztec::note::note_getter_options::NoteGetterOptions;

#[external("private")]
fn get_notes() -> BoundedVec<CustomNote, MAX_NOTES_PER_PAGE> {
    storage.balances.get_notes(NoteGetterOptions::new())
}

#[external("private")]
fn find_note_by_value(target_value: Field) -> CustomNote {
    let options = NoteGetterOptions::new()
        .select(CustomNote::properties().value, target_value, Option::none())
        .set_limit(1);

    let notes = storage.balances.get_notes(options);
    assert(notes.len() == 1, "Note not found");
    notes.get(0)
}
```

### Transfer notes

```rust
#[external("private")]
fn transfer_note(to: AztecAddress, value: Field) {
    // Find and remove from sender
    let note = find_note_by_value(value);
    storage.balances.remove(note);

    // Create new note for recipient
    let new_note = CustomNote::new(note.value, note.data, to);
    storage.balances.insert(new_note)
        .emit(&mut context, to, MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

## Using custom notes with Maps

Maps are essential for organizing custom notes by key in private storage. They allow you to efficiently store and retrieve notes based on addresses, IDs, or other identifiers.

### Common Map patterns

```rust
use dep::aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::Packable},
    state_vars::{Map, PrivateMutable, PrivateSet},
};

#[derive(Eq, Packable)]
#[note]
pub struct CardNote {
    points: u32,
    strength: u32,
    owner: AztecAddress,
    randomness: Field,
}

impl CardNote {
    pub fn new(points: u32, strength: u32, owner: AztecAddress) -> Self {
        let randomness = unsafe { random() };
        CardNote { points, strength, owner, randomness }
    }
}

#[storage]
struct Storage<Context> {
    // Map from player address to their collection of cards
    card_collections: Map<AztecAddress, PrivateSet<CardNote, Context>, Context>,

    // Map from player address to their active card
    active_cards: Map<AztecAddress, PrivateMutable<CardNote, Context>, Context>,

    // Nested maps: game_id -> player -> cards
    game_cards: Map<Field, Map<AztecAddress, PrivateSet<CardNote, Context>, Context>, Context>,
}
```

Common patterns:

- `Map<AztecAddress, PrivateSet<CustomNote>>` - Multiple notes per user (like token balances, card collections)
- `Map<AztecAddress, PrivateMutable<CustomNote>>` - Single note per user (like user profile, active state)
- `Map<Field, Map<AztecAddress, PrivateSet<CustomNote>>>` - Nested organization (game sessions, channels)

### Inserting into mapped PrivateSets

To add notes to a mapped PrivateSet:

```rust
use dep::aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn add_card_to_collection(player: AztecAddress, points: u32, strength: u32) {
    let card = CardNote::new(points, strength, player);

    // Insert into the player's collection
    storage.card_collections
        .at(player)
        .insert(card)
        .emit(&mut context, player, MessageDelivery.CONSTRAINED_ONCHAIN);
}
```

### Using mapped PrivateMutable

For PrivateMutable in a Map, handle both initialization and updates:

```rust
use dep::aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn set_active_card(player: AztecAddress, points: u32, strength: u32) {
    // Check if already initialized
    let is_initialized = storage.active_cards.at(player).is_initialized();

    if is_initialized {
        // Replace existing card
        storage.active_cards
            .at(player)
            .replace(|_old_card| CardNote::new(points, strength, player))
            .emit(&mut context, player, MessageDelivery.CONSTRAINED_ONCHAIN);
    } else {
        // Initialize for first time
        let card = CardNote::new(points, strength, player);
        storage.active_cards
            .at(player)
            .initialize(card)
            .emit(&mut context, player, MessageDelivery.CONSTRAINED_ONCHAIN);
    }
}
```

### Reading from mapped PrivateSets

```rust
use dep::aztec::note::note_getter_options::NoteGetterOptions;

#[external("private")]
fn get_player_cards(player: AztecAddress) -> BoundedVec<CardNote, MAX_NOTES_PER_PAGE> {
    // Get all cards for this player
    storage.card_collections
        .at(player)
        .get_notes(NoteGetterOptions::new())
}

#[external("private")]
fn get_total_points(player: AztecAddress) -> u32 {
    let options = NoteGetterOptions::new();
    let notes = storage.card_collections.at(player).get_notes(options);

    let mut total = 0;
    for i in 0..notes.len() {
        let card = notes.get(i);
        total += card.points;
    }
    total
}
```

### Reading from mapped PrivateMutable

```rust
#[external("private")]
fn get_active_card(player: AztecAddress) -> CardNote {
    storage.active_cards.at(player).get_note()
}
```

### Filtering notes in Maps

Filter notes by their fields when reading from maps:

```rust
use dep::aztec::{note::note_getter_options::NoteGetterOptions, utils::comparison::Comparator};

#[external("private")]
fn find_strong_cards(player: AztecAddress, min_strength: u32) -> BoundedVec<CardNote, MAX_NOTES_PER_PAGE> {
    let options = NoteGetterOptions::new()
        .select(CardNote::properties().strength, Comparator.GTE, min_strength)
        .set_limit(10);

    storage.card_collections.at(player).get_notes(options)
}
```

### Working with nested Maps

Navigate nested map structures to organize data hierarchically:

```rust
use dep::aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn add_card_to_game(
    game_id: Field,
    player: AztecAddress,
    points: u32,
    strength: u32
) {
    let card = CardNote::new(points, strength, player);

    // Navigate nested maps: game_cards[game_id][player]
    storage.game_cards
        .at(game_id)
        .at(player)
        .insert(card)
        .emit(&mut context, player, MessageDelivery.CONSTRAINED_ONCHAIN);
}

#[external("private")]
fn get_game_cards(
    game_id: Field,
    player: AztecAddress
) -> BoundedVec<CardNote, MAX_NOTES_PER_PAGE> {
    storage.game_cards
        .at(game_id)
        .at(player)
        .get_notes(NoteGetterOptions::new())
}
```

## Further reading

- [What the `#[note]` macro does](../../aztec-nr/framework-description/functions/attributes.md#implementing-notes)
- [Note lifecycle and nullifiers](../../foundational-topics/advanced/storage/indexed_merkle_tree.mdx)
- [Advanced note patterns](./advanced/how_to_retrieve_filter_notes.md)
- [Note portals for L1 communication](./how_to_communicate_cross_chain.md)
- [Macros reference](../../aztec-nr/framework-description/macros.md)
- [Keys, including npk_m_hash](../../foundational-topics/accounts/keys.md)
