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

Compile the contract:

```bash
aztec-nargo compile
```

Generate the typescript class:

```bash
aztec codegen ./aztec-nargo/output/target/path -o src/artifacts
```

This would create a typescript file like `Example.ts` in `./src/artifacts`.

You can use the `Contract` class to deploy a contract:

#include_code dapp-deploy yarn-project/end-to-end/src/sample-dapp/deploy.mjs typescript

Or you can use the generated contract class. See [below](#deploying-token-contract) for more details.

### Deploy Arguments

There are several optional arguments that can be passed:

The `deploy(...)` method is generated automatically with the typescript class representing your contract.

Additionally the `.send()` method can have a few optional arguments too, which are specified in an optional object:

#include_code deploy_options yarn-project/aztec.js/src/contract/deploy_method.ts typescript

### Deploying token contract

To give you a more complete example we will deploy a `Token` contract whose artifacts are included in the `@aztec/noir-contracts.js` package.

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