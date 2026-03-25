---
title: Sending Transactions
sidebar_position: 4
description: Send transactions to Aztec contracts using Aztec.js with various options and error handling
tags: [transactions, contracts, aztec.js]
---

This guide shows you how to send transactions to smart contracts on Aztec.

## Overview

Transactions on Aztec execute contract functions that modify state. Unlike simple reads, transactions go through private execution on your device, proving, and then submission to the network for inclusion in a block. You can send single transactions, batch multiple calls atomically, and query transaction status after submission.

## Prerequisites

- [Connected to a network](./how_to_connect_to_local_network.md) with a `EmbeddedWallet` instance and funded accounts
- Deployed contract with its address and ABI (see [How to Deploy](./how_to_deploy_contract.md))
- Understanding of [contract interactions](../aztec-nr/framework-description/calling_contracts.md)

## Send a transaction

After connecting to a contract:

```typescript
import { Contract } from "@aztec/aztec.js";

// wallet is from the connection guide; contractAddress and artifact are from your deployed contract
const contract = await Contract.at(contractAddress, artifact, wallet);
```

Call a function and wait for it to be mined:

```typescript
// contract is from the step above; alice is from the connection guide
const receipt = await contract.methods
  .transfer(bobAddress, amount)
  .send({ from: aliceAddress });

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
```

The `from` field specifies which account sends the transaction. If that account has Fee Juice, it pays for the transaction automatically. For other fee payment options, see [paying fees](./how_to_pay_fees.md).

### What happens behind the scenes

When using `EmbeddedWallet`, calling `send()` triggers a **simulation** step before the transaction is actually sent. This simulation:

1. **Estimates gas limits** based on actual execution, with a configurable padding (default 10%) to avoid reverts. If you provide explicit gas limits via `fee.gasSettings`, they take precedence.
2. **Generates private authwits automatically**. If the contract you're calling requires a private [authentication witness](./how_to_use_authwit.md) (e.g., a token transfer on behalf of the sender), the wallet detects this during simulation and creates the authwit on the fly — no manual setup needed.

This means a simple `.send()` is all most apps need. You can adjust the gas padding if desired:

```typescript
wallet.setEstimatedGasPadding(0.2); // 20% padding instead of the default 10%
```

:::note
Public authwits still need to be set explicitly before the transaction, as they require a separate onchain transaction. See [Using Authentication Witnesses](./how_to_use_authwit.md) for details.
:::

### Send without waiting

Use the `NO_WAIT` option to get the transaction hash immediately without waiting for inclusion:

```typescript title="no_wait_transaction" showLineNumbers 
// Use NO_WAIT for regular transactions too
const { txHash: transferTxHash } = await token.methods
  .transfer(bobAddress, 100n)
  .send({ from: aliceAddress, wait: NO_WAIT });

console.log(`Transaction sent: ${transferTxHash.toString()}`);

// Wait for inclusion later using the node
const transferReceipt = await waitForTx(node, transferTxHash);
console.log(`Transaction mined in block ${transferReceipt.blockNumber}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.1.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L149-L160" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L149-L160</a></sub></sup>


## Send batch transactions

Execute multiple calls atomically using `BatchCall`:

```typescript title="batch_call" showLineNumbers 
// Execute multiple calls atomically using BatchCall
const batch = new BatchCall(wallet, [
  token.methods.mint_to_public(aliceAddress, 500n),
  token.methods.transfer(bobAddress, 200n),
]);

const { receipt: batchReceipt } = await batch.send({ from: aliceAddress });
console.log(`Batch executed in block ${batchReceipt.blockNumber}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.1.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L162-L171" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L162-L171</a></sub></sup>


:::warning
All calls in a batch must succeed or the entire batch reverts. Use batch transactions when you need atomic execution of multiple operations.
:::

## Query transaction status

After sending a transaction without waiting, you can query its receipt using the node:

```typescript title="query_tx_status" showLineNumbers 
// Query transaction status after sending without waiting
const { txHash: statusTxHash } = await token.methods
  .transfer(bobAddress, 10n)
  .send({ from: aliceAddress, wait: NO_WAIT });

// Check status using the node
const txReceipt = await node.getTxReceipt(statusTxHash);

console.log(`Status: ${txReceipt.status}`);
console.log(`Block number: ${txReceipt.blockNumber}`);
console.log(`Transaction fee: ${txReceipt.transactionFee}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.1.0-rc.2/docs/examples/ts/aztecjs_advanced/index.ts#L194-L206" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L194-L206</a></sub></sup>


The receipt includes:

- `status` - Transaction finalization status (`pending`, `proposed`, `checkpointed`, `proven`, `finalized`, or `dropped`)
- `executionResult` - Execution outcome (`success`, `app_logic_reverted`, `teardown_reverted`, or `both_reverted`)
- `blockNumber` - Block where the transaction was included
- `transactionFee` - Fee paid for the transaction
- `error` - Error message if the transaction reverted

## Next steps

- Learn to [read contract data](./how_to_read_data.md) including simulating functions before sending
- Understand [authentication witnesses](./how_to_use_authwit.md) for delegated transactions
- Configure [gas and fees](./how_to_pay_fees.md) for transaction costs
- Set up [transaction testing](./how_to_test.md) in your development workflow
