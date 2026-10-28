---
title: Partial notes
sidebar_position: 1
tags: [Developers, Contracts, Notes]
description: How partial notes work, how they are completed, and how they enable use cases like AMM swaps and payment endpoints.
references: ["noir-projects/aztec-nr/uint-note/src/uint_note.nr"]
---

import Image from "@theme/IdealImage";

:::note Token standard
Where this page refers to a concrete token, it assumes the [AIP-20 fungible token standard](../../standards/aip-20.md). The partial-note primitive (`UintNote` / `PartialUintNote`) is token-agnostic; AIP-20 is one standard built on top of it.
:::

## What are partial notes?

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L29-L36" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L29-L36</a></sub></sup>


The `UintNote` struct itself only contains the `value` field. Additional fields including `owner`, `randomness`, and `storage_slot` are passed as parameters during note hash computation.

When creating the note locally during private execution, the `owner` and `storage_slot` are known, but the `value` potentially is not (e.g., it depends on some onchain dynamic variable). First, a **partial note** can be created during private execution that commits to the `owner` and `randomness`, and then the note is _"completed"_ to create a full note by later adding the `storage_slot` and `value` fields, usually during public execution.

<Image img={require("@site/static/img/partial-notes.png")} />

## Use cases

Partial notes are useful when part of the note struct is a value that depends on dynamic, public onchain data that isn't available during private execution, such as:

- AMM swap prices
- Current gas prices
- Time-dependent interest accrual

They are also useful as **payment endpoints**: a recipient can create a partial note ahead of time and share the commitment with prospective senders. Senders later complete the partial note to pay the recipient, with no action needed from the recipient at payment time. See [partial notes as payment endpoints](./partial_notes_as_payment_endpoints.md) for the full design.

## The completer

A partial note is finalized by a later completion step that supplies the public fields (`storage_slot` and `value`). At that point its private preimage (`owner` and `randomness`) is not re-derived or re-checked, and the partial note itself is just a `Field` that can be copied and shared freely. If anyone holding it could complete it, they could insert a note with an arbitrary, unbacked `value` into the note hash tree, or complete the note at the wrong time or with the wrong values.

To prevent this, the creator designates a **completer** at creation time. During the constrained private execution that creates the partial note, the contract records a validity commitment `H(partial_commitment, completer)` in the nullifier tree. Completion recomputes this commitment and asserts it exists, using its presence as proof that a legitimate, constrained execution created the partial note and authorized this specific completer to supply the public values and finalize it.

With AIP-20, the completer is chosen explicitly when calling `initialize_transfer_commitment`; completion (`transfer_private_to_commitment` / `transfer_public_to_commitment`) binds the completer to the caller's `msg_sender` and debits a separately authorized `from` account.

For `UintNote`, the fields split cleanly across the two phases:

| Field          | Fixed at                        | How                                                                                          |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `owner`        | Partial note creation (private) | Committed in `partial_commitment = H(owner, randomness)`                                      |
| `randomness`   | Partial note creation (private) | Same commitment; fresh per note, blinds the owner                                             |
| `completer`    | Partial note creation (private) | Bound in the validity commitment `H(partial_commitment, completer)`; not part of the note hash |
| `storage_slot` | Completion (public or private)  | Hashed into `note_hash = H(storage_slot, partial_commitment, value)`                          |
| `value`        | Completion (public or private)  | Same hash; supplied by the completer's call                                                   |

(`storage_slot` is typically known during private execution too; it is just not bound into the note hash until completion.)

The creator fixes who gets paid (`owner`) and who may finalize (`completer`); the completer later fixes how much (`value`). Funds therefore flow from the completing side to the note's owner: in AIP-20, completion debits the authorized `from` account (the completer itself, or a payer who authorized it) and credits the `owner` chosen by the creator.

## Single-use semantics

Each partial note is intended to be completed exactly once. The protocol does not enforce this directly: completion checks that a validity commitment exists in the nullifier tree but does not consume it, so a partial note can technically be completed more than once. However, reuse is unsafe for two independent reasons:

