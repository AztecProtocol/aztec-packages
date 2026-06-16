---
title: Getting Started on Testnet
sidebar_position: 1
tags: [testnet]
description: Deploy contracts and send transactions on the Aztec testnet using the CLI wallet and the Sponsored FPC for fee payment.
---

import { General } from '@site/src/components/Snippets/general_snippets';

This guide walks you through deploying your first contract on the Aztec testnet. You will install the CLI tools, create an account using the Sponsored FPC (so you don't need to bridge Fee Juice yourself), and deploy and interact with a contract.

## Testnet vs Local Network

| Feature | Local Network | Testnet |
|---------|-------------|---------|
| **Environment** | Local machine | Decentralized network on Sepolia |
| **Fees** | Free (test accounts prefunded) | Sponsored FPC available |
| **Block times** | Instant | ~36 seconds |
| **Proving** | Optional | Required |
| **Accounts** | Test accounts pre-deployed | Must create and deploy your own |

:::info
If you want to develop and iterate quickly, start with the [local network guide](./getting_started_on_local_network.md). The local network has instant blocks and no proving, making it faster for development.
:::

## Prerequisites

- <General.node_ver />

## Install the Aztec toolchain

Install the testnet version of the Aztec CLI:

```bash
VERSION=#include_testnet_version bash -i <(curl -sL https://install.aztec.network/#include_testnet_version)
```

:::warning
Testnet is version-dependent. It is currently running version `#include_testnet_version`. Maintain version consistency when interacting with the testnet to avoid errors.
:::

This installs:

- **aztec** - Compiles and tests Aztec contracts, launches infrastructure, and provides utility commands
- **aztec-up** - Version manager for the Aztec toolchain (`aztec-up install`, `aztec-up use`, `aztec-up list`)
- **aztec-wallet** - CLI tool for interacting with the Aztec network

## Getting started on testnet

### Step 1: Set up your environment

Set the required environment variables:

```bash
export NODE_URL=https://rpc.testnet.aztec-labs.com
export SPONSORED_FPC_ADDRESS=0x08b888c4be63ed67f61a622fdd013ea028326bac22a8982a3b5a7e9ec62f765b
```

### Step 2: Register the Sponsored FPC

The Sponsored FPC (Fee Payment Contract) pays transaction fees on your behalf, so you don't need to bridge Fee Juice from L1. Register it in your wallet:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --alias sponsoredfpc \
    $SPONSORED_FPC_ADDRESS SponsoredFPC \
    --salt 0
```

### Step 3: Create and deploy an account

Unlike the local network, testnet has no pre-deployed accounts. Create and deploy your own:

```bash
aztec-wallet create-account \
    --node-url $NODE_URL \
    --alias my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

:::note
The first transaction will take longer as it downloads proving keys. If you see `Timeout awaiting isMined`, the transaction is still processing: this is normal on testnet.
:::

### Step 4: Deploy a contract

Deploy a token contract as an example:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18
```

This deploys the `TokenContract` with:
- `admin`: your wallet address
- `name`: Token
- `symbol`: TOK
- `decimals`: 18

You can check the transaction status on [Aztecscan](https://testnet.aztecscan.xyz).

### Step 5: Interact with your contract

Mint some tokens:

```bash
aztec-wallet send mint_to_public \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
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

This should print:

```
Simulation result:  100n
```

Move tokens to private state:

```bash
aztec-wallet send transfer_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
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

This should print:

```
Simulation result:  25n
```

## Viewing transactions on the block explorer

You can view your transactions, contracts, and account on the testnet block explorers:

- [Aztecscan](https://testnet.aztecscan.xyz)
- [Aztec Explorer](https://aztecexplorer.xyz/?network=testnet)

Search by transaction hash, contract address, or account address to see details and status.

## Registering existing contracts

To interact with a contract deployed by someone else, you need to register it in your local PXE first:

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

## Paying fees without the Sponsored FPC

The Sponsored FPC is convenient for getting started, but you can also pay fees directly by bridging Fee Juice from Ethereum Sepolia. See [Paying Fees](./docs/aztec-js/how_to_pay_fees.md#bridge-fee-juice-from-l1) for details on bridging and other fee payment methods.

## Getting Fee Juice from the faucet

If you want to pay fees directly instead of using the Sponsored FPC, you can request **Fee Juice** from the testnet faucet:

- [Aztec Fee Juice Faucet](https://aztec-faucet.nethermind.io/) - dispenses testnet Fee Juice to your account

:::note Fee Juice is not the AZTEC token
This faucet dispenses **Fee Juice**, the asset used to pay transaction fees (gas) on Aztec. Fee Juice lives on Aztec (L2) and is only used to pay fees. It is **not** the AZTEC token, which is a separate asset that lives on Ethereum (L1). This faucet does not dispense AZTEC tokens.
:::

## Testnet information

For complete testnet technical details including contract addresses and network configuration, see the [Networks page](/networks#testnet).

## Next steps

- Check out the [Tutorials](./docs/tutorials/contract_tutorials/counter_contract.md) for building more complex contracts
- Learn about [paying fees](./docs/aztec-js/how_to_pay_fees.md) with different methods
- Explore [Aztec Playground](https://play.aztec.network/) for an interactive development experience

:::tip Need help?
If something does not work, see the [support guide](./support.md). It tells you when to ask in [Discord](https://discord.gg/aztec) or the [forum](https://forum.aztec.network), when to [open a GitHub issue](https://github.com/AztecProtocol/aztec-packages/issues/new?template=bug_report.yml), and how to disclose security issues responsibly.
:::
