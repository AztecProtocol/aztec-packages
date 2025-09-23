---
title: Deploying Contracts
tags: [contracts, deployment]
sidebar_position: 3
description: Deploy smart contracts to Aztec using generated TypeScript classes.
---

This guide shows you how to deploy compiled contracts to Aztec using the generated TypeScript interfaces.

## Prerequisites

- Compiled contract artifacts (see [How to Compile](../smart_contracts/how_to_compile_contract.md))
- Running Aztec sandbox
- Funded wallet for deployment fees
- TypeScript project set up

## Generate TypeScript bindings

### Compile and generate code

```bash
# Compile the contract
aztec-nargo compile
aztec-postprocess-contract

# Generate TypeScript interface
aztec codegen ./target/my_contract-MyContract.json -o src/artifacts
```

:::info
The codegen command creates a TypeScript class with typed methods for deployment and interaction. This provides type safety and autocompletion in your IDE.
:::

## Deploy a contract

### Step 1: Import and connect

```typescript
import { MyContract } from './artifacts/MyContract';
```

### Step 2: Deploy the contract

Deploying the contract really depends on how you're paying for it. If paying using an account's fee juice (like a test account on the sandbox):

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

On the testnet, you'll likely not have funds in `testAccount` to pay for fee Juice. You want to instead pay fees using the [Sponsored Fee Payment Contract method](./how_to_pay_fees.md), for example:

```typescript
const contract = await MyContract.deploy(
    wallet,
    constructorArg1,
    constructorArg2)
    .send({ from: alice.address, fee: { paymentMethod: sponsoredPaymentMethod } }) // using the Sponsored FPC
    .deployed();
```

## Use deployment options

### Deploy with custom salt

By default, the deployment's salt is random, but you can specify it (for example, if you want to get a deterministic address):

```typescript
import { Fr } from '@aztec/aztec.js';

const salt = Fr.random();

const contract = await MyContract.deploy(wallet, arg1, arg2)
    .send({
        from: testAccount.address,
        contractAddressSalt: salt
    })
    .deployed();
```


### Deploy universally

Deploy to the same address across networks:

```typescript
const contract = await MyContract.deploy(wallet, arg1, arg2)
    .send({
        from: testAccount.address,
        universalDeploy: true,
        contractAddressSalt: salt
    })
    .deployed();
```

:::info
Universal deployment excludes the sender from address computation, allowing the same address on any network with the same salt.
:::

### Skip initialization

Deploy without running the constructor:

```typescript
const contract = await MyContract.deploy(wallet)
    .send({
        from: testAccount.address,
        skipInitialization: true
    })
    .deployed();

// Initialize later
await contract.methods.initialize(arg1, arg2)
    .send({ from: testAccount.address })
    .wait();
```

## Calculate deployment address

### Get address before deployment

```typescript
import { Fr } from '@aztec/aztec.js';

const salt = Fr.random();
const deployer = testAccount.address;

// Calculate address without deploying
const deployer = MyContract.deploy(wallet, arg1, arg2);
const instance = await deployer.getInstance();
const address = instance.address;

console.log(`Contract will deploy at: ${address}`);
```

:::warning
This is an advanced pattern. For most use cases, deploy the contract directly and get the address from the deployed instance.
:::

## Monitor deployment progress

### Track deployment transaction

```typescript
const deployTx = MyContract.deploy(wallet, arg1, arg2)
    .send({ from: testAccount.address });

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

### Deploy contracts with dependencies

```typescript
// Deploy first contract
const token = await TokenContract.deploy(
    wallet,
    wallet.address,
    'MyToken',
    'MTK',
    18n
)
    .send({ from: testAccount.address })
    .deployed();

// Deploy second contract with reference to first
const vault = await VaultContract.deploy(
    wallet,
    token.address  // Pass first contract's address
)
    .send({ from: wallet.address })
    .deployed();
```

### Deploy contracts in parallel

```typescript
// Start all deployments simultaneously
const deployments = [
    Contract1.deploy(wallet, arg1).send({ from: testAccount.address }),
    Contract2.deploy(wallet, arg2).send({ from: testAccount.address }),
    Contract3.deploy(wallet, arg3).send({ from: testAccount.address }),
];

// Wait for all to complete
const receipts = await Promise.all(
    deployments.map(d => d.wait())
);

// Get deployed contract instances
const contracts = await Promise.all(
    deployments.map(d => d.deployed())
);
```

:::tip
Parallel deployment is faster but be aware of nonce management if deploying many contracts from the same account.
:::

## Verify deployment

### Check contract registration

At the moment the easiest way to get contract data is by querying the PXE directly:

```typescript
// Verify contract is registered in PXE
const contracts = await pxe.getContracts();
const isRegistered = contracts.some(
    c => c.equals(myContractInstance.address)
);

if (isRegistered) {
    console.log('Contract registered in PXE');
}

// Get contract metadata
const metadata = await pxe.getContractMetadata(myContractInstance.address);
if (metadata) {
    console.log('Contract metadata found');
}
```

### Verify contract is callable

```typescript
try {
    // Try calling a view function
    const result = await contract.methods.get_version()
        .simulate({ from: testAccount.address });
    console.log('Contract is callable, version:', result);
} catch (error) {
    console.error('Contract not accessible:', error.message);
}
```

## Register deployed contracts

### Add existing contract to PXE

If a contract was deployed by another account:

```typescript
import { loadContractArtifact } from '@aztec/aztec.js';

const artifact = loadContractArtifact(MyContract.artifact);
const contract = await MyContract.at(contractAddress, wallet);

// To register an existing contract instance, you need to know
// its exact deployment parameters. The registerContract method
// requires both the artifact and instance details.
// This is typically handled automatically when deploying.
await wallet.registerContract({
    instance: contract.instance,
    artifact: artifact
});

```

:::warning
You need the exact deployment parameters (salt, initialization hash, etc.) to correctly register an externally deployed contract.

For example:

```typescript
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js';
const contract = await getContractInstanceFromInstantiationParams(contractArtifact, {
    publicKeys: PublicKeys.default(),
    constructorArtifact: initializer,
    constructorArgs: parameters,
    deployer: from,
    salt,
});
```

:::

## Next steps

- [Send transactions](./how_to_send_transaction.md) to interact with your contract
- [Simulate functions](./how_to_simulate_function.md) to read contract state
- [Use authentication witnesses](./how_to_use_authwit.md) for delegated calls
