---
title: All about fees
sidebar_position: 0
tags: [fees, accounts, cli, contracts] TODO: check tags
---

The Aztec network is a privacy preserving layer 2 secured by Ethereum, and for the consensus mechanism to work, Aztec makes use of an asset to pay for transactions called, "Fee juice".

By the end of this tutorial you will...
- Connect to the Aztec testnet (or a locally run sandbox)
- Use different payment methods to deploy accounts and make transactions via:
	- various `aztec-wallet` CLI commands
	- the Aztec.js library
- Understand the pros/cons of different payment methods


## Background

As a quick summary of required knowledge:

(**TODO: Each of these as snippets**)

**The PXE**
The PXE is a client-side key manager, private contract storage, and Private eXecution Environment for private transactions. A PXE is a core part of an Aztec wallet and Sandbox, but can be decoupled and run independently.

**An Aztec node**
An Aztec node is a prover/sequencer that is part of a decentralised Aztec network. The Aztec testnet rolls up to Ethereum Sepolia.

**The Aztec Sandbox**
The Aztec Sandbox runs a local environment for rapid development, it includes: an Ethereum node, an Aztec node, and PXE.

## Connect to the network

To quickly get started we'll begin with using the `aztec-wallet` to connect to a local sandbox.

#### Tools

**TODO: as snippet**
To install the tools see [Getting Started](../../getting_started.md) or `bash -i <(curl -s https://install.aztec.network)`

Test the CLi tool with: `aztec-wallet --version`

Start the sandbox (L1, L2, and PXE) via: `aztec start --sandbox`

#### Accounts

