---
title: Setting up for Testnet
sidebar_position: 3
tags: [testnet]
description: Guide for developers to get started with the Aztec testnet, including account creation and contract deployment.
---

import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

This guide explains the differences between sandbox and testnet, how to migrate from sandbox to testnet, and how to start developing directly on testnet.

## Sandbox vs Testnet: Key Differences

Before diving into the setup, it's important to understand the differences between sandbox and testnet:

### Sandbox (Local Development)

- Runs locally on your machine
- No proving by default (faster development)
- No fees
- Instant block times
- Test accounts automatically deployed
- Ideal for rapid development and testing

### Testnet (Remote Network)

- Remote environment with network of sequencers
- Always has proving enabled (longer transaction times)
- Always has fees enabled (need to pay or sponsor fees)
- ~36 second block times, longer L1 settlement
- No automatic test accounts
- Ideal for production-like testing

:::info
If you're new to Aztec and want to understand local development first, check out the [sandbox guide](../developers/docs/guides/local_env/sandbox.md).
:::

## Prerequisites

Before working with testnet, ensure you have:

1. [Docker](https://docs.docker.com/get-started/get-docker/) installed
2. Aztec CLI installed:

```sh
bash -i <(curl -s https://install.aztec.network)
```

3. The testnet version installed:

```bash
aztec-up -v latest
```

:::warning
The testnet is version dependent. It is currently running version `2.0.2`. Maintain version consistency when interacting with the testnet to reduce errors.
:::

## Getting Started on Testnet

### Step 1: Set up your environment

Set the required environment variables:

```bash
export NODE_URL=https://aztec-testnet-fullnode.zkv.xyz
export SPONSORED_FPC_ADDRESS=0x299f255076aa461e4e94a843f0275303470a6b8ebe7cb44a471c66711151e529
```

### Step 2: Create and deploy an account

Unlike sandbox, testnet has no pre-deployed accounts. You need to create your own:

```bash
aztec-wallet create-account \
    --register-only \
    --node-url $NODE_URL \
    --alias my-wallet
```

This creates an account but doesn't deploy it yet. Next, register with the fee sponsor to avoid paying fees:

```bash
aztec-wallet register-contract \
    --node-url $NODE_URL \
    --from my-wallet \
    --alias sponsoredfpc \
    $SPONSORED_FPC_ADDRESS SponsoredFPC \
    --salt 0
```

Finally, deploy your account:

```bash
aztec-wallet deploy-account \
    --node-url $NODE_URL \
    --from my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --register-class
```

:::note
The first transaction will take longer as it downloads proving keys. If you see `Timeout awaiting isMined`, the transaction is still processing - this is normal on testnet.
:::

### Step 3: Deploy and interact with contracts

Deploy a token contract as an example:

```bash
aztec-wallet deploy \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --alias token \
    TokenContract \
    --args accounts:my-wallet Token TOK 18 --no-wait
```

You can check the transaction status on [aztecscan](https://aztecscan.xyz) or [aztecexplorer](https://aztecexplorer.xyz).

Interact with your deployed contract:

```bash
aztec-wallet send mint_to_private \
    --node-url $NODE_URL \
    --from accounts:my-wallet \
    --payment method=fpc-sponsored,fpc=contracts:sponsoredfpc \
    --contract-address token \
    --args accounts:my-wallet 10
```

## Migrating from Sandbox to Testnet

If you have an existing app running on sandbox, here's how to migrate it to testnet:

### 1. Connect to Testnet Node

Instead of running a local sandbox, connect to the testnet node:

```sh
export NODE_URL=https://aztec-testnet-fullnode.zkv.xyz
```

When running `aztec-wallet` commands, include the node URL:

```sh
aztec-wallet create-account -a main --register-only --node-url $NODE_URL
```

### 2. Initialize PXE for Testnet

You can connect to testnet directly from your app using AztecJS:

In the browser:

```javascript
import { createPXE } from "@aztec/pxe/client/lazy";
```

In Node.js:

```javascript
import { createPXE } from "@aztec/pxe/server";
```

Then initialize with testnet configuration:

```javascript
import { createAztecNodeClient } from "@aztec/aztec.js";
import { getPXEConfig } from "@aztec/pxe/server";
import { createStore } from "@aztec/kv-store/lmdb";

const NODE_URL = "https://aztec-testnet-fullnode.zkv.xyz";
const node = createAztecNodeClient(NODE_URL);
const l1Contracts = await node.getL1ContractAddresses();
const config = getPXEConfig();
const fullConfig = { ...config, l1Contracts };

const store = await createStore("pxe1", {
  dataDirectory: "store",
  dataStoreMapSizeKB: 1e6,
});

const pxe = await createPXE(node, fullConfig, { store });
```

### 3. Handle Fees on Testnet

Unlike sandbox, testnet requires fee payment. You have three options:

1. **User pays their own fees** - Send them tokens or direct them to the faucet
2. **Your contract sponsors fees** - Deploy a fee-paying contract
3. **Use the canonical sponsored FPC** - Recommended for getting started

Example using the sponsored FPC:

```javascript
const receiptForBob = await bananaCoin
  .withWallet(bobWallet)
  .methods.transfer(alice, amountTransferToAlice)
  .send({ fee: { paymentMethod: sponsoredPaymentMethod } })
  .wait();
```

### 4. Important Migration Considerations

- **Register all contracts**: Including account contracts and the sponsored FPC in the PXE
- **No test accounts**: You'll need to deploy accounts manually
- **Longer transaction times**: Handle timeouts gracefully - transactions may still succeed
- **L1-L2 messaging delays**:
  - L1→L2: Wait ~1.5-2 minutes (vs 2 blocks on sandbox)
  - L2→L1: Wait ~30 minutes for finalization (vs immediate on sandbox)

## Key Considerations When Using Testnet

### Handling Transaction Timeouts

Testnet transactions take longer than sandbox. Handle timeouts gracefully:

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
const isTestnet = process.env.NODE_URL?.includes("testnet");
const nodeUrl = process.env.NODE_URL || "http://localhost:8080";
```

## Next Steps

- **New to Aztec?** Start with the [sandbox guide](../developers/docs/guides/local_env/sandbox.md) for faster development
- **Ready for production testing?** Continue using testnet
- **Learn more:** Check out our [tutorials](./docs/tutorials/contract_tutorials/counter_contract.md)
- **Explore:** Visit [Aztec Playground](https://play.aztec.network/)

## Additional Resources

- [Fee payment guide](./docs/guides/aztec-js/how_to_pay_fees.md)
- [Running a node](../the_aztec_network/index.md)
- [Block explorers](https://aztecscan.xyz)
