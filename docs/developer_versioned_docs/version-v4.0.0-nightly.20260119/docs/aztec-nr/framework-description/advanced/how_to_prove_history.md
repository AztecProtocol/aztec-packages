---
title: Proving Historic State
sidebar_position: 15
tags: [contracts]
description: Prove historical state and note inclusion in your Aztec smart contracts using the Archive tree.
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
- **Contract deployment** - prove a contract was deployed or initialized

Common use cases:
- Verify ownership of an asset from another contract without revealing which specific note
- Prove eligibility based on historical state (e.g., "owned tokens at block X")
- Claim rewards based on past contributions (see the [claim contract](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr) for a complete example)

## Prove note inclusion

Import the trait:

```rust title="history_import" showLineNumbers 
use dep::aztec::history::note_inclusion::ProveNoteInclusion;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260119/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L5-L7" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L5-L7</a></sub></sup>


Prove a note exists in the note hash tree:

```rust title="prove_note_inclusion" showLineNumbers 
let header = self.context.get_anchor_block_header();
header.prove_note_inclusion(proof_retrieved_note);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260119/noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L55-L58" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/claim_contract/src/main.nr#L55-L58</a></sub></sup>


## Prove note validity

To prove a note was valid (existed AND wasn't nullified) at a historical block:

```rust
use dep::aztec::history::note_validity::ProveNoteValidity;

let header = self.context.get_anchor_block_header();
header.prove_note_validity(retrieved_note, &mut self.context);
```

This verifies both:
1. The note was included in the note hash tree
2. The note's nullifier was not in the nullifier tree

## Prove at a specific historical block

To prove against state at a specific past block (not just the anchor block):

```rust
let historical_header = self.context.get_block_header_at(block_number);
historical_header.prove_note_inclusion(retrieved_note);
```

:::warning
Using `get_block_header_at` adds ~3k constraints to prove Archive tree membership. The anchor block header is effectively free since it's verified once per transaction.
:::

## Prove a note was nullified

To prove a note has been spent/nullified:

```rust
use dep::aztec::history::nullifier_inclusion::ProveNoteIsNullified;

let header = self.context.get_anchor_block_header();
header.prove_note_is_nullified(retrieved_note, &mut self.context);
```

## Prove contract deployment

To prove a contract was deployed at a historical block:

```rust
use dep::aztec::history::contract_inclusion::ProveContractDeployment;

let header = self.context.get_anchor_block_header();
header.prove_contract_deployment(contract_address);
```

You can also prove a contract was initialized (constructor was called):

```rust
use dep::aztec::history::contract_inclusion::ProveContractInitialization;

let header = self.context.get_anchor_block_header();
header.prove_contract_initialization(contract_address);
```

## Available proof traits

The `aztec::history` module provides these traits:

| Trait | Purpose |
|-------|---------|
| `ProveNoteInclusion` | Prove note exists in note hash tree |
| `ProveNoteValidity` | Prove note exists and is not nullified |
| `ProveNoteIsNullified` | Prove note's nullifier is in nullifier tree |
| `ProveNoteNotNullified` | Prove note's nullifier is not in nullifier tree |
| `ProveNullifierInclusion` | Prove a raw nullifier exists |
| `ProveNullifierNonInclusion` | Prove a raw nullifier does not exist |
| `ProveContractDeployment` | Prove a contract was deployed |
| `ProveContractNonDeployment` | Prove a contract was not deployed |
| `ProveContractInitialization` | Prove a contract was initialized |
| `ProveContractNonInitialization` | Prove a contract was not initialized |
