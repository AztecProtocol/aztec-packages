---
title: How to Simulate a Function Call
tags: [functions]
sidebar_position: 2
description: Learn how to call view functions in your Aztec.js applications to query public state from contracts.
---

This guide explains how to `simulate` a function call using Aztec.js.

## Prerequisites

You should have a wallet to act as the caller, and a contract that has been deployed.

You can learn how to create wallets from [this guide](./create_account.md).

You can learn how to deploy a contract [here](./deploy_contract.md).

## Relevant imports

You will need to import this from Aztec.js:

```typescript title="import_contract" showLineNumbers 
import { Contract } from '@aztec/aztec.js';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L7-L9" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L7-L9</a></sub></sup>


## Define contract

Get a previously deployed contract like this:

```typescript title="get_contract" showLineNumbers 
const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L46-L48" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L46-L48</a></sub></sup>


## Simulating function calls

Call the `simulate` function on the typescript contract wrapper like this:

```typescript title="simulate_function" showLineNumbers 
const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
expect(balance).toEqual(1n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L55-L58" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L55-L58</a></sub></sup>


:::info Note
- If the simulated function is `utility` you will get a properly typed value.
- If the simulated function is `public` or `private` it will return a Field array of size 4.
:::
