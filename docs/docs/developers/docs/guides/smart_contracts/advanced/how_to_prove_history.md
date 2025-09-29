---
title: Proving Historic State
sidebar_position: 1
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

:::info Historical Proofs
Prove state at any past block using the Archive tree. Useful for timestamps, eligibility checks, and ownership verification.
:::

## Retrieve notes for proofs

```rust
use aztec::note::note_getter_options::NoteGetterOptions;

let options = NoteGetterOptions::new();
let notes = storage.notes.at(owner).get_notes(options);

// Access first note as retrieved_note
let retrieved_note = notes.get(0);
```

## Prove note inclusion

```rust
use dep::aztec::history::note_validity::ProveNoteValidity;

// Get block header for historical proof
let header = context.get_block_header();

// Prove note existed and wasn't nullified
// Requires: RetrievedNote, storage_slot, context
header.prove_note_validity(retrieved_note, storage_slot, &mut context);
```

:::tip
Use `prove_note_validity` to verify both inclusion and non-nullification in one call.
:::

## Prove nullifier inclusion

```rust
use dep::aztec::history::nullifier_inclusion::ProveNullifierInclusion;
use dep::aztec::protocol_types::hash::compute_siloed_nullifier;

// Compute nullifier (requires note hash)
let nullifier = note.compute_nullifier(&mut context, note_hash_for_nullification);
let siloed_nullifier = compute_siloed_nullifier(context.this_address(), nullifier);

// Prove nullifier was included
context.get_block_header().prove_nullifier_inclusion(siloed_nullifier);
```

:::info Additional Proofs

Other available proofs:
- Note inclusion without validity check
- Nullifier non-inclusion (prove something wasn't nullified)
- Public data inclusion at historical blocks

:::
