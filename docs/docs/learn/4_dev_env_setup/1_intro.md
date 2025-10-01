---
title: "Development Environment Setup"
description: "Learn how to set up your Aztec development environment with the Sandbox and essential tools"
sidebar_position: 1
tags: [development environment, setup, getting started]
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Welcome to the development environment setup! This is where you'll get your hands dirty and prepare everything you need to start building on Aztec. Don't worry if you're new to blockchain development - we'll guide you through each step.

## Overview

In this lesson, we'll walk through setting up your complete Aztec development environment:

1. **Getting Started with the Sandbox** - Your local Aztec network for development and testing
2. **Running the Aztec Sandbox** - How to start, configure, and use your local development network
3. **Installing the Noir Language Support** - Setting up your code editor with syntax highlighting, auto-completion, and other helpful features for writing Noir contracts

## Why This Matters

Before writing smart contracts, we need to properly configure our development environment.

The Aztec Sandbox is particularly important because it gives you a safe, local environment where you can:

- Deploy and test contracts without spending real funds
- Experiment freely without affecting any live networks
- Debug issues quickly with fast block times
- Reset everything instantly when needed

## Prerequisites

Before we begin, make sure you have:

- [**Node.js**](https://nodejs.org/en) (version 22 or later)
- [**Docker**](https://www.docker.com/) (for running the Sandbox)
- A code editor (we recommend [VS Code](https://code.visualstudio.com/) for the best Noir support)
- Basic familiarity with the CLI (command line interface)

## What is the sandbox?

The Sandbox is an local development Aztec network running fully on your machine, and interacting with a development Ethereum node. You can develop and deploy on it just like on a testnet or mainnet (when the time comes). The sandbox makes it faster and easier to develop and test your Aztec applications.

What's included in the sandbox:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- Development tools to compile contracts and interact with the network (`aztec-nargo` and `aztec-wallet`)

All of this comes packages in a Docker container to make it easy to install and run.

## Getting started with the sandbox

### Start Docker

Docker needs to be running in order to install the sandbox. Find instructions on the [Docker website](https://docs.docker.com/get-started/).

### Install the sandbox

Run:

```bash
bash -i <(curl -s https://install.aztec.network)
```

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (full sandbox, sequencer, prover, pxe, etc) and provides utility commands to interact with the network
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-postprocess-contract** - postprocessing tool for Aztec contracts (transpilation and VK generation).
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.
- **aztec-wallet** - a tool for interacting with the aztec network

### Start the sandbox

Once these have been installed, to start the sandbox, run:

```bash
aztec start --sandbox
```

**Congratulations, you have just installed and run the Aztec Sandbox!**

```bash
     /\        | |
    /  \    ___| |_ ___  ___
   / /\ \  |_  / __/ _ \/ __|
  / ____ \  / /| ||  __/ (__
 /_/___ \_\/___|\__\___|\___|

```

In the terminal, you will see some logs:

1. Sandbox version
2. Contract addresses of rollup contracts
3. PXE (private execution environment) setup logs
4. Initial accounts that are shipped with the sandbox and can be used in tests

You'll know the sandbox is ready to go when you see something like this:

```bash
INFO: cli Aztec Server listening on port 8080
```

### Noir language support

Now, we are ready to start writing some Aztec smart contracts.

Create a new folder and open it up in VS Code.

To make your Noir code easier to visualize, download the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir). Be careful to verify that the extension is correct by checking the [linked GitHub repository](https://github.com/noir-lang/vscode-noir) is correct.

This gives you:

- Syntax highlighting
- Compile errors and warnings on file save
- Run tests via codelens above each test
- Useful snippets for common code patterns
- Auto-format on save

## What's next?

Now that we have our environment set up, let's create our first smart contract using the Aztec boilerplate contracts.
