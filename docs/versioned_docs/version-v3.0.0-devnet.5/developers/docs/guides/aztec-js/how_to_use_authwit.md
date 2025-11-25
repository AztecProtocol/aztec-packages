---
title: Using Authentication Witnesses
tags: [accounts, authwit]
sidebar_position: 6
description: Step-by-step guide to implementing authentication witnesses in Aztec.js for delegated transactions.
---

This guide shows you how to create and use authentication witnesses (authwits) to authorize other accounts to perform actions on your behalf.

:::warning aztec-nr

Using AuthWitnesses is always a two-part process. This guide shows how to generate and use them, but you still need to set up your contract to accept and authenticate them.

Therefore it is recommended to read the `aztec-nr` [guide on authwitnesses](../smart_contracts/how_to_use_authwit.md) before this one.

:::

## Prerequisites

- Deployed account wallets
- Contract with authwit validation (see [smart contract authwits](../smart_contracts/how_to_use_authwit.md))
- Understanding of [authwit concepts](../../concepts/advanced/authwit.md)

## AuthWits

Let's also assume we have a contract with functions `some_public_function` and `some_private_function` with the macro `#[authorize_once("from", "authwit_nonce")]`, meaning it will check if:

- `from` is `msg_sender`, or
- there's an authwitness allowing `from` to call this function

Regardless of its type, you'll want to define what is being delegated (let's call it "action") and the intent ("who intends to act"). For example:

```typescript
const nonce = Fr.random()

// bob creates an authwit that authorizes alice to call the function on his behalf
const action = contract.methods.some_private_function(bob, 10n, nonce)
const intent = {
    caller: alice.address, // alice "intends" to call the function on bob's behalf
    action
};
```

:::tip

The nonce is necessary to avoid replay attacks. However, the contract is smart enough to allow bob to call the function himself by setting the nonce to `0`.

:::

## Create private authwits

Private AuthWits mean that some action is authorized in private. No specific transaction is made, the authorization is just sent as part of the actual transaction:

```typescript
const authWit = await wallet.createAuthWit(bob.address, intent);
```

Now alice can call the function by providing the authwit:

```typescript
await action.send({ from: alice.address, authWitnesses: [authWit] }).wait();
```

## Create public authwits

Public authwits mean the authorization is public, so it requires a transaction. You create the authwit just as above, but the wallet needs to authorize it in the canonical `AuthRegistry` contract:

```typescript
// "true" is specific here... because you may want to revoke it later!
const authwit = await wallet.setPublicAuthWit(bob.address, intent, true);
await authwit.send({ from: bob.address }).wait()
```

Now that everyone knows about the public authorization, alice can call the function normally:

```typescript
await action.send({ from: alice.address }).wait()
```

## Create arbitrary message authwits

This is useful when you need to authorize arbitrary data rather than a specific contract function call. For example, authorizing a signature over a message for offchain verification.

### Step 1: Create inner hash

You can use `computeInnerAuthWitHash` to get yourself a hash of arbitrary hash you can use in an authwit:

```typescript
import { computeInnerAuthWitHash, computeAuthWitMessageHash } from "@aztec/aztec.js";

// Create hash of arbitrary data
const innerHash = computeInnerAuthWitHash([
    field1,
    field2,
    field3
]);

// Create full authwit message hash
const messageHash = computeAuthWitMessageHash(
    executorAddress,
    chainId,
    version,
    innerHash
);
```

## Revoke public authwits

Because public authwits are... well, public, that means you should be able to revoke them. Just set the last parameter to `false` and send the transaction:

```typescript
// Set authorized to false to revoke
const revoked = await authorizerWallet.setPublicAuthWit({
    caller: executorAddress,
    action: action
}, false).send({ from: account.address });
```

## Next steps

- Learn about [authwits in smart contracts](../smart_contracts/how_to_use_authwit.md)
- Understand [authwit concepts](../../concepts/advanced/authwit.md)
- Explore [account abstraction](../../concepts/accounts/index.md)
- Implement [cross-chain messaging](../smart_contracts/how_to_communicate_cross_chain.md)
