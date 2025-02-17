---
title: State Model
sidebar_position: 4
tags: [state]
---

Aztec has a hybrid public/private state model. Aztec contract developers can specify which data is public and which data is private, as well as the functions that can operate on that data.

## Public State

Aztec has public state that will be familiar to developers coming that have worked on other blockchains. Public state is transparent and is managed by the associated smart contract logic.

Internal to the Aztec network, public state is stored and updated by the sequencer. The sequencer executes state transitions, generates proofs of correct execution (or delegates proof generation to the prover network), and publishes the associated data to Ethereum.

## Private State

Private state must be treated differently from public state. Private state is encrypted and therefore is "owned" by a user or a set of users (via shared secrets) that are able to decrypt the state.

Private state is represented in an append-only database since updating a record would leak information about the transaction graph.

The act of "deleting" a private state variable can be represented by adding an associated nullifier to a nullifier set. The nullifier is generated such that, without knowing the decryption key of the owner, an observer cannot link a state record with a nullifier.

Modification of state variables can be emulated by nullifying the state record and creating a new record to represent the variable. Private state has an intrinsic UTXO structure.

## Further reading

Read more about how to leverage the Aztec state model in Aztec contracts [here](../../../developers/reference/smart_contract_reference/storage/index.md).
