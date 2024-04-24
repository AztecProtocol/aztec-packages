---
title: Published Gas & Fee Data
---

# Published Gas & Fee Data

When a block is published to L1, it includes information about the gas and fees at a block-level, and at a transaction-level.

## Block-level Data

The block header contains a `GlobalVariables`, which contains a `GasFees` object. This object contains the following fields:
- `feePerDaGas`: The fee in [FPA](./fee-payment-asset.md) per unit of DA gas consumed for transactions in the block.
- `feePerL2Gas`: The fee in FPA per unit of L2 gas consumed for transactions in the block.

## Transaction-level Data

The transaction data which is published to L1 is a `TxEffects` object, which includes
- `transaction_fee`: the fee paid by the transaction in FPA


