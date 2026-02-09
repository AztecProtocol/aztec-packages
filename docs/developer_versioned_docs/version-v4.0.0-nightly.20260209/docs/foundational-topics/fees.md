---
title: Fees
sidebar_position: 4
tags: [fees, mana, gas]
description: Understand Aztec's fee system including mana-based transaction pricing, Aztec token and Fee Juice payments, and how L1 and L2 costs are transparently calculated for users.
references: ["yarn-project/stdlib/src/gas/gas_settings.ts"]
---

import { Why_Fees } from '@site/src/components/Snippets/general_snippets';

<Why_Fees />

In a nutshell, the pricing of transactions transparently accounts for:

- L1 costs, including L1 execution of a block, and data availability via blobs,
- L2 node operating costs, including proving

This is achieved through multiple variables and calculations.

## Terminology

Familiar terms from Ethereum mainnet as referred to on the Aztec network:

| Ethereum Mainnet | Aztec              | Description                                                    |
| ---------------- | ------------------ | -------------------------------------------------------------- |
| gas              | mana               | Unit measuring computational effort for transaction operations |
| fee per gas      | Fee Juice per mana | Price per unit of mana                                         |
| fee (wei)        | Fee Juice          | Total fee paid for a transaction                               |

## What is mana?

Mana is Aztec's unit of computational effort, equivalent to gas on Ethereum. Every transaction consumes mana based on the operations it performs.

Mana has two dimensions:

- **Data Availability (DA) mana**: Cost of publishing transaction data to the data availability layer
- **L2 mana**: Cost of executing the transaction on Aztec

The total transaction fee is calculated as:

```
fee = (daMana × feePerDaMana) + (l2Mana × feePerL2Mana)
```

:::note
The SDK and protocol code use "gas" in variable names (e.g., `daGas`, `l2Gas`, `feePerDaGas`, `feePerL2Gas`) rather than "mana". When reading code, `Gas` and mana refer to the same concept.
:::

## What is Fee Juice?

Fee Juice is the native fee token on Aztec, used to pay for transaction fees. It is bridged Aztec tokens from Ethereum and is **non-transferable** on Aztec - it can only be used to pay fees, not sent between accounts.

Aztec borrows ideas from EIP-1559, including congestion multipliers and the ability to specify base and priority fees per mana.

## Factors affecting fees

Other fields used in mana and fee calculations are determined in various ways:

- hard-coded constants (eg congestion update fraction)
- values assumed constant (eg L1 gas cost of publishing a block, blobs per block)
- informed from previous block header and/or L1 rollup contract (eg base fee per mana)
- informed via an oracle (eg wei per mana)

Most constants are defined by the protocol, while others are part of the rollup contract on L1.

### User-defined settings

Users can define the following settings as part of a transaction:

import { Gas_Settings_Components, Gas_Settings, Tx_Teardown_Phase } from '@site/src/components/Snippets/general_snippets';

```javascript title="gas_settings_vars" showLineNumbers 
/** Gas usage and fees limits set by the transaction sender for different dimensions and phases. */
export class GasSettings {
  constructor(
    public readonly gasLimits: Gas,
    public readonly teardownGasLimits: Gas,
    public readonly maxFeesPerGas: GasFees,
    public readonly maxPriorityFeesPerGas: GasFees,
  ) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260209/yarn-project/stdlib/src/gas/gas_settings.ts#L17-L26" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/gas/gas_settings.ts#L17-L26</a></sub></sup>


<Gas_Settings_Components />

## Fee payment

A fee payer obtains Fee Juice by bridging Aztec tokens from Ethereum. The fee payer can be the account itself or a fee-paying contract (FPC), which functions similarly to a paymaster on Ethereum. On Aztec, Fee Juice is non-transferable and only deducted by the protocol to pay for fees. A user can claim bridged Fee Juice and use it to pay for transaction fees in the same transaction.

Fee Juice uses an enshrined `FeeJuicePortal` contract on Ethereum for bridging, unlike user-deployed token portals. The underlying cross-chain messaging mechanism is similar to other tokens - for more on this concept see the [Token Bridge Tutorial](../tutorials/js_tutorials/token_bridge.md) which describes portal contracts and [cross-chain messaging](../aztec-nr/framework-description/how_to_communicate_cross_chain.md).

### Payment methods

An account with Fee Juice can pay for its transactions directly. A new account can even pay for its own deployment transaction, provided Fee Juice was bridged to its address before deployment.

Alternatively, accounts can use [fee-paying contracts (FPCs)](../aztec-js/how_to_pay_fees.md#fee-payment-contracts-fpc) to pay for transactions. FPCs accept tokens and pay fees in Fee Juice on behalf of users. Common patterns include:

- **Sponsored FPCs**: Pay fees unconditionally, enabling free transactions for users
- **Token-accepting FPCs**: Accept a specific token in exchange for paying fees

FPCs can contain arbitrary logic to authorize fee payments and can operate privately or publicly.

### Teardown phase

<Tx_Teardown_Phase />

This enables FPCs to calculate the actual transaction cost and refund any overpayment to the user.

### Operator rewards

The calculated fee of a transaction is deducted from the fee payer (nominated account or fee-paying contract), then pooled together across transactions, blocks, and epochs. Once an epoch is proven, the total collected fees (minus any burnt congestion amount) are distributed to the provers and block proposers that contributed to the epoch.

## Next steps

For a guide on paying fees programmatically, see [How to Pay Fees](../aztec-js/how_to_pay_fees).
