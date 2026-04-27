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
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/wallets@#include_version_without_prefix @aztec/noir-contracts.js@#include_version_without_prefix
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

If your account doesn't have Fee Juice, use the [Sponsored FPC](./how_to_pay_fees.md#sponsored-fpc):

#include_code deploy_account_sponsored_fpc /docs/examples/ts/aztecjs_connection/index.ts typescript

:::info
See the [guide on fees](./how_to_pay_fees.md#sponsored-fpc) for more details on the Sponsored FPC and what this snippet means.
:::

### Using Fee Juice

If your account has Fee Juice from a [bridge from L1](./how_to_pay_fees.md#bridge-fee-juice-from-l1), you can claim it and deploy in one step using `FeeJuicePaymentMethodWithClaim`.

Create a new Schnorr account for this path:

#include_code create_fee_juice_account /docs/examples/ts/aztecjs_connection/index.ts typescript

Claim the bridged Fee Juice and deploy in one step:

#include_code bridge_fee_juice_claim /docs/examples/ts/aztecjs_connection/index.ts typescript

If the account already has Fee Juice on L2 (for example, from a faucet or a previously claimed bridge), no special payment method is needed — just call `send({ from: NO_FROM })` and Fee Juice is used automatically.

The `from: NO_FROM` signals that this transaction should be executed without account contract mediation. The wallet will directly execute it via a default entrypoint with no authorization.

## Verify deployment

Confirm the account was deployed successfully. Substitute the account variable for whichever path you used above (`newAccount` for the Sponsored FPC path, `feeJuiceAccount` for the Fee Juice path):

#include_code verify_account_deployment /docs/examples/ts/aztecjs_connection/index.ts typescript

## Next steps

- [Deploy contracts](./how_to_deploy_contract.md) with your new account
- [Send transactions](./how_to_send_transaction.md) from an account
- Learn about [account abstraction](../foundational-topics/accounts/index.md)
- Implement [authentication witnesses](./how_to_use_authwit.md)
