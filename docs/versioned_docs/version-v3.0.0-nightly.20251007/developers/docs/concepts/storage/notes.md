---
title: Notes (UTXOs)
sidebar_position: 5
tags: [notes, storage]
description: Understand how notes work in Aztec as the fundamental unit of private state, including their lifecycle, storage, and consumption.
---

import Image from "@theme/IdealImage";

The [state model page](./state_model.md) explains that there is a difference between public and private state. Private state uses UTXOs (unspent transaction ouputs), also known as notes. This page introduces the concept of UTXOs and how notes are abstracted on Aztec.

## What are notes?

In an account-based model such as Ethereum, each account is typically associated with a specific location in the data tree. In a UTXO model, each note specifies its owner and there is no relationship between an account and data's location in the data tree. Notes are encrypted pieces of data that can only be decrypted by their owner.

Rather than storing entire notes in a data tree, note commitments (hashes of the notes) are stored in a merkle tree, aptly named the note hash tree. Users will prove that they have the note pre-image information when they update private state in a contract.

When a note is updated, Aztec nullifies the original commitment in the note hash tree by creating a nullifier from the note data, and may create a new note with the updated information, encrypted to a new owner if necessary. This helps to decouple actions of creating, updating and deleting private state.

<Image img={require("@site/static/img/public-and-private-state-diagram.png")} />

Notes are comparable to cash, with some slight differences. When you want to spend \$3.50 USD in real life, you give your \$5 note to a cashier who will keep \$3.50 and give you separate notes that add up to \$1.50. Using private notes on Aztec, when you want to spend a \$5 note, you nullify it and create a \$1.5 note with yourself as the owner and a \$3.5 note with the recipient as the owner. Only you and the recipient are aware of \$3.5 transaction, they are not aware that you "split" the \$5 note.

## Sending notes

When creating notes for a recipient, you need a way to send the note to them. There are a few ways to do this:

### Onchain (encrypted logs):

This is the common method and works well for most use cases. You can emit an encrypted log as part of a transaction. The encrypted note data will be posted onchain, allowing the recipient to find the note through [note discovery](../advanced/storage/note_discovery.md).

### Offchain:

In some cases, if you know the recipient offchain, you might choose to share the note data directly with them. The recipient can store that note in their PXE and later spend it.

### Self-created notes (not emitted):

If you create a note for yourself, you don’t need to broadcast it to the network or share anything. You will only need to keep the note somewhere, such as in your PXE, so you can prove ownership and spend it in future transactions.

## Abstracting notes from apps & users

When using the Aztec protocol, users may not be aware of the specific notes that they own. Their experience should be similar to Ethereum, and should instead see the amount of their assets inside their account.

This is accomplished through the smart contract library, Aztec.nr, which abstracts notes by allowing developers to specify custom note types. This means they can specify how notes are interacted with, nullified, transferred, and displayed. Aztec.nr also helps users discover all of the notes that have been encrypted to their account and posted to the chain, known as [note discovery](../advanced/storage/note_discovery.md).

## Technical details

### Some context

- Public functions and storage work much like other blockchains in terms of having dedicated storage slots and being publicly visible
- Private functions are executed locally with proofs generated for sound execution, and commitments to private variable updates are stored using append-only trees
- "Note" types are part of Aztec.nr, a framework that facilitates use of Aztec's different storage trees to achieve things such as private variables

This page will focus on how private variables are implemented with Notes and storage trees.

#### Side-note about execution

