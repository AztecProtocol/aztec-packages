---
title: Getting Started
tags: [local_network, connection, wallet]
sidebar_position: 1
description: Connect your application to the Aztec local network and interact with accounts.
---

This guide shows you how to connect your application to the Aztec local network and interact with the network.

## Prerequisites

- Running Aztec local network (see [Quickstart](../../getting_started_on_local_network.md)) on port 8080
- Node.js installed
- TypeScript project set up

## Install Aztec.js

### Install the Aztec.js package

```bash
yarn add @aztec/aztec.js@3.0.0-nightly.20251118
```

## Create a Node Client

The local network is essentially a one-node network. Just like on a real network, you need to interface with it:

```typescript
const node = createAztecNodeClient("http://localhost:8080");
const l1Contracts = await node.getL1ContractAddresses();
```

As the name implies, we want to know the L1 Contracts addresses for our wallet.

## Create a TestWallet

You will need to create your own TestWallet to connect to local network accounts. Let's create a TestWallet:

```typescript
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";

export async function setupWallet(): Promise<TestWallet> {
  const nodeUrl = "http://localhost:8080";
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(node);
  return wallet;
}
```

### Verify the connection

Get node information to confirm your connection:

```typescript
const nodeInfo = await pxe.getNodeInfo();
console.log("Connected to local network version:", nodeInfo.nodeVersion);
console.log("Chain ID:", nodeInfo.l1ChainId);
```

### Get local network accounts

The local network has some accounts pre-funded with fee-juice to pay for gas. You can import them and create accounts:

```typescript
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const [aliceAccount, bobAccount] = await getInitialTestAccountsData();
await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);
await wallet.createSchnorrAccount(bobAccount.secret, bobAccount.salt);
```

### Check account balances

Verify that the accounts have fee juice for transactions:

```typescript
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

const aliceBalance = await getFeeJuiceBalance(aliceAccount.address, node);
console.log(`Alice's fee juice balance: ${aliceBalance}`);
```

## Next steps

- [Create an account](./how_to_create_account.md) - Deploy new accounts on the network
- [Deploy a contract](./how_to_deploy_contract.md) - Deploy your smart contracts
- [Send transactions](./how_to_send_transaction.md) - Execute contract functions
