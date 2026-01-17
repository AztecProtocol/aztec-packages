---
title: Deploying Contracts
tags: [contracts, deployment]
sidebar_position: 3
description: Deploy smart contracts to Aztec using generated TypeScript classes.
---

This guide shows you how to deploy compiled contracts to Aztec using the generated TypeScript interfaces.

## Overview

Deploying a contract to Aztec involves publishing the contract class (the bytecode) and creating a contract instance at a specific address. The generated TypeScript classes handle this process through an API: you call `deploy()` with constructor arguments, `send()` with transaction options, and `deployed()` to wait for completion. The contract address is deterministically computed from the contract class, constructor arguments, salt, and deployer address.

## Prerequisites

- Compiled contract artifacts (see [How to Compile](../aztec-nr/how_to_compile_contract.md))
- Running Aztec local network
- Funded wallet for deployment fees
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
In the examples below, `wallet` refers to a `Wallet` instance that manages keys and signs transactions. The `from` option in `send()` specifies which account pays for the transaction. This account must be registered in the wallet and have sufficient fee juice. On a local network, test accounts are pre-funded; on testnet, you typically use sponsored fees.
:::

### Step 2: Deploy the contract

How you deploy depends on how you pay for it. When paying using an account's fee juice (like a test account on the local network):

```typescript
// Deploy with constructor arguments
const contract = await MyContract.deploy(
  deployer_wallet,
  constructorArg1,
  constructorArg2
)
  .send({ from: testAccount.address }) // testAccount has fee juice and is registered in the deployer_wallet
  .deployed();
```

On testnet, you likely won't have funds in `testAccount` to pay for fee juice. Instead, pay fees using the [Sponsored Fee Payment Contract method](./how_to_pay_fees.md):

```typescript
const contract = await MyContract.deploy(
  wallet,
  constructorArg1,
  constructorArg2
)
  .send({ from: alice.address, fee: { paymentMethod: sponsoredPaymentMethod } }) // using the Sponsored FPC
  .deployed();
```

Here's a complete example from the test suite:

#include_code deploy_basic yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

## Use deployment options

### Deploy with custom salt

By default, the deployment's salt is random, but you can specify it (for example, if you want to get a deterministic address):

```typescript
import { Fr } from "@aztec/aztec.js/fields";

const salt = Fr.random();

const contract = await MyContract.deploy(wallet, arg1, arg2)
  .send({
    from: testAccount.address,
    contractAddressSalt: salt,
  })
  .deployed();
```

### Deploy universally

Deploy to the same address across networks by setting `universalDeploy: true`:

#include_code deploy_universal yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

:::info
Universal deployment excludes the sender from address computation, allowing the same address on any network with the same salt.
:::

### Skip initialization

Deploy without running the constructor:

```typescript
const contract = await MyContract.deploy(wallet)
  .send({
    from: testAccount.address,
    skipInitialization: true,
  })
  .deployed();

// Initialize later
await contract.methods
  .initialize(arg1, arg2)
  .send({ from: testAccount.address })
  .wait();
```

### Deploy with a specific initializer

Some contracts have multiple initializer functions (e.g., both a private `constructor` and a `public_constructor`). By default, the generated `deploy()` method uses the default initializer (typically named `constructor`). To deploy using a different initializer, use `deployWithOpts`:

#include_code deploy_with_opts yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

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

```typescript
import { Fr } from "@aztec/aztec.js/fields";

const salt = Fr.random();

// Calculate address without deploying
const deployMethod = MyContract.deploy(wallet, arg1, arg2);
const instance = await deployMethod.getInstance({ contractAddressSalt: salt });
const address = instance.address;

console.log(`Contract will deploy at: ${address}`);
```

:::warning
This is an advanced pattern. For most use cases, deploy the contract directly and get the address from the deployed instance.
:::

## Monitor deployment progress

### Track deployment transaction

