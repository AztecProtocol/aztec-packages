---
title: Getting Started on Testnet
sidebar_position: 6
tags: [sandbox, testnet]
---

# Getting Started on Aztec Testnet

This guide will walk you through setting up and using the Aztec testnet. By the end, you'll have created an account, deployed a contract, and performed some basic operations.

If you already have an app on sandbox, you might want to check out the [sandbox to testnet guide](../../../sandbox_to_testnet_guide.md).

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
bash -i <(curl -s https://install.aztec.network)
```

Then install the version of the network running the testnet:

```bash
aztec-up 0.85.0-alpha-testnet.3
```

:::warning

The testnet is version dependent. It is currently running version `0.85.0-alpha-testnet.3`. Maintain version consistency when interacting with the testnet to reduce errors.

:::

## Step 1: Deploy an account to testnet

Aztec uses account abstraction, which means:

- All accounts are smart contracts (no EOAs)
- Account signature schemes are private
- Accounts only need deployment if they interact with public components
- Private contract interactions don't require account deployment

0. Set some variables that we need:

```bash
export NODE_URL=http://34.107.66.170
export SPONSORED_FPC_ADDRESS=0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5
```

1. Create a new account:

```bash
aztec-wallet create-account \
    --register-only \
    --node-url $NODE_URL \
    --alias my-wallet
```

You should see the account information displayed in your terminal.

2. Register your account with the fee sponsor contract:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --from my-wallet \
    --alias sponsoredfpc \
    $SPONSORED_FPC_ADDRESS SponsoredFPC \
    --salt 0
```

This means you won't have to pay fees - a sponsor contract will pay them for you. Fees on Aztec are abstracted, so you can pay publicly or privately (even without the sequencer knowing who you are).

You should see that the contract `SponsoredFPC` was added at a specific address.

3. Deploy your account (even though we don't have to):

```bash
aztec-wallet deploy-account \
    --node-url $NODE_URL \
    --from my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --register-class
```

Note: The first time you run these commands, it will take longer as some binaries are installed. This command is generating a client-side proof!

You should see the tx hash in your terminal.

## Step 2: Deploy and interact with a token contract

1. Deploy a token contract:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18
```

You should see confirmation that the token contract is stored in the database.

2. Mint 10 private tokens to yourself:

```bash
aztec-wallet send mint_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 10
```

You should see confirmation that the tx hash is stored in the database.

3. Send 2 private tokens to public:

```bash
aztec-wallet send transfer_to_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address last \
    --args accounts:my-wallet accounts:my-wallet 2 0
```

You should see confirmation that the tx hash is stored in the database.

4. Check your balances

Private balance:

```bash
aztec-wallet simulate balance_of_private \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `8n`.

Public balance:

```bash
aztec-wallet simulate balance_of_public \
    --node-url $NODE_URL \
    --from my-wallet \
    --contract-address last \
    --args accounts:my-wallet
```

You should see `2n`.

## Next Steps

Congratulations! You've now learned the fundamentals of working with the Aztec testnet. Here are some resources to continue your journey:

- [Aztec Playground](https://play.aztec.network/)
- [Tutorials](../../tutorials/codealong/contract_tutorials/counter_contract.md)
- [Guide to run a node](../../../the_aztec_network/index.md)
