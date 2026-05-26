---
title: Proving Historic State
sidebar_position: 15
tags: [contracts]
description: Prove historical state and note inclusion in your Aztec smart contracts using the Archive tree.
references: ["noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr"]
---

This guide shows you how to prove historical state transitions and note inclusion using Aztec's Archive tree.

## Prerequisites

- An Aztec contract project set up
- Understanding of Aztec's note and nullifier system

## What you can prove

You can create proofs for these elements at any past block height:

- **Note inclusion** - prove a note existed in the note hash tree
- **Note validity** - prove a note existed and wasn't nullified at a specific block
- **Nullifier inclusion/non-inclusion** - prove a nullifier was or wasn't in the nullifier tree
- **Contract deployment** - prove a contract's bytecode was published or initialized

Common use cases:
- Verify ownership of an asset from another contract without revealing which specific note
- Prove eligibility based on historical state (e.g., "owned tokens at block X")
- Claim rewards based on past contributions (see the [claim contract](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr) for a complete example)

## Prove note inclusion

Import the function:

#include_code history_import noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr rust

Prove a note exists in the note hash tree:

#include_code prove_note_inclusion noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr rust

## Prove note validity

To prove a note was valid (existed AND wasn't nullified) at a historical block:

```rust
use aztec::history::note::assert_note_was_valid_by;

let header = self.context.get_anchor_block_header();
assert_note_was_valid_by(header, hinted_note, &mut self.context);
```

This verifies both:
1. The note was included in the note hash tree
2. The note's nullifier was not in the nullifier tree

## Prove at a specific historical block

To prove against state at a specific past block (not just the anchor block):

```rust
use aztec::history::note::assert_note_existed_by;

let historical_header = self.context.get_block_header_at(block_number);
assert_note_existed_by(historical_header, hinted_note);
```

:::warning
Using `get_block_header_at` adds ~3k constraints to prove Archive tree membership. The anchor block header is effectively free since it's verified once per transaction.
:::

## Prove a note was nullified

To prove a note has been spent/nullified:

```rust
use aztec::history::note::assert_note_was_nullified_by;

let header = self.context.get_anchor_block_header();
assert_note_was_nullified_by(header, confirmed_note, &mut self.context);
```

## Prove contract bytecode was published

To prove a contract's bytecode was published at a historical block:

```rust
use aztec::history::deployment::assert_contract_bytecode_was_published_by;

let header = self.context.get_anchor_block_header();
assert_contract_bytecode_was_published_by(header, contract_address);
```

You can also prove a contract was initialized (constructor was called):

```rust
use aztec::history::deployment::assert_contract_was_initialized_by;
use aztec::oracle::get_contract_instance::get_contract_instance;

let header = self.context.get_anchor_block_header();
let instance = get_contract_instance(contract_address);
assert_contract_was_initialized_by(header, contract_address, instance.initialization_hash);
```

## Available proof functions

The `aztec::history` module provides these functions:

| Function | Module | Purpose |
|----------|--------|---------|
| `assert_note_existed_by` | `history::note` | Prove note exists in note hash tree |
| `assert_note_was_valid_by` | `history::note` | Prove note exists and is not nullified |
| `assert_note_was_nullified_by` | `history::note` | Prove note's nullifier is in nullifier tree |
| `assert_note_was_not_nullified_by` | `history::note` | Prove note's nullifier is not in nullifier tree |
| `assert_nullifier_existed_by` | `history::nullifier` | Prove a raw nullifier exists |
| `assert_nullifier_did_not_exist_by` | `history::nullifier` | Prove a raw nullifier does not exist |
| `assert_contract_bytecode_was_published_by` | `history::deployment` | Prove a contract's bytecode was published |
| `assert_contract_bytecode_was_not_published_by` | `history::deployment` | Prove a contract's bytecode was not published |
| `assert_contract_was_initialized_by` | `history::deployment` | Prove a contract was initialized |
| `assert_contract_was_not_initialized_by` | `history::deployment` | Prove a contract was not initialized |
