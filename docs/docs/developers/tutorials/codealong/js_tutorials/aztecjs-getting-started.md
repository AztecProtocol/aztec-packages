---
title: Getting started with Aztec.js
sidebar_position: 0
---

import Image from "@theme/IdealImage";

In this guide, we will retrieving the Sandbox and deploy a pre-written token contract to it using Aztec.js. We will then use Aztec.js to interact with this contract and transfer tokens.

This guide assumes you have followed the [quickstart](../../../../developers/getting_started.md).

:::note
This tutorial is for the sandbox and will need adjustments if deploying to testnet. Install the sandbox [here](../../../getting_started.md).
:::

## Prerequisites

- A running Aztec sandbox at version #include_version_without_prefix. Install with `aztec-up #include_version_without_prefix`.

## Set up the project

We will deploy a pre-compiled token contract, and send tokens privately, using the Sandbox.

We will create a `yarn` TypeScript project called `token` (although `npm` works fine too).

1. Initialize a yarn project

```sh
mkdir token
cd token
yarn init -yp
```

2. Create a `src` folder inside your new `token` directory:

```sh
mkdir src
```

3. Add necessary yarn packages

```sh
yarn add @aztec/aztec.js@#include_version_without_prefix @aztec/accounts@#include_version_without_prefix @aztec/noir-contracts.js@#include_version_without_prefix typescript @types/node
```

:::note Match tool and dependency versions
The version returned from `aztec -V` should match the `@aztec/...` dependencies in package.json

:::

and yarn config:

```sh
echo "nodeLinker: node-modules" > .yarnrc.yml
```

Then run: `yarn install`

4. Add a `tsconfig.json` file into the project root and paste this:

```json
{
  "compilerOptions": {
    "outDir": "dest",
    "rootDir": "src",
    "target": "es2020",
    "lib": ["dom", "esnext", "es2017.object"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "downlevelIteration": true,
    "inlineSourceMap": true,
    "declarationMap": true,
    "importHelpers": true,
    "resolveJsonModule": true,
    "composite": true,
    "skipLibCheck": true
  },
  "references": [],
  "include": ["src", "src/*.json"]
}
```

5. Add this to your `package.json`:

```json
  "type": "module",
  "scripts": {
    "build": "yarn clean && tsc -b",
    "build:dev": "tsc -b --watch",
    "clean": "rm -rf ./dest tsconfig.tsbuildinfo",
    "start": "yarn build && node ./dest/index.js"
  },
```

6. Create an `index.ts` file in the `src` directory with the following sandbox connection setup:

```ts
#include_code imports1 /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts raw
#include_code imports2 /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts raw
#include_code imports3 /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts raw
import type { AztecAddress, Logger, Wallet } from '@aztec/aztec.js';
#include_code token_utils /yarn-project/end-to-end/src/fixtures/token_utils.ts raw

const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
#include_code setup /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts raw
}

main();
```

7. Finally, run the package:

In the project root, run

```sh
yarn start
```

A successful run should show something like this:

```
[21:21:57.641] INFO: e2e:token Aztec Sandbox Info  {
  enr: undefined,
  nodeVersion: '0.82.0',
  l1ChainId: 31337,
  rollupVersion: 1,
  l1ContractAddresses: {
    rollupAddress: EthAddress<0x759f145841f36282f23e0935697c7b2e00401902>,
    registryAddress: EthAddress<0xd5448148ccca5b2f27784c72265fc37201741778>,
    inboxAddress: EthAddress<0x7ba2d0f3a856cd7156a4e88d8c06e5f5cb3b7dd6>,
    outboxAddress: EthAddress<0x6ab41414235e8e9d0e5ac42cdf430432dd6bdd02>,
    feeJuiceAddress: EthAddress<0x5a08d997c9284780330208ecf0112f80f9e6c472>,
    stakingAssetAddress: EthAddress<0xc34806e86bcc34feab846712e57edf6086696377>,
    feeJuicePortalAddress: EthAddress<0x7d2ec00c17a6988c6dbf17a3ee825614cb4aaa4c>,
    coinIssuerAddress: EthAddress<0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266>,
    rewardDistributorAddress: EthAddress<0x5c29eba61f19c908dc3e559a80753794ab812e45>,
    governanceProposerAddress: EthAddress<0x0b3761732e242dbf9491250b8db3b68f61dc6352>,
    governanceAddress: EthAddress<0xeeab717ebb2dfdb1d19a6638dffe141e4111c9e2>,
    slashFactoryAddress: EthAddress<0xbca51eb257b56ee0b3ef2bbdf865b2cc32f9b39b>,
    feeAssetHandlerAddress: EthAddress<0xc3181f43e89f2db4949ec0dddb4e332ef188f66c>
  },
  protocolContractAddresses: {
    classRegisterer: AztecAddress<0x0000000000000000000000000000000000000000000000000000000000000003>,
    feeJuice: AztecAddress<0x0000000000000000000000000000000000000000000000000000000000000005>,
    instanceDeployer: AztecAddress<0x0000000000000000000000000000000000000000000000000000000000000002>,
    multiCallEntrypoint: AztecAddress<0x0000000000000000000000000000000000000000000000000000000000000004>
  }
}
```

Great! The Sandbox is running and we are able to interact with it.

## Load accounts

