---
title: Connect to Local Network
tags: [local_network, connection, wallet]
sidebar_position: 1
description: Connect your application to the Aztec local network and interact with accounts.
references: ["docs/examples/ts/aztecjs_connection/index.ts", "yarn-project/wallets/src/embedded/*", "yarn-project/accounts/src/testing/*"]
---

This guide shows you how to connect your application to the Aztec local network and interact with the network.

## Prerequisites

- Running Aztec local network (see [Quickstart](../../getting_started_on_local_network.md)) on port 8080
- Node.js installed
- TypeScript project set up

## Install dependencies

```bash
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/wallets@#include_version_without_prefix
```

## Connect to the network

Create a node client and EmbeddedWallet to interact with the local network:

#include_code connect_to_network /docs/examples/ts/aztecjs_connection/index.ts typescript

:::note About EmbeddedWallet
`EmbeddedWallet` is a simplified wallet for local development that implements the same `Wallet` interface used in production. It handles key management, transaction signing, and proof generation in-process without external dependencies.

**Why use it for testing?** It starts instantly, requires no setup, and provides deterministic behavior—ideal for automated tests and rapid iteration.

**Production wallets** (like browser extensions or mobile apps) implement the same interface but store keys securely, may require user confirmation for transactions, and typically run in a separate process. Code written against `EmbeddedWallet` works with any `Wallet` implementation, so your application logic transfers directly to production.
:::

### Verify the connection

Get node information to confirm your connection:

#include_code verify_connection /docs/examples/ts/aztecjs_connection/index.ts typescript

### Load pre-funded accounts

The local network has accounts pre-funded with fee juice to pay for gas. Register them in your wallet:

#include_code load_accounts /docs/examples/ts/aztecjs_connection/index.ts typescript

These accounts are pre-funded with fee juice (the native gas token) at genesis, so you can immediately send transactions without needing to bridge funds from L1.

### Check fee juice balance

Verify that an account has fee juice for transactions:

#include_code check_fee_juice /docs/examples/ts/aztecjs_connection/index.ts typescript

## Next steps

- [Create an account](./how_to_create_account.md) - Deploy new accounts on the network
- [Deploy a contract](./how_to_deploy_contract.md) - Deploy your smart contracts
- [Send transactions](./how_to_send_transaction.md) - Execute contract functions
