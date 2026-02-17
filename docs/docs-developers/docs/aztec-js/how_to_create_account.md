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
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/wallets@#include_version_without_prefix
```

## Create a new account

Using the [`wallet` from the connection guide](./how_to_connect_to_local_network.md), call `createSchnorrAccount` to create a new account with a random secret and salt:

#include_code create_account /docs/examples/ts/aztecjs_connection/index.ts typescript

The secret is used to derive the account's encryption keys, and the salt ensures address uniqueness. The signing key is automatically derived from the secret.

:::warning Store your secret and salt
Save the `secret` and `salt` values securely. You need both to recover access to your account. If you lose them, you will permanently lose access to the account and any assets it holds.
:::

## Deploy the account

New accounts must be deployed before they can send transactions. Deployment requires paying fees.

### Using the Sponsored FPC

If your account doesn't have Fee Juice, use the [Sponsored Fee Payment Contract](./how_to_pay_fees.md#sponsored-fee-payment-contracts):

#include_code deploy_account_sponsored_fpc /docs/examples/ts/aztecjs_connection/index.ts typescript

:::info
See the [guide on fees](./how_to_pay_fees.md#sponsored-fee-payment-contracts) for setting up the Sponsored FPC.
:::

### Using Fee Juice

If your account already has Fee Juice (for example, [bridged from L1](./how_to_pay_fees.md#bridge-fee-juice-from-l1)):

#include_code deploy_account_fee_juice /docs/examples/ts/aztecjs_connection/index.ts typescript

The `from: AztecAddress.ZERO` is required because there's no existing account to send from—the transaction itself creates the account.

## Verify deployment

Confirm the account was deployed successfully:

#include_code verify_account_deployment /docs/examples/ts/aztecjs_connection/index.ts typescript

## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../foundational-topics/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
