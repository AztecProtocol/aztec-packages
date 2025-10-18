---
title: Sending Transactions
sidebar_position: 4
description: Send transactions to Aztec contracts using Aztec.js with various options and error handling
tags: [transactions, contracts, aztec.js]
---

This guide shows you how to send transactions to smart contracts on Aztec.

## Prerequisites

- Deployed contract with its address and ABI
- Funded account wallet
- Running Aztec sandbox or connected to a network
- Understanding of [contract interactions](../smart_contracts/how_to_call_contracts.md)

## Sending a basic transaction

Let's say you've connected to a contract, for example:

```typescript
import { Contract } from "@aztec/aztec.js";

const contract = await Contract.at(contractAddress, artifact, wallet);
```

or

```typescript
import { MyContract } from './artifacts/MyContract';

const contract = await MyContract.at(contractAddress, wallet);
```

You should [choose your fee-paying method](./how_to_pay_fees.md) and just call a function on it:

```typescript
const withFeeJuice = await contract.methods
    .transfer(recipientAddress, amount)
    .send({ from: fundedAccount.address }) // if this account has fee-juice
    .wait();

// or using the Sponsored FPC

const sponsored = await contract.methods
    .transfer(recipientAddress, amount)
    .send({ fee: { paymentMethod: sponsoredPaymentMethod } })
    .wait();
```

### Send without waiting

```typescript
// Send transaction and get a SentTx object
const sentTx = contract.methods
    .transfer(recipientAddress, amount)
    .send({ from: fundedAccount.address });

// Get transaction hash immediately
const txHash = await sentTx.getTxHash();
console.log(`Transaction sent with hash: ${txHash.toString()}`);

// Wait for inclusion later
const receipt = await sentTx.wait();
console.log(`Transaction mined in block ${receipt.blockNumber}`);
```

## Send batch transactions

### Execute multiple calls atomically

```typescript
import { BatchCall } from '@aztec/aztec.js';

const batch = new BatchCall(wallet, [
    token.methods.approve(spender, amount),
    contract.methods.deposit(amount),
    contract.methods.updateState()
]);

const receipt = await batch.send({ from: fundedAccount.address }).wait();
console.log(`Batch executed in block ${receipt.blockNumber} with fee ${receipt.transactionFee}`);
```

:::warning
All calls in a batch must succeed or the entire batch reverts. Use batch transactions when you need atomic execution of multiple operations.
:::

## Query transaction status

### Get transaction receipt

```typescript
const txHash = await sentTx.getTxHash();
const receipt = await wallet.getTxReceipt(txHash); // or pxe.getTxReceipt(txHash);
```

### Check transaction effects

```typescript
const txHash = await sentTx.getTxHash();
const effect = await pxe.getTxEffect(txHash);

// Access public data writes
effect.data.publicDataWrites.forEach(write => {
    console.log(`Wrote ${write.value} to slot ${write.leafSlot}`);
});

// Check note hashes (private note commitments)
effect.data.noteHashes.forEach(noteHash => {
    console.log(`Created note: ${noteHash.toString()}`);
});

// Check nullifiers (consumed notes)
effect.data.nullifiers.forEach(nullifier => {
    console.log(`Nullified: ${nullifier.toString()}`);
});
```

## Next steps

- Learn to [simulate functions](./how_to_simulate_function.md) before sending
- Understand [authentication witnesses](./how_to_use_authwit.md) for delegated transactions
- Configure [gas and fees](./how_to_pay_fees.md) for optimal transaction costs
- Set up [transaction testing](./how_to_test.md) in your development workflow
