---
title: Using Authentication Witnesses
tags: [accounts, authwit]
sidebar_position: 6
description: Step-by-step guide to implementing authentication witnesses in Aztec.js for delegated transactions.
---

This guide shows you how to create and use authentication witnesses (authwits) to authorize other accounts to perform actions on your behalf.

:::warning aztec-nr

Using AuthWitnesses is always a two-part process. This guide shows how to generate and use them, but you still need to set up your contract to accept and authenticate them.

Therefore it is recommended to read the `aztec-nr` [guide on authwitnesses](../aztec-nr/framework-description/how_to_use_authwit.md) before this one.

:::

## Prerequisites

- [Connected to a network](./how_to_connect_to_local_network.md) with a `TestWallet` instance and funded accounts
- Contract with authwit validation (see [smart contract authwits](../aztec-nr/framework-description/how_to_use_authwit.md))
- Understanding of [authwit concepts](../foundational-topics/advanced/authwit.md)

## Intent types

The authwit system supports different intent types depending on your use case:

- **`CallIntent`**: Use when authorizing a specific contract function call. Contains `{ caller, action }` where `action` is a `ContractFunctionInteraction`.
- **`IntentInnerHash`**: Use when authorizing arbitrary data. Contains `{ consumer, innerHash }` where `consumer` is the contract that will verify the authwit.

## Create private authwits

Private authwits authorize actions in the private domain. The authorization is included directly in the transaction that uses it.

Let's say Alice wants to allow Bob to transfer tokens from her account. Alice is the **authorizer** (she owns the tokens) and Bob is the **caller** (he will execute the transfer):

```typescript title="private_authwit" showLineNumbers 
// Alice wants to allow Bob to transfer tokens from her account (private)
const privateNonce = Fr.random();

// Define the action Bob will execute
const privateAction = tokenContract.methods.transfer_in_private(
  aliceAddress, // from
  bobAddress, // to
  100n, // amount
  privateNonce, // authwit nonce for replay protection
);

// Alice creates an authwit authorizing Bob to call this function
const privateWitness = await wallet.createAuthWit(aliceAddress, {
  caller: bobAddress,
  action: privateAction,
});

// Bob executes the transfer, providing the authwit
await privateAction.send({ from: bobAddress, authWitnesses: [privateWitness] });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/docs/examples/ts/aztecjs_authwit/index.ts#L34-L54" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_authwit/index.ts#L34-L54</a></sub></sup>


:::tip
The nonce prevents replay attacks. When `from` and `msg_sender` are the same (self-transfer), set the nonce to `0`.
:::

## Create public authwits

Public authwits require a transaction to store the authorization in the `AuthRegistry` contract before the authorized action can be executed:

```typescript title="public_authwit" showLineNumbers 
// Alice wants to allow Bob to transfer tokens from her account (public)
const publicNonce = Fr.random();

// Define the action Bob will execute
const publicAction = tokenContract.methods.transfer_in_public(
  aliceAddress, // from
  bobAddress, // to
  100n, // amount
  publicNonce, // authwit nonce
);

// Alice sets the public authwit (this requires a transaction)
const authwit = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: publicAction },
  true, // authorized
);
await authwit.send();

// Now Bob can execute the transfer
await publicAction.send({ from: bobAddress });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/docs/examples/ts/aztecjs_authwit/index.ts#L56-L78" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_authwit/index.ts#L56-L78</a></sub></sup>


## Create arbitrary message authwits

Use this when authorizing arbitrary data rather than a specific contract function call:

```typescript title="arbitrary_authwit" showLineNumbers 
import { computeInnerAuthWitHash } from "@aztec/aztec.js/authorization";

// Create hash of arbitrary data
const innerHash = await computeInnerAuthWitHash([
  Fr.fromHexString("0xcafe"),
  Fr.fromHexString("0xbeef"),
]);

// Create an intent with the consumer contract address
const intent = {
  consumer: tokenContract.address,
  innerHash,
};

// Create the authwit for arbitrary data
const arbitraryWitness = await wallet.createAuthWit(aliceAddress, intent);
console.log("Arbitrary authwit created:", arbitraryWitness);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/docs/examples/ts/aztecjs_authwit/index.ts#L80-L98" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_authwit/index.ts#L80-L98</a></sub></sup>


The `consumer` is the contract address that will verify this authwit.

## Revoke public authwits

Public authwits can be revoked by setting `authorized` to `false`:

```typescript title="revoke_authwit" showLineNumbers 
// Revoke a public authwit by setting authorized to false
const revokeNonce = Fr.random();
const revokeAction = tokenContract.methods.transfer_in_public(
  aliceAddress,
  bobAddress,
  50n,
  revokeNonce,
);

// First, set the authwit
const setAuthwit = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  true,
);
await setAuthwit.send();

// Later, revoke it
const revokeInteraction = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  false, // revoke authorization
);
await revokeInteraction.send();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260208/docs/examples/ts/aztecjs_authwit/index.ts#L100-L125" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_authwit/index.ts#L100-L125</a></sub></sup>


## Next steps

- Learn about [authwits in smart contracts](../aztec-nr/framework-description/how_to_use_authwit.md)
- Understand [authwit concepts](../foundational-topics/advanced/authwit.md)
- Explore [account abstraction](../foundational-topics/accounts/index.md)