```typescript
const deployTx = MyContract.deploy(wallet, arg1, arg2).send({
  from: testAccount.address,
});

// Get transaction hash immediately
const txHash = await deployTx.getTxHash();
console.log(`Deployment tx: ${txHash}`);

// Wait for the transaction to be mined
const receipt = await deployTx.wait();
console.log(`Deployed in block ${receipt.blockNumber}`);

// Get the deployed contract instance
const contract = await deployTx.deployed();
console.log(`Contract address: ${contract.address}`);
```

## Deploy multiple contracts

### Deploy a token contract

Here's an example deploying a `TokenContract` with constructor arguments for admin, name, symbol, and decimals:

#include_code deploy_token yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

### Deploy contracts with dependencies

When one contract depends on another, deploy them sequentially and pass the first contract's address:

```typescript
// Deploy first contract
const token = await TokenContract.deploy(
  wallet,
  admin.address,
  "MyToken",
  "MTK",
  18
)
  .send({ from: admin.address })
  .deployed();

// Deploy second contract with reference to first
const vault = await VaultContract.deploy(wallet, token.address)
  .send({ from: admin.address })
  .deployed();
```

### Deploy contracts in parallel

```typescript
// Start all deployments simultaneously
const deployments = [
  Contract1.deploy(wallet, arg1).send({ from: deployer.address }),
  Contract2.deploy(wallet, arg2).send({ from: deployer.address }),
  Contract3.deploy(wallet, arg3).send({ from: deployer.address }),
];

// Wait for all to complete
const receipts = await Promise.all(deployments.map((d) => d.wait()));

// Get deployed contract instances
const contracts = await Promise.all(deployments.map((d) => d.deployed()));
```

:::tip[Parallel deployment considerations]
Parallel deployment is faster, but transactions from the same account share a nonce sequence. The wallet handles nonce assignment automatically, but if one deployment fails, subsequent deployments may also fail due to nonce gaps. For reliable parallel deployments:

- Use separate accounts for each deployment, or
- Handle failures gracefully and retry with fresh nonces
- Consider using `BatchCall` to bundle multiple operations into a single transaction (see below)
  :::

### Deploy with BatchCall

Use `BatchCall` to bundle a deployment with other calls into a single transaction. This is useful when you need to deploy a contract and immediately call methods on it:

#include_code deploy_batch yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

## Verify deployment

### Check contract registration

Query the wallet to verify the contract was deployed and its class is published:

#include_code verify_deployment yarn-project/end-to-end/src/e2e_deploy_contract/deploy_method.test.ts typescript

The `getContractMetadata` method returns:

- `contractInstance` - The contract instance details (if found)
- `isContractInitialized` - Whether the constructor has been called
- `isContractPublished` - Whether the contract class is publicly registered

### Verify contract is callable

```typescript
try {
  // Try calling a view function
  const result = await contract.methods
    .get_version()
    .simulate({ from: testAccount.address });
  console.log("Contract is callable, version:", result);
} catch (error) {
  console.error("Contract not accessible:", error.message);
}
```

## Register deployed contracts

### Add existing contract to wallet

If a contract was deployed by another account:

```typescript
const contract = await MyContract.at(contractAddress, wallet);

// Register the contract with the wallet
// The registerContract method takes positional parameters:
// - instance: ContractInstanceWithAddress (required)
// - artifact: ContractArtifact (optional)
// - secretKey: Fr (optional)
await wallet.registerContract(contract.instance, MyContract.artifact);
```

:::warning
You need the exact deployment parameters (salt, initialization hash, etc.) to correctly register an externally deployed contract. If you don't have access to the contract instance, you can reconstruct it:

```typescript
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contracts";
import { PublicKeys } from "@aztec/stdlib/keys";

const instance = await getContractInstanceFromInstantiationParams(
  MyContract.artifact,
  {
    publicKeys: PublicKeys.default(),
    constructorArtifact: "constructor", // or the initializer function name
    constructorArgs: [arg1, arg2],
    deployer: deployerAddress,
    salt: deploymentSalt,
  }
);

await wallet.registerContract(instance, MyContract.artifact);
```

:::

## Next steps

- [Send transactions](./how_to_send_transaction.md) to interact with your contract
- [Read contract data](./how_to_read_data.md) including simulating functions and reading events
- [Use authentication witnesses](./how_to_use_authwit.md) for delegated calls
