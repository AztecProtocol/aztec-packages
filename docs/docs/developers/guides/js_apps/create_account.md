---
title: How to Create a New Account
tags: [accounts]
sidebar_position: 0
description: Guide to creating and managing user accounts in your Aztec.js applications.
---

This guide explains how to create a new account using Aztec.js.

An in-depth explainer about accounts on Aztec can be found [here](../../../aztec/concepts/accounts/index.md). Creating an account does two things:

1. Deploys an account contract -- representing you -- allowing you to perform actions on the network (deploy contracts, call functions etc).
2. Adds your encryption keys to the Private eXecution Environment (PXE) allowing it to decrypt and manage your private state.

## Relevant imports

You will need to import these libraries:

#include_code create_account_imports yarn-project/end-to-end/src/composed/docs_examples.test.ts typescript

## Define arguments needed

#include_code define_account_vars yarn-project/end-to-end/src/composed/docs_examples.test.ts typescript

## Create the wallet with these args

#include_code create_wallet yarn-project/end-to-end/src/composed/docs_examples.test.ts typescript

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