Under the hood, the Aztec protocol handles some important details around public and private function calls. Calls between them are asynchronous due to different execution contexts (local execution vs. node execution).
A detailed explanation of the transaction lifecycle can be found [here](../transactions.md#simple-example-of-the-private-transaction-lifecycle).

## Private state variables in Aztec

State variables in an Aztec contract are defined inside a struct specifically named `Storage`, and must satisfy the [Note Interface (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) and contain a [Note header (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note/note_header.nr).

The Note header struct contains the contract address which the value is effectively siloed to, a nonce to ensure unique Note hashes, and a storage "slot" (or ID) to associate multiple notes.

A couple of things to unpack here:

#### Storage "slot"

Storage slots are more literal for public storage, a place where a value is stored. For private storage, a storage slot is logical (more [here](../advanced/storage/storage_slots.md)).

#### Silos

The address of the contract is included in a Note's data to ensure that different contracts don't arrive at the same hash with an identical variable. This is handled in the protocol's execution.

### Note types

There is more than one Note type, such as the `PrivateSet` type is used for private variables. There are also `PrivateMutable` and `PrivateImmutable` types.

Furthermore, notes can be completely custom types, storing any value or set of values that are desired by an application.

### Initialization

Private state variables are stored locally when the contract is created. Depending on the application, values may be privately shared by the creator with others via encrypted logs onchain.
A hash of a note is stored in the append-only note hash tree on the network so as to prove existence of the current state of the note in a privacy preserving way.

#### Note Hash Tree

By virtue of being append only, notes are not edited. If two transactions amend a private value, multiple notes will be inserted into the tree to the note hash tree and the nullifier tree. The header will contain the same logical storage slot.

### Reading Notes

:::info

Only those with appropriate keys/information will be able to successfully read private values that they have permission to. Notes can be read outside of a transaction or "offchain" with no changes to data structures onchain.

:::

When a note is read in a transaction, a subsequent read from another transaction of the same note would reveal a link between the two. So to preserve privacy, notes that are read in a transaction are said to be "consumed" (defined below), and new note(s) are then created with a unique hash.

With type `PrviateSet`, a private variable's value is interpreted as the sum of values of notes with the same logical storage slot.

Consuming, deleting, or otherwise "nullifying" a note is NOT done by deleting the Note hash; this would leak information. Rather a nullifier is created deterministically linked to the value. This nullifier is inserted into another the nullifier storage tree.

When reading a value, the local private execution checks that its notes (of the corresponding storage slot/ID) have not been nullified.

### Updating

:::note
Only those with appropriate keys/information will be able to successfully nullify a value that they have permission to.
:::

To update a value, its previous note hash(es) are nullified. The new note value is updated in the user's private execution environment (PXE), and the updated note hash inserted into the note hash tree.

## Supplementary components

Some optional background resources on notes can be found here:

- [High level network architecture](../index.md), specifically the Private Execution Environment
- [Transaction lifecycle (simple diagram)](../transactions.md#simple-example-of-the-private-transaction-lifecycle)
- [Public and Private state](./state_model.md)

Notes touch several core components of the protocol, but we will focus on a the essentials first.

### Some code context

The way Aztec benefits from the Noir language is via three important components:

- `Aztec.nr` - a Noir framework enabling contracts on Aztec, written in Noir. Includes useful Note implementations
- `noir contracts` - example Aztec contracts
- `noir-protocol-circuits` - a crate containing essential circuits for the protocol (public circuits and private wrappers)

A lot of what we will look at will be in [aztec-nr/aztec/src/note (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note), specifically the lifecycle and note interface.

Looking at the noir circuits in these components, you will see references to the distinction between public/private execution and state.

### Lifecycle functions

Inside the [lifecycle (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note/lifecycle.nr) circuits we see the functions to create and destroy a note, implemented as insertions of note hashes and nullifiers respectively. This is helpful for regular private variables.

We also see a function to create a note hash from the public context, a way of creating a private variable from a public call (run in the sequencer). This could be used in application contracts to give private digital assets to users.

### Note Interface functions

To see a [note_interface (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) implementation, we will look at a simple [ValueNote GitHub link](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/value-note/src/value_note.nr).

The interface is required to work within an Aztec contract's storage, and a ValueNote is a specific type of note to hold a number (as a `Field`).

#### Computing hashes and nullifiers

A few key functions in the note interface are around computing the note hash and nullifier, with logic to get/use secret keys from the private context.

In the ValueNote implementation you'll notice that it uses the `pedersen_hash` function. This is currently required by the protocol, but may be updated to another hashing function, like poseidon.

As a convenience, the outer [note/utils.nr (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/aztec/src/note/utils.nr) contains implementations of functions that may be needed in Aztec contracts, for example computing note hashes.

#### Serialization and deserialization

Serialization/deserialization of content is used to convert between the Note's variables and a generic array of Field elements. The Field type is understood and used by lower level crypographic libraries.
This is analogous to the encoding/decoding between variables and bytes in solidity.

For example in ValueNote, the `serialize_content` function simply returns: the value, nullifying public key hash (as a field) and the note randomness; as an array of Field elements.

### Value as a sum of Notes

We recall that multiple notes are associated with a "slot" (or ID), and so the value of a numerical note (like ValueNote) is the sum of each note's value.
The helper function in [balance_utils (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/#include_/noir-projects/aztec-nr/value-note/src/balance_utils.nr) implements this logic taking a `PrivateSet` of `ValueNotes`.

A couple of things worth clarifying:

- A `PrivateSet` takes a Generic type, specified here as `ValueNote`, but can be any `Note` type (for all notes in the set)
- A `PrivateSet` of notes also specifies _the_ slot of all Notes that it holds

### Example - Notes in action

The Aztec.nr framework includes examples of high-level states [easy_private_uint (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v3.0.0-nightly.20251007/noir-projects/aztec-nr/easy-private-state/src/easy_private_uint.nr) for use in contracts.

The struct (`EasyPrivateUint`) contains a Context, Set of ValueNotes, and storage_slot (used when setting the Set).

Notice how the `add` function shows the simplicity of appending a new note to all existing ones. On the other hand, `sub` (subtraction), needs to first add up all existing values (consuming them in the process), and then insert a single new value of the difference between the sum and parameter.

---

### References

- ["Stable" state variable (GitHub link)](https://github.com/AztecProtocol/aztec-packages/issues/4130)
