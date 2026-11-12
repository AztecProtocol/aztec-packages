---
title: "Prove Knowledge of a Note"
sidebar_position: 3
description: "Create a private note with randomness you choose, then prove offchain with a Noir circuit that you know the note's contents."
references: ["docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr", "docs/lines/v6/examples/circuits/note_hash_proof/src/main.nr", "docs/lines/v6/examples/ts/note_hash_proof/index.ts", "labs/noir-projects/aztec-nr/aztec/src/note/lifecycle.nr", "labs/noir-projects/aztec-nr/uint-note/src/uint_note.nr"]
---

## Overview

A private note appears onchain only as a note hash. In this tutorial, you create a note whose randomness you choose, then prove outside Aztec, with a Noir circuit, that you know the contents behind that hash. A service that cannot read your notes can check the proof, but what it shows depends on the contract that created the note (see [What the proof shows](#what-the-proof-shows)).

You build three parts:

- A contract with a private `create_note` function that takes the randomness as a private argument and delivers the note to its owner
- A Noir circuit that recomputes the note hash and checks it against the hash in the transaction
- A TypeScript script that creates the note, reads its hash from the transaction, and proves and verifies with bb.js

## Prerequisites

- Node.js (v26.12.0 or later) and yarn
- The Aztec CLI at version #include_aztec_version, with a local network running (see [Connecting to a local network](../../aztec-js/how_to_connect_to_local_network.md))
- Familiarity with [notes](../../foundational-topics/state_management.md) and [proving Noir circuits in TypeScript](./recursive_verification.md)

## What the proof shows

Read this before you use the pattern:

- **It reveals** the note hash, the contract address, the owner's address and the value. Anyone who sees the proof learns which note it is about and how much it holds.
- **It proves** that the prover knows a randomness, storage slot and nonce that make a `UintNote` of that value, owned by that address in that contract, hash to that note hash.
- **It does not prove** that the note hash is in the note hash tree. The verifier must look the hash up on the chain itself.
- **It does not prove** that the note is unspent. Only the owner's PXE can compute the note's nullifier, so a verifier cannot check this.
- **It does not prove** that the prover is the owner. Anyone who knows the randomness can produce the proof, which is why the randomness must stay secret.
- **It does not prove** how the note came to exist. A note means only what the contract's rules for creating notes allow: this tutorial's `create_note` lets any caller create a note of any value for itself, so a proof about it shows knowledge of a note, not a payment.

## The contract

Aztec.nr's `create_note` picks the note's randomness inside the PXE and never returns it. To prove knowledge of a note outside Aztec, you need the randomness, so this contract takes it as an argument and creates the note with the same steps as `create_note`:

#include_code create_note /docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr rust

The function:

1. Computes the note hash with `UintNote`'s own `compute_note_hash`
2. Tells the PXE about the new note (`notify_created_note`) and adds its hash to the transaction (`push_note_hash`)
3. Delivers the note to its owner with `MessageDelivery::onchain_constrained()`, so the owner's PXE finds and stores it (the script reads it back with `balance_of`)

The randomness is a private argument, so it never appears onchain. Two rules apply to it:

- **Use fresh randomness for every note.** With a known or repeated randomness, anyone can test guesses of the owner and value against the public note hash.
- **Create one note per call.** Aztec.nr's `create_note` mixes the side-effect counter into the randomness so that two notes in one transaction never share a hash. This function does not, so a transaction must not call it twice with the same arguments.

## The circuit

The circuit takes the note's public data as public inputs, and the randomness, storage slot and nonce as private inputs. It recomputes the unique note hash with the same functions the protocol uses:

#include_code circuit /docs/lines/v6/examples/circuits/note_hash_proof/src/main.nr rust

The circuit's `Nargo.toml` depends on Aztec.nr and its `uint_note` crate at the version your contract uses:

```toml title="Nargo.toml"
[package]
name = "note_hash_proof"
type = "bin"

[dependencies]
aztec = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "#include_aztec_version", directory = "aztec" }
uint_note = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "#include_aztec_version", directory = "uint-note" }
```

Compile it with `nargo compile`, which writes `target/note_hash_proof.json`.

## Create the note

The script deploys the contract, picks random randomness with `Fr.random()`, and creates a note of value 69:

#include_code create_note /docs/lines/v6/examples/ts/note_hash_proof/index.ts typescript

The owner's PXE now holds the note:

#include_code check_delivery /docs/lines/v6/examples/ts/note_hash_proof/index.ts typescript

## Find the note hash and nonce

The settled note hash is in the transaction's effects, next to the hashes of every other note the transaction created. Constrained delivery, for example, also re-creates a note in the handshake registry. Each settled hash has a nonce that comes from the transaction's first nullifier and the hash's position, so the script finds the note's position the way the PXE does during [note discovery](../../foundational-topics/advanced/storage/note_discovery.md#the-sync-process): it silos the note's hash to the contract and compares it, under each position's nonce, with the hash settled there.

The contract computes the note's hash with a utility function, which runs in your PXE and sends no transaction:

#include_code note_hash /docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr rust

#include_code find_note_hash /docs/lines/v6/examples/ts/note_hash_proof/index.ts typescript

## Prove and verify

Execute the circuit with noir_js, then prove and verify the result with bb.js. The script imports the circuit's artifact from where `nargo compile` wrote it, so point that import at your circuit's `target/` folder. The storage slot comes from the contract's generated storage layout:

#include_code prove /docs/lines/v6/examples/ts/note_hash_proof/index.ts typescript

With a wrong private input, the circuit's assertion fails while it computes the witness, so no proof can be made:

#include_code wrong_randomness /docs/lines/v6/examples/ts/note_hash_proof/index.ts typescript

## Next steps

- [Custom notes](../../aztec-nr/framework-description/custom_notes.md) explains how note hashes are built.
- [Verify Noir proofs in Aztec contracts](./recursive_verification.md) verifies a proof inside a private function instead of offchain.
