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

```typescript title="deploy_basic_local" showLineNumbers 
// wallet and aliceAddress are from the connection guide
// Deploy with constructor arguments
const { contract: token } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress }); // alice has fee juice and is registered in the wallet
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L38-L48" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L38-L48</a></sub></sup>


On testnet, your account likely won't have Fee Juice. Instead, pay fees using the [Sponsored Fee Payment Contract method](./how_to_pay_fees.md):

```typescript title="deploy_sponsored_fpc_contract" showLineNumbers 
// Set up the Sponsored FPC (see fees guide for full setup)
const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
  SponsoredFPCContract.artifact,
  { salt: new Fr(0) },
);
await wallet.registerContract(
  sponsoredFPCInstance,
  SponsoredFPCContract.artifact,
);
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
  sponsoredFPCInstance.address,
);

// wallet is from the connection guide; sponsoredPaymentMethod is from the fees guide
const { contract: sponsoredContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SponsoredToken",
  "SPT",
  18,
).send({ from: aliceAddress, fee: { paymentMethod: sponsoredPaymentMethod } });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L50-L72" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L50-L72</a></sub></sup>


Here's a complete example from the test suite:

```typescript title="deploy_basic" showLineNumbers 
const { contract } = await StatefulTestContract.deploy(wallet, owner, 42).send({ from: defaultAccountAddress });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L47-L49" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L47-L49</a></sub></sup>


## Use deployment options

### Deploy with custom salt

By default, the deployment's salt is random, but you can specify it (for example, if you want to get a deterministic address):

```typescript title="deploy_custom_salt" showLineNumbers 
// wallet and aliceAddress are from the connection guide
const customSalt = Fr.random();

const { contract: saltedContract } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "SaltedToken",
  "SALT",
  18,
  { salt: customSalt },
).send({
  from: aliceAddress,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L74-L88" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L74-L88</a></sub></sup>


### Deploy universally

Deploy to the same address across networks by setting `universalDeploy: true`:

```typescript title="deploy_universal" showLineNumbers 
const opts = { universalDeploy: true, from: defaultAccountAddress };
const { contract } = await StatefulTestContract.deploy(wallet, owner, 42).send(opts);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L66-L69" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L66-L69</a></sub></sup>


:::info
Universal deployment excludes the sender from address computation, allowing the same address on any network with the same salt.
:::

### Skip initialization

Deploy without running the constructor:

```typescript title="skip_initialization" showLineNumbers 
// Deploy without running the constructor using skipInitialization
const { contract: delayedToken } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "DelayedToken",
  "DLY",
  18,
).send({
  from: aliceAddress,
  skipInitialization: true,
});

console.log(`Contract deployed at: ${delayedToken.address}`);

// Initialize later by calling the constructor manually
await delayedToken.methods
  .constructor(aliceAddress, "DelayedToken", "DLY", 18)
  .send({ from: aliceAddress });

console.log("Contract initialized");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L274-L295" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L274-L295</a></sub></sup>


### Deploy with a specific initializer

Some contracts have multiple initializer functions (e.g., both a private `constructor` and a `public_constructor`). By default, the generated `deploy()` method uses the default initializer (typically named `constructor`). To deploy using a different initializer, use `deployWithOpts`:

```typescript title="deploy_with_opts" showLineNumbers 
const { contract } = await StatefulTestContract.deployWithOpts(
  { wallet, method: 'public_constructor' },
  owner,
  42,
).send({
  from: defaultAccountAddress,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L90-L98" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L90-L98</a></sub></sup>


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

```typescript title="calculate_address_before_deploy" showLineNumbers 
// Calculate address without deploying
// wallet is from the connection guide (see prerequisites)
const deploymentSalt = Fr.random();
const deployMethod = TokenContract.deploy(
  wallet,
  aliceAddress,
  "PredictedToken",
  "PRED",
  18,
  { salt: deploymentSalt, deployer: aliceAddress },
);
const instance = await deployMethod.getInstance();
const predictedAddress = instance.address;

console.log(`Contract will deploy at: ${predictedAddress}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L90-L106" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L90-L106</a></sub></sup>


:::warning
This is an advanced pattern. For most use cases, deploy the contract directly and get the address from the deployed instance.
:::

## Monitor deployment progress

### Track deployment transaction

Use `NO_WAIT` to get the transaction hash immediately and track deployment:

```typescript title="no_wait_deploy" showLineNumbers 
// Use NO_WAIT to get the transaction hash immediately and track deployment
const { txHash } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "AnotherToken",
  "ATK",
  18,
).send({
  from: aliceAddress,
  wait: NO_WAIT,
});

console.log(`Deployment tx: ${txHash}`);

// Wait for the transaction to be mined using the node
const receipt = await waitForTx(node, txHash);
console.log(`Deployed in block ${receipt.blockNumber}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L147-L165" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L147-L165</a></sub></sup>


For most use cases, simply await the deployment to get the contract directly:

```typescript title="deploy_contract" showLineNumbers 
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const { contract: token } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress });

