---
title: Getting Started on Testnet
sidebar_position: 6
draft: true
tags: [sandbox, testnet]
---

# Getting Started on Aztec Testnet

This guide will walk you through setting up and using the Aztec testnet. By the end, you'll have created an account, deployed a contract, and performed some basic operations.

## Key Terms

In this guide you will see these terms:

- **aztec**: a command-line tool for interacting with aztec testnet (& sandbox local environments)
- **aztec-nargo**: a command-line tool for compiling contracts
- **aztec.nr**: a Noir library used for writing Aztec smart contracts
- **aztec-wallet**: A tool for creating and interacting with Aztec wallets
- **sandbox**: A local development environment

## Prerequisites

Before you begin, you'll need to install:
1. [Docker](https://docs.docker.com/get-started/get-docker/)

## Install Aztec CLI

Run this:

```sh
bash -i <(curl -s https://install.aztec.network) && VERSION=#include_aztec_version aztec-up
```

## Install Noir LSP

Install the [Noir Language Support extension for VSCode](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir).

Now we're ready!

## Step 1: Deploy an account to testnet

Aztec uses account abstraction, which means:
- All accounts are smart contracts (no EOAs)
- Account signature schemes are private
- Accounts only need deployment if they interact with public components
- Private contract interactions don't require account deployment

1. Create a new account:
```bash
aztec-wallet create-account --register-only -a my-wallet
```

2. Register your account with the fee sponsor contract:
```bash
export SPONSORED_FPC_ADDRESS=0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5
aztec-wallet register-contract SPONSORED_FPC_ADDRESS SponsoredFPC --from my-wallet
```

This means you won't have to pay fees - a sponsor contract will pay them for you. Fees on Aztec are abstracted, so you can pay publicly or privately (even without the sequencer knowing who you are).

3. Deploy your account (even though we don't have to):
```bash
aztec-wallet deploy-account --from my-wallet --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

Note: The first time you run these commands, it will take longer as some binaries are installed. This command is generating a client-side proof!

## Step 2: Deploy and interact with a token contract

1. Deploy a token contract:
```bash
aztec-wallet deploy --from accounts:my-wallet token_contract@Token --args accounts:my-wallet Token TOK 18 -a token
```

2. Mint 10 private tokens to yourself:
```bash
aztec-wallet send token mint_private -ca last --args accounts:my-wallet 10 -f accounts:my-wallet
```

3. Make the private tokens public:
```bash
aztec-nargo call token_contract transfer_private_to_public --args <amount> <recipient>
```

## Next Steps

Congratulations! You've now learned the fundamentals of working with the Aztec testnet. Here are some resources to continue your journey:

- [Aztec Playground](https://play.aztec.network/)
- [Tutorials](../../tutorials/codealong/contract_tutorials/counter_contract.md)
- [Guide to run a node](../../../run_node/index.md)
