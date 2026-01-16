---
title: Implementing custom notes
description: Learn how to create and use custom note types for specialized private data storage in Aztec contracts
sidebar_position: 6
tags: [smart contracts, notes, privacy]
keywords: [implementing note, note, custom note]
---

This guide shows you how to create custom note types for storing specialized private data in your Aztec contracts.

## Prerequisites

- Basic understanding of [Aztec private state and notes](../../foundational-topics/state_management.md)
- Aztec development environment set up

## When to create custom notes

You may want to create your own note type if you need to:

- Store specific data types not provided by built-in note libraries
- Combine multiple fields into a single note (e.g., game cards with multiple attributes)
- Implement custom nullifier schemes for advanced use cases

:::info Built-in Note Types
Aztec.nr provides pre-built note types for common use cases:

**UintNote** - For numeric values like token balances (supports partial notes):

```toml
# In Nargo.toml
uint_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/uint-note" }
```

**FieldNote** - For storing single Field values:

```toml
# In Nargo.toml
field_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/field-note" }
```

**AddressNote** - For storing Aztec addresses:

```toml
# In Nargo.toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/address-note" }
```

:::

## Creating a custom note

Define your custom note with the `#[note]` macro:

#include_code nft_note_struct /docs/examples/contracts/nft/src/nft.nr rust

The `#[note]` macro generates the following for your struct:

- `NoteType` trait - Provides a unique type ID for the note
- `NoteHash` trait - Handles note hash and nullifier computation
- `NoteProperties` - Enables field selection when querying notes

### Required traits

Your note struct must derive:

- `Packable` - Required by the `#[note]` macro for serialization
- `Eq` - Required by storage types like `PrivateSet` for note comparisons

The `#[note]` macro handles the `NoteType`, `NoteHash`, and `NoteProperties` traits automatically.

### How note hashing works

When a note is inserted, the `#[note]` macro generates code that computes the note hash by combining:

1. **Your packed note data** - The fields you define in your struct
2. **Owner address** - Provided by the storage variable
3. **Storage slot** - Determined by the storage layout
4. **Randomness** - Generated automatically to prevent brute-force attacks

This happens automatically - you don't need to include owner or randomness fields in your struct.

## Using notes in storage

Notes are stored using `Owned<PrivateSet<...>>` which manages note ownership:

```rust
use aztec::{
    macros::storage::storage,
    state_vars::{Owned, PrivateSet},
};

#[storage]
struct Storage<Context> {
    // Collection of notes, indexed by owner
    nfts: Owned<PrivateSet<NFTNote, Context>, Context>,
}
```

### Inserting notes

#include_code mint /docs/examples/contracts/nft/src/main.nr rust

### Reading and removing notes

Use `pop_notes` to read and nullify notes atomically. This is the recommended pattern for most use cases:

#include_code burn /docs/examples/contracts/nft/src/main.nr rust

:::warning
There's also a `get_notes` function that reads without nullifying, but use it with caution - the returned notes may have already been spent in another transaction.
:::

## Custom note hashing

Most notes should use the standard `#[note]` macro. Use `#[custom_note]` only when you need:

- Custom nullifier schemes (e.g., notes spendable by anyone with a secret, not tied to an owner)
- Partial notes that can be completed in public execution
- Non-standard hash computation for specific security requirements

With `#[custom_note]`, you must implement the `NoteHash` trait yourself:

```rust
use aztec::{
    context::PrivateContext,
    macros::notes::custom_note,
    note::note_interface::NoteHash,
    protocol_types::{
        address::AztecAddress,
        constants::{DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_NULLIFIER},
        hash::poseidon2_hash_with_separator,
        traits::Packable,
    },
};

#[derive(Eq, Packable)]
#[custom_note]
pub struct CustomHashNote {
    pub data: Field,
}

impl NoteHash for CustomHashNote {
    fn compute_note_hash(
        self,
        owner: AztecAddress,
        storage_slot: Field,
        randomness: Field,
    ) -> Field {
        // Custom hash computation
        poseidon2_hash_with_separator(
            [self.data, owner.to_field(), storage_slot, randomness],
            DOM_SEP__NOTE_HASH,
        )
    }

    fn compute_nullifier(
        self,
        context: &mut PrivateContext,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Field {
        // Standard nullifier using owner's nullifier secret key
        let owner_npk_m = aztec::keys::getters::get_public_keys(owner).npk_m;
        let secret = context.request_nsk_app(owner_npk_m.hash());
        poseidon2_hash_with_separator(
            [note_hash_for_nullification, secret],
            DOM_SEP__NOTE_NULLIFIER,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(
        self,
        owner: AztecAddress,
        note_hash_for_nullification: Field,
    ) -> Field {
        let owner_npk_m = aztec::keys::getters::get_public_keys(owner).npk_m;
        let secret = aztec::keys::getters::get_nsk_app(owner_npk_m.hash());
        poseidon2_hash_with_separator(
            [note_hash_for_nullification, secret],
            DOM_SEP__NOTE_NULLIFIER,
        )
    }
}
```

## Viewing notes (unconstrained)

For read-only queries without constraints:

#include_code view_notes /noir-projects/noir-contracts/contracts/app/nft_contract/src/main.nr rust

## Further reading

- [What the `#[note]` macro does](./functions/attributes.md#implementing-notes)
- [Note getter options](./advanced/how_to_retrieve_filter_notes.md)
- [Storage types](../../foundational-topics/state_management.md)
- [Macros reference](./macros.md)
