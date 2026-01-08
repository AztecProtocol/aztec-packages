---
title: Partial Notes
sidebar_position: 1
tags: [Developers, Contracts, Notes]
description: "Learn how partial notes enable private-to-public value transfers when data depends on onchain state."
---

import Image from "@theme/IdealImage";

Partial notes are notes created with incomplete data during private execution, which are completed later with additional information that becomes available during public execution.

## Prerequisites

- Understanding of [notes and private state](../how_to_implement_custom_notes.md)
- Familiarity with [private and public function execution](../../../foundational-topics/call_types.md)

## Overview

Consider a `UintNote`:

```rust title="uint_note_def" showLineNumbers 
#[derive(Deserialize, Eq, Serialize, Packable)]
#[custom_note]
pub struct UintNote {
    /// The number stored in the note.
    pub value: u128,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L27-L34" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L27-L34</a></sub></sup>


The struct only contains the `value` field. Additional fields (`owner`, `randomness`, `storage_slot`) are passed as parameters during note hash computation.

When creating a note in private, the `owner` and `storage_slot` are known, but the `value` may not be (e.g., it depends on onchain state). A **partial note** commits to the private fields first, then is _completed_ by adding the `value` field during public execution.

<Image img={require("@site/static/img/partial-notes.png")} />

## Use Cases

Partial notes are useful when part of the note depends on dynamic, public onchain data unavailable during private execution:

- AMM swap prices
- Current gas prices
- Time-dependent interest accrual

## Two-Phase Commitment Process

All notes in Aztec use the partial note format internally. This ensures identical note hashes regardless of whether notes were created complete (all fields known in private) or as partial notes (completed later in public).

### Phase 1: Partial Commitment (Private Execution)

The private fields (`owner`, `randomness`, `storage_slot`) are committed during private execution, creating a `PartialUintNote`:

```rust title="partial_uint_note_def" showLineNumbers 
#[derive(Packable, Serialize, Deserialize, Eq)]
pub struct PartialUintNote {
    commitment: Field,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L189-L194" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L189-L194</a></sub></sup>


The commitment is computed as:

```rust title="compute_partial_commitment" showLineNumbers 
fn compute_partial_commitment(
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
) -> Field {
    poseidon2_hash_with_separator(
        [owner.to_field(), storage_slot, randomness],
        DOM_SEP__NOTE_HASH,
    )
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L161-L172" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L161-L172</a></sub></sup>


This produces: `partial_commitment = H(owner, storage_slot, randomness)`

### Phase 2: Note Completion (Public Execution)

The note is completed by hashing the partial commitment with the public value:

```rust title="compute_complete_note_hash" showLineNumbers 
fn compute_complete_note_hash(self, value: u128) -> Field {
    // Here we finalize the note hash by including the (public) value into the partial note commitment. Note that we
    // use the same generator index as we used for the first round of poseidon - this is not an issue.
    poseidon2_hash_with_separator([self.commitment, value.to_field()], DOM_SEP__NOTE_HASH)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L285-L291" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L285-L291</a></sub></sup>


The resulting note hash is: `H(partial_commitment, value)`

### Complete Notes Use the Same Format

When a note is created with all fields known, it still follows the same two-phase process internally:

```rust title="compute_note_hash" showLineNumbers 
fn compute_note_hash(
    self,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
) -> Field {
    // Partial notes can be implemented by having the note hash be either the result of multiscalar multiplication
    // (MSM), or two rounds of poseidon. MSM results in more constraints and is only required when multiple variants
    // of partial notes are supported. Because UintNote has just one variant (where the value is public), we use
    // poseidon instead.

    // We must compute the same note hash as would be produced by a partial note created and completed with the same
    // values, so that notes all behave the same way regardless of how they were created. To achieve this, we
    // perform both steps of the partial note computation.

    // First we create the partial note from a commitment to the private content (including storage slot).
    let partial_note = PartialUintNote {
        commitment: compute_partial_commitment(owner, storage_slot, randomness),
    };

    // Then compute the completion note hash. In a real partial note this step would be performed in public.
    partial_note.compute_complete_note_hash(self.value)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/aztec-nr/uint-note/src/uint_note.nr#L37-L61" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/uint-note/src/uint_note.nr#L37-L61</a></sub></sup>


This ensures notes with identical field values produce identical note hashes, regardless of whether they were created as partial or complete notes.

## Using Partial Notes

The typical workflow involves two function calls. The [Token contract](https://github.com/AztecProtocol/aztec-packages/tree/v4.0.0-nightly.20260108/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) demonstrates this pattern:

**1. Private function**: Create the partial note using `UintNote::partial()`:

```rust title="prepare_private_balance_increase" showLineNumbers 
#[internal("private")]
fn _prepare_private_balance_increase(to: AztecAddress) -> PartialUintNote {
    let partial_note = UintNote::partial(
        to,
        self.storage.balances.get_storage_slot(),
        self.context,
        to,
        self.msg_sender().unwrap(),
    );

    partial_note
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L353-L366" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L353-L366</a></sub></sup>


**2. Public function**: Complete the note with the now-known value:

```rust title="finalize_transfer_to_private" showLineNumbers 
#[internal("public")]
fn _finalize_transfer_to_private(
    from_and_completer: AztecAddress,
    amount: u128,
    partial_note: PartialUintNote,
) {
    // First we subtract the `amount` from the public balance of `from_and_completer`
    let balance_storage = self.storage.public_balances.at(from_and_completer);

    let from_balance = balance_storage.read().sub(amount);
    balance_storage.write(from_balance);

    // We finalize the transfer by completing the partial note.
    partial_note.complete(self.context, from_and_completer, amount);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260108/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L422-L438" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L422-L438</a></sub></sup>


The `completer` parameter ensures only the authorized address can finalize the note, preventing front-running attacks.

## Example: AMM Contract

The [AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes for token swaps. Since the exchange rate is only known onchain, a partial note is created for the recipient in private, then completed during public execution once the output amount is calculated.

## Next Steps

- [Implement custom notes](../how_to_implement_custom_notes.md) - Learn about note structure and lifecycle
- [Private and public execution](../../../foundational-topics/call_types.md) - Understand the execution model
- [Token contract tutorial](../../../tutorials/contract_tutorials/token_contract.md) - See partial notes in a complete example
