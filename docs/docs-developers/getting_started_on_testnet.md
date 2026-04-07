---
title: Getting Started on Testnet
sidebar_position: 1
tags: [testnet]
description: Deploy contracts and send transactions on Aztec testnet using the CLI wallet.
---

import { General } from '@site/src/components/Snippets/general_snippets';

This guide walks you through deploying your first contract on the Aztec testnet. You will install the CLI tools, get fee juice to pay for transactions, create an account, and deploy and interact with a contract.

## Testnet vs Local Network

| Feature | Local Network | Testnet |
|---------|-------------|---------|
| **Environment** | Local machine | Decentralized network on Sepolia |
| **Fees** | Free (test accounts prefunded) | Must bridge Fee Juice from L1 |
| **Block times** | Instant | ~36 seconds |
| **Proving** | Optional | Required |
| **Accounts** | Test accounts pre-deployed | Must create and deploy your own |

:::info
If you want to develop and iterate quickly without bridging fees, start with the [local network guide](./getting_started_on_local_network.md) or the [devnet guide](./getting_started_on_devnet.md) (which has a sponsored fee contract for free transactions).
:::

## Prerequisites

- <General.node_ver />
- An Ethereum wallet with Sepolia ETH (for bridging Fee Juice). You can get Sepolia ETH from faucets like [Google Cloud Sepolia Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia).

## Install the Aztec toolchain

Install the testnet version of the Aztec CLI:

```bash
VERSION=#include_testnet_version bash -i <(curl -sL https://install.aztec.network/#include_testnet_version)
```

:::warning
Testnet is version-dependent. It is currently running version `#include_testnet_version`. Ensure version consistency when interacting with the testnet to avoid errors.
:::

This installs:

- **aztec** - Compiles and tests Aztec contracts, launches infrastructure, and provides utility commands
- **aztec-up** - Version manager for the Aztec toolchain (`aztec-up install`, `aztec-up use`, `aztec-up list`)
- **aztec-wallet** - CLI tool for interacting with the Aztec network

## Set up your environment

Set the required environment variables:

```bash
export NODE_URL=https://rpc.testnet.aztec-labs.com
```

## Step 1: Bridge Fee Juice from L1

Unlike the local network and devnet, testnet does **not** have a Sponsored Fee Payment Contract (FPC). You must bridge Fee Juice from Ethereum Sepolia to pay for transactions on L2.

The `aztec-wallet bridge-fee-juice` command mints Fee Juice on L1 and bridges it to your L2 address. You need an Ethereum private key with Sepolia ETH for the L1 gas costs.

First, generate an Aztec account (without deploying it yet):

```bash
aztec-wallet create-account \
    --node-url $NODE_URL \
    --alias my-wallet \
    --skip-initialization \
    --register-class
```

This will print your account address. Now bridge Fee Juice to that address:

```bash
aztec-wallet bridge-fee-juice \
    --node-url $NODE_URL \
    --l1-rpc-urls https://sepolia.infura.io/v3/YOUR_INFURA_KEY \
    --l1-private-key YOUR_SEPOLIA_PRIVATE_KEY \
    --mint \
    1000000000000000000 \
    accounts:my-wallet
```

Replace `YOUR_INFURA_KEY` with a Sepolia RPC provider key (Infura, Alchemy, etc.) and `YOUR_SEPOLIA_PRIVATE_KEY` with the private key of an Ethereum account that has Sepolia ETH.

:::note
The `--mint` flag mints Fee Juice on L1 before bridging. This works on testnets where the Fee Juice L1 contract allows minting. The bridging process takes a few minutes as it waits for L1 transactions to be processed and the L2 message to become available.
:::

## Step 2: Deploy your account

Once the Fee Juice has been bridged and is available on L2, deploy your account:

```bash
aztec-wallet deploy-account \
    --node-url $NODE_URL \
    accounts:my-wallet
```

:::note
The first transaction may take longer as it downloads proving keys. If you see a `Timeout awaiting isMined` message, the transaction is still processing. Check the block explorer for status.
:::

## Step 3: Deploy a contract

Deploy a token contract as an example:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18
```

This deploys the `TokenContract` with:
- `admin`: your wallet address
- `name`: Token
- `symbol`: TOK
- `decimals`: 18

On successful deployment, you'll see the contract address and deployment details.

## Step 4: Interact with your contract

Mint some tokens:

```bash
aztec-wallet send mint_to_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --contract-address token \
    --args accounts:my-wallet 100
```

Check your balance:

```bash
aztec-wallet simulate balance_of_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --contract-address token \
    --args accounts:my-wallet
```

Move tokens to private state:

```bash
aztec-wallet send transfer_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --contract-address token \
    --args accounts:my-wallet 25
```

Check your private balance:

```bash
aztec-wallet simulate balance_of_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --contract-address token \
    --args accounts:my-wallet
```

## Viewing transactions on the block explorer

You can view your transactions, contracts, and account on the testnet block explorers:

- [Aztecscan](https://testnet.aztecscan.xyz)
- [Aztec Explorer](https://aztecexplorer.xyz/?network=testnet)

Search by transaction hash, contract address, or account address to see transaction details, status, and more.

## Registering existing contracts

If you want to interact with a contract that was deployed by someone else, you need to register it in your local PXE first:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --alias mycontract \
    <CONTRACT_ADDRESS> <ArtifactName>
```

For example, to register a `TokenContract` deployed by someone else:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --alias external-token \
    0x1234...abcd TokenContract
```

After registration, you can interact with it using `aztec-wallet send` and `aztec-wallet simulate` as shown above.

## Key differences from devnet

- **No Sponsored FPC**: You must bridge Fee Juice from L1 to pay for transactions. On devnet, the Sponsored FPC pays fees for free.
- **Decentralized sequencer set**: Testnet runs with multiple validators, unlike devnet's centralized sequencer.
- **Production-like conditions**: Testnet is the staging environment for Alpha. Treat it as production.
- **Longer finalization**: L2 to L1 message finalization takes longer due to the decentralized proving pipeline.

## Testnet information

For complete testnet technical details including contract addresses and network configuration, see the [Networks page](/networks#testnet).

## Next steps

- Check out the [Tutorials](./docs/tutorials/contract_tutorials/counter_contract.md) for building more complex contracts
- Learn about [paying fees](./docs/aztec-js/how_to_pay_fees.md) with different methods
- Explore [Aztec Playground](https://play.aztec.network/) for an interactive development experience
