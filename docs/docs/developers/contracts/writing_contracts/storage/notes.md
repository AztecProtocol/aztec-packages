---
title: Using Notes
---

This explainer will go through some more details of components that make up Notes, expanding upon what has been covered [here](../../../../learn/concepts/storage/notes).

Some optional background resources on notes can be seen here:
- [High level network architecture](../../../../learn/about_aztec/technical_overview#high-level-network-architecture), specifically the Private Execution Environment
- [Transaction lifecycle (simple diagram)](../../../../learn/concepts/transactions#simple-example-of-the-private-transaction-lifecycle)
- [Public and Private state](../../../../learn/concepts/hybrid_state/main)

Notes touches a lot of other core components of the protocol, but we will focus on a the essentials first.

#### Some code context
The way Aztec benefits from the Noir language is via three important components:
- `Aztec-nr` - a Noir framework enabling contracts on Aztec, written in Noir. Includes useful Note implementations
- `noir contracts` - , example Aztec contracts
- `noir-protocol-circuits` - a crate containing essential circuits for the protocol (public circuits and private wrappers)

A lot of what we will look at will be in [aztec-nr/aztec/src/note](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note), specifically the lifecycle and note interface.
Looking at the noir circuits in these components, you will see references to the distinction between public/private execution and state.

### Lifecycle functions
Inside the [lifecycle](
https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/lifecycle.nr) circuits we see the functions to create and destroy a note, implemented as insertions of note hashes and nullifiers respectively.

We also see a function to create a note hash from the public context, a way of creating a private variable from a public call (run in the sequencer).

### Note Interface functions
To see a [note_interface](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) implementation, we will look at a simple [ValueNote](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/value-note/src/value_note.nr).

The interface is required to work within an Aztec contract's storage, and a ValueNote is a specific type of note to hold a number (as a `Field`).

#### Computing hashes and nullifiers
A few key functions in the note interface are around computing the note hash and nullifier, with logic to get/use secret keys from the private context.

In the ValueNote implementation you'll notice that it uses the `pedersen_hash` function. This is currently required by the protocol, but may be updated to another hashing function, like poseidon.

As a convenience, the outer [note/utils.nr](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/utils.nr) contains an implementation of a function required by Aztec contracts using private storage: `compute_note_hash_and_nullifier`

#### Serialization and deserialization
Serialization/deserialization of content is used to convert between the Note's variables and a generic array of Field elements. The Field type is understood and used by lower level crypographic libraries.
This is analogous to the encoding/decoding between variables and bytes in solidity.

For example in ValueNote, the `serialize_content` function simply returns: the value, owner address (as a field) and the note randomness; as an array of Field elements.

### Value as a sum of Note
We recall that multiple notes are associated with a "slot" (or ID), and so the value of a numerical note (like ValueNote) is the sum of each note's value.
The helper function in [balance_utils](https://github.com/AztecProtocol/aztec-packages/blob/#include_/noir-projects/aztec-nr/value-note/src/balance_utils.nr) implements this logic taking a `Set` of `ValueNotes`.

A couple of things worth clarifying:
- A `Set` takes a Generic type, specified here as `ValueNote`, but can be any `Note` type (for all notes in the set)
- A `Set` of notes also specifies *the* slot of all Notes that it holds

### Abstracting Notes
The Aztec.nr framework includes an [easy_private_state](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/aztec-nr/easy-private-state/src/easy_private_state.nr) for use in contracts.

The struct is an `EasyPrivateUint` that contains a Context, Set of ValueNotes, and storage_slot (used when setting the Set).

The `add` function shows the simplicity of appending a new note to all existing ones. On the other hand, `sub` (subtraction), needs to first add up all existing values (consuming them in the process), and then insert a single new value of the difference between the sum and parameter.

-----

### Apply

To see this in action, try the [Token tutorial](../../../tutorials/writing_token_contract). In this section you will also find other tutorials using notes in different ways.

### Further reading

- [Proof of prior notes](../../writing_contracts/historical_data/archive_tree/how_to_prove_history) - public/private reading of public/private proof of state (public or private)

If you're curious about any of the following related topics, search the documentation for...
- Private and public contexts
- Encryption keys and events
- Oracle's role in using notes
- Value Serialization/Deserialization

### References
- [Notes explainer](../../../../learn/concepts/storage/notes)

Related:
- ["Stable" state variable](https://github.com/AztecProtocol/aztec-packages/issues/4130)
- [Code: Aztec-Patterns](https://github.com/defi-wonderland/aztec-patterns)
