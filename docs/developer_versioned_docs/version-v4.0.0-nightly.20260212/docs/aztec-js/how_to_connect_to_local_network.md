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
yarn add @aztec/aztec.js@4.0.0-nightly.20260212 @aztec/wallets@4.0.0-nightly.20260212
```

## Connect to the network

Create a node client and EmbeddedWallet to interact with the local network:

```typescript title="connect_to_network" showLineNumbers 
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);

// Wait for the network to be ready
await waitForNode(node);

// Create an EmbeddedWallet connected to the node
const wallet = await EmbeddedWallet.create(node);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260212/docs/examples/ts/aztecjs_connection/index.ts#L1-L14" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L1-L14</a></sub></sup>


:::note About EmbeddedWallet
`EmbeddedWallet` is a simplified wallet for local development that implements the same `Wallet` interface used in production. It handles key management, transaction signing, and proof generation in-process without external dependencies.

**Why use it for testing?** It starts instantly, requires no setup, and provides deterministic behavior—ideal for automated tests and rapid iteration.

**Production wallets** (like browser extensions or mobile apps) implement the same interface but store keys securely, may require user confirmation for transactions, and typically run in a separate process. Code written against `EmbeddedWallet` works with any `Wallet` implementation, so your application logic transfers directly to production.
:::

### Verify the connection

Get node information to confirm your connection:

```typescript title="verify_connection" showLineNumbers 
const nodeInfo = await node.getNodeInfo();
console.log("Connected to local network version:", nodeInfo.nodeVersion);
console.log("Chain ID:", nodeInfo.l1ChainId);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260212/docs/examples/ts/aztecjs_connection/index.ts#L16-L20" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L16-L20</a></sub></sup>


### Load pre-funded accounts

The local network has accounts pre-funded with fee juice to pay for gas. Register them in your wallet:

```typescript title="load_accounts" showLineNumbers 
const testAccounts = await getInitialTestAccountsData();
const [aliceAddress, bobAddress] = await Promise.all(
  testAccounts.slice(0, 2).map(async (account) => {
    return (await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey)).address;
  }),
);

console.log(`Alice's address: ${aliceAddress.toString()}`);
console.log(`Bob's address: ${bobAddress.toString()}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260212/docs/examples/ts/aztecjs_connection/index.ts#L22-L32" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L22-L32</a></sub></sup>


These accounts are pre-funded with fee juice (the native gas token) at genesis, so you can immediately send transactions without needing to bridge funds from L1.

### Check fee juice balance

Verify that an account has fee juice for transactions:

```typescript title="check_fee_juice" showLineNumbers 
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";

const aliceBalance = await getFeeJuiceBalance(aliceAddress, node);
console.log(`Alice's fee juice balance: ${aliceBalance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260212/docs/examples/ts/aztecjs_connection/index.ts#L34-L39" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L34-L39</a></sub></sup>


## Next steps

- [Create an account](./how_to_create_account.md) - Deploy new accounts on the network
- [Deploy a contract](./how_to_deploy_contract.md) - Deploy your smart contracts
- [Send transactions](./how_to_send_transaction.md) - Execute contract functions
