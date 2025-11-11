---
title: Setting up for Devnet
sidebar_position: 3
tags: [testnet]
description: Guide for developers to get started with the Aztec devnet, including account creation and contract deployment.
---

import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

This guide explains the differences between sandbox and devnet, how to migrate from sandbox to devnet, and how to start developing directly on devnet.

## Sandbox vs Devnet: Key Differences

Before diving into the setup, it's important to understand the differences between sandbox and devnet:

### Sandbox (Local Development)

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
If you're new to Aztec and want to understand local development first, check out the [sandbox guide](../developers/docs/tutorials/sandbox.md).
:::

## Prerequisites

Before working with devnet, ensure you have:

1. [Docker](https://docs.docker.com/get-started/get-docker/) installed
2. Aztec CLI installed:

```sh
bash -i <(curl -s https://install.aztec.network)
```

3. The devnet version installed:

```bash
aztec-up #include_devnet_version
```

:::warning
The devnet is version dependent. It is currently running version `#include_devnet_version`. Maintain version consistency when interacting with the devnet to reduce errors.
:::

## Getting Started on Devnet

### Step 1: Set up your environment

Set the required environment variables:

```bash
export VERSION=#include_devnet_version
export NODE_URL=https://devnet.aztec-labs.com/
export SPONSORED_FPC_ADDRESS=0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97
```

### Step 2: Create and deploy an account

Unlike sandbox, devnet has no pre-deployed accounts. You need to create your own, but first you need to register the sponsored FPC to pay transaction fees:

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
The first transaction will take longer as it downloads proving keys. If you see `Timeout awaiting isMined`, the transaction is still processing - this is normal on testnet.
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

## Migrating from Sandbox to Testnet

If you have an existing app running on sandbox, here's how to migrate it to testnet:

### 1. Connect to Testnet Node

Instead of running a local sandbox, connect to the testnet node:

```sh
export NODE_URL=https://aztec-testnet-fullnode.zkv.xyz
```

When running `aztec-wallet` commands, include the node URL:

```sh
aztec-wallet create-account -a main --node-url $NODE_URL
```

### 2. Initialize a TestWallet for Devnet

You can connect to testnet directly from your app using AztecJS:

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

Unlike sandbox, devnet requires fee payment. You have three options:

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
  - L1→L2: Wait ~1.5-2 minutes (vs 2 blocks on sandbox)
  - L2→L1: Wait ~30 minutes for finalization (vs immediate on sandbox)

## Key Considerations When Using Devnet

### Handling Transaction Timeouts

Devnet transactions take longer than sandbox. Handle timeouts gracefully:

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

## Devnet information

## RPC

https://devnet.aztec-labs.com

## Packages Versions / Github Tag

3.0.0-devnet.4

## Network Configuration

- **l1ChainId**: 11155111
- **rollupVersion**: 1667575857
<!-- cspell:disable-next-line -->
- **enr**: -Na4QDO8LfoSfCpWFbMPHwYZegt9P--3X8XCRmwuXD1SEtxdD2kx4K-ue5VuwG4DOWqDbsxLQ9Ja3Mr6OSmjV-8x-ToHhWF6dGVjsTAwLTExMTU1MTExLWIwNWYzNmM5LTE2Njc1NzU4NTctMjc2MzhiZjMtMDY4YTc5ZTiCaWSCdjSCaXCEIpEKG4lzZWNwMjU2azGhAvyGRkH6p8gsIWyI6vmqHxMIqAweVkShKk3mjGfL7e2Gg3RjcIKd0IN1ZH CCndCDdmVyjjMuMC4wLWRldm5ldC4y

## Migration Notes

[Migration Notes](./docs/resources/migration_notes.md)

## L1 Contract Addresses

- **registryAddress**: `0x9017a63e26eaf1197c49b4315a9f32a771abeea7`
- **slashFactoryAddress**: `0x4926e1bd0ba4c9f477c57ce7311c62d4075dca5c`
- **feeAssetHandlerAddress**: `0x252a71fc243812f747fc4782dea865a260ef81c9`
- **rollupAddress**: `0xb05f36c9dffa76f0af639385ef44d5560e0160c1`
- **inboxAddress**: `0x33631b33f335e249279db08b9b7272c9906c1405`
- **outboxAddress**: `0xfe37ceedec5674805fdc3cd5ca8aa6ca656cbfb9`
- **feeJuiceAddress**: `0xa9144418460188c2b59914e6a7cb01deb1e019d7`
- **stakingAssetAddress**: `0xdcaca47b74caf5c14ce023597f0e3b67e1f14496`
- **feeJuicePortalAddress**: `0xeea84a878a3fd52d14e7820dddb60d35219b9cd9`
- **coinIssuerAddress**: `0x48ab541e0f60e3138f6f24c5cc72993ffcdca462`
- **rewardDistributorAddress**: `0x4833dacefe705e31200d071a04d17bd29e2c740c`
- **governanceProposerAddress**: `0x4194937ab0bb3b1b4b1b1d770bb8577a0500911b`
- **governanceAddress**: `0x6af3cc6c09a72b5a0ab772f37fd7b719569f27b9`
- **gseAddress**: `0xeee2d3289dff43909b935da9ef2121fdcad8773f`

## Protocol Contract Addresses

- **classRegistry**: `0x0000000000000000000000000000000000000000000000000000000000000003`
- **feeJuice**: `0x0000000000000000000000000000000000000000000000000000000000000005`
- **instanceRegistry**: `0x0000000000000000000000000000000000000000000000000000000000000002`
- **multiCallEntrypoint**: `0x0000000000000000000000000000000000000000000000000000000000000004`
- **sponsoredFPC**: `0x280e5686a148059543f4d0968f9a18cd4992520fcd887444b8689bf2726a1f97`

## Next Steps

- **New to Aztec?** Start with the [sandbox tutorial](../developers/docs/tutorials/sandbox.md) for faster development
- **Ready for production testing?** Continue using devnet
- **Learn more:** Check out our [tutorials](./docs/tutorials/contract_tutorials/counter_contract.md)
- **Explore:** Visit [Aztec Playground](https://play.aztec.network/)

## Additional Resources

- [Fee payment guide](./docs/aztec-js/how_to_pay_fees.md)
- [Running a node](../the_aztec_network/index.md)
- [Block explorers](https://aztecscan.xyz)
