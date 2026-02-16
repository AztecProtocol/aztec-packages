---
title: Aztec Overview
sidebar_position: 0
tags: [protocol]
description: Overview of Aztec, a privacy-first Layer 2 on Ethereum supporting smart contracts with private and public state and execution.
---

import Image from "@theme/IdealImage";

This page outlines Aztec's fundamental technical concepts. Read this first to understand Aztec's core concepts before you start building.

## What is Aztec?

Aztec is a privacy-first Layer 2 on Ethereum. It supports smart contracts with both private & public state and private & public execution.

<Image img={require("@site/static/img/Aztec_overview.png")} />

## High level view

<Image img={require("@site/static/img/aztec-high-level.png")} />

1. A user interacts with Aztec through Aztec.js (like web3js or ethersjs)
2. Private functions are executed in the PXE, which is client-side
3. Proofs and tree updates are sent to the Aztec Node
4. Public functions are executed by the AVM (Aztec Virtual Machine)
5. The sequencer rolls up transactions with private and public state updates into blocks
6. The block data and proof of a correct state transition are submitted to Ethereum for verification

## Private and public execution

Private functions execute **client-side** (on user devices) to maintain maximum privacy. Public functions execute on a **remote network of nodes**, similar to other blockchains.

This creates a **directional flow** within each transaction:

1. Private execution happens first (on user's device)
2. Public execution happens second (on the network)

**Important:** Private functions can enqueue public functions to be executed later in the transaction lifecycle, but public functions **cannot** call private functions.

### Private Execution Environment (PXE)

Private functions are executed on the user's device in the Private Execution Environment (PXE, pronounced 'pixie'), which then generates proofs for onchain verification. The PXE is a client-side library for the execution and proof-generation of private operations. It holds keys, notes, and generates proofs. The PXE is included in aztec.js, a TypeScript library, and can be run within Node or the browser.

Note: It is easy for private functions to be written in a detrimentally unoptimized way, because many intuitions of regular program execution do not apply to proving. For more about writing performant private functions in Noir, see [this page](https://noir-lang.org/docs/explainers/explainer-writing-noir) of the Noir documentation.

### Aztec Virtual Machine (AVM)

Public functions are executed by the Aztec Virtual Machine (AVM), which is conceptually similar to the Ethereum Virtual Machine (EVM). As such, writing efficient public functions follow the same intuition as gas-efficient solidity contracts.

The PXE and AVM are completely separate execution environments and they cannot directly communicate with each other. This means:

- Private functions are executed first in the PXE, followed by public functions in the AVM
- Data can only flow from private to public, never the reverse

## Private and public state

Private state uses a UTXO (Unspent Transaction Output) model. Think of **notes** as sealed envelopes containing private data where only the owner can decrypt and read them. To "update" private data, you don't modify it directly. Instead, you destroy the old note and create a new one.

Notes are stored in an append-only tree, meaning data can only be added and never modified or deleted. When a note is consumed, a **nullifier** is created. A nullifier is a unique identifier that proves a note was used without revealing which specific note it was. This is how Aztec maintains privacy: observers can see that some note was spent, but they cannot tell which one.

Nullifiers are stored in their own [nullifier tree](./docs/foundational-topics/advanced/storage/indexed_merkle_tree.mdx).

Public state works similarly to other chains like Ethereum, behaving like a public ledger. Public data is stored in a public data tree.

![Public vs private state](@site/static/img/public-and-private-state-diagram.png)

Aztec [smart contract](./docs/aztec-nr/framework-description/contract_structure.md) developers must use different patterns depending on state type:

- **Private state**: Create commitments (cryptographic hashes that hide the data) and nullifiers (proofs that data was consumed)
- **Public state**: Directly update values, similar to Ethereum smart contracts

## Accounts and keys

### Account abstraction

Every account in Aztec is a smart contract (account abstraction). This allows implementing different schemes for authorizing transactions, nonce management, and fee payments.

Developers can write their own account contract to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed.

Learn more about account contracts [here](./docs/foundational-topics/accounts/index.md).

### Key pairs

Each account in Aztec is backed by 3 key pairs:

- A **nullifier key pair** used for note nullifier computation
- An **incoming viewing key pair** used to encrypt a note for the recipient
- An **outgoing viewing key pair** used to encrypt a note for the sender

As Aztec has native account abstraction, accounts do not automatically have a signing key pair to authenticate transactions. This is up to the account contract developer to implement.

## Noir

Noir is a zero-knowledge domain specific language used for writing smart contracts for the Aztec network. It is also possible to write circuits with Noir that can be verified on or offchain. For more in-depth docs into the features of Noir, go to the [Noir documentation](https://noir-lang.org/).
