---
title: Connect to Local Network
tags: [local_network, connection, wallet]
sidebar_position: 1
description: Connect your application to the Aztec local network and interact with accounts.
---

This guide shows you how to connect your application to the Aztec local network and interact with the network.

## Prerequisites

- Running Aztec local network (see [Quickstart](../../getting_started_on_local_network.md)) on port 8080
- Node.js installed
- TypeScript project set up

## Install dependencies

```bash
yarn add @aztec/aztec.js@4.0.0-nightly.20260202 @aztec/test-wallet@4.0.0-nightly.20260202
```

## Connect to the network

Create a node client and TestWallet to interact with the local network:

```typescript
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import {
  TestWallet,
  registerInitialLocalNetworkAccountsInWallet,
} from "@aztec/test-wallet/server";

const nodeUrl = "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);

// Wait for the network to be ready
await waitForNode(node);

// Create a TestWallet connected to the node
const wallet = await TestWallet.create(node);
```

`TestWallet` is a development wallet that handles account management and transaction signing locally, suitable for testing and development.

### Verify the connection

Get node information to confirm your connection:

```typescript
const nodeInfo = await node.getNodeInfo();
console.log("Connected to local network version:", nodeInfo.nodeVersion);
console.log("Chain ID:", nodeInfo.l1ChainId);
```

### Load pre-funded accounts

The local network has accounts pre-funded with fee juice to pay for gas. Register them in your wallet:

```typescript
const [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);

console.log(`Alice's address: ${alice.toString()}`);
console.log(`Bob's address: ${bob.toString()}`);
```

These accounts are pre-funded with fee juice (the native gas token) at genesis, so you can immediately send transactions without needing to bridge funds from L1.

### Check fee juice balance

Verify that an account has fee juice for transactions:

```typescript
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

const aliceBalance = await getFeeJuiceBalance(alice, node);
console.log(`Alice's fee juice balance: ${aliceBalance}`);
```

## Next steps

- [Create an account](./how_to_create_account.md) - Deploy new accounts on the network
- [Deploy a contract](./how_to_deploy_contract.md) - Deploy your smart contracts
- [Send transactions](./how_to_send_transaction.md) - Execute contract functions
