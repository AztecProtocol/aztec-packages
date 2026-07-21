---
title: Deploying Contracts
tags: [contracts, deployment]
sidebar_position: 3
description: Deploy smart contracts to Aztec using generated TypeScript classes.
---

This guide shows you how to deploy compiled contracts to Aztec using the generated TypeScript interfaces.

## Overview

Deploying a contract to Aztec involves publishing the contract class (the bytecode) and creating a contract instance at a specific address. The generated TypeScript classes handle this process through an API: you call `deploy()` with constructor arguments and `send()` with transaction options to deploy and get the contract instance. The contract address is deterministically computed from the contract class, constructor arguments, salt, and deployer address.

import { General } from '@site/src/components/Snippets/general_snippets';

## Prerequisites

- Compiled contract artifacts (see [How to Compile](../aztec-nr/compiling_contracts.md))
- <General.AztecJSPrerequisites />
- TypeScript project set up

## Generate TypeScript bindings

### Compile and generate code

```bash
# Compile the contract
aztec compile

# Generate TypeScript interface
aztec codegen ./target/my_contract-MyContract.json -o src/artifacts
```

:::info
The codegen command creates a TypeScript class with typed methods for deployment and interaction. This provides type safety and autocompletion in your IDE.
:::

## Deploy a contract

### Step 1: Import and connect

```typescript
import { MyContract } from "./artifacts/MyContract";
```

:::note[About wallets and accounts]
In the examples below, `wallet` refers to a `Wallet` instance that manages keys and signs transactions. See [Creating Accounts](./how_to_create_account.md) for how to set up a wallet. The `from` option in `send()` specifies which account pays for the transaction. This account must be registered in the wallet and have sufficient fee juice. On a local network, test accounts are pre-funded; on testnet, you typically use sponsored fees.
:::

### Step 2: Deploy the contract

How you deploy depends on how you pay for it. When paying using an account's fee juice (like a test account on the local network):

#include_code deploy_basic_local /docs/examples/ts/aztecjs_advanced/index.ts typescript

On testnet, your account likely won't have Fee Juice. Instead, pay fees using the [Sponsored Fee Payment Contract method](./how_to_pay_fees.md):

#include_code deploy_sponsored_fpc_contract /docs/examples/ts/aztecjs_advanced/index.ts typescript

Here's a complete example from the test suite:

#include_code deploy_basic yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

## Use deployment options

### Deploy with custom salt

By default, the deployment's salt is random, but you can specify it (for example, if you want to get a deterministic address):

#include_code deploy_custom_salt /docs/examples/ts/aztecjs_advanced/index.ts typescript

### Deploy universally

Deploy to the same address across networks by setting `universalDeploy: true`:

#include_code deploy_universal yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

:::info
Universal deployment excludes the sender from address computation, allowing the same address on any network with the same salt.
:::

### Skip initialization

Deploy without running the constructor:

#include_code skip_initialization /docs/examples/ts/aztecjs_advanced/index.ts typescript

### Deploy with a specific initializer

Some contracts have multiple initializer functions (e.g., both a private `constructor` and a `public_constructor`). By default, the generated `deploy()` method uses the default initializer (typically named `constructor`). To deploy using a different initializer, use `deployWithOpts`:

#include_code deploy_with_opts yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

The `deployWithOpts` method accepts an options object as its first argument:

- `wallet`: The wallet to use for deployment (required)
- `method`: The name of the initializer function to call (optional, defaults to `constructor`)
- `publicKeys`: Custom public keys for the contract instance (optional)

The remaining arguments are the parameters for the chosen initializer function.

:::tip
This is useful for contracts that support multiple initialization patterns, such as token standards that allow both private and public minting during deployment.
:::

## Calculate deployment address

### Get address before deployment

#include_code calculate_address_before_deploy /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::warning
This is an advanced pattern. For most use cases, deploy the contract directly and get the address from the deployed instance.
:::

## Monitor deployment progress

### Track deployment transaction

Use `NO_WAIT` to get the transaction hash immediately and track deployment:

#include_code no_wait_deploy /docs/examples/ts/aztecjs_advanced/index.ts typescript

For most use cases, simply await the deployment to get the contract directly:

#include_code deploy_contract /docs/examples/ts/aztecjs_connection/index.ts typescript

## Deploy multiple contracts

### Deploy a token contract

Here's an example deploying a `TokenContract` with constructor arguments for admin, name, symbol, and decimals:

#include_code deploy_token yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

### Deploy contracts with dependencies

When one contract depends on another, deploy them sequentially and pass the first contract's address:

#include_code deploy_with_dependencies /docs/examples/ts/aztecjs_advanced/index.ts typescript

### Deploy contracts in parallel

#include_code parallel_deploy /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::tip[Parallel deployment considerations]
Parallel deployment is faster, but transactions from the same account share a nonce sequence. The wallet handles nonce assignment automatically, but if one deployment fails, subsequent deployments may also fail due to nonce gaps. For reliable parallel deployments:

- Use separate accounts for each deployment, or
- Handle failures gracefully and retry with fresh nonces
- Consider using `BatchCall` to bundle multiple operations into a single transaction (see below)
  :::

### Deploy with BatchCall

Use `BatchCall` to bundle a deployment with other calls into a single transaction. This is useful when you need to deploy a contract and immediately call methods on it:

#include_code deploy_batch yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

## Verify deployment

### Check contract state

Use `wallet.getContractMetadata()` to check your contract's current state:

```typescript
const metadata = await wallet.getContractMetadata(contractAddress);

// Check each state:
metadata.instance; // Contract registered in your wallet?
metadata.isContractClassPubliclyRegistered; // Class registered on the network?
metadata.isContractPublished; // Instance registered on the network?
metadata.initializationStatus; // Constructor has been called?
```

For a complete overview of what these states mean and when functions become callable, see [Contract Readiness States](../aztec-nr/contract_readiness_states.md).

Here's a complete example:

#include_code verify_deployment yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts typescript

### What the PXE checks automatically

When you simulate or send a transaction, the PXE automatically verifies:

- Contract instance is registered in your wallet
- Contract artifact is available locally
- Contract class ID matches the network state

The PXE does **not** automatically check:

- Whether the contract is published on the network
- Whether the contract is initialized
- Whether the contract class is registered on the network

If you call a public function on an unpublished contract, the transaction will fail at the network level, not during local simulation. Use `getContractMetadata()` to check these states before sending transactions if you want to provide better error messages to users.

### Verify contract is callable

#include_code verify_contract_callable /docs/examples/ts/aztecjs_advanced/index.ts typescript

## Register deployed contracts

### Add existing contract to wallet

If a contract was deployed by another account:

#include_code register_external_contract /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::warning
You need the exact deployment parameters (salt, initialization hash, etc.) to correctly register an externally deployed contract. If you don't have access to the contract instance, you can reconstruct it:

#include_code reconstruct_contract_instance /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::

## Next steps

- [Contract Readiness States](../aztec-nr/contract_readiness_states.md) - Understand the different states a contract progresses through
- [Send transactions](./how_to_send_transaction.md) to interact with your contract
- [Read contract data](./how_to_read_data.md) including simulating functions and reading events
- [Use authentication witnesses](./how_to_use_authwit.md) for delegated calls
