---
title: Proving historic state
sidebar_position: 15
tags: [contracts]
description: Prove historical notes, nullifiers, contract deployment, and public storage in your Aztec smart contracts.
references: ["noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr"]
---

This guide shows you how to prove facts about Aztec's historical state from inside a private function: that a note existed, that a nullifier was or wasn't present, that a contract was deployed, or what a public storage slot held at a past block.

Each proof is a Merkle membership (or non-membership) proof against a state tree root committed in a past block header: the note hash tree, the nullifier tree, or the public data tree. (The Archive tree, by contrast, holds a hash of each block header and is what proves a header is canonical.) Private functions always read from a past block header rather than the live chain tip, because the chain advances while a proof is generated on your device. The proofs therefore tell you what was true once every transaction in the chosen block had executed.

## Prerequisites

- An Aztec contract project set up
- Understanding of Aztec's note and nullifier system

## What you can prove

You can create proofs for these elements at any past block height:

- **Note inclusion** - prove a note existed in the note hash tree
- **Note validity** - prove a note existed and wasn't nullified at a specific block
- **Nullifier inclusion/non-inclusion** - prove a nullifier was or wasn't in the nullifier tree
- **Contract deployment** - prove a contract's bytecode was published or initialized
- **Public storage** - read the value a public storage slot held at a past block

Common use cases:
- Verify ownership of an asset from another contract without revealing which specific note
- Prove eligibility based on historical state (e.g., "owned tokens at block X")
- Claim rewards based on past contributions (see the [claim contract](https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr) for a complete example)

## Choosing a block header

Every function below takes a `BlockHeader`. Two getters on the private context provide one:

- `self.context.get_anchor_block_header()` returns the transaction's anchor block header. The protocol's circuits verify it once per transaction, so using it adds no extra constraints to your function. The protocol requires a transaction to expire within 24 hours of its anchor block, so the anchor is always a block from the last 24 hours.
- `self.context.get_block_header_at(block_number)` returns the header of any block at or before the anchor block, letting you prove against older state at the cost of extra constraints (see [Prove at a specific historical block](#prove-at-a-specific-historical-block)).

:::warning Data availability
Producing these proofs requires the historical state trees (note hashes, nullifiers, public storage) for the chosen block. Many nodes prune this data after a few hours, so proving against older blocks requires a node that retains it, such as an archive node.
:::

## Prove note inclusion

Import the function:

```rust title="history_import" showLineNumbers 
use aztec::history::note::assert_note_existed_by;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L5-L7" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L5-L7</a></sub></sup>


Prove a note exists in the note hash tree:

```rust title="prove_note_inclusion" showLineNumbers 
let header = self.context.get_anchor_block_header();
let confirmed_note = assert_note_existed_by(header, hinted_note);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L41-L44" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L41-L44</a></sub></sup>


## Prove note validity

To prove a note was valid (existed AND wasn't nullified) at a historical block:

```rust
use aztec::history::note::assert_local_note_was_valid_by;

let header = self.context.get_anchor_block_header();
assert_local_note_was_valid_by(header, hinted_note, &mut self.context);
```

This verifies both:
1. The note was included in the note hash tree
2. The note's nullifier was not in the nullifier tree

The `assert_local_note_was_*` helpers only work for the executing contract's own notes: this is because it is not possible for a contract to retrieve the app-siloed nullifier hiding secret key that corresponds to another contract. To prove facts about another contract's notes, use `assert_note_existed_by`, which supports notes of any contract (see [Prove note inclusion](#prove-note-inclusion)).

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

To prove a note has been nullified:

```rust
use aztec::history::note::assert_local_note_was_nullified_by;

let header = self.context.get_anchor_block_header();
assert_local_note_was_nullified_by(header, confirmed_note, &mut self.context);
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

## Read historical public storage

To read the value a public storage slot held at a past block in a private function, use `public_storage_historical_read`. It returns the stored value and constrains it against the public data tree root in the given block header:

```rust
use aztec::history::storage::public_storage_historical_read;

let header = self.context.get_anchor_block_header();
let value = public_storage_historical_read(header, storage_slot, contract_address);
```

An uninitialized slot reads as `0`.

Because this proves the value against a past block header rather than reading the live chain tip, a private function can read public state this way **without enqueuing a public call**. Enqueuing a public call is only needed to read the _current_ value or to write to public storage.

Higher-level state variables build on this. Reading a `PublicImmutable` or `DelayedPublicMutable` from a private function performs a historical public storage read internally (through `WithHash`), so you rarely need to call `public_storage_historical_read` directly. Both types are designed so that a historical read is also a correct read of the current value: a `PublicImmutable` can only be initialized once, so its value never changes, while a `DelayedPublicMutable` delays every write and sets the transaction's expiration timestamp so the transaction is only valid for as long as the value it read still holds.

## Available history functions

The `aztec::history` module provides these functions:

| Function | Module | Purpose |
|----------|--------|---------|
| `assert_note_existed_by` | `history::note` | Prove note exists in note hash tree (any contract) |
| `assert_local_note_was_valid_by` | `history::note` | Prove own note exists and is not nullified |
| `assert_local_note_was_nullified_by` | `history::note` | Prove own note's nullifier is in nullifier tree |
| `assert_local_note_was_not_nullified_by` | `history::note` | Prove own note's nullifier is not in nullifier tree |
| `assert_nullifier_existed_by` | `history::nullifier` | Prove a siloed nullifier exists |
| `assert_nullifier_did_not_exist_by` | `history::nullifier` | Prove a siloed nullifier does not exist |
| `assert_contract_bytecode_was_published_by` | `history::deployment` | Prove a contract's bytecode was published |
| `assert_contract_bytecode_was_not_published_by` | `history::deployment` | Prove a contract's bytecode was not published |
| `assert_contract_was_initialized_by` | `history::deployment` | Prove a contract was initialized |
| `assert_contract_was_not_initialized_by` | `history::deployment` | Prove a contract was not initialized |
| `public_storage_historical_read` | `history::storage` | Read a public storage value at a historical block |

The nullifier functions take a _siloed_ nullifier: the nullifier hashed together with the contract address, which is the value actually stored in the global nullifier tree. Use `compute_siloed_nullifier` to convert an inner nullifier (the value passed to `push_nullifier_unsafe`) into its siloed form.
