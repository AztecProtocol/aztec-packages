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

## Private state variables in Aztec
State variables in an Aztec contract are defined inside a struct specifically named `Storage`, and must satisfy the [Note Interface](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) and contain a [Note header](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_header.nr).

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


### Further reading

- [Using Notes Explainer](../../../developers/contracts/writing_contracts/storage/notes)
