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

- Node.js (v24.15.0 or later) and yarn
- The Aztec CLI at version v6.0.0, with a local network running (see [Connecting to a local network](../../aztec-js/how_to_connect_to_local_network.md))
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

```rust title="create_note" showLineNumbers 
/// Creates a note of `value` owned by the caller, with randomness the caller chose, so the caller can later prove
/// knowledge of the note's contents outside Aztec.
///
/// `randomness` must be fresh for every call and kept secret: anyone who learns it can test guesses of the owner
/// and value against the public note hash. The library's own `create_note` also mixes in the side-effect counter
/// so that two notes in one transaction never share a hash; this function does not, so a transaction must not
/// call it twice with the same arguments.
#[external("private")]
fn create_note(value: u128, randomness: Field) {
    let owner = self.msg_sender();
    let storage_slot = self.storage.notes.get_storage_slot();
    let note = UintNote { value };
    let note_hash_counter = self.context.get_side_effect_counter();
    let note_hash = note.compute_note_hash(owner, storage_slot, randomness);

    notify_created_note(
        owner,
        storage_slot,
        randomness,
        UintNote::get_id(),
        note.pack(),
        note_hash,
        note_hash_counter,
    );
    self.context.push_note_hash(note_hash);

    NoteMessage::new(
        NewNote { note, owner, storage_slot, randomness, note_hash_counter },
        self.context,
    )
        .deliver(MessageDelivery::onchain_constrained());
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr#L21-L54" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr#L21-L54</a></sub></sup>


The function:

1. Computes the note hash with `UintNote`'s own `compute_note_hash`
2. Tells the PXE about the new note (`notify_created_note`) and adds its hash to the transaction (`push_note_hash`)
3. Delivers the note to its owner with `MessageDelivery::onchain_constrained()`, so the owner's PXE finds and stores it (the script reads it back with `balance_of`)

The randomness is a private argument, so it never appears onchain. Two rules apply to it:

- **Use fresh randomness for every note.** With a known or repeated randomness, anyone can test guesses of the owner and value against the public note hash.
- **Create one note per call.** Aztec.nr's `create_note` mixes the side-effect counter into the randomness so that two notes in one transaction never share a hash. This function does not, so a transaction must not call it twice with the same arguments.

## The circuit

The circuit takes the note's public data as public inputs, and the randomness, storage slot and nonce as private inputs. It recomputes the unique note hash with the same functions the protocol uses:

```rust title="circuit" showLineNumbers 
use aztec::{
    note::note_interface::NoteHash,
    protocol::{address::AztecAddress, hash::{compute_siloed_note_hash, compute_unique_note_hash}, traits::FromField},
};
use uint_note::UintNote;

