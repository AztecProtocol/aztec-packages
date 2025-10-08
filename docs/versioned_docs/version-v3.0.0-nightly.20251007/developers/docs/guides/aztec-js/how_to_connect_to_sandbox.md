---
title: Connecting to the Sandbox
tags: [sandbox, connection, pxe]
sidebar_position: 1
description: Connect your application to the Aztec sandbox and interact with accounts.
---

This guide shows you how to connect your application to the Aztec sandbox and interact with the network.

## Prerequisites

- Running Aztec sandbox (see [Quickstart](../../../getting_started_on_sandbox.md)) on port 8080
- Node.js installed
- TypeScript project set up

## Install Aztec.js

### Install the Aztec.js package

```bash
yarn add @aztec/aztec.js@3.0.0-nightly.20251007
```

## Create a Node Client

The sandbox is essentially a one-node network. Just like on a real network, you need to interface with it:

```typescript
const node = createAztecNodeClient("http://localhost:8080")
const l1Contracts = await node.getL1ContractAddresses();
```

As the name implies, we want to know the L1 Contracts addresses for our PXE.

## Create a PXE

Although the sandbox comes with its own PXE, it's useful to create one specifically for your use-case. You will need to bring your own PXE to the testnet eventually. Let's create a PXE store and configure it:

```typescript
import { createStore } from '@aztec/kv-store/lmdb';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';

const config = getPXEConfig()
const fullConfig = { ...config, l1Contracts }
fullConfig.proverEnabled = false; // you'll want to set this to "true" once you're ready to connect to the testnet

const store = await createStore('pxe', {
    dataDirectory: 'store',
    dataStoreMapSizeKB: 1e6,
});
const pxe = await createPXE(node, fullConfig, {store});
await waitForPXE(pxe);
```

### Verify the connection

Get node information to confirm your connection:

```typescript
const nodeInfo = await pxe.getNodeInfo();
console.log('Connected to sandbox version:', nodeInfo.nodeVersion);
console.log('Chain ID:', nodeInfo.l1ChainId);
```

## Create wallets

Now that we have a PXE running, we can create a Wallet:

```typescript
import { createAztecNodeClient } from '@aztec/aztec.js';
import { TestWallet } from '@aztec/test-wallet';

const node = createAztecNodeClient('http://localhost:8080');
const wallet = await TestWallet.create(node);
```

### Get test accounts

The sandbox has some accounts pre-funded with fee-juice to pay for gas. You can import them and create accounts:

```typescript
import { getInitialTestAccountsData } from '@aztec/accounts/testing';

const [aliceAccount, bobAccount] = await getInitialTestAccountsData();
await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);
await wallet.createSchnorrAccount(bobAccount.secret, bobAccount.salt);
```

### Check account balances

Verify that the accounts have fee juice for transactions:

```typescript
import { getFeeJuiceBalance } from '@aztec/aztec.js';

const aliceBalance = await getFeeJuiceBalance(aliceAccount.address, pxe);
console.log(`Alice's fee juice balance: ${aliceBalance}`);
```

## Next steps

- [Create an account](./how_to_create_account.md) - Deploy new accounts on the network
- [Deploy a contract](./how_to_deploy_contract.md) - Deploy your smart contracts
- [Send transactions](./how_to_send_transaction.md) - Execute contract functions
