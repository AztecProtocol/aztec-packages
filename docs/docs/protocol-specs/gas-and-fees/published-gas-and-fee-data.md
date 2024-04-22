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
- `gas_used`: the total gas consumed by the transaction, contains:
  - `da_gas_used`: the total DA gas consumed by the transaction.
  - `l2_gas_used`: the total L2 gas consumed by the transaction.
- `max_inclusion_fee`: the inclusion fee paid by the transaction.

:::note
The `transaction_fee` is not published because it can be [calculated from the above](./specifying-gas-fee-info.md#transaction-fee).
:::

