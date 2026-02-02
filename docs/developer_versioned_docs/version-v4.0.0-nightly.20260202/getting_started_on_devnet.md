---
title: Setting up for Devnet
sidebar_position: 3
tags: [devnet]
description: Guide for developers to get started with the Aztec devnet, including account creation and contract deployment.
---

This guide explains the differences between the local network and devnet, how to migrate from the local network to devnet, and how to start developing directly on devnet.

## Local Network vs Devnet: Key Differences

Before diving into the setup, it's important to understand the differences between the local network and devnet:

### Local Network (Local Development)

- Runs locally on your machine
- No proving by default (faster development)
- No fees
- Instant block times
- Test accounts automatically deployed
- Ideal for rapid development and testing

### Devnet (Remote Network)

- Remote environment with network of sequencers
- Always has fees enabled (need to pay or sponsor fees)
- ~36 second block times, longer L1 settlement
- No automatic test accounts

:::info
If you're new to Aztec and want to understand local development first, check out the [local network guide](./docs/tutorials/local_network.md).
:::

## Prerequisites

Before working with devnet, ensure you have:

1. [Docker](https://docs.docker.com/get-started/get-docker/) installed
2. Aztec CLI with Devnet version installed:

```sh
bash -i <(curl -s https://install.aztec.network/3.0.0-devnet.5/)
```

:::warning
The devnet is version dependent. It is currently running version `3.0.0-devnet.5`. Maintain version consistency when interacting with the devnet to reduce errors.
:::

## Getting Started on Devnet

### Step 1: Set up your environment

Set the required environment variables:

```bash
export VERSION=3.0.0-devnet.5
export NODE_URL=https://devnet.aztec-labs.com/
export SPONSORED_FPC_ADDRESS=0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97
```

### Step 2: Create and deploy an account

Unlike the local network, devnet has no pre-deployed accounts. You need to create your own, but first you need to register the sponsored FPC to pay transaction fees:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --alias sponsoredfpc \
    $SPONSORED_FPC_ADDRESS SponsoredFPC \
    --salt 0
```

Then create your account and deploy it:

```bash
aztec-wallet create-account \
    --node-url $NODE_URL \
    --alias my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS
```

:::note
The first transaction will take longer as it downloads proving keys. If you see `Timeout awaiting isMined`, the transaction is still processing - this is normal on devnet.
:::

### Step 3: Deploy and interact with contracts

Deploy a token contract as an example:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18 --no-wait
```

You can check the transaction status on [aztecscan](https://devnet.aztecscan.xyz).

Interact with your deployed contract:

```bash
aztec-wallet send mint_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS \
    --contract-address token \
    --args accounts:my-wallet 10
```

## Migrating from the Local Network to Devnet

If you have an existing app running on your local network, here's how to migrate it to devnet:

### 1. Connect to Devnet Node

Instead of running a local network, connect to the devnet node:

```sh
export NODE_URL=https://devnet-6.aztec-labs.com/
```

When running `aztec-wallet` commands, include the node URL:

```sh
aztec-wallet create-account -a main --node-url $NODE_URL
```

### 2. Initialize a TestWallet for Devnet

You can connect to devnet directly from your app using AztecJS:

In the browser:

```javascript
import { TestWallet } from "@aztec/test-wallet/client/lazy";
```

In Node.js:

```javascript
import { TestWallet } from "@aztec/test-wallet/server";
```

Then initialize with devnet configuration:

```javascript
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";

const NODE_URL = "https://devnet.aztec-labs.com";
const node = createAztecNodeClient(NODE_URL);
const wallet = await TestWallet.create(node);
```

### 3. Handle Fees on Devnet

Unlike the local network, devnet requires fee payment. You have three options:

1. **User pays their own fees** - Send them tokens or direct them to the faucet
2. **Your contract sponsors fees** - Deploy a fee-paying contract
3. **Use the canonical sponsored FPC** - Recommended for getting started

:::info
See the [aztec-starter](https://github.com/AztecProtocol/aztec-starter/blob/154758c866fe34174f2e22b59e70e277fe8ecc73/src/utils/deploy_account.ts#L39) for an example of how to deploy a contract with the sponsored FPC.
:::

### 4. Important Migration Considerations

- **Register all contracts**: Including account contracts and the sponsored FPC in the wallet
- **No test accounts**: You'll need to deploy accounts manually
- **Longer transaction times**: Handle timeouts gracefully - transactions may still succeed
- **L1-L2 messaging delays**:
  - L1→L2: Wait ~1.5-2 minutes (vs 2 blocks on the local network)
  - L2→L1: Wait ~30 minutes for finalization (vs immediate on the local network)

## Key Considerations When Using Devnet

### Handling Transaction Timeouts

Devnet transactions take longer than on the local network. Handle timeouts gracefully:

```javascript
try {
  const receipt = await tx.wait();
} catch (error) {
  if (error.message.includes("Timeout awaiting isMined")) {
    console.log("Transaction sent but still being mined");
    // Check block explorer for status
  }
}
```

### Environment Detection

Detect which environment your code is running against:

```javascript
const isDevnet = process.env.NODE_URL?.includes("devnet");
const nodeUrl = process.env.NODE_URL || "http://localhost:8080";
```

## Devnet Information

For complete Devnet technical details including RPC endpoints, contract addresses, and network configuration, see the [Networks page](/networks#devnet).

## Next Steps

- **New to Aztec?** Start with the [local network tutorial](./docs/tutorials/local_network.md) for faster development
- **Ready for production testing?** Continue using devnet
- **Learn more:** Check out our [tutorials](./docs/tutorials/contract_tutorials/counter_contract.md)
- **Explore:** Visit [Aztec Playground](https://play.aztec.network/)