1. **Privacy.** The completion log is tagged by `H(partial_commitment)`. Two completions of the same partial note emit logs with the same tag, which publicly links those completions as paying the same recipient.
2. **Discovery.** The recipient's Private eXecution Environment (PXE) treats the partial note as pending until the first matching completion log is found. After the first match, the pending entry is removed. A second completion against the same commitment may not be discovered by the recipient's wallet, so the funds are effectively lost.

This is why an AIP-20 commitment should be completed only once. A second `transfer_private_to_commitment` (or `transfer_public_to_commitment`) against the same commitment is not found by the recipient's log processing on the second pass, so the amount is most likely lost.

The takeaway: treat each partial note as a one-shot object. To accept multiple payments, create multiple partial notes.

## Completion in public and private contexts

`PartialUintNote` supports completion in two contexts:

- `complete` runs in a public function (AIP-20's `transfer_public_to_commitment`). The storage slot and value are emitted in a public log tagged by the partial note's commitment. Anyone observing the chain learns the amount.
- `complete_from_private` runs in a private function (AIP-20's `transfer_private_to_commitment`). The same storage slot and value are emitted in a private log with the same tag. The payload is plaintext, but it is only discoverable by a party that can derive the tag, and the tag derives from the partial note's commitment.

For private→private completion, the privacy of the amount depends on whether the partial note's commitment itself is held secret. If the commitment is published publicly (e.g., in an onchain registry), anyone can derive the tag and read the amount from the private log payload. If the commitment is shared only with prospective senders, the amount stays hidden from outside observers.

One additional protocol constraint: `complete_from_private` requires the validity commitment to be settled in a prior transaction. A partial note cannot be both created and completed in the same private transaction. The public completion path has no such restriction.

## Implementation

All notes in Aztec use the partial note format internally. This ensures that notes produce identical note hashes regardless of whether they were created as complete notes (with all fields known in private) or as partial notes (completed later in public). By having all notes follow the same two-phase hash commitment process, the protocol maintains consistency and allows notes created through different flows to behave identically.

### Note structure example

The `UintNote` struct contains only the `value` field:

```rust title="uint_note_def" showLineNumbers 
#[derive(Deserialize, Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    /// The number stored in the note.
    pub value: u128,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L29-L36" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L29-L36</a></sub></sup>


### Two-phase commitment process

**Phase 1: partial commitment (private execution)**

The private fields (`owner` and `randomness`) are committed during local, private execution:

```rust title="compute_partial_commitment" showLineNumbers 
fn compute_partial_commitment(owner: AztecAddress, randomness: Field) -> Field {
    poseidon2_hash_with_separator(
        [owner.to_field(), randomness],
        DOM_SEP__PARTIAL_NOTE_COMMITMENT,
    )
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L144-L151" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L144-L151</a></sub></sup>


This creates a partial note commitment:

```
partial_commitment = H(owner, randomness)
```

**Phase 2: note completion (public execution)**

The note is completed by hashing the partial commitment with the public value:

```rust title="compute_complete_note_hash" showLineNumbers 
fn compute_complete_note_hash(self, storage_slot: Field, value: u128) -> Field {
    compute_note_hash(storage_slot, [self.commitment, value.to_field()])
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L256-L260" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L256-L260</a></sub></sup>


The resulting structure is a nested commitment:

```
note_hash = H(storage_slot, H(owner, randomness), value)
          = H(storage_slot, partial_commitment, value)
```

## Universal note format

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L39-L56" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L39-L56</a></sub></sup>


This two-step process ensures that notes with identical field values produce identical note hashes, regardless of whether they were created as partial notes or complete notes.

## Partial notes in practice

To understand how to use partial notes in practice, [this AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/v5.2.0/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes to initiate and complete the swap of `token1` to `token2`. Since the exchange rate is onchain, it cannot be known ahead of time while executing in private so a full note cannot be created. Instead, a partial note is created for the `owner` swapping the tokens. This partial note is then completed during public execution once the exchange rate can be read.

For a different application of the same primitive, where the partial note represents an offer to be paid rather than a deferred DeFi settlement, see [partial notes as payment endpoints](./partial_notes_as_payment_endpoints.md).
