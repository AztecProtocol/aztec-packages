---
title: Quickstart
---

Get started with the Aztec Sandbox

## Introduction

The Aztec Sandbox is an environment for local development on the Aztec Network. It's easy to get setup with just a single, simple command, and contains all the components needed to develop and test Aztec contracts and applications.

This quickstart walks you through installing the Sandbox, deploying your first Noir contract, and verifying its execution!

## Installation

You can run the Sandbox using either Docker or npm.

### With Docker

To install and start the Sandbox paste the line below in a macOS Terminal or Linux shell prompt. You will need to have Docker installed on your machine.

```bash
/bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

To install a specific version of the sandbox, you can set the environment variable `SANDBOX_VERSION`

```bash
SANDBOX_VERSION=<version> /bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"
```

NOTE: If `SANDBOX_VERSION` is not defined, the script will pull the latest release of the sandbox.

### With npm

You can download and run the Sandbox package directly if you have nodejs 18 or higher installed. You will also need an Ethereum node like Anvil or Hardhat running locally on port 8545.

```bash
npx @aztec/aztec-sandbox
```

## Deploying a contract

To interact with the sandbox now that it's running locally, install the Aztec CLI:

```bash
npm install -g @aztec/cli
```

The sandbox is preloaded with two accounts. Let's assign them to shell variables. Run the following in your terminal, so we can refer to the accounts as $ALICE and $BOB from now on:

:::note
The default accounts that come with sandbox will likely change over time. Save two of the "Initial accounts" that are printed in the terminal when you started the sandbox.
:::

```bash
ALICE="0x183253b9bb70e447c2bddce766b199111bec335d3396cd403ff5306ddf2f8a43"
BOB="0x112cc0f5583099bf9cf9cd3e638aff4222a688c210a07f74262d8b4b90e51f2b"
```

Start by deploying a private token contract, minting an initial supply of private tokens to Alice:

#include_code deploy yarn-project/end-to-end/src/guides/up_quick_start.sh bash

The contract address of the newly-deployed contract should be printed to the console. Let's store this contract address for future commands:

```bash
CONTRACT_ADDRESS="Paste the contract address here"
```

## Caling a contract

We can check Alice's private token balance by querying the contract.

<!-- Uncomment this when this test (https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/end-to-end/src/guides/up_quick_start.sh#L18-L24)
is updated to use $CONTRACT instead of a hardcoded value -->

<!-- #include_code deploy yarn-project/end-to-end/src/guides/up_quick_start.sh bash -->

```bash
aztec-cli call getBalance \
  --args $ALICE \
  --contract-abi PrivateTokenContractAbi \
  --contract-address $CONTRACT_ADDRESS
```

We can have Alice privately transfer tokens to Bob. Only Alice and Bob will know what's happened. Here, we use Alice's private key to send a transaction to transfer tokens to Bob:

```bash
aztec-cli send transfer \
  --args 500 $BOB \
  --contract-abi PrivateTokenContractAbi \
  --contract-address $CONTRACT_ADDRESS \
  --private-key 0xb2803ec899f76f6b2ac011480d24028f1a29587f8a3a92f7ee9d48d8c085c284
```

Next we can verify the result by checking Alice's new balance

```bash
aztec-cli call getBalance \
  --args $ALICE \
  --contract-abi PrivateTokenContractAbi \
  --contract-address $CONTRACT_ADDRESS
```

Lastly, we can further verify the result by checking Bob's new balance

```bash
aztec-cli call getBalance \
  --args $BOB \
  --contract-abi PrivateTokenContractAbi \
  --contract-address $CONTRACT_ADDRESS
```

Congratualations! You are all set up with the Aztec sandbox!

## Great, but what can I do with it?

Aztec's Layer 2 network is a fully programmable combined private/public ZK rollup. To achieve this, the network contains the following primary components:

- Aztec Node - Aggregates all of the 'backend' services necessary for the building and publishing of rollups.
- Aztec RPC Server - Normally residing with the end client, this decrypts and stores a client's private state, executes simulations and submits transactions to the Aztec Node.
- Aztec.js - Aztec's client library for interacting with the Aztec RPC Server (think Ethers.js).
