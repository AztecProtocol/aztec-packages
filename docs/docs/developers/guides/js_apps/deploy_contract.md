---
title: How to Deploy a Contract
tags: [contracts]
sidebar_position: 1
---

Once you have [compiled](../smart_contracts/how_to_compile_contract.md) your contracts you can proceed to deploying them using Aztec.js.

You can use this method to deploy your contracts to the sandbox or to a remote network.

## Prerequisites

- Contract artifacts ready (go to [How to Compile Contract](../smart_contracts/how_to_compile_contract.md) for instructions on how to compile contracts)
- Aztec Sandbox running (go to [Getting Started](../../getting_started.md) for instructions on how to install and run the sandbox)

## Deploy

Contracts can be deployed using the `aztec.js` library.

### Generate the typescript artifact

Compile the contract:

```bash
aztec-nargo compile
```

Generate the typescript class:

```bash
aztec codegen ./aztec-nargo/output/target/path -o src/artifacts
```

This would create a typescript file like `Example.ts` in `./src/artifacts`.

### Deploying

Import the typescript artifact into your file.

#include_code import_artifact yarn-project/end-to-end/src/sample-dapp/deploy.mjs typescript

Then you can use the `Contract` class **or** the [generated contract class](#using-generated-contract-class) to deploy the contract.

To use the `Contract` class to deploy a contract:

#include_code dapp-deploy yarn-project/end-to-end/src/sample-dapp/deploy.mjs typescript

#### Deploy Arguments

There are several optional arguments that can be passed:

The `deploy(...)` method is generated automatically with the typescript class representing your contract.

Additionally the `.send()` method can have a few optional arguments too, which are specified in an optional object:

#include_code deploy_options yarn-project/aztec.js/src/contract/deploy_method.ts typescript

### Using generated contract class

As a more complete example, here a `Token` contract deployment whose artifacts are included in the `@aztec/noir-contracts.js` package. You can use similar deployment syntax with your own contract by importing the TS artifact generated with `aztec codegen`. This example uses the generated `TokenContract` to deploy.

```ts
#include_code create_account_imports yarn-project/end-to-end/src/composed/docs_examples.test.ts raw
#include_code import_contract yarn-project/end-to-end/src/composed/docs_examples.test.ts raw
#include_code import_token_contract yarn-project/end-to-end/src/composed/docs_examples.test.ts raw

async function main(){

    #include_code full_deploy yarn-project/end-to-end/src/composed/docs_examples.test.ts raw

}
```

:::note
You can try running the deployment with the same salt the second time in which case the transaction will fail because the address has been already deployed to.
:::