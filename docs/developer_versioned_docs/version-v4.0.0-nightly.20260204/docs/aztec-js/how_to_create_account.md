---
title: Creating Accounts
tags: [accounts]
sidebar_position: 2
description: Step-by-step guide to creating and deploying new user accounts in Aztec.js applications.
---

This guide shows you how to create and deploy a new account on Aztec.

## Prerequisites

- [Connected to a network](./how_to_connect_to_local_network.md) with a `TestWallet` instance
- Understanding of [account concepts](../foundational-topics/accounts/index.md)

## Install dependencies

```bash
yarn add @aztec/aztec.js@4.0.0-nightly.20260204 @aztec/test-wallet@4.0.0-nightly.20260204
```

## Create a new account

Using the [`wallet` from the connection guide](./how_to_connect_to_local_network.md), call `createSchnorrAccount` to create a new account with a random secret and salt:

```typescript title="create_account" showLineNumbers 
import { Fr } from "@aztec/aztec.js/fields";

const secret = Fr.random();
const salt = Fr.random();
const newAccount = await wallet.createSchnorrAccount(secret, salt);
console.log("New account address:", newAccount.address.toString());
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260204/docs/examples/ts/aztecjs_connection/index.ts#L39-L46" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L39-L46</a></sub></sup>


The secret is used to derive the account's encryption keys, and the salt ensures address uniqueness. The signing key is automatically derived from the secret.

:::warning Store your secret and salt
Save the `secret` and `salt` values securely. You need both to recover access to your account. If you lose them, you will permanently lose access to the account and any assets it holds.
:::

## Deploy the account

New accounts must be deployed before they can send transactions. Deployment requires paying fees.

### Using the Sponsored FPC

If your account doesn't have Fee Juice, use the [Sponsored Fee Payment Contract](./how_to_pay_fees.md#sponsored-fee-payment-contracts):

```typescript title="deploy_account_sponsored_fpc" showLineNumbers 
// Additional imports needed for account deployment examples
import { AztecAddress } from "@aztec/aztec.js/addresses";
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
  from: AztecAddress.ZERO,
  fee: { paymentMethod: sponsoredPaymentMethod },
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260204/docs/examples/ts/aztecjs_connection/index.ts#L48-L74" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L48-L74</a></sub></sup>


:::info
See the [guide on fees](./how_to_pay_fees.md#sponsored-fee-payment-contracts) for setting up the Sponsored FPC.
:::

### Using Fee Juice

If your account already has Fee Juice (for example, [bridged from L1](./how_to_pay_fees.md#bridge-fee-juice-from-l1)):

```typescript title="deploy_account_fee_juice" showLineNumbers 
// newAccount is the account created in the previous section
const deployMethodFeeJuice = await newAccount.getDeployMethod();
await deployMethodFeeJuice.send({
  from: AztecAddress.ZERO,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260204/docs/examples/ts/aztecjs_connection/index.ts#L76-L82" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L76-L82</a></sub></sup>


The `from: AztecAddress.ZERO` is required because there's no existing account to send from—the transaction itself creates the account.

## Verify deployment

Confirm the account was deployed successfully:

```typescript title="verify_account_deployment" showLineNumbers 
const metadata = await wallet.getContractMetadata(newAccount.address);
console.log("Account deployed:", metadata.isContractInitialized);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260204/docs/examples/ts/aztecjs_connection/index.ts#L84-L87" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L84-L87</a></sub></sup>


## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../foundational-topics/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
