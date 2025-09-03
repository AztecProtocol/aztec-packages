---
title: Implementing custom notes
description: Learn how to create and use custom note types for specialized private data storage in Aztec contracts
sidebar_position: 10
tags: [smart contracts, notes, privacy]
keywords: [implementing note, note, custom note]
---

This guide shows you how to create custom note types for storing specialized private data in your Aztec contracts. Notes are the fundamental data structure in Aztec when working with private state.

## Prerequisites

- Basic understanding of [Aztec private state](../../../aztec/concepts/storage/state_model.md)
- Familiarity with [notes and UTXOs](../../../aztec/concepts/storage/index.md)
- Aztec development environment set up

## Why create custom notes?

You may want to create your own note type if you need to:

- Use a specific type of private data or struct not already implemented in Aztec.nr
- Experiment with custom note hashing and nullifier schemes
- Store multiple pieces of related data together (e.g., a card in a game with multiple attributes)
- Optimize storage by combining data that's used together

## Standard note implementation

### Creating a custom note struct

Define your custom note with the `#[note]` macro:

```rust
use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
};

// We derive the Serialize trait because this struct is returned from a contract function
// We use Eq for comparisons, Packable for packing/unpacking the note
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
```

The `#[note]` macro automatically implements the required traits for your note type, including the `NoteHash` trait.

### Required fields

Every custom note needs these essential fields:

1. **Application data**: Your specific fields (e.g., `points`, `value`, `token_id`)
2. **Randomness**: Prevents brute-force attacks on note contents
3. **Owner**: Used for nullifier generation and access control

```rust
#[note]
pub struct MyNote {
    // Application-specific data
    data: Field,

    // Required for privacy - prevents preimage attacks
    randomness: Field,

    // Required for nullifier generation
    owner: AztecAddress,
}
```

### Why randomness matters

Without randomness, note contents can be guessed through brute force. For example, if you know someone's Aztec address, you could try hashing it with many potential values to find which note hash in the tree belongs to them.

### Why owner is important

The `owner` field provides two critical functions:

1. **Access control**: Ensures only the owner can spend the note
2. **Privacy from sender**: Prevents the sender from tracking when a note is spent

Without using the owner's nullifier key, a sender could derive the nullifier off-chain and monitor when it appears in the nullifier tree, breaking privacy.

### Implementing note methods

Add a constructor and helper methods:

```rust
impl CardNote {
    pub fn new(points: u8, owner: AztecAddress) -> Self {
        // Safety: We use randomness to preserve privacy. The sender already knows
        // the full note pre-image, so we trust them to cooperate in random generation
        let randomness = unsafe { random() };

        CardNote { points, randomness, owner }
    }

    pub fn get_points(self) -> u8 {
        self.points
    }
}
```

## Built-in note types

Aztec.nr provides several pre-built note types for common use cases:

### ValueNote

For storing numeric values (commonly used for token balances):

```rust
#[derive(Eq, Packable)]
#[note]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}

impl ValueNote {
    pub fn new(value: Field, owner: AztecAddress) -> Self {
        let randomness = unsafe { random() };
        ValueNote { value, owner, randomness }
    }

    pub fn value(self) -> Field {
        self.value
    }
}
```

#### Importing ValueNote

In Nargo.toml:

```toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/value-note" }
```

In your contract:

```rust
use value_note::value_note::ValueNote;
```

#### Working with ValueNote

Creating a new ValueNote:

```rust
let note = ValueNote::new(100, owner_address);
```

Getting total balance (sum of all notes):

```rust
unconstrained fn get_balance(notes: PrivateSet<ValueNote>) -> u128 {
    let mut sum = 0;
    for note in notes.get_notes(NoteGetterOptions::new()) {
        sum += note.value;
    }
    sum
}
```

Incrementing and decrementing:

```rust
// Increment creates a new note
increment(
    balance: PrivateSet<ValueNote, &mut PrivateContext>,
    amount: u128,
    recipient: AztecAddress
);

// Decrement spends existing notes
decrement(
    balance: PrivateSet<ValueNote, &mut PrivateContext>,
    amount: u128,
    owner: AztecAddress
);
```

### AddressNote

For storing Aztec addresses:

```rust
#[derive(Eq, Packable)]
#[note]
pub struct AddressNote {
    address: AztecAddress,
    owner: AztecAddress,
    randomness: Field,
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner: AztecAddress) -> Self {
        let randomness = unsafe { random() };
        AddressNote { address, owner, randomness }
    }

    pub fn get_address(self) -> AztecAddress {
        self.address
    }
}
```

#### Importing AddressNote

