---
title: Deploying a Token Contract
sidebar_position: 0
description: A tutorial going through how to deploy a token contract to the sandbox using typescript.
---

import Image from "@theme/IdealImage";

In this guide, we will retrieving the Sandbox and deploy a pre-written token contract to it using Aztec.js. [Check out the source code](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). We will then use Aztec.js to interact with this contract and transfer tokens.

Before starting, make sure to be running Aztec sandbox at version 2.0.2. Check out [the guide](../../guides/local_env/sandbox.md) for info about that.

## Set up the project

Let's initialize a yarn project first. You can init it with the dependencies we need:

```sh
yarn add typescript @types/node tsx
```

:::tip

Never heard of `tsx`? Well, it will just run `typescript` with reasonable defaults. Pretty cool for a small example like this one. You may want to tune in your own project's `tsconfig.json` later!

:::

Let's also import the Aztec dependencies for this tutorial:

```sh
yarn add @aztec/aztec.js@2.0.2 @aztec/accounts@2.0.2 @aztec/noir-contracts.js@2.0.2
```

Aztec.js assumes your project is using ESM, so make sure you add `"type": "module"` to `package.json`. You probably also want at least a `start` script. For example:

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx index.ts"
  }
}
```

### Connecting to the sandbox

We want to [connect to our running sandbox](../../guides/js_apps/connect_to_sandbox.md) and import the test accounts into the local PXE. Let's call them Alice and Bob (of course). Create an `index.ts` with it:

```typescript
import { createPXEClient } from "@aztec/aztec.js";
import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
const pxe = await createPXEClient("http://localhost:8080");

const alice = (await getDeployedTestAccountsWallets(pxe))[0];
const bob = (await getDeployedTestAccountsWallets(pxe))[1];
```

## Deploy the token contract

Now that we have our accounts loaded, let's move on to deploy our pre-compiled token smart contract. You can find the full code for the contract [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/token_contract/src).

Let's import the interface directly, and make Alice the admin:

```typescript
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const token = await TokenContract.deploy(
  alice,
  alice.getAddress(),
  "TokenName",
  "TKN",
  18
)
  .send({ from: alice.getAddress() })
  .deployed();
```

## Mint and transfer

Let's go ahead and have Alice mint herself some tokens, in private:

```typescript
await token.methods
  .mint_to_private(alice.getAddress(), 100)
  .send({ from: alice.getAddress() })
  .wait();
```

Let's check both Alice's and Bob's balances now:

```typescript
let aliceBalance = await token.methods
  .balance_of_private(alice.getAddress())
  .simulate({ from: alice.getAddress() });
console.log(`Alice's balance: ${aliceBalance}`); // whoooaa 100 tokens
let bobBalance = await token.methods
  .balance_of_private(bob.getAddress())
  .simulate({ from: bob.getAddress() });
console.log(`Bob's balance: ${bobBalance}`); // you get nothin' 🥹
```

Great! Let's have Alice transfer some tokens to Bob, also in private:

```typescript
await token.methods
  .transfer(bob.getAddress(), 10)
  .send({ from: alice.getAddress() })
  .wait();
bobBalance = await token.methods
  .balance_of_private(bob.getAddress())
  .simulate({ from: bob.getAddress() });
console.log(`Bob's balance: ${bobBalance}`);
```

Nice, Bob should now see 10 tokens in his balance! Thanks Alice!

## Other cool things

Say that Alice is nice and wants to set Bob as a minter. Even though it's a public function, it can be called in a similar way:

```typescript
await token.methods
  .set_minter(bob.getAddress(), true)
  .send({ from: alice.getAddress() })
  .wait();
```

Bob is now the minter, so he can mint some tokens to himself, notice that for the time being, you need to bind `token` to Bob's wallet with `withWallet(bob)`:

```typescript
await token
  .withWallet(bob)
  .methods.mint_to_private(bob.getAddress(), 100)
  .send({ from: bob.getAddress() })
  .wait();
bobBalance = await token.methods
  .balance_of_private(bob.getAddress())
  .simulate({ from: bob.getAddress() });
console.log(`Bob's balance: ${bobBalance}`);
```

:::info

Have a look at the [contract source](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). Notice is that the `mint_to_private` function we used above actually starts a [partial note](../../concepts/advanced/storage/partial_notes.md). This allows the total balance to increase while keeping the recipient private! How cool is that?

:::
