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

- Deployed contract with its address and ABI
- Funded account wallet (see [paying fees](./how_to_pay_fees.md))
- Running Aztec local network or connected to a network
- Understanding of [contract interactions](../aztec-nr/framework-description/calling_contracts.md)

## Send a transaction

After connecting to a contract:

```typescript
import { Contract } from "@aztec/aztec.js";

const contract = await Contract.at(contractAddress, artifact, wallet);
```

Call a function and wait for it to be mined:

```typescript
const receipt = await contract.methods
  .transfer(recipientAddress, amount)
  .send({ from: sender.address })
  .wait();

console.log(`Transaction mined in block ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
```

The `from` field specifies which account sends the transaction. If that account has Fee Juice, it pays for the transaction automatically. For other fee payment options, see [paying fees](./how_to_pay_fees.md).

### Send without waiting

```typescript
const sentTx = contract.methods
  .transfer(recipientAddress, amount)
  .send({ from: sender.address });

// Get transaction hash immediately
const txHash = await sentTx.getTxHash();
console.log(`Transaction sent: ${txHash.toString()}`);

// Wait for inclusion later
const receipt = await sentTx.wait();
console.log(`Transaction mined in block ${receipt.blockNumber}`);
```

## Send batch transactions

Execute multiple calls atomically using `BatchCall`:

```typescript
import { BatchCall } from "@aztec/aztec.js";

const batch = new BatchCall(wallet, [
  token.methods.approve(spender, amount),
  contract.methods.deposit(amount),
  contract.methods.updateState(),
]);

const receipt = await batch.send({ from: sender.address }).wait();
console.log(`Batch executed in block ${receipt.blockNumber}`);
```

:::warning
All calls in a batch must succeed or the entire batch reverts. Use batch transactions when you need atomic execution of multiple operations.
:::

## Query transaction status

After sending a transaction, you can query its receipt:

```typescript
const txHash = await sentTx.getTxHash();
const receipt = await wallet.getTxReceipt(txHash);

console.log(`Status: ${receipt.status}`);
console.log(`Block number: ${receipt.blockNumber}`);
console.log(`Transaction fee: ${receipt.transactionFee}`);
```

The receipt includes:

- `status` - Transaction status (`success`, `reverted`, `dropped`, or `pending`)
- `blockNumber` - Block where the transaction was included
- `transactionFee` - Fee paid for the transaction
- `error` - Error message if the transaction reverted

## Next steps

- Learn to [simulate functions](./how_to_simulate_function.md) before sending
- Understand [authentication witnesses](./how_to_use_authwit.md) for delegated transactions
- Configure [gas and fees](./how_to_pay_fees.md) for transaction costs
- Set up [transaction testing](./how_to_test.md) in your development workflow
