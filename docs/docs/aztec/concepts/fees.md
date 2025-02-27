---
title: Fees
sidebar_position: 0
tags: [fees]
---

import { Why_Fees } from '/components/snippets';

<Why_Fees />

In a nutshell, the pricing of transactions transparently accounts for:
- L1 costs, including L1 execution of a block, and data availability via blobs,
- L2 node operating costs, including proving

This is done via multiple variables and calculations explained in detail in the protocol specifications.

## Terminology and factors

Familiar terms from Ethereum mainnet as referred to on the Aztec network:

| Mainnet     | Aztec              | Description |
| ----------- | ------------------ | - |
| gas         | mana               | indication of effort in transaction operations |
| fee per gas | fee-juice per mana | cost per unit of effort |
| fee (wei)   | fee-juice          | amount to be paid |

An oracle informs the price of fee-juice per wei, which can be used to calculate a transaction's fee-juice in the units of wei.

Also Aztec borrows ideas from EIP-1559 including: congestion multipliers, and the ability to specify base and priority fee per mana.


### Aztec-specific fields

There are many other fields used in mana and fee calculations, and below shows the ways these fields are determined:

- hard-coded constants (eg congestion update fraction)
- values assumed constant (eg L1 gas cost of publishing a block, blobs per block)
- informed from previous block header and/or L1 rollup contract (eg base_fee_juice_per_mana)
- informed via an oracle (eg wei per mana)

Most of the constants are defined by the protocol, several others are part of the rollup contract on L1.

More information about the design/choices can be found in the fees section of the protocol specification.

### User selected factors

As part of a transaction the follow gas settings are available to be defined by the user.

import { Gas_Settings } from '/components/snippets';

<Gas_Settings />

These are:

#include_code gas_settings_vars yarn-project/stdlib/src/gas/gas_settings.ts javascript


## Fee payment

A fee payer will have bridged fee-juice from L1. On Aztec this fee asset is non-transferrable, and only deducted by the protocol to pay for fees.

The calculated fee-juice of a transaction is deducted from the fee payer (nominated account or fee-paying contract), these are pooled together each transaction, block, and epoch.
Once the epoch is proven, the total fee-juice (minus any burnt congestion amount), is distributed to those that contributed to the epoch.

The fees section of the protocol specification explains this distribution of fee-juice between proposers and provers.

## Next steps

More comprehensive technical details for implementers will be available from the updated protocol specifications soon.

For a guide on how to pay fees programmatically, see [here](../../developers/guides/js_apps/pay_fees).
