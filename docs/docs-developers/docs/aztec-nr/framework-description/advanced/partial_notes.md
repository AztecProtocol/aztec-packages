---
title: Partial notes
sidebar_position: 1
tags: [Developers, Contracts, Notes]
description: How partial notes work, how they are completed, and how they enable use cases like AMM swaps and payment endpoints.
references:
  [
    "noir-projects/aztec-nr/uint-note/src/uint_note.nr",
    "noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr",
  ]
---

import Image from "@theme/IdealImage";

## What are partial notes?

Partial notes are notes created with incomplete data, usually during private execution, which can be completed with additional information that becomes available later, usually during public execution.

Let's say, for example, we have a `UintNote`:

#include_code uint_note_def /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The `UintNote` struct itself only contains the `value` field. Additional fields including `owner`, `randomness`, and `storage_slot` are passed as parameters during note hash computation.

When creating the note locally during private execution, the `owner` and `storage_slot` are known, but the `value` potentially is not (e.g., it depends on some onchain dynamic variable). First, a **partial note** can be created during private execution that commits to the `owner` and `randomness`, and then the note is _"completed"_ to create a full note by later adding the `storage_slot` and `value` fields, usually during public execution.

<Image img={require("@site/static/img/partial-notes.png")} />

## Use cases

Partial notes are useful when part of the note struct is a value that depends on dynamic, public onchain data that isn't available during private execution, such as:

- AMM swap prices
- Current gas prices
- Time-dependent interest accrual

They are also useful as **payment endpoints**: a recipient can mint a partial note ahead of time and share the commitment with prospective senders. Senders later complete the partial note to pay the recipient, who does not need to be online for the payment to land. See [partial notes as payment endpoints](./partial_notes_as_payment_endpoints.md) for the full design.

## Single-use semantics

Each partial note is intended to be completed exactly once. The protocol does not enforce this directly: completion checks that a validity commitment exists in the nullifier tree but does not consume it, so a partial note can technically be completed more than once. However, reuse is unsafe for two independent reasons:

1. **Privacy.** The completion log is tagged by `H(partial_commitment, ...)`. Two completions of the same partial note emit logs with the same tag, which publicly links those completions as paying the same recipient.
2. **Discovery.** The recipient's Private eXecution Environment (PXE) treats the partial note as pending until the first matching completion log is found. After the first match, the pending entry is removed. A second completion against the same commitment may not be discovered by the recipient's wallet, so the funds are effectively lost.

The token contract's `finalize_transfer_to_private` documents this behavior directly: reusing a `partial_note` argument means the amount "would most likely get lost" because partial note log processing fails to find the pending entry on the second pass.

The takeaway: treat each partial note as a one-shot object. To accept multiple payments, mint multiple partial notes.

## Completion in public and private contexts

`PartialUintNote` supports completion in two contexts:

- `complete` runs in a public function. The storage slot and value are emitted in a public log tagged by the partial commitment. Anyone observing the chain learns the amount.
- `complete_from_private` runs in a private function. The same storage slot and value are emitted in a private log with the same tag. The payload is plaintext, but it is only useful to a party that knows the tag, and the tag derives from the partial commitment.

For private→private completion, the privacy of the amount depends on whether the partial commitment itself is held secret. If the commitment is published publicly (e.g., in an onchain registry), anyone can derive the tag and read the amount from the private log payload. If the commitment is shared only with prospective senders, the amount stays hidden from outside observers.

One additional protocol constraint: `complete_from_private` requires the validity commitment to be settled in a prior transaction. A partial note cannot be both minted and completed in the same private transaction. The public completion path has no such restriction.

## Implementation

All notes in Aztec use the partial note format internally. This ensures that notes produce identical note hashes regardless of whether they were created as complete notes (with all fields known in private) or as partial notes (completed later in public). By having all notes follow the same two-phase hash commitment process, the protocol maintains consistency and allows notes created through different flows to behave identically.

### Note structure example

The `UintNote` struct contains only the `value` field:

#include_code uint_note_def /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

### Two-phase commitment process

**Phase 1: partial commitment (private execution)**

The private fields (`owner` and `randomness`) are committed during local, private execution:

#include_code compute_partial_commitment /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This creates a partial note commitment:

```
partial_commitment = H(owner, randomness)
```

**Phase 2: note completion (public execution)**

The note is completed by hashing the partial commitment with the public value:

#include_code compute_complete_note_hash /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The resulting structure is a nested commitment:

```
note_hash = H(H(owner, randomness), storage_slot, value)
          = H(partial_commitment, storage_slot, value)
```

## Universal note format

All notes in Aztec use the partial note format internally, even when all data is known during private execution. This ensures consistent note hash computation regardless of how the note was created.

When a note is created with all fields known (including `owner`, `storage_slot`, `randomness`, and `value`):

1. A partial commitment is computed from the private fields (`owner`, `randomness`)
2. The partial commitment is immediately completed with the `storage_slot` and `value` fields

#include_code compute_note_hash /noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This two-step process ensures that notes with identical field values produce identical note hashes, regardless of whether they were created as partial notes or complete notes.

## Partial notes in practice

To understand how to use partial notes in practice, [this AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes to initiate and complete the swap of `token1` to `token2`. Since the exchange rate is onchain, it cannot be known ahead of time while executing in private so a full note cannot be created. Instead, a partial note is created for the `owner` swapping the tokens. This partial note is then completed during public execution once the exchange rate can be read.

For a different application of the same primitive, where the partial note represents an offer to be paid rather than a deferred DeFi settlement, see [partial notes as payment endpoints](./partial_notes_as_payment_endpoints.md).