console.log(`Token deployed at: ${token.address.toString()}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_connection/index.ts#L128-L140" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L128-L140</a></sub></sup>


## Deploy multiple contracts

### Deploy a token contract

Here's an example deploying a `TokenContract` with constructor arguments for admin, name, symbol, and decimals:

```typescript title="deploy_token" showLineNumbers 
const { contract: token } = await TokenContract.deploy(wallet, owner, 'TOKEN', 'TKN', 18).send({
  from: defaultAccountAddress,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L79-L83" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L79-L83</a></sub></sup>


### Deploy contracts with dependencies

When one contract depends on another, deploy them sequentially and pass the first contract's address:

```typescript title="deploy_with_dependencies" showLineNumbers 
// Deploy contracts with dependencies - deploy sequentially and pass addresses
const { contract: baseToken } = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "BaseToken",
  "BASE",
  18,
).send({ from: aliceAddress });

// A second contract could reference the first (example pattern)
const { contract: derivedToken } = await TokenContract.deploy(
  wallet,
  baseToken.address, // Use first contract's address as admin
  "DerivedToken",
  "DERIV",
  18,
).send({ from: aliceAddress });

console.log(`Base token at: ${baseToken.address.toString()}`);
console.log(`Derived token at: ${derivedToken.address.toString()}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L226-L247" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L226-L247</a></sub></sup>


### Deploy contracts in parallel

```typescript title="parallel_deploy" showLineNumbers 
// Deploy contracts in parallel using Promise.all
const contracts = await Promise.all([
  TokenContract.deploy(wallet, aliceAddress, "Token1", "T1", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
  TokenContract.deploy(wallet, aliceAddress, "Token2", "T2", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
  TokenContract.deploy(wallet, aliceAddress, "Token3", "T3", 18)
    .send({
      from: aliceAddress,
    })
    .then(({ contract }) => contract),
]);

console.log(`Contract 1 at: ${contracts[0].address}`);
console.log(`Contract 2 at: ${contracts[1].address}`);
console.log(`Contract 3 at: ${contracts[2].address}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L249-L272" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L249-L272</a></sub></sup>


:::tip[Parallel deployment considerations]
Parallel deployment is faster, but transactions from the same account share a nonce sequence. The wallet handles nonce assignment automatically, but if one deployment fails, subsequent deployments may also fail due to nonce gaps. For reliable parallel deployments:

- Use separate accounts for each deployment, or
- Handle failures gracefully and retry with fresh nonces
- Consider using `BatchCall` to bundle multiple operations into a single transaction (see below)
  :::

### Deploy with BatchCall

Use `BatchCall` to bundle a deployment with other calls into a single transaction. This is useful when you need to deploy a contract and immediately call methods on it:

```typescript title="deploy_batch" showLineNumbers 
// Create a contract instance and make the PXE aware of it
const deployMethod = StatefulTestContract.deploy(wallet, owner, 42, { deployer: defaultAccountAddress });
const contract = await deployMethod.register();

// Batch deployment and a public call into the same transaction
const publicCall = contract.methods.increment_public_value(owner, 84);
await new BatchCall(wallet, [deployMethod, publicCall]).send({ from: defaultAccountAddress });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L170-L178" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L170-L178</a></sub></sup>


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

```typescript title="verify_deployment" showLineNumbers 
const metadata = await wallet.getContractMetadata(contract.address);
const classMetadata = await wallet.getContractClassMetadata(metadata.instance!.originalContractClassId);
const isPublished = classMetadata.isContractClassPubliclyRegistered;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L56-L60" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/contracts/deploy/deploy_method.parallel.test.ts#L56-L60</a></sub></sup>


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

```typescript title="verify_contract_callable" showLineNumbers 
// token is from the deployment step above; aliceAddress is from the connection guide
try {
  // Try calling a view function
  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  console.log("Contract is callable, balance:", balance);
} catch (error) {
  console.error("Contract not accessible:", (error as Error).message);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L108-L119" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L108-L119</a></sub></sup>


## Register deployed contracts

### Add existing contract to wallet

If a contract was deployed by another account:

```typescript title="register_external_contract" showLineNumbers 
// wallet is from the connection guide; contractAddress is the address of the deployed contract
const contractAddress = token.address;

// Get the contract metadata from the node (includes the instance)
const metadata = await wallet.getContractMetadata(contractAddress);

// Register the contract with the wallet
// The registerContract method takes positional parameters:
// - instance: ContractInstanceWithAddress (required)
// - artifact: ContractArtifact (optional)
// - secretKey: Fr (optional)
await wallet.registerContract(metadata.instance!, TokenContract.artifact);

// Now you can interact with the contract
const externalContract = await TokenContract.at(contractAddress, wallet);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L121-L137" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L121-L137</a></sub></sup>


:::warning
You need the exact deployment parameters (salt, initialization hash, etc.) to correctly register an externally deployed contract. If you don't have access to the contract instance, you can reconstruct it:

```typescript title="reconstruct_contract_instance" showLineNumbers 
// Reconstruct a contract instance from deployment parameters
// Use this when you need to register a contract deployed by someone else
const reconstructedInstance = await getContractInstanceFromInstantiationParams(
  TokenContract.artifact,
  {
    publicKeys: PublicKeys.default(),
    constructorArtifact: "constructor",
    constructorArgs: [aliceAddress, "ReconstructedToken", "RTK", 18],
    deployer: aliceAddress,
    salt: new Fr(12345), // The original deployment salt
  },
);

// Register the reconstructed contract with the wallet
await wallet.registerContract(reconstructedInstance, TokenContract.artifact);
console.log(
  `Reconstructed contract address: ${reconstructedInstance.address.toString()}`,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_advanced/index.ts#L191-L210" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L191-L210</a></sub></sup>


:::

## Next steps

- [Contract Readiness States](../aztec-nr/contract_readiness_states.md) - Understand the different states a contract progresses through
- [Send transactions](./how_to_send_transaction.md) to interact with your contract
- [Read contract data](./how_to_read_data.md) including simulating functions and reading events
- [Use authentication witnesses](./how_to_use_authwit.md) for delegated calls
