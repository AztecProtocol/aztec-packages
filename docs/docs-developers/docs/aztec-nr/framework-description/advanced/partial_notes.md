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

#include_code uint_note_def noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

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

#include_code partial_uint_note_def noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The commitment is computed as:

#include_code compute_partial_commitment noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This produces: `partial_commitment = H(owner, storage_slot, randomness)`

### Phase 2: Note Completion (Public Execution)

The note is completed by hashing the partial commitment with the public value:

#include_code compute_complete_note_hash noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

The resulting note hash is: `H(partial_commitment, value)`

### Complete Notes Use the Same Format

When a note is created with all fields known, it still follows the same two-phase process internally:

#include_code compute_note_hash noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

This ensures notes with identical field values produce identical note hashes, regardless of whether they were created as partial or complete notes.

## Using Partial Notes

The typical workflow involves two function calls. The [Token contract](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr) demonstrates this pattern:

**1. Private function**: Create the partial note using `UintNote::partial()`:

#include_code prepare_private_balance_increase noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

**2. Public function**: Complete the note with the now-known value:

#include_code finalize_transfer_to_private noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

The `completer` parameter ensures only the authorized address can finalize the note, preventing front-running attacks.

## Example: AMM Contract

The [AMM contract](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/noir-contracts/contracts/app/amm_contract) uses partial notes for token swaps. Since the exchange rate is only known onchain, a partial note is created for the recipient in private, then completed during public execution once the output amount is calculated.

## Next Steps

- [Implement custom notes](../how_to_implement_custom_notes.md) - Learn about note structure and lifecycle
- [Private and public execution](../../../foundational-topics/call_types.md) - Understand the execution model
- [Token contract tutorial](../../../tutorials/contract_tutorials/token_contract.md) - See partial notes in a complete example
