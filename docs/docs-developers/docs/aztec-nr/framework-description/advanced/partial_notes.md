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

#include_code uint_note_def /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The `UintNote` struct itself only contains the `value` field. Additional fields including `owner`, `randomness`, and `storage_slot` are passed as parameters during note hash computation.

When creating the note locally during private execution, the `owner` and `storage_slot` are known, but the `value` potentially is not (e.g., it depends on some onchain dynamic variable). First, a **partial note** can be created during private execution that commits to the `owner`, `randomness`, and `storage_slot`, and then the note is *"completed"* to create a full note by later adding the `value` field, usually during public execution.

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

#include_code uint_note_def /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

### Two-Phase Commitment Process

**Phase 1: Partial Commitment (Private Execution)**

The private fields (`owner`, `randomness`, and `storage_slot`) are committed during local, private execution:

#include_code compute_partial_commitment /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This creates a partial note commitment:

```
partial_commitment = H(owner, storage_slot, randomness)
```

**Phase 2: Note Completion (Public Execution)**

The note is completed by hashing the partial commitment with the public value:

#include_code compute_complete_note_hash /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The resulting structure is a nested commitment:

```
note_hash = H(H(owner, storage_slot, randomness), value)
          = H(partial_commitment, value)
```

## Universal Note Format

All notes in Aztec use the partial note format internally, even when all data is known during private execution. This ensures consistent note hash computation regardless of how the note was created.

When a note is created with all fields known (including `owner`, `storage_slot`, `randomness`, and `value`):

1. A partial commitment is computed from the private fields (`owner`, `storage_slot`, `randomness`)
2. The partial commitment is immediately completed with the `value` field

#include_code compute_note_hash /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This two-step process ensures that notes with identical field values produce identical note hashes, regardless of whether they were created as partial notes or complete notes.

<Image img={require("@site/static/img/shrek.jpeg")} />

## Partial Notes in Practice

To understand how to use partial notes in practice, [this AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes to initiate and complete the swap of `token1` to `token2`. Since the exchange rate is onchain, it cannot be known ahead of time while executing in private so a full note cannot be created. Instead, a partial note is created for the `owner` swapping the tokens. This partial note is then completed during public execution once the exchange rate can be read.
