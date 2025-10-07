---
title: Creating Accounts
tags: [accounts]
sidebar_position: 2
description: Step-by-step guide to creating and deploying user accounts in Aztec.js applications.
---

This guide shows you how to create and deploy a new account contract in Aztec.

## Prerequisites

- A running Aztec sandbox or testnet
- Node.js and TypeScript environment
- `@aztec/aztec.js` package installed
- Understanding of [account concepts](../../concepts/accounts/index.md)

## Import required libraries

### Step 1: Install dependencies

```bash
yarn add @aztec/aztec.js@3.0.0-nightly.20251007 @aztec/accounts@3.0.0-nightly.20251007
```

## Create account keys

Any account on Aztec just needs a secret, a salt, and a signing key. Let's get them:

```typescript
import { Fr, GrumpkinScalar } from '@aztec/aztec.js';

const secretKey = Fr.random();
const salt = new Fr(0);
const signingPrivateKey = GrumpkinScalar.random();
```

These keys will be used to:

- `secretKey`: Derive encryption keys for private state
- `signingPrivateKey`: Sign transactions

## Create a wallet

We need a Wallet to hold our account contract. Let's use `TestWallet` since most of the 3rd party wallets will use the same interface:

```typescript
import { TestWallet } from '@aztec/test-wallet';

const wallet = new TestWallet(pxe);
```

## Deploy the account

### Get some fee juice

On the sandbox, all the test accounts are funded with fee juice and ready to use. [Just import them](./how_to_connect_to_sandbox.md) and you're good to go.

On testnet, accounts have no fee juice so you need to sort that out first. Either [using an account that has fee-juice](./how_to_pay_fees.md#pay-with-fee-juice), or (probably easiest) just [use the Sponsored Fee Payment Contract](./how_to_pay_fees.md#sponsored-fee-payment-contracts)

### Step 2: Deploy the new account

If your account was pre-funded with Fee Juice (ex. on the sandbox, or if you used a faucet), you can deploy the account using its own Fee Juice:

```typescript
// get the initial test accounts data
const [fundedAccount] = await getInitialTestAccountsData();
// add the funded account to the wallet
const fundedWallet = await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);

// add the new account to the wallet
const alice = await wallet.createSchnorrAccount(secretKey, salt, signingPrivateKey);
// deploy the new account from the funded account
await alice.deploy({ deployAccount: fundedAccount.address }).wait()
```

Or if using the Sponsored FPC:

```typescript
const alice = await wallet.createSchnorrAccount(secretKey, salt, signingPrivateKey);
await alice.deploy({ fee: { paymentMethod: sponsoredPaymentMethod }}).wait()
```

:::warning Testnet

On the testnet your account won't be funded with Fee Juice, so you have to use the Sponsored FPC. Check out the [guide on fees](./how_to_pay_fees.md) if you don't know how to set up `sponsoredPaymentMethod` yet

:::

## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from your account
- Learn about [account abstraction](../../concepts/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
