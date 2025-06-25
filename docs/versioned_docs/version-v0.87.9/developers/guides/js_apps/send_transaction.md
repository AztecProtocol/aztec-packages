---
title: How to Send a Transaction
sidebar_position: 4
---

This guide explains how to send a transaction using Aztec.js.

## Prerequisites

You should have a wallet to act as the transaction sender, a contract that has been deployed, and fee juice to pay for transactions.

You can learn how to create wallets from [this guide](./create_account.md).

You can learn how to deploy a contract [here](./deploy_contract.md).

You can learn how to use fee juice [here](./pay_fees.md).

## Relevant imports

You will need to import this library:

```typescript title="import_contract" showLineNumbers 
import { Contract } from '@aztec/aztec.js';
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L7-L9" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L7-L9</a></sub></sup>


## Define contract

Get a previously deployed contract like this:

```typescript title="get_contract" showLineNumbers 
const contract = await Contract.at(deployedContract.address, TokenContractArtifact, wallet);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L45-L47" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L45-L47</a></sub></sup>


## Call method

```typescript title="send_transaction" showLineNumbers 
const _tx = await contract.methods.mint_to_public(newWallet.getAddress(), 1).send().wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L52" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L50-L52</a></sub></sup>