/// Proves knowledge of the randomness, storage slot and nonce that make a `UintNote` of `value`, owned by `owner` in
/// `contract_address`, hash to `settled_note_hash`. The verifier must check that the hash is in the note hash tree
/// itself. Whether the note is unspent cannot be shown this way: its nullifier needs the owner's nullifier key.
fn main(
    settled_note_hash: pub Field,
    contract_address: pub Field,
    owner: pub Field,
    value: pub u128,
    randomness: Field,
    storage_slot: Field,
    note_nonce: Field,
) {
    let note_hash = UintNote { value }.compute_note_hash(AztecAddress::from_field(owner), storage_slot, randomness);
    let siloed_note_hash = compute_siloed_note_hash(AztecAddress::from_field(contract_address), note_hash);
    assert_eq(compute_unique_note_hash(note_nonce, siloed_note_hash), settled_note_hash);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/circuits/note_hash_proof/src/main.nr#L1-L24" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/circuits/note_hash_proof/src/main.nr#L1-L24</a></sub></sup>


The circuit's `Nargo.toml` depends on Aztec.nr and its `uint_note` crate at the version your contract uses:

```toml title="Nargo.toml"
[package]
name = "note_hash_proof"
type = "bin"

[dependencies]
aztec = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "v6.0.0", directory = "aztec" }
uint_note = { git = "https://github.com/aztec-labs-eng/aztec-nr/", tag = "v6.0.0", directory = "uint-note" }
```

Compile it with `nargo compile`, which writes `target/note_hash_proof.json`.

## Create the note

The script deploys the contract, picks random randomness with `Fr.random()`, and creates a note of value 69:

```typescript title="create_note" showLineNumbers 
import assert from "node:assert";
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import { NoteHashProofContract } from "./artifacts/NoteHashProof.js";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

const [aliceData] = await getInitialTestAccountsData();
const alice = await wallet.createSchnorrInitializerlessAccount(
  aliceData.secret,
  aliceData.salt,
  aliceData.signingKey,
);

const { contract } = await NoteHashProofContract.deploy(wallet).send({
  from: alice.address,
});

// The randomness is a private argument: it never leaves this machine, and it must be fresh for every note.
const value = 69n;
const randomness = Fr.random();
const { receipt } = await contract.methods
  .create_note(value, randomness)
  .send({ from: alice.address });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/note_hash_proof/index.ts#L1-L31" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/note_hash_proof/index.ts#L1-L31</a></sub></sup>


The owner's PXE now holds the note:

```typescript title="check_delivery" showLineNumbers 
const { result: balance } = await contract.methods
  .balance_of(alice.address)
  .simulate({ from: alice.address });
assert.equal(balance, value);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/note_hash_proof/index.ts#L33-L38" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/note_hash_proof/index.ts#L33-L38</a></sub></sup>


## Find the note hash and nonce

The settled note hash is in the transaction's effects, next to the hashes of every other note the transaction created. Constrained delivery, for example, also re-creates a note in the handshake registry. Each settled hash has a nonce that comes from the transaction's first nullifier and the hash's position, so the script finds the note's position the way the PXE does during [note discovery](../../foundational-topics/advanced/storage/note_discovery.md#the-sync-process): it silos the note's hash to the contract and compares it, under each position's nonce, with the hash settled there.

The contract computes the note's hash with a utility function, which runs in your PXE and sends no transaction:

```rust title="note_hash" showLineNumbers 
/// The note hash `create_note` computes for these arguments, before the protocol silos it to this contract and
/// makes it unique.
#[external("utility")]
unconstrained fn note_hash(owner: AztecAddress, value: u128, randomness: Field) -> Field {
    UintNote { value }.compute_note_hash(owner, self.storage.notes.get_storage_slot(), randomness)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr#L56-L63" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/contracts/note_hash_proof_contract/src/main.nr#L56-L63</a></sub></sup>


```typescript title="find_note_hash" showLineNumbers 
import {
  computeNoteHashNonce,
  computeUniqueNoteHash,
  siloNoteHash,
} from "@aztec-labs/stdlib/hash";

const { txEffect } = await node.getTxReceipt(receipt.txHash, {
  includeTxEffect: true,
});
if (!txEffect) {
  throw new Error(`Transaction ${receipt.txHash} has no effect yet`);
}

const { result: noteHash } = await contract.methods
  .note_hash(alice.address, value, randomness)
  .simulate({ from: alice.address });
const siloedNoteHash = await siloNoteHash(contract.address, new Fr(noteHash));

let found: { settledNoteHash: Fr; noteNonce: Fr } | undefined;
for (const [index, settledNoteHash] of txEffect.noteHashes.entries()) {
  const noteNonce = await computeNoteHashNonce(txEffect.nullifiers[0], index);
  const uniqueNoteHash = await computeUniqueNoteHash(
    noteNonce,
    siloedNoteHash,
  );
  if (uniqueNoteHash.equals(settledNoteHash)) {
    found = { settledNoteHash, noteNonce };
    break;
  }
}
if (!found) {
  throw new Error(
    `No note hash in transaction ${receipt.txHash} is the note's`,
  );
}
const { settledNoteHash, noteNonce } = found;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/note_hash_proof/index.ts#L40-L77" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/note_hash_proof/index.ts#L40-L77</a></sub></sup>


## Prove and verify

Execute the circuit with noir_js, then prove and verify the result with bb.js. The script imports the circuit's artifact from where `nargo compile` wrote it, so point that import at your circuit's `target/` folder. The storage slot comes from the contract's generated storage layout:

```typescript title="prove" showLineNumbers 
import { Barretenberg, UltraHonkBackend } from "@aztec-foundation/bb.js";
import { Noir } from "@aztec-foundation/noir-noir_js";
// The artifact `nargo compile` wrote for the circuit.
import circuit from "../../../target/note_hash_proof.json" with { type: "json" };

const inputs = {
  settled_note_hash: settledNoteHash.toString(),
  contract_address: contract.address.toString(),
  owner: alice.address.toString(),
  value: value.toString(),
  randomness: randomness.toString(),
  storage_slot: NoteHashProofContract.storage.notes.slot.toString(),
  note_nonce: noteNonce.toString(),
};

const noir = new Noir(circuit as any);
const { witness } = await noir.execute(inputs);

const api = await Barretenberg.new({ threads: 1 });
const backend = new UltraHonkBackend(circuit.bytecode, api);
const proof = await backend.generateProof(witness);
const verified = await backend.verifyProof(proof);
console.log(`Proof verified: ${verified}`);
await api.destroy();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/note_hash_proof/index.ts#L79-L104" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/note_hash_proof/index.ts#L79-L104</a></sub></sup>


With a wrong private input, the circuit's assertion fails while it computes the witness, so no proof can be made:

```typescript title="wrong_randomness" showLineNumbers 
await assert.rejects(
  noir.execute({ ...inputs, randomness: Fr.random().toString() }),
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/note_hash_proof/index.ts#L107-L111" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/note_hash_proof/index.ts#L107-L111</a></sub></sup>


## Next steps

- [Custom notes](../../aztec-nr/framework-description/custom_notes.md) explains how note hashes are built.
- [Verify Noir proofs in Aztec contracts](./recursive_verification.md) verifies a proof inside a private function instead of offchain.
