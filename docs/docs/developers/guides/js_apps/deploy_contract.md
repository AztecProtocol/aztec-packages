---
title: How to Deploy a Contract
tags: [contracts]
sidebar_position: 1
description: Learn how to deploy smart contracts to the Aztec network using Aztec.js.
---

You can deploy your contract using JS, which could come in handy (ex. if doing it on a browser)

## Prerequisites

- You should have your compiled contract ready (go to [How to Compile Contract](../smart_contracts/how_to_compile_contract.md) for instructions on how to compile contracts)
- Aztec Sandbox running (go to [Getting Started](../../getting_started.md) for instructions on how to install and run the sandbox)

## Deploy

Contracts can be deployed using the `aztec.js` library. `aztec-nargo` can generate a handy typescript binding you can use to deploy the contract and call its functions:

```bash
aztec-nargo compile # generate contract artifacts
aztec-postprocess-contract # transpile contract and generate verification keys
aztec codegen ./your/contract -o src/artifacts
```

This would take the compiled contract and create a typescript file like `YourContract.ts`. You can now import it into your file, for example:

```typescript
import { YourContract } from './src/artifacts/YourContract.ts';
```

Then you can use its own class to deploy:

```typescript
const contract = await YourContract.deploy(wallet, "constructorArg1")
    .send({ from: wallet.getAddress() })
    .deployed();

console.log(`Contract deployed at ${contract.address.toString()}`);
```

### Deploy Arguments

There are several optional arguments that can be passed:

The `deploy(...)` method is generated automatically with the typescript class representing your contract.

Additionally the `.send()` method can have a few optional arguments too, which are specified in an optional object:

#include_code deploy_options yarn-project/aztec.js/src/contract/deploy_method.ts typescript
