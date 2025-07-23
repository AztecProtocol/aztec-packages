---
title: Aztec Overview
sidebar_position: 0
tags: [protocol]
---

import Image from "@theme/IdealImage";

This page outlines Aztec's fundamental technical concepts. It is recommended to read this before diving into building on Aztec.

## What is Aztec?

Aztec is a privacy-first Layer 2 on Ethereum. It supports smart contracts with both private & public state and private & public execution.

<Image img={require("@site/static/img/Aztec_overview.png")} />

## High level view

<Image img={require("@site/static/img/aztec-high-level.png")} />

1. A user interacts with Aztec through Aztec.js (like web3js or ethersjs)
2. Private functions are executed in the PXE, which is client-side
3. Proofs and tree updates are sent to the Public VM (running on an Aztec node)
4. Public functions are executed in the Public VM
5. The Public VM rolls up the transactions that include private and public state updates into blocks
6. The block data and proof of a correct state transition are submitted to Ethereum for verification

## Private and public execution

Private functions are executed client side, on user devices to maintain maximum privacy. Public functions are executed by a remote network of nodes, similar to other blockchains. These distinct execution environments create a directional execution flow for a single transaction--a transaction begins in the private context on the user's device then moves to the public network. This means that private functions executed by a transaction can enqueue public functions to be executed later in the transaction life cycle, but public functions cannot call private functions.

### Private Execution Environment (PXE)

Private functions are executed on the user's device in the Private Execution Environment (PXE, pronounced 'pixie'), then it generates proofs for onchain verification. It is a client-side library for execution and proof-generation of private operations. It holds keys, notes, and generates proofs. It is included in aztec.js, a TypeScript library, and can be run within Node or the browser.

Note: It is easy for private functions to be written in a detrimentally unoptimized way, because many intuitions of regular program execution do not apply to proving. For more about writing performant private functions in Noir, see [this page](https://noir-lang.org/docs/explainers/explainer-writing-noir) of the Noir documentation.

### Aztec Virtual Machine (AVM)

Public functions are executed by the Aztec Virtual Machine (AVM), which is conceptually similar to the Ethereum Virtual Machine (EVM). As such, writing efficient public functions follow the same intuition as gas-efficient solidity contracts.

The PXE is unaware of the Public VM. And the Public VM is unaware of the PXE. They are completely separate execution environments. This means:

- The PXE and the Public VM cannot directly communicate with each other
- Private transactions in the PXE are executed first, followed by public transactions

## Private and public state

Private state works with UTXOs, which are chunks of data that we call notes. To keep things private, notes are stored in an [append-only UTXO tree](./concepts/advanced/storage/indexed_merkle_tree.mdx), and a nullifier is created when notes are invalidated (aka deleted). Nullifiers are stored in their own [nullifier tree](./concepts/advanced/storage/indexed_merkle_tree.mdx).

Public state works similarly to other chains like Ethereum, behaving like a public ledger. Public data is stored in a public data tree.

![Public vs private state](@site/static/img/public-and-private-state-diagram.png)

Aztec [smart contract](./smart_contracts_overview.md) developers should keep in mind that different data types are used when manipulating private or public state. Working with private state is creating commitments and nullifiers to state, whereas working with public state is directly updating state.

## Accounts and keys

### Account abstraction

Every account in Aztec is a smart contract (account abstraction). This allows implementing different schemes for authorizing transactions, nonce management, and fee payments.

Developers can write their own account contract to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed.

Learn more about account contracts [here](./concepts/accounts/index.md).

### Key pairs

Each account in Aztec is backed by 3 key pairs:

- A **nullifier key pair** used for note nullifier computation
- A **incoming viewing key pair** used to encrypt a note for the recipient
- A **outgoing viewing key pair** used to encrypt a note for the sender

As Aztec has native account abstraction, accounts do not automatically have a signing key pair to authenticate transactions. This is up to the account contract developer to implement.

## Noir

Noir is a zero-knowledge domain specific language used for writing smart contracts for the Aztec network. It is also possible to write circuits with Noir that can be verified on or offchain. For more in-depth docs into the features of Noir, go to the [Noir documentation](https://noir-lang.org/).

## What's next?

### Start coding

<div>
 <Card shadow='tl' link='/developers/getting_started'>
    <CardHeader>
      <h3>Developer Getting Started Guide</h3>
    </CardHeader>
    <CardBody>
      Follow the getting started guide to start developing with the Aztec Sandbox
    </CardBody>
  </Card>
</div>

### Dive deeper into how Aztec works

Explore the Concepts for a deeper understanding into the components that make up Aztec:

<div className="card-container">

  <Card shadow='tl' link='/aztec/concepts/accounts'>
    <CardHeader>
      <h3>Accounts</h3>
    </CardHeader>
    <CardBody>
      Learn about Aztec's native account abstraction - every account in Aztec is a smart contract which defines the rules for whether a transaction is or is not valid
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/pxe'>
    <CardHeader>
      <h3>PXE (pronounced 'pixie')</h3>
    </CardHeader>
    <CardBody>
      The Private Execution Environment (or PXE) is a client-side library for the execution of private operations
    </CardBody>
  </Card>

   <Card shadow='tl' link='/aztec/concepts/storage/state_model'>
    <CardHeader>
      <h3>State model</h3>
    </CardHeader>
    <CardBody>
      Aztec has a hybrid public/private state model
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/storage'>
    <CardHeader>
      <h3>Storage</h3>
    </CardHeader>
    <CardBody>
     In Aztec, private data and public data are stored in two trees: a public data tree and a note hashes tree
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/wallets'>
    <CardHeader>
      <h3>Wallets</h3>
    </CardHeader>
    <CardBody>
     Wallets expose to dapps an interface that allows them to act on behalf of the user, such as querying private state or sending transactions
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/advanced/circuits'>
    <CardHeader>
      <h3>Protocol Circuits</h3>
    </CardHeader>
    <CardBody>
      Central to Aztec's operations are circuits in the core protocol and the developer-written Aztec.nr contracts
    </CardBody>
  </Card>

</div>
