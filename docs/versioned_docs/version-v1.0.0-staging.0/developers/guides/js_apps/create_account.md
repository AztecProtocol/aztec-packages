---
title: How to Create a New Account
tags: [accounts]
sidebar_position: 0
---

This guide explains how to create a new account using Aztec.js.

## Relevant imports

You will need to import these libraries:

```typescript title="create_account_imports" showLineNumbers 
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L2-L6" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L2-L6</a></sub></sup>


## Define arguments needed

```typescript title="define_account_vars" showLineNumbers 
const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
const pxe = createPXEClient(PXE_URL);
const secretKey = Fr.random();
const signingPrivateKey = GrumpkinScalar.random();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L18-L23" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L18-L23</a></sub></sup>


## Create the wallet with these args

```typescript title="create_wallet" showLineNumbers 
// Use a pre-funded wallet to pay for the fees for the deployments.
const wallet = (await getDeployedTestAccountsWallets(pxe))[0];
const newAccount = await getSchnorrAccount(pxe, secretKey, signingPrivateKey);
await newAccount.deploy({ deployWallet: wallet }).wait();
const newWallet = await newAccount.getWallet();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L25-L31" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L25-L31</a></sub></sup>


Now you have a new wallet in your PXE! To learn how to use this wallet to deploy a contract, read [this guide](./deploy_contract.md).
