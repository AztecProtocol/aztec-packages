---
title: Using Authentication Witnesses
tags: [accounts, authwit]
sidebar_position: 6
description: Step-by-step guide to implementing authentication witnesses in Aztec.js for delegated transactions.
---

This guide shows you how to create and use authentication witnesses (authwits) to authorize other accounts to perform actions on your behalf.

:::warning aztec-nr

Using AuthWitnesses is always a two-part process. This guide shows how to generate and use them, but you still need to set up your contract to accept and authenticate them.

Therefore it is recommended to read the `aztec-nr` [guide on authwitnesses](../aztec-nr/framework-description/authentication_witnesses.md) before this one.

:::

## Prerequisites

- Deployed account wallets
- Contract with authwit validation (see [smart contract authwits](../aztec-nr/framework-description/authentication_witnesses.md))
- Understanding of [authwit concepts](../foundational-topics/advanced/authwit.md)

## Intent types

The authwit system supports different intent types depending on your use case:

- **`CallIntent`**: Use when authorizing a specific contract function call. Contains `{ caller, action }` where `action` is a `ContractFunctionInteraction`.
- **`IntentInnerHash`**: Use when authorizing arbitrary data. Contains `{ consumer, innerHash }` where `consumer` is the contract that will verify the authwit.

## Create private authwits

Private authwits authorize actions in the private domain. The authorization is included directly in the transaction that uses it.

Let's say Alice wants to allow Bob to transfer tokens from her account. Alice is the **authorizer** (she owns the tokens) and Bob is the **caller** (he will execute the transfer):

```typescript
import { Fr } from "@aztec/aztec.js/fields";

const nonce = Fr.random();

// Define the action Bob will execute
const action = tokenContract.methods.transfer_in_private(
  alice.address, // from
  bob.address, // to
  100n, // amount
  nonce // authwit nonce for replay protection
);

// Alice creates an authwit authorizing Bob to call this function
const witness = await wallet.createAuthWit(alice.address, {
  caller: bob.address,
  action,
});

// Bob executes the transfer, providing the authwit
await action.send({ from: bob.address, authWitnesses: [witness] }).wait();
```

:::tip
The nonce prevents replay attacks. When `from` and `msg_sender` are the same (self-transfer), set the nonce to `0`.
:::

## Create public authwits

Public authwits require a transaction to store the authorization in the `AuthRegistry` contract before the authorized action can be executed:

```typescript
const nonce = Fr.random();

// Define the action Bob will execute
const action = tokenContract.methods.transfer_in_public(
  alice.address, // from
  bob.address, // to
  100n, // amount
  nonce // authwit nonce
);

// Alice sets the public authwit (this requires a transaction)
const authwit = await wallet.setPublicAuthWit(
  alice.address,
  { caller: bob.address, action },
  true // authorized
);
await authwit.send().wait();

// Now Bob can execute the transfer
await action.send({ from: bob.address }).wait();
```

## Create arbitrary message authwits

Use this when authorizing arbitrary data rather than a specific contract function call:

```typescript
import { computeInnerAuthWitHash } from "@aztec/aztec.js/authorization";

// Create hash of arbitrary data
const innerHash = await computeInnerAuthWitHash([
  Fr.fromHexString("0xcafe"),
  Fr.fromHexString("0xbeef"),
]);

// Create an intent with the consumer contract address
const intent = {
  consumer: targetContract.address,
  innerHash,
};

// Create the authwit
const witness = await wallet.createAuthWit(alice.address, intent);
```

The `consumer` is the contract address that will verify this authwit.

## Revoke public authwits

Public authwits can be revoked by setting `authorized` to `false`:

```typescript
const revokeInteraction = await wallet.setPublicAuthWit(
  alice.address,
  { caller: bob.address, action },
  false // revoke authorization
);
await revokeInteraction.send().wait();
```

## Next steps

- Learn about [authwits in smart contracts](../aztec-nr/framework-description/authentication_witnesses.md)
- Understand [authwit concepts](../foundational-topics/advanced/authwit.md)
- Explore [account abstraction](../foundational-topics/accounts/index.md)