The sandbox is preloaded with multiple accounts so you don't have to sit and create them. Let's load these accounts. Add this code to the `main()` function in `index.ts` below the code that's there:

#include_code load_accounts /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts typescript

An explanation on accounts on Aztec can be found [here](../../../../aztec/concepts/accounts/index.md).

## Deploy a contract

Now that we have our accounts loaded, let's move on to deploy our pre-compiled token smart contract. You can find the full code for the contract [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts/app/token_contract/src). Add this to `index.ts` below the code you added earlier:

#include_code Deployment /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts typescript

`yarn start` will now give something like this:

```
[21:35:17.434] INFO: e2e:token Loaded alice's account at 0x2a4c7cded97e40031f16c917ab8da8852a1b6da7bf136b32c163d8b16a80acba
[21:35:17.434] INFO: e2e:token Loaded bob's account at 0x0da6dbf69a48f02b09dbdb18fa77bfa526771d3df2ab75b66cb9c69de9002648
[21:35:17.434] INFO: e2e:token Deploying Token contract...
[21:35:20.646] INFO: aztecjs:deploy_sent_tx Contract 0x05db83a57befe646e5ce1dcd9bccce4e3af64e5c1628f69be520e527863805dd successfully deployed.
[21:35:23.995] INFO: e2e:token L2 contract deployed
```

We can break this down as follows:

1. We create and send a contract deployment transaction to the network.
2. We wait for it to be successfully mined.
3. We retrieve the transaction receipt containing the transaction status and contract address.
4. We connect to the contract with Alice
5. Alice initialize the contract with herself as the admin and a minter.
6. Alice privately mints 1,000,000 tokens to herself

## View the balance of an account

A token contract wouldn't be very useful if you aren't able to query the balance of an account. As part of the deployment, tokens were minted to Alice. We can now call the contract's `balance_of_private()` function to retrieve the balances of the accounts.

Call the `balance_of_private` function using the following code (paste this):

#include_code Balance /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts typescript

Running now should yield output:

```
[21:38:42.789] INFO: e2e:token Alice's balance 1000000
[21:38:42.901] INFO: e2e:token Bob's balance 0
```

Above, we created a second instance of the `TokenContract` contract class.
This time pertaining to Bob.
This class offers a TypeScript bindings of our `Token` contract..
We then call `balance_of_private()` as a `view` method.
View methods can be thought as read-only.
No transaction is submitted as a result but a user's state can be queried.

We can see that each account has the expected balance of tokens.

### Calling a view function

<a href="https://raw.githubusercontent.com/AztecProtocol/aztec-packages/6b9e2cc6d13051c4ed38387264600a3cc6d28210/docs/static/img/sandbox_unconstrained_function.png">
<img src="https://raw.githubusercontent.com/AztecProtocol/aztec-packages/6b9e2cc6d13051c4ed38387264600a3cc6d28210/docs/static/img/sandbox_unconstrained_function.png" alt="Unconstrained function call" />
</a>

## Create and submit a transaction

### Transfer

Now lets transfer some funds from Alice to Bob by calling the `transfer` function on the contract. This function takes 2 arguments:

1. The recipient.
2. The quantity of tokens to be transferred.

Here is the Typescript code to call the `transfer` function, add this to your `index.ts` at the bottom of the `main` function:

#include_code Transfer /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts typescript

Our output should now look like this:

```
[21:38:42.901] INFO: e2e:token Transferring 543 tokens from Alice to Bob...
[21:38:46.384] INFO: e2e:token Alice's balance 999457
[21:38:46.644] INFO: e2e:token Bob's balance 543
```

Here, we used the same contract abstraction as was previously used for reading Alice's balance. But this time we called `send()` generating and sending a transaction to the network. After waiting for the transaction to settle we were able to check the new balance values.

### Mint

Finally, the contract has several `mint` functions that can be used to generate new tokens for an account.
We will focus only on `mint_to_private`.
This function has private and public execution components, but it mints tokens privately.
This function takes:

1. A minter (`from`)
2. A recipient
3. An amount of tokens to mint

This function starts as private to set up the creation of a [partial note](../../../../aztec/concepts/advanced/storage/partial_notes.md). The private function calls a public function that checks that the minter is authorized to mint new tokens an increments the public total supply. The recipient of the tokens remains private, but the minter and the amount of tokens minted are public.

Let's now use these functions to mint some tokens to Bob's account using Typescript, add this to `index.ts`:

#include_code Mint /yarn-project/end-to-end/src/composed/e2e_sandbox_example.test.ts typescript

Our complete output should now be something like:

```
[21:40:29.635] INFO: e2e:token Alice's balance 999457
[21:40:29.927] INFO: e2e:token Bob's balance 10543
```

That's it! We have successfully deployed a token contract to an instance of the Aztec network and mined private state-transitioning transactions. We have also queried the resulting state all via the interfaces provided by the contract. To see exactly what has happened here, you can learn about the transaction flow [on the Concepts page here](../../../../aztec/concepts/transactions.md).

## Next Steps

### Build a fullstack Aztec project

Follow the [dapp tutorial](./simple_dapp/index.md).

### Optional: Learn more about concepts mentioned here

- [Authentication witness](../../../../aztec/concepts/advanced/authwit.md)
- [Functions under the hood](../../../../aztec/smart_contracts/functions/function_transforms.md)
