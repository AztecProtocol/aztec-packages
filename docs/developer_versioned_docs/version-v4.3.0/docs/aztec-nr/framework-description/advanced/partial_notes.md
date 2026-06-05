---
title: Partial Notes
sidebar_position: 1
tags: [Developers, Contracts, Notes]
description: How partial notes work and how they can be used.
references: ["noir-projects/aztec-nr/uint-note/src/uint_note.nr", "noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr"]
---

import Image from "@theme/IdealImage";

## What are Partial Notes?

Partial notes are notes created with incomplete data, usually during private execution, which can be completed with additional information that becomes available later, usually during public execution.

Let's say, for example, we have a `UintNote`:

```rust title="uint_note_def" showLineNumbers 
#[derive(Deserialize, Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    /// The number stored in the note.
    pub value: u128,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L26-L33" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L26-L33</a></sub></sup>


The `UintNote` struct itself only contains the `value` field. Additional fields including `owner`, `randomness`, and `storage_slot` are passed as parameters during note hash computation.

When creating the note locally during private execution, the `owner` and `storage_slot` are known, but the `value` potentially is not (e.g., it depends on some onchain dynamic variable). First, a **partial note** can be created during private execution that commits to the `owner` and `randomness`, and then the note is *"completed"* to create a full note by later adding the `storage_slot` and `value` fields, usually during public execution.

<Image img={require("@site/static/img/partial-notes.png")} />

## Use Cases

Partial notes are useful when a e.g., part of the note struct is a value that depends on dynamic, public onchain data that isn't available during private execution, such as:

- AMM swap prices
- Current gas prices
- Time-dependent interest accrual

## Implementation

All notes in Aztec use the partial note format internally. This ensures that notes produce identical note hashes regardless of whether they were created as complete notes (with all fields known in private) or as partial notes (completed later in public). By having all notes follow the same two-phase hash commitment process, the protocol maintains consistency and allows notes created through different flows to behave identically.

### Note Structure Example

The `UintNote` struct contains only the `value` field:

```rust title="uint_note_def" showLineNumbers 
#[derive(Deserialize, Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    /// The number stored in the note.
    pub value: u128,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L26-L33" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L26-L33</a></sub></sup>


### Two-Phase Commitment Process

**Phase 1: Partial Commitment (Private Execution)**

The private fields (`owner` and `randomness`) are committed during local, private execution:

```rust title="compute_partial_commitment" showLineNumbers 
fn compute_partial_commitment(owner: AztecAddress, randomness: Field) -> Field {
    poseidon2_hash_with_separator([owner.to_field(), randomness], DOM_SEP__NOTE_HASH)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L143-L147" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L143-L147</a></sub></sup>


This creates a partial note commitment:

```
partial_commitment = H(owner, randomness)
```

**Phase 2: Note Completion (Public Execution)**

The note is completed by hashing the partial commitment with the public value:

```rust title="compute_complete_note_hash" showLineNumbers 
fn compute_complete_note_hash(self, storage_slot: Field, value: u128) -> Field {
    // Here we finalize the note hash by including the (public) storage slot and value into the partial note
    // commitment. Note that we use the same separator as we used for the first round of poseidon - this is not
    // an issue.
    poseidon2_hash_with_separator(
        [self.commitment, storage_slot, value.to_field()],
        DOM_SEP__NOTE_HASH,
    )
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L241-L251" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L241-L251</a></sub></sup>


The resulting structure is a nested commitment:

```
note_hash = H(H(owner, randomness), storage_slot, value)
          = H(partial_commitment, storage_slot, value)
```

## Universal Note Format

All notes in Aztec use the partial note format internally, even when all data is known during private execution. This ensures consistent note hash computation regardless of how the note was created.

When a note is created with all fields known (including `owner`, `storage_slot`, `randomness`, and `value`):

1. A partial commitment is computed from the private fields (`owner`, `randomness`)
2. The partial commitment is immediately completed with the `storage_slot` and `value` fields

```rust title="compute_note_hash" showLineNumbers 
fn compute_note_hash(self, owner: AztecAddress, storage_slot: Field, randomness: Field) -> Field {
    // Partial notes can be implemented by having the note hash be either the result of multiscalar multiplication
    // (MSM), or two rounds of poseidon. MSM results in more constraints and is only required when multiple
    // variants of partial notes are supported. Because UintNote has just one variant (where the value is public),
    // we use poseidon instead.

    // We must compute the same note hash as would be produced by a partial note created and completed with the
    // same values, so that notes all behave the same way regardless of how they were created. To achieve this, we
    // perform both steps of the partial note computation.

    // First we create the partial note from a commitment to the private content.
    let partial_note = PartialUintNote { commitment: compute_partial_commitment(owner, randomness) };

    // Then compute the completion note hash. In a real partial note this step would be performed in public.
    partial_note.compute_complete_note_hash(storage_slot, self.value)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.3.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L36-L53" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L36-L53</a></sub></sup>


This two-step process ensures that notes with identical field values produce identical note hashes, regardless of whether they were created as partial notes or complete notes.


## Partial Notes in Practice

To understand how to use partial notes in practice, [this AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/v4.3.0/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes to initiate and complete the swap of `token1` to `token2`. Since the exchange rate is onchain, it cannot be known ahead of time while executing in private so a full note cannot be created. Instead, a partial note is created for the `owner` swapping the tokens. This partial note is then completed during public execution once the exchange rate can be read.
