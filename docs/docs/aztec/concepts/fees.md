---
title: Fees
sidebar_position: 4
tags: [fees]
---

import { Why_Fees } from '@site/src/components/Snippets/general_snippets';

<Why_Fees />

In a nutshell, the pricing of transactions transparently accounts for:

- L1 costs, including L1 execution of a block, and data availability via blobs,
- L2 node operating costs, including proving

This is done via multiple variables and calculations explained in detail in the protocol specifications.

## Terminology and factors

Familiar terms from Ethereum mainnet as referred to on the Aztec network:

| Ethereum Mainnet | Aztec              | Description                                    |
| ---------------- | ------------------ | ---------------------------------------------- |
| gas              | mana               | indication of effort in transaction operations |
| fee per gas      | fee-juice per mana | cost per unit of effort                        |
| fee (wei)        | fee-juice          | amount to be paid                              |

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

import { Gas_Settings_Components, Gas_Settings, Tx_Teardown_Phase } from '@site/src/components/Snippets/general_snippets';

<Gas_Settings />

These are:

#include_code gas_settings_vars yarn-project/stdlib/src/gas/gas_settings.ts javascript

<Gas_Settings_Components />

## Fee payment

A fee payer will have bridged fee-juice from L1. On Aztec this fee asset is non-transferrable, and only deducted by the protocol to pay for fees. A user can claim bridged fee juice and use it to pay for transaction fees in the same transaction.

The mechanisms for bridging is the same as any other token. For more on this concept see the start of the [Token Bridge Tutorial](../../developers/tutorials/codealong/js_tutorials/token_bridge.md) where it describes the components and how bridging works (under the hood this makes use of [portals](https://docs.aztec.network/aztec/concepts/communication/portals)).

### Payment methods

An account with fee-juice can pay for its transactions, including deployment of a new account, if fee juice has been bridged the that address at which the account will be deployed.

An account making a transaction can also refer to "fee-paying contracts" (FPCs) to pay for its transactions. FPCs are contracts that accept a token and pay for transactions in fee juice. This means a user doesn't need to hold fee juice, they only need the token that the FPC accepts. FPCs can contain arbitrary logic to determine how they want to authorize transaction fee payments. They can be used for paying transaction fees privately or publicly.

### Teardown phase

<Tx_Teardown_Phase />

### Operator rewards

The calculated fee-juice of a transaction is deducted from the fee payer (nominated account or fee-paying contract), then pooled together each transaction, block, and epoch.
Once the epoch is proven, the total fee-juice (minus any burnt congestion amount), is distributed to provers and block validators/sequencers that contributed to the epoch.

The fees section of the protocol specification explains this distribution of fee-juice between proposers and provers.

## Next steps

More comprehensive technical details for implementers will be available from the updated protocol specifications soon.

For a guide showing ways to pay fees programmatically, see [here](../../developers/guides/js_apps/pay_fees).
