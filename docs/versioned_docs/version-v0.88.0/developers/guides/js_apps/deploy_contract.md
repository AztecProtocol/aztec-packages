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

```typescript title="import_artifact" showLineNumbers 
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/yarn-project/end-to-end/src/sample-dapp/deploy.mjs#L5-L7" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/deploy.mjs#L5-L7</a></sub></sup>


Then you can use the `Contract` class **or** the [generated contract class](#using-generated-contract-class) to deploy the contract.

To use the `Contract` class to deploy a contract:

```typescript title="dapp-deploy" showLineNumbers 
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();

  const token = await Contract.deploy(ownerWallet, TokenContractArtifact, [ownerAddress, 'TokenName', 'TKN', 18])
    .send()
    .deployed();

  console.log(`Token deployed at ${token.address.toString()}`);

  const addresses = { token: token.address.toString() };
  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/yarn-project/end-to-end/src/sample-dapp/deploy.mjs#L13-L32" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/deploy.mjs#L13-L32</a></sub></sup>


#### Deploy Arguments

There are several optional arguments that can be passed:

The `deploy(...)` method is generated automatically with the typescript class representing your contract.

Additionally the `.send()` method can have a few optional arguments too, which are specified in an optional object:

```typescript title="deploy_options" showLineNumbers 
export type DeployOptions = {
  /** An optional salt value used to deterministically calculate the contract address. */
  contractAddressSalt?: Fr;
  /** Set to true to *not* include the sender in the address computation. */
  universalDeploy?: boolean;
  /** Skip contract class registration. */
  skipClassRegistration?: boolean;
  /** Skip public deployment, instead just privately initialize the contract. */
  skipPublicDeployment?: boolean;
  /** Skip contract initialization. */
  skipInitialization?: boolean;
} & SendMethodOptions;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/yarn-project/aztec.js/src/contract/deploy_method.ts#L32-L45" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/deploy_method.ts#L32-L45</a></sub></sup>


### Using generated contract class

As a more complete example, here a `Token` contract deployment whose artifacts are included in the `@aztec/noir-contracts.js` package. You can use similar deployment syntax with your own contract by importing the TS artifact generated with `aztec codegen`. This example uses the generated `TokenContract` to deploy.

```ts
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
import { Contract } from '@aztec/aztec.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

async function main(){

const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
const pxe = createPXEClient(PXE_URL);
const secretKey = Fr.random();
const signingPrivateKey = GrumpkinScalar.random();

// Use a pre-funded wallet to pay for the fees for the deployments.
const wallet = (await getDeployedTestAccountsWallets(pxe))[0];
const newAccount = await getSchnorrAccount(pxe, secretKey, signingPrivateKey);
await newAccount.deploy({ deployWallet: wallet }).wait();
const newWallet = await newAccount.getWallet();

const deployedContract = await TokenContract.deploy(
  wallet, // wallet instance
  wallet.getAddress(), // account
  'TokenName', // constructor arg1
  'TokenSymbol', // constructor arg2
  18,
)
  .send()
  .deployed();

const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);

}
```

:::note
You can try running the deployment with the same salt the second time in which case the transaction will fail because the address has been already deployed to.
:::