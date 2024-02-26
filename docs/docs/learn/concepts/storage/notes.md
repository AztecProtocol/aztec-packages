---
title: Understanding Notes
description: Core knowledge of Notes and how they work
---

Most prominant blockchain networks don't have privacy at the protocol level. Aztec contracts can define public and private functions, that can read/write public and private state.

For private state we need encryption and techniques to hide information about state changes. For private functions, we need local execution and proof of correct execution.

### Some context
- public functions and storage work much like other blockchains in terms of having dedicated storage slots
- Private functions are executed locally with proofs generated for sound execution, and commitments to private variable updates are stored using append-only trees.
- "Note" types are part of aztec.nr, a framework that facilitates use of Aztec's different storage trees to achieve private variables. Note: there are more uses beyond this.

This article will restrict its focus to how private variables are implemented with Notes and relevant storage trees. NB: these components can be used in a variety of ways to implement different attributes such as: singletons, unique value, or private sharing.

#### Side-note about execution
Under the hood, the Aztec protocol handles some important details around public and private function calls. Notably around calls between them and relevant delays to avoid race conditions around state reads/writes (more [here](../pxe/acir_simulator#simulating-functions)).
Whilst it just works for us under the hood, a detailed explanation of the transaction lifecycle can be found [here](../transactions#simple-example-of-the-private-transaction-lifecycle).

## Private variables in Aztec
### Definition
State variables in an Aztec contract are defined inside a struct specifically named `Storage`, and must satisfy the [Note Interface](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) and contain a [Note header](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note/note_header.nr).

The Note header struct contains the contract address which the value is effectively siloed to, a nonce to ensure unique Note hashes, and a storage "slot" (or ID) to associate multiple notes.

A couple of things to unpack here:

#### Storage "slot"
Storage slots are more literal for public storage, a place where a value is stored. For private storage, a storage slot is logical (more [here](./storage_slots#private-state-slots---slots-arent-real)).

#### Silos
The address of the contract is included in a Note's data to ensure contracts don't arrive at the same hash with an identical variable. This is handled in the protocol's execution.

### Note types
There is more than one Note type, but the `Set` type is most useful for private variables. There are also `Singleton` and `ImmutableSingleton` types.

Furthermore, notes can be completely custom types, storing any value or set of values that are desired by an application.

### Initialisation
Private state variables are encrypted and stored locally when the contract is created. Depending on the application, values may be privately shared by the creator with others via encrypted logs onchain.
A hash of a note is stored in the append-only note hash tree so as to prove existence of the current state of the note.

#### Note Hash Tree
By virtue of being append only, notes are not edited. If two transactions amend a private value, multiple notes will be inserted into the tree. The header will contain the same logical storage slot.

### Reading Notes
Info:
- Only those with appropriate keys/information will be able to successfully read private values that they have permission to
- Notes can be read outside of a transaction or "off-chain" with no changes to data structures on-chain

When a note is read in a transaction, a subsequent read from another transaction of the same note would reveal a link between the two. So to preserve privacy, notes that are read in a transaction are said to be "consumed" (defined below), and new note(s) are then created with an incremented nonce.

Being of type `Set`, a private variable's value is interpreted as the sum of values of notes with the same logical storage slot.

Consuming, deleting, or otherwise "nullifying" a note is NOT done by deleting the Note hash, this would leak information, but rather by creating a nullifier deterministically linked to the value. This nullifier is inserted into another storage tree, aptly named the nullifier tree.

When interpreting a value the Aztec.nr framework checks that its notes (of the corresponding storage slot/ID) have not been nullified.

### Updating
Note: only those with appropriate keys/information will be able to successfully nullify a value that they have permission to.

To update a value, its previous note hash(es) are nullified. The new note value is updated in the PXE, and the updated note hash inserted into the note hash tree. This also increments the nonce.

## Using Noir

Some optionally background resources on notes can be seen here:
- [High level network architecture](../../about_aztec/technical_overview#high-level-network-architecture), specifically the Private Execution Environment
- [Transaction lifecycle (simple diagram)](../transactions#simple-example-of-the-private-transaction-lifecycle)
- [Public and Private state](../hybrid_state/main)

Outside of this there are many more details to discover that will be skipped over for now:
- Private and public contexts
- Encryption keys and events
- Oracle's role in using notes
- Value Serialization/Deserialization

This explainer will go through some examples that touch on what has been covered so far.

#### Some code context
The way Aztec (`aztec-packages` monorepo) benefits from the Noir language is via three important components:
- `Aztec-nr` - a Noir framework enabling contracts on Aztec, written in Noir. Includes useful Note implementations.
- `noir contracts` - , example Aztec contracts
- `noir-protocol-circuits` - a crate containing essential circuits for the protocol (public circuits and private wrappers)

A lot of what we will look at will be in [aztec-nr/aztec/src/note](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note), specifically the lifecycle and note interface.
Looking at the noir circuits in these components, you will see references to the distinction between public/private execution and state.

### Lifecycle functions
Inside the [lifecycle](
https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note/lifecycle.nr) circuits we see the functions to create and destroy a note, implemented as insertions of note hashes and nullifiers respectively.

We also see a function to create a note hash from the public context, a way of creating a private variable from a public call (run in the sequencer).

### Note Interface functions
To see a [note_interface](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) implementation, we will look at a simple [ValueNote](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/value-note/src/value_note.nr).

#### Computing hashes and nullifiers
A few key functions in the note interface are around computing the note hash and nullifier, with logic to get/use secret keys from the private context.

In the ValueNote implementation you'll notice that it uses the `pedersen_hash` function. This is currently required by the protocol, but may be updated to another hashing function, like poseidon.

As a convenience, the outer [note/utils.nr](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/aztec/src/note/utils.nr) contains an implementation of a function required by Aztec contracts using private storage: `compute_note_hash_and_nullifier`

#### Serialization and deserialization
Serialization/deserialization of content is used to convert between the Note's variables and a generic array of Field elements. The Field type is understood and used by lower level crypographic libraries.
This is analogous to the encoding/decoding between variables and bytes in solidity.

For example in ValueNote, the `serialize_content` function simply returns: the value, owner address (as a field) and the note randomness; as an array of Field elements.

### Value as a sum of Note
We recall that multiple notes are associated with a "slot" (or ID), and so the value of a numerical note (like ValueNote) is the sum of each note's value.
The helper function in [balance_utils](https://github.com/AztecProtocol/aztec-packages/blob/#include_/noir-projects/aztec-nr/value-note/src/balance_utils.nr) implements this logic taking a `Set` of `ValueNotes`.

A couple of things worth clarifying:
- A `Set` takes a Generic type, specified here as `ValueNote`, but can be any `Note` type (for all notes in the set).
- A `Set` of notes also specifies *the* slot of all Notes that it holds.

### Abstracting Notes
The Aztec.nr framework includes an [easy_private_state](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/aztec-nr/easy-private-state/src/easy_private_state.nr) for use in contracts.

The struct is an `EasyPrivateUint` that contains a Context, Set of ValueNotes, and storage_slot (used when setting the Set).

The `add` function shows the simplicity of appending a new note to all existing ones. On the other hand, `sub` (subtraction), needs to first add up all existing values (consuming them in the process), and then insert a single new value of the difference between the sum and parameter.

-----

### Apply
To see this in action, try one of the [Tutorials](../../../developers/tutorials/main)

### Further reading

- [Proof of prior notes](https://docs.aztec.network/developers/contracts/syntax/historical_access/how_to_prove_history) - public/private reading of public/private proof of state (public or private)

### References
1. [learn/concepts/hybrid_state/main#private-state](https://docs.aztec.network/learn/concepts/hybrid_state/main#private-state)
1. [learn/concepts/storage/trees/main#note-hash-tree](https://docs.aztec.network/learn/concepts/storage/trees/main#note-hash-tree)
1. [learn/concepts/storage/storage_slots#private-state-slots](https://docs.aztec.network/learn/concepts/storage/storage_slots#private-state-slots---slots-arent-real)
1. [developers/contracts/syntax/storage/main](https://docs.aztec.network/developers/contracts/syntax/storage/main)
    1. [developers/contracts/syntax/storage/private_state](https://docs.aztec.network/developers/contracts/syntax/storage/private_state)
    1. [developers/contracts/syntax/storage/storage_slots](https://docs.aztec.network/developers/contracts/syntax/storage/storage_slots)
1. [developers/contracts/syntax/context#the-private-context](https://docs.aztec.network/developers/contracts/syntax/context#the-private-context)
1. [developers/wallets/main#recipient-encryption-keys](https://docs.aztec.network/developers/wallets/main#recipient-encryption-keys)


Related:
- ["Stable" state variable](https://github.com/AztecProtocol/aztec-packages/issues/4130)
- [Code: Aztec-Patterns](https://github.com/defi-wonderland/aztec-patterns)