In Nargo.toml:

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/address-note" }
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
#[derive(Eq, Packable)]
#[custom_note]
pub struct TransparentNote {
    amount: u128,
    secret_hash: Field,
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
        note_hash_for_nullify: Field,
    ) -> Field {
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(
        self,
        note_hash_for_nullify: Field
    ) -> Field {
        self.compute_nullifier(zeroed(), note_hash_for_nullify)
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
    private_notes: Map<AztecAddress, PrivateSet<MyCustomNote, Context>, Context>,

    // Single immutable note
    config_note: PrivateImmutable<ConfigNote, Context>,
}
```

## Working with custom notes

### Creating and storing notes

```rust
#[private]
fn create_note(owner: AztecAddress, data: Field) {
    // Create the note
    let note = MyCustomNote::new(data, owner);

    // Store it in the owner's note set
    storage.private_notes.at(owner).insert(note);
}
```

### Reading notes

```rust
#[private]
fn get_notes(owner: AztecAddress) -> BoundedVec<MyCustomNote, MAX_NOTES> {
    // Get all notes for the owner
    let notes = storage.private_notes.at(owner).get_notes(
        NoteGetterOptions::new()
    );

    notes
}

#[private]
fn find_note_by_data(owner: AztecAddress, target_data: Field) -> MyCustomNote {
    let notes = storage.private_notes.at(owner).get_notes(
        NoteGetterOptions::new()
    );

    for note in notes {
        if note.data == target_data {
            return note;
        }
    }

    assert(false, "Note not found");
}
```

### Transferring notes

To transfer a custom note between users:

```rust
#[private]
fn transfer_note(from: AztecAddress, to: AztecAddress, data: Field) {
    // Find and remove from sender (nullifies the old note)
    let note = find_note_by_data(from, data);
    storage.private_notes.at(from).remove(note);

    // Create new note for recipient
    let new_note = MyCustomNote::new(data, to);
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

### Indexed notes

For efficient lookups by specific fields:

```rust
#[note]
pub struct OrderNote {
    owner: AztecAddress,
    order_id: Field,      // Index field
    amount: u128,
    randomness: Field,
}

impl OrderNote {
    // Helper for filtering by order_id
    pub fn with_order_id(order_id: Field) -> NoteFilter {
        NoteFilter::new(
            |note: OrderNote| note.order_id == order_id
        )
    }
}

// Usage
let order = storage.orders.at(owner).get_notes(
    NoteGetterOptions::new()
        .with_filter(OrderNote::with_order_id(target_id))
        .set_limit(1)
)[0];
```

## Best practices

### Security considerations

1. **Always include randomness**: Prevents brute-force attacks
2. **Never reuse randomness**: Each note needs unique randomness
3. **Include owner field**: Required for proper nullifier generation
4. **Validate inputs**: Check for zero addresses and invalid values

### Design principles

Keep notes focused on single concepts:

```rust
// Good: Single-purpose note
#[note]
pub struct PaymentNote {
    amount: u128,
    recipient: AztecAddress,
    randomness: Field,
}

// Avoid: Kitchen-sink note with unrelated fields
#[note]
pub struct EverythingNote {
    amount: u128,
    recipient: AztecAddress,
    token_id: Field,
    metadata: Field,
    permissions: Field,
    // Too many unrelated fields
}
```

### Note lifecycle management

Plan for the full lifecycle:

1. **Creation**: Include all necessary data
2. **Storage**: Use appropriate collection types (`PrivateSet`, `PrivateImmutable`)
3. **Retrieval**: Implement efficient getter methods with filters
4. **Transfer**: Handle ownership changes properly
5. **Deletion**: Nullify notes when no longer needed

## Troubleshooting

### Note not found errors

If notes aren't being found:

- Verify the owner address is correct
- Check that notes were properly inserted
- Ensure you're querying the right storage map
- Verify your filter conditions match the note data

### Privacy leaks

To maintain privacy:

- Always include randomness in every note
- Use `unsafe { random() }` for randomness generation
- Don't reuse randomness values
- Avoid predictable patterns in note data

### Performance issues

For better performance:

- Use filters to reduce the number of notes fetched
- Set appropriate limits with `set_limit()`
- Consider batching note operations
- Use indexed patterns for frequently queried fields

## Further reading

- [What the `#[note]` macro does](../../../aztec/smart_contracts/functions/attributes.md#implementing-notes)
- [Note lifecycle and nullifiers](../../../aztec/concepts/advanced/storage/indexed_merkle_tree.mdx)
- [Advanced note patterns](./advanced/how_to_retrieve_filter_notes.md)
- [Note portals for L1 communication](./how_to_communicate_cross_chain.md)
- [Macros reference](../../../developers/reference/smart_contract_reference/macros.md)
- [Keys, including npk_m_hash](../../../aztec/concepts/accounts/keys.md)
