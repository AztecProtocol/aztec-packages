---
title: What is Aztec?
sidebar_position: 0
id: overview
tags: [protocol]
---

![Aztec](https://research.tokenmetrics.com/wp-content/uploads/2023/08/Aztec-Research-scaled.jpg)

This page outlines Aztec's fundamental technical concepts.

## Aztec Overview

![Aztec](https://docs.aztec.network/assets/images/how-does-aztec-work-bdd89644f75b23c05bc0e7e04d7a5bb9.webp)

1. A user interacts with Aztec through Aztec.js (like web3js or ethersjs).
2. Private functions are executed in the PXE, which is client-side.
3. They are rolled up and sent to the Public VM (running on an Aztec node).
4. Public functions are executed in the Public VM.
5. The Public VM rolls up the private and public transaction rollups, which are submitted to Ethereum.

The PXE is unaware of the Public VM, and the Public VM is unaware of the PXE; they are completely separate execution environments. 
This means that the PXE and the Public VM cannot directly communicate with each other, and private transactions in the PXE are executed first, followed by public transactions.

### Private and public state

Private state works with UTXOs, which we refer to as notes. To keep things private, everything is stored in an [append-only UTXO tree](./concepts/storage/trees/index.md), and a nullifier is created when notes are invalidated. Nullifiers are then stored in their own [nullifier tree](./concepts/storage/trees/index.md).

Public state functions similarly to other blockchains like Ethereum, behaving like a public ledger. Public data is stored in a [public data tree](./concepts/storage/trees/index.md#public-state-tree).

Aztec [smart contract](./smart_contracts_overview.md) should keep in mind that different types are used when manipulating private or public state. Working with private state involves creating commitments and nullifiers, while working with public state involves directly updating the state.

## Accounts

Every account in Aztec is a smart contract (account abstraction). This allows implementing various schemes for transaction signing, nonce management, and fee payments.

Developers can write their own account contracts to define the rules by which user transactions are authorized and paid for. They can also specify how user keys are managed.

Learn more about account contracts [here](./concepts/accounts/index.md).

## Smart contracts

Developers can write [smart contracts](./smart_contracts_overview.md) that manipulate both public and private states. They are written in a framework on top of Noir, the zero-knowledge domain-specific language developed specifically for Aztec. Outside of Aztec, Noir is also used for writing circuits that can be verified on EVM chains.

Noir has its own documentation site that you can find [here](https://noir-lang.org).

## Communication with Ethereum

Aztec allows private communications with Ethereum, i.e., no one knows where the transaction is coming from, just that it is coming from somewhere on Aztec.

This is achieved through portals: these are smart contracts deployed on an EVM that are related to the Ethereum smart contract you want to interact with.

Learn more about portals [here](../protocol-specs/l1-smart-contracts/index.md).

## Circuits

Aztec operates on three types of circuits:

- [Private kernel circuits](../aztec/concepts/circuits/kernels/private_kernel.md), which are executed by the user on their own device, and prove the correct execution of a function.
- [Public kernel circuits](../aztec/concepts/circuits/kernels/public_kernel.md),  executed by the [sequencer](./network/sequencer/index.md), ensure the stack trace of transactions adheres to function execution rules.
- [Rollup circuits](../aztec/concepts/circuits/index.md), which bundle all of the Aztec transactions into a proof that can be efficiently verified on Ethereum.

## What's next?

### Dive deeper into how Aztec works

Explore the Concepts for a deeper understanding into the components that make up Aztec:

<div className="card-container">

  <Card shadow='tl' link='/aztec/concepts/accounts'>
    <CardHeader>
      <h3>Accounts</h3>
    </CardHeader>
    <CardBody>
    Learn about Aztec's native account abstraction—every account in Aztec is a smart contract that defines the rules for whether a transaction is valid or not.
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/circuits'>
    <CardHeader>
      <h3>Circuits</h3>
    </CardHeader>
    <CardBody>
      Understand the central role of circuits in Aztec's operations, including those in the core protocol and the developer-written Aztec.nr contracts.
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/pxe'>
    <CardHeader>
      <h3>PXE (pronounced 'pixie')</h3>
    </CardHeader>
    <CardBody>
     Discover the Private Execution Environment (PXE), a client-side library for executing private operations.
    </CardBody>
  </Card>

   <Card shadow='tl' link='/aztec/concepts/state_model'>
    <CardHeader>
      <h3>State model</h3>
    </CardHeader>
    <CardBody>
     Explore Aztec's hybrid public/private state model.Explore Aztec's hybrid public/private state model.
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/storage'>
    <CardHeader>
      <h3>Storage</h3>
    </CardHeader>
    <CardBody>
     In Aztec, private and public data are stored in two trees: a public data tree and a note hashes tree.
    </CardBody>
  </Card>

  <Card shadow='tl' link='/aztec/concepts/wallets'>
    <CardHeader>
      <h3>Wallets</h3>
    </CardHeader>
    <CardBody>
    Wallets expose an interface to decentralized applications (dapps) that allows them to act on behalf of the user, such as querying private state or sending transactions.
    </CardBody>
  </Card>

</div>

## Start coding

<div>
 <Card shadow='tl' link='/guides/developer_guides/getting_started'>
    <CardHeader>
      <h3>Developer Getting Started Guide</h3>
    </CardHeader>
    <CardBody>
      Follow the getting started guide to start developing with the Aztec Sandbox.
    </CardBody>
  </Card>
</div>
