---
title: How to Create a New Account
tags: [accounts]
sidebar_position: 0
description: Guide to creating and managing user accounts in your Aztec.js applications.
---

This guide explains how to create a new account using Aztec.js.

An in-depth explainer about accounts on Aztec can be found [here](../../concepts/accounts/index.md). Creating an account does two things:

1. Deploys an account contract -- representing you -- allowing you to perform actions on the network (deploy contracts, call functions etc).
2. Adds your encryption keys to the Private eXecution Environment (PXE) allowing it to decrypt and manage your private state.

## Relevant imports

You will need to import these libraries:

```typescript title="create_account_imports" showLineNumbers
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { Fr, GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L2-L6" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L2-L6</a></sub></sup>


## Define arguments needed

```typescript title="define_account_vars" showLineNumbers
const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
const pxe = createPXEClient(PXE_URL);
const secretKey = Fr.random();
const signingPrivateKey = GrumpkinScalar.random();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L18-L23" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L18-L23</a></sub></sup>


## Create the wallet with these args

```typescript title="create_wallet" showLineNumbers
// Use a pre-funded wallet to pay for the fees for the deployments.
const wallet = (await getDeployedTestAccountsWallets(pxe))[0];
const newAccount = await getSchnorrAccount(pxe, secretKey, signingPrivateKey);
await newAccount.deploy({ deployWallet: wallet }).wait();
const newWallet = await newAccount.getWallet();
const newAccountAddress = newWallet.getAddress();

const defaultAccountAddress = wallet.getAddress();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L25-L34" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L25-L34</a></sub></sup>


Now you have a new wallet in your PXE! To learn how to use this wallet to deploy a contract, read [this guide](./deploy_contract.md).

## What happens during account creation

When you create an account, several things happen under the hood:

1. The account contract is deployed to the network
2. The deployment transaction is simulated and executed through the private kernel circuit
3. The transaction is submitted to the pool and picked up by the sequencer
4. The sequencer includes it in an L2 block and executes the recursive rollup circuits
5. The L2 block is published on L1
6. The PXE retrieves the L2 block and decrypts any new account state

## Creating specific account types

By default, Aztec.js provides several account implementations including Schnorr accounts. The example above uses the `getDeployedTestAccountsWallets` helper which creates Schnorr accounts by default.

## Next Steps

- Learn how to [deploy contracts](./deploy_contract.md) with your new account
