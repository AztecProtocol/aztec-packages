---
title: Core Concepts
---

This page outlines Aztec concepts that are essential for developers to understand. Reading and understanding these concepts will help you massively when you start to dive deeper into smart contracts.

A little bit of time here can save a lot down the road.

# Aztec Overview

TODO diagram

To sum this up:
1. A user interacts with Aztec through Aztec.js (like web3js or ethersjs) or Aztec CLI
2. Private functions are executed in the PXE, which is client-side
3. They are rolled up and sent to the Public VM
4. Public functions are executed in the Public VM
5. The Public VM rolls up the private & public transaction rollups
6. These rollups are submitted to Ethereum

## Composability between private and public state

The PXE is unaware of the Public VM. And the Public VM is unaware of the PXE. They are completely separate execution environments. This means:

* The PXE and the Public VM cannot directly communicate with each other
* Private transactions in the PXE are executed first, followed by public transactions

You can call a public transaction from a private transaction by using this:

TODO include code

You cannot call a private transaction from a public transaction, but you can use an append-only merkle tree to save messages from a public function call. These can later be executed by a private function.

TODO include code if we have anything

### Data types

Private state works with UTXOs, or what we call notes. To keep things private, everything is stored in an append-only UTXO tree, and a nullifier is created when notes are spent.

TODO diagram maybe

Public state works similarly to other chains like Ethereum, behaving more like a public ledger. 

Working with private state is like creating commitments and nullifiers, whereas working with public state is like directly updating state.

We have abstractions for working with private state so you don't have to worry about these commitments and nullifiers. However, it is important to understand that the types and libraries you use will be different when working with private state and public state.

For example, let's say you're trying to work with an integer. We have a library called `EasyPrivateUint` that acts like an int but in the background is actually updating notes in private state. For the public side, we instead have something called `SafeU120`. You cannot use EasyPrivateUint in a public environment, and you cannot use SafeU120 in a private environment.

# Storage

Currently, when writing Aztec.nr smart contracts, you will need to define two things when initiating storage:

1. The storage struct, ie what you are storing and their types
2. A storage `impl` block with `init` function that will be called when you use the storage in a function

The storage struct looks like this:

TODO include code

The storage impl block looks like this:

TODO include code

The `init` function must declare the storage struct with an instantiation defining how variables are accessed and manipulated. Each variable must be given a storage slot, which can be anything except 0.

The impl block is likely to be abstracted away at a later date.

# Portals

Aztec allows you to interact with Ethereum privately - ie no-one knows where the transaction is coming from, just that it is coming from somewhere on Aztec.

This is achieved through portals - these are smart contracts written in Solidity that are related to the Ethereum smart contract you want to interact with.

A portal can be associated with multiple Aztec contracts, but an Aztec contract can only be associated with one portal. 

# Account Abstraction

Every account in Aztec is a smart contract. This allows implementing different schemes for transaction signing, nonce management, and fee payments.

You can write your own account contract to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed.

# Noir Language
Aztec smart contracts are written in a framework on top of Noir, the zero-knowledge domain-specific language developed specifically for Aztec. It is similar to Rust. Outside of Aztec, Noir is used for writing circuits that can be verified in Solidity.

You do not need to understand Noir to write Aztec contracts. However, it may be useful to reference the [Noir docs](https://noir-lang.org) when you start writing more advanced contracts.