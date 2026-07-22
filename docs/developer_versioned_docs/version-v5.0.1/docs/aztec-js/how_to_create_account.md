---
title: Creating Accounts
tags: [accounts]
sidebar_position: 2
description: Step-by-step guide to creating and deploying new user accounts in Aztec.js applications.
---

This guide shows you how to create and deploy a new account on Aztec.

## Prerequisites

- [Connected to a network](./how_to_connect_to_local_network.md) with a `EmbeddedWallet` instance
- Understanding of [account concepts](../foundational-topics/accounts/index.md)

## Install dependencies

```bash
yarn add @aztec/aztec.js@5.0.1 @aztec/wallets@5.0.1 @aztec/noir-contracts.js@5.0.1
```

## Create a new account

Using the [`wallet` from the connection guide](./how_to_connect_to_local_network.md), call `createSchnorrAccount` to create a new account with a random secret, salt, and signing key:

```typescript title="create_account" showLineNumbers 
import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";

const secret = Fr.random();
const salt = Fr.random();
const signingKey = GrumpkinScalar.random();
const newAccount = await wallet.createSchnorrAccount(secret, salt, signingKey);
console.log("New account address:", newAccount.address.toString());
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/ts/aztecjs_connection/index.ts#L47-L55" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L47-L55</a></sub></sup>


The secret derives the account's encryption keys, the signing key authenticates its transactions, and the salt ensures address uniqueness. The signing key is provided independently and is not derived from the secret: it is an ownership key, so keep it separate from the encryption secret that your PXE holds.

:::warning Store your secret, salt, and signing key
Save the `secret`, `salt`, and `signingKey` values securely. You need all three to recover access to your account. If you lose them, you will permanently lose access to the account and any assets it holds.
:::

## Create an initializerless account

Alternatively, create an [initializerless account](../foundational-topics/accounts/deployment.md), which needs no deployment transaction at all:

```typescript
const secret = Fr.random();
const salt = Fr.random();
const account = await wallet.createSchnorrInitializerlessAccount(secret, salt);
console.log("Account address:", account.address.toString());
```

An initializerless account commits its signing public key into the address itself (through the instance's `immutables_hash`), so there is no onchain state to initialize. Creating the account registers it locally in the PXE, and it is ready to use immediately: skip the deployment section below entirely. Fees are only needed for the account's first real transaction, paid with any of the usual [payment methods](./how_to_pay_fees.md).

Two things to keep in mind:

- The signing key cannot be changed later. A new key means a new address.
- Calling `getDeployMethod()` on an initializerless account throws, since there is nothing to deploy.

See [account deployment](../foundational-topics/accounts/deployment.md) for how this works and how to choose between the two account types.

## Deploy the account

Accounts created with `createSchnorrAccount` must be deployed before they can send transactions (initializerless accounts skip this step). Deployment requires paying fees.

### Using the Sponsored FPC

If your account doesn't have Fee Juice, use the [Sponsored FPC](./how_to_pay_fees.md#sponsored-fpc):

```typescript title="deploy_account_sponsored_fpc" showLineNumbers 
// Additional imports needed for account deployment examples
import { NO_FROM } from "@aztec/aztec.js/account";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";

// Set up the Sponsored FPC payment method (see fees guide for details)
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

// newAccount is the account created in the previous section
const deployMethod = await newAccount.getDeployMethod();
await deployMethod.send({
  from: NO_FROM,
  fee: { paymentMethod: sponsoredPaymentMethod },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/ts/aztecjs_connection/index.ts#L57-L83" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L57-L83</a></sub></sup>


:::info
See the [guide on fees](./how_to_pay_fees.md#sponsored-fpc) for more details on the Sponsored FPC and what this snippet means.
:::

### Using Fee Juice

If your account has Fee Juice from a [bridge from L1](./how_to_pay_fees.md#bridge-fee-juice-from-l1), you can claim it and deploy in one step using `FeeJuicePaymentMethodWithClaim`.

Create a new Schnorr account for this path:

```typescript title="create_fee_juice_account" showLineNumbers 
// `feeJuiceAccount` is just another Schnorr account, the same kind as
// `newAccount` above. It gets its own name here so both deploy paths
// can coexist in one example; in your own code, pick whichever name fits.
const feeJuiceSecret = Fr.random();
const feeJuiceSalt = Fr.random();
const feeJuiceSigningKey = GrumpkinScalar.random();
const feeJuiceAccount = await wallet.createSchnorrAccount(
  feeJuiceSecret,
  feeJuiceSalt,
  feeJuiceSigningKey,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/ts/aztecjs_connection/index.ts#L85-L97" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L85-L97</a></sub></sup>


Claim the bridged Fee Juice and deploy in one step:

```typescript title="bridge_fee_juice_claim" showLineNumbers 
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

// claim is from the bridgeTokensPublic step above
// Create a payment method that claims the bridged Fee Juice and uses it to pay
const bridgePaymentMethod = new FeeJuicePaymentMethodWithClaim(
  feeJuiceAccount.address,
  claim,
);

// Use it to pay for any transaction; here we deploy the account in one step
const deployMethodBridged = await feeJuiceAccount.getDeployMethod();
await deployMethodBridged.send({
  from: NO_FROM,
  fee: { paymentMethod: bridgePaymentMethod },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/ts/aztecjs_connection/index.ts#L166-L182" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L166-L182</a></sub></sup>


If the account already has Fee Juice on L2 (for example, from a faucet or a previously claimed bridge), no special payment method is needed — just call `send({ from: NO_FROM })` and Fee Juice is used automatically.

The `from: NO_FROM` signals that this transaction should be executed without account contract mediation. The wallet will directly execute it via a default entrypoint with no authorization.

## Verify deployment

Confirm the account was deployed successfully. Substitute the account variable for whichever path you used above (`newAccount` for the Sponsored FPC path, `feeJuiceAccount` for the Fee Juice path):

```typescript title="verify_account_deployment" showLineNumbers 
// `newAccount` refers to whichever account you just deployed,
// either the Sponsored FPC account or `feeJuiceAccount` from the Fee Juice path.
const metadata = await wallet.getContractMetadata(newAccount.address);
console.log("Account deployed:", metadata.initializationStatus);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/ts/aztecjs_connection/index.ts#L184-L189" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L184-L189</a></sub></sup>


## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../foundational-topics/accounts/index.md) and [account deployment](../foundational-topics/accounts/deployment.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
