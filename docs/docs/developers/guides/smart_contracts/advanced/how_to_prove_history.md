---
title: How to Prove Historic State
sidebar_position: 8
tags: [contracts]
description: Prove historical state and note inclusion in your Aztec smart contracts using the Archive tree.
---

This guide shows you how to prove historical state transitions and note inclusion using Aztec's Archive tree.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of Aztec's note and nullifier system
- Knowledge of Merkle tree concepts

## Understand what you can prove

You can create proofs for these elements at any past block height:

- Note inclusion/exclusion
- Nullifier inclusion/exclusion  
- Note validity (included and not nullified)
- Public value existence
- Contract deployment

Use cases include:

- Timestamp verification in private contexts
- Eligibility verification based on historical note ownership
- Item ownership verification
- Public data existence proofs
- Contract deployment verification

## Prepare notes for proofs

### Create a test note (if needed)

```rust
let note = MyNote::new(value, owner);
create_note(&mut context, storage_slot, note).emit(encode_and_encrypt_note(
    &mut context,
    owner,
));
```

### Retrieve notes from PXE

```rust
let (retrieved_notes, _): (BoundedVec<RetrievedNote<MyNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
    get_notes(&mut context, storage_slot, options);
```

## Prove note inclusion

### Prove a note existed in a block

```rust
let header = context.historical_header;
header.prove_note_inclusion(retrieved_note, MY_NOTE_STORAGE_SLOT);
```

### Prove note validity (existed and not nullified)

```rust
let header = context.historical_header;
header.prove_note_validity(retrieved_note, MY_NOTE_STORAGE_SLOT, context);
```

## Prove nullifier inclusion

### Create a nullifier

```rust
destroy_note_unsafe(&mut context, retrieved_note, note_hash);
```

### Prove nullifier was included in a block

```rust
let header = context.historical_header;
header.prove_nullifier_inclusion(siloed_nullifier);
```

## Explore additional proofs

The Aztec SDK provides additional proof methods for:
- Contract inclusion proofs
- Public value inclusion proofs  
- Current state lookups

Explore the available methods in the Aztec SDK documentation for more advanced use cases.
