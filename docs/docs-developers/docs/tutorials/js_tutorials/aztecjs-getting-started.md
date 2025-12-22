---
title: Deploying a Token Contract
sidebar_position: 0
description: A tutorial going through how to deploy a token contract to the local network using typescript.
---

import Image from "@theme/IdealImage";

In this guide, we will retrieving the local network and deploy a pre-written token contract to it using Aztec.js. [Check out the source code](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). We will then use Aztec.js to interact with this contract and transfer tokens.

Before starting, make sure to be running Aztec local network at version #include_version_without_prefix. Check out [the guide](../../tutorials/local_network.md) for info about that.

## Set up the project

First, create a new directory for your project and initialize it with yarn:

```sh
mkdir token-tutorial
cd token-tutorial
yarn init -y
```

Next, add the TypeScript dependencies:

```sh
yarn add typescript @types/node tsx
```

:::tip

Never heard of `tsx`? Well, it will just run `typescript` with reasonable defaults. Pretty cool for a small example like this one. You may want to tune in your own project's `tsconfig.json` later!

:::

Let's also import the Aztec dependencies for this tutorial:

```sh
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/accounts@#include_version_without_prefix @aztec/noir-contracts.js@#include_version_without_prefix @aztec/test-wallet@#include_version_without_prefix
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

### Connecting to the local network

Now let's connect to the Aztec local network and set up test accounts.

**Step 1: Start the Aztec Local Network**

In a separate terminal, run:

```sh
aztec start --local-network
```

Keep this terminal running throughout the tutorial.

**Step 2: Create the index.ts file**

Create an `index.ts` file in the root of your project with the following code. This connects to the local network and imports test accounts (Alice and Bob):

#include_code setup /docs/examples/ts/aztecjs_getting_started/index.ts typescript

**Step 3: Verify the script runs**

Run the script to make sure everything is set up correctly:

```sh
yarn start
```

If there are no errors, you're ready to continue. For more details on connecting to the local network, see [this guide](../../aztec-js/how_to_connect_to_local_network.md).

## Deploy the token contract

Now that we have our accounts loaded, let's deploy a pre-compiled token contract from the Aztec library. You can find the full code for the contract [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/#include_aztec_version/noir-projects/noir-contracts/contracts/app/token_contract/src).

Add the following to `index.ts` to import the contract and deploy it with Alice as the admin:

#include_code deploy /docs/examples/ts/aztecjs_getting_started/index.ts typescript

## Mint and transfer

Let's go ahead and have Alice mint herself some tokens, in private:

#include_code mint /docs/examples/ts/aztecjs_getting_started/index.ts typescript

Let's check both Alice's and Bob's balances now:

#include_code check_balances /docs/examples/ts/aztecjs_getting_started/index.ts typescript

Alice should have 100 tokens, while Bob has none yet.

Great! Let's have Alice transfer some tokens to Bob, also in private:

#include_code transfer /docs/examples/ts/aztecjs_getting_started/index.ts typescript

Bob should now see 10 tokens in his balance.

## Other cool things

Say that Alice is nice and wants to set Bob as a minter. Even though it's a public function, it can be called in a similar way:

#include_code set_minter /docs/examples/ts/aztecjs_getting_started/index.ts typescript

Bob is now the minter, so he can mint some tokens to himself:

#include_code bob_mints /docs/examples/ts/aztecjs_getting_started/index.ts typescript

:::info

Have a look at the [contract source](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). Notice is that the `mint_to_private` function we used above actually starts a partial note. This allows the total balance to increase while keeping the recipient private! How cool is that?

:::
