---
title: How to Send a Transaction
sidebar_position: 4
description: Learn how to send transactions to the Aztec network using Aztec.js.
---

This guide explains how to send a transaction using Aztec.js.

## Prerequisites

You should have a wallet to act as the transaction sender, a contract that has been deployed, and fee juice to pay for transactions.

You can learn how to create wallets from [this guide](./create_account.md).

You can learn how to deploy a contract [here](./deploy_contract.md).

You can learn how to use fee juice [here](./how_to_pay_fees.md).

## Relevant imports

You will need to import this library:

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


## Call method

```typescript title="send_transaction" showLineNumbers 
await contract.methods.mint_to_public(newAccountAddress, 1).send({ from: defaultAccountAddress }).wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L51-L53" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L51-L53</a></sub></sup>

