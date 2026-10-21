---
title: Deploying a Token Contract
sidebar_position: 0
description: A tutorial going through how to deploy a token contract to the local network using typescript.
references: ["docs/examples/ts/aztecjs_getting_started/index.ts"]
---

import Image from "@theme/IdealImage";

In this guide, we will retrieve the local network and deploy a pre-written token contract to it using Aztec.js. [Check out the source code](https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). We will then use Aztec.js to interact with this contract and transfer tokens.

Before starting, make sure to be running Aztec local network at version 5.2.0. Check out [the guide](../../../getting_started_on_local_network.md) for info about that.

## Set up the project

First, create a new directory for your project and initialize it with yarn:

```sh
mkdir token-tutorial
cd token-tutorial
yarn init -y
```

Next, add the TypeScript dependencies:

```sh
yarn add "typescript@^5.3.3" @types/node tsx
```

:::tip

Never heard of `tsx`? Well, it will just run `typescript` with reasonable defaults. Pretty cool for a small example like this one. You may want to tune in your own project's `tsconfig.json` later!

:::

Let's also import the Aztec dependencies for this tutorial:

```sh
yarn add @aztec/aztec.js@5.2.0 @aztec/accounts@5.2.0 @aztec/noir-contracts.js@5.2.0 @aztec/wallets@5.2.0
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

```typescript title="setup" showLineNumbers 
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });

const [alice, bob] = await getInitialTestAccountsData();
await wallet.createSchnorrInitializerlessAccount(
  alice.secret,
  alice.salt,
  alice.signingKey,
);
await wallet.createSchnorrInitializerlessAccount(
  bob.secret,
  bob.salt,
  bob.signingKey,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L1-L19" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L1-L19</a></sub></sup>


**Step 3: Verify the script runs**

Run the script to make sure everything is set up correctly:

```sh
yarn start
```

If there are no errors, you're ready to continue. For more details on connecting to the local network, see [this guide](../../aztec-js/how_to_connect_to_local_network.md).

## Deploy the token contract

Now that we have our accounts loaded, let's deploy a pre-compiled token contract from the Aztec library. You can find the full code for the contract [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v5.2.0/noir-projects/noir-contracts/contracts/app/token_contract/src).

Add the following to `index.ts` to import the contract and deploy it with Alice as the admin:

```typescript title="deploy" showLineNumbers 
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const { contract: token } = await TokenContract.deploy(
  wallet,
  alice.address,
  "TokenName",
  "TKN",
  18,
).send({ from: alice.address });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L21-L31" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L21-L31</a></sub></sup>


## Mint and transfer

Let's go ahead and have Alice mint herself some tokens, in private:

```typescript title="mint" showLineNumbers 
await token.methods
  .mint_to_private(alice.address, 100)
  .send({ from: alice.address });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L33-L37" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L33-L37</a></sub></sup>


Let's check both Alice's and Bob's balances now:

```typescript title="check_balances" showLineNumbers 
let { result: aliceBalance } = await token.methods
  .balance_of_private(alice.address)
  .simulate({ from: alice.address });
console.log(`Alice's balance: ${aliceBalance}`);
let { result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's balance: ${bobBalance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L39-L48" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L39-L48</a></sub></sup>


Alice should have 100 tokens, while Bob has none yet.

Great! Let's have Alice transfer some tokens to Bob, also in private:

```typescript title="transfer" showLineNumbers 
await token.methods.transfer(bob.address, 10).send({ from: alice.address });
({ result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address }));
console.log(`Bob's balance: ${bobBalance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L50-L56" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L50-L56</a></sub></sup>


Bob should now see 10 tokens in his balance.

## Other cool things

Say that Alice is nice and wants to set Bob as a minter. Even though it's a public function, it can be called in a similar way:

```typescript title="set_minter" showLineNumbers 
await token.methods.set_minter(bob.address, true).send({ from: alice.address });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L58-L60" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L58-L60</a></sub></sup>


Bob is now the minter, so he can mint some tokens to himself:

```typescript title="bob_mints" showLineNumbers 
await token.methods
  .mint_to_private(bob.address, 100)
  .send({ from: bob.address });
({ result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address }));
console.log(`Bob's balance: ${bobBalance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/docs/examples/ts/aztecjs_getting_started/index.ts#L62-L70" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_getting_started/index.ts#L62-L70</a></sub></sup>


:::info

Have a look at the [contract source](https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr). Notice is that the `mint_to_private` function we used above actually starts a partial note. This allows the total balance to increase while keeping the recipient private! How cool is that?

:::

## Going Further

The pre-compiled token contract used in this tutorial is Aztec's reference implementation. It covers the core operations you need to get started: minting, private transfers, and public balance management.

For production applications, consider the **AIP-20 Token Standard** maintained by [DeFi Wonderland](https://github.com/defi-wonderland/aztec-standards/tree/dev/src/token_contract). AIP-20 formalizes the same patterns used in the reference contract and adds:

- **Commitment-based transfers** for DeFi protocols where the recipient is determined asynchronously
- **Recursive note consumption** for handling large balances that span many notes
- **Tokenized vault support (AIP-4626)** for yield-bearing tokens that issue shares against an underlying asset

To learn how to write a token contract from scratch rather than deploying a pre-compiled one, see the [Private Token Contract tutorial](../contract_tutorials/token_contract.md). For the full specifications of all Aztec contract standards, see the [Aztec Contract Standards](../../aztec-nr/standards/index.md) reference.
