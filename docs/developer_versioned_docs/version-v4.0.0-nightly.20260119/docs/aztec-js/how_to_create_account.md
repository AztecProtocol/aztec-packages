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
yarn add @aztec/aztec.js@4.0.0-nightly.20260119 @aztec/test-wallet@4.0.0-nightly.20260119
```

## Create a new account

Use the wallet's `createSchnorrAccount` method to create a new account with a random secret and salt:

```typescript
import { Fr } from "@aztec/aztec.js/fields";

const secret = Fr.random();
const salt = Fr.random();
const newAccount = await wallet.createSchnorrAccount(secret, salt);
console.log("New account address:", newAccount.address.toString());
```

The secret is used to derive the account's encryption keys, and the salt ensures address uniqueness. The signing key is automatically derived from the secret.

:::warning Store your secret and salt
Save the `secret` and `salt` values securely. You need both to recover access to your account. If you lose them, you will permanently lose access to the account and any assets it holds.
:::

## Deploy the account

New accounts must be deployed before they can send transactions. Deployment requires paying fees.

### Using the Sponsored FPC

If your account doesn't have Fee Juice, use the [Sponsored Fee Payment Contract](./how_to_pay_fees.md#sponsored-fee-payment-contracts):

```typescript
import { AztecAddress } from "@aztec/aztec.js/addresses";

const deployMethod = await newAccount.getDeployMethod();
await deployMethod
  .send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod: sponsoredPaymentMethod },
  })
  .wait();
```

:::info
See the [guide on fees](./how_to_pay_fees.md#sponsored-fee-payment-contracts) for setting up `sponsoredPaymentMethod`.
:::

### Using Fee Juice

If your account already has Fee Juice (for example, [bridged from L1](./how_to_pay_fees.md#bridge-fee-juice-from-l1)):

```typescript
import { AztecAddress } from "@aztec/aztec.js/addresses";

const deployMethod = await newAccount.getDeployMethod();
await deployMethod
  .send({
    from: AztecAddress.ZERO,
  })
  .wait();
```

The `from: AztecAddress.ZERO` is required because there's no existing account to send from—the transaction itself creates the account.

## Verify deployment

Confirm the account was deployed successfully:

```typescript
const metadata = await wallet.getContractMetadata(newAccount.address);
console.log("Account deployed:", metadata.isContractInitialized);
```

## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../foundational-topics/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
