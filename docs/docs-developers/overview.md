---
title: Aztec Overview
sidebar_position: 0
tags: [protocol]
description: Overview of Aztec, a privacy-first Layer 2 on Ethereum supporting smart contracts with private and public state and execution.
---

import Image from "@theme/IdealImage";

This page outlines Aztec's fundamental technical concepts. It is recommended to read this before diving into building on Aztec.

## What is Aztec?

Aztec is a privacy-first Layer 2 on Ethereum. It supports smart contracts with both private & public state and private & public execution.

<Image img={require("@site/static/img/Aztec_overview.png")} />

## Getting started

Learn about Aztec, what it is, how it works, and how to get started writing smart contracts on Aztec with programmable privacy by watching this video:

<div style={{position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', maxWidth: '100%', marginBottom: '2rem'}}>
  <iframe
    style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}}
    src="https://www.youtube.com/embed/93pfZMjKMmQ"
    title="Aztec Overview Video"
    frameBorder="0"
    allowFullScreen>
  </iframe>
</div>

## High level view

<Image img={require("@site/static/img/aztec-high-level.png")} />

1. A user interacts with Aztec through Aztec.js (like web3js or ethersjs)
2. Private functions are executed in the PXE, which is client-side
3. Proofs and tree updates are sent to the sequencer
4. Public functions are executed by the AVM (Aztec Virtual Machine)
5. The sequencer rolls up transactions with private and public state updates into blocks
6. The block data and proof of a correct state transition are submitted to Ethereum for verification

## Private and public execution

- **Private functions** execute client-side on user devices to maintain maximum privacy
- **Public functions** execute on a remote network of nodes, similar to other blockchains

This creates a **directional flow** within each transaction:

1. Private execution happens first (on the user's device)
2. Public execution happens second (on the network)

**Important:** Private functions can enqueue public functions to run later in the transaction lifecycle, but public functions **cannot** call private functions.

### Private Execution Environment (PXE)

Private functions are executed on the user's device in the Private Execution Environment (PXE, pronounced 'pixie'), which then generates proofs for onchain verification. The PXE is a client-side library for the execution and proof generation of private operations. It holds keys, notes, and generates proofs. It is included in aztec.js, a TypeScript library, and can be run within Node or the browser.

Note: It is easy for private functions to be written in a detrimentally unoptimized way, because many intuitions of regular program execution do not apply to proving. For more about writing performant private functions in Noir, see [this page](https://noir-lang.org/docs/explainers/explainer-writing-noir) of the Noir documentation.

### Aztec Virtual Machine (AVM)

Public functions are executed by the Aztec Virtual Machine (AVM), which is conceptually similar to the Ethereum Virtual Machine (EVM). As such, writing efficient public functions follows the same intuition as writing gas efficient Solidity contracts.

The PXE and AVM are completely separate execution environments. This means:

- The PXE and AVM cannot directly communicate with each other
- Private functions are executed first in the PXE, followed by public functions in the AVM

## Private and public state

**Public state** works similarly to other chains like Ethereum, behaving like a public ledger. You can directly read and update values, just like you would with Solidity storage variables. Public data is stored in a public data tree.

**Private state** works differently. Instead of storing a balance directly (which anyone could see), private state uses a UTXO model with something called **notes**. Think of notes like physical cash where instead of having a total balance of 30 tokens, you might have one note worth 20 tokens and another worth 10. Now to "update" private state, you consume (spend) existing notes and create new ones, just like handing over bills and receiving change.

Notes are stored as commitments (hashes) in an [append only note hash tree](./docs/foundational-topics/advanced/storage/indexed_merkle_tree.mdx). Since the tree is append only, you cannot delete or modify a note. So how do you mark a note as spent? This is where **nullifiers** come in. When you consume a note, you produce a unique nullifier that proves the note was used, without revealing which note it was. Nullifiers are stored in their own [nullifier tree](./docs/foundational-topics/advanced/storage/indexed_merkle_tree.mdx), and the presence of a nullifier prevents the same note from being spent twice.

![Public vs private state](@site/static/img/public-and-private-state-diagram.png)

As an Aztec [smart contract](./docs/aztec-nr/framework-description/contract_structure.md) developer, the key thing to remember is that these two state types require different patterns:

- **Public state**: You directly update values, similar to Ethereum smart contracts
- **Private state**: You create commitments (hashes of your private data) and nullifiers (proofs that data was consumed) rather than modifying storage directly

## Accounts and keys

### Account abstraction

Every account in the Aztec network is a smart contract, because of native account abstraction. This allows implementing different schemes for authorizing transactions, nonce management, and fee payments. Developers can write their own account contract to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed.

Learn more about account contracts [here](./docs/foundational-topics/accounts/index.md).

### Key pairs

Each account in Aztec is backed by 3 key pairs:

- A **nullifier key pair** used for note nullifier computation
- An **incoming viewing key pair** used to encrypt a note for the recipient
- An **outgoing viewing key pair** used to encrypt a note for the sender

As Aztec has native account abstraction, accounts do not automatically have a signing key pair to authenticate transactions. This is up to the account contract developer to implement.

## Noir

Noir is a zero-knowledge domain specific language used for writing smart contracts for the Aztec network. It is also possible to write circuits with Noir that can be verified on or offchain. For more in-depth docs into the features of Noir, go to the [Noir website](https://noir-lang.org/).
