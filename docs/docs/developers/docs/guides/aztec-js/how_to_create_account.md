---
title: Creating Accounts
tags: [accounts]
sidebar_position: 2
description: Step-by-step guide to creating and deploying user accounts in Aztec.js applications.
---

This guide walks you through creating and deploying a new account contract in Aztec.

## Prerequisites

- Running Aztec sandbox or testnet
- Node.js and TypeScript environment
- `@aztec/aztec.js` package installed
- Understanding of [account concepts](../../concepts/accounts/index.md)

## Install dependencies

```bash
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/accounts@#include_version_without_prefix
```

## Create account keys

Every account on Aztec requires a secret, a salt, and a signing key.

```typescript
import { Fr, GrumpkinScalar } from "@aztec/aztec.js";

const secretKey = Fr.random();
const salt = new Fr(0);
const signingPrivateKey = GrumpkinScalar.random();
```

These keys serve the following purposes:

- `secretKey`: Derives encryption keys for private state
- `signingPrivateKey`: Signs transactions

## Create a wallet

You need a Wallet to hold your account contract. Use `TestWallet` since most third-party wallets implement the same interface:

```typescript
import { TestWallet } from "@aztec/test-wallet/server";

const wallet = new TestWallet(pxe);
```

## Deploy the account

### Get Fee Juice

On the sandbox, all test accounts come pre-funded with Fee Juice. [Import them](./how_to_connect_to_sandbox.md) to start using them immediately.

On testnet, accounts start without Fee Juice. You can either [use an account that has Fee Juice](./how_to_pay_fees.md#pay-with-fee-juice) or [use the Sponsored Fee Payment Contract](./how_to_pay_fees.md#sponsored-fee-payment-contracts).

### Register and deploy accounts

Test accounts on the Sandbox are already deployed but need to be registered in the wallet and the PXE (Private eXecution Environment):

```typescript
// on the Sandbox, you can get the initial test accounts data using getInitialTestAccountsData
const [initialAccountData] = await getInitialTestAccountsData();
// add the funded account to the wallet
const initialAccount = await wallet.createSchnorrAccount(initialAccountData.secret, initialAccountData.salt);
```

Other accounts require deployment. To deploy an account that already has Fee Juice:

```ts
const anotherAccount = await wallet.createSchnorrAccount(accountWithFeeJuice.secret, accountWithFeeJuice.salt);
const deployMethod = await anotherAccount.getDeployMethod();

// using the default fee payment method (Fee Juice)
await deployMethod.send({
    from: AztecAddress.ZERO, // the zero address is used because there's no account to send from: the transaction itself will create the account!
}).wait()
```

To deploy using the Sponsored FPC:

```typescript
// deploy an account with random salt and secret
const anotherAccount = await wallet.createSchnorrAccount(Fr.random(), Fr.random());
const deployMethod = await anotherAccount.getDeployMethod();
await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod: sponsoredPaymentMethod }
}).wait()
```

:::info
See the [guide on fees](./how_to_pay_fees.md) for setting up `sponsoredPaymentMethod`.
:::

## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with a new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../../concepts/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
