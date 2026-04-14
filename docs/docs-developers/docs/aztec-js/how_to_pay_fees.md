---
title: Paying Fees
tags: [fees, transactions, accounts, mana, gas]
sidebar_position: 7
description: Pay transaction fees on Aztec, understand mana costs, estimate gas, and retrieve fees from receipts.
---

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

This guide walks you through paying transaction fees on Aztec using various payment methods.

## Prerequisites

- <General.AztecJSPrerequisites />
- Understanding of [fee concepts](../foundational-topics/fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Payment methods overview

| Method              | Use Case                      | Privacy | Requirements               |
| ------------------- | ----------------------------- | ------- | -------------------------- |
| Fee Juice (default) | Account already has Fee Juice | Public  | Funded account             |
#if(devnet)
| Sponsored FPC       | Testing, free transactions    | Public  | None                       |
#else
| Sponsored FPC       | Testing, free transactions    | Public  | None (devnet and local only) |
#endif
| Bridge + Claim      | Bootstrap from L1             | Public  | L1 ETH for gas             |

## Mana and Fee Juice

Mana is Aztec's unit of computational effort (like gas on Ethereum), and Fee Juice is the native fee token used to pay for transactions. For a detailed explanation of these concepts, see [Fee Concepts](../foundational-topics/fees.md).

## Estimate mana costs

:::tip Automatic estimation with EmbeddedWallet
When using `EmbeddedWallet`, gas is estimated automatically on every `send()` call. You only need to manually estimate if you want to preview costs before sending, or if you're using a custom wallet implementation.
:::

Before sending a transaction, you can estimate the mana it will consume by simulating with `estimateGas: true`:

#include_code estimate_mana /docs/examples/ts/aztecjs_advanced/index.ts typescript

The `estimatedGas` object contains:

- `gasLimits.daGas` - Estimated DA mana for main execution
- `gasLimits.l2Gas` - Estimated L2 mana for main execution
- `teardownGasLimits.daGas` - Estimated DA mana for teardown phase
- `teardownGasLimits.l2Gas` - Estimated L2 mana for teardown phase

### Calculate expected fee from estimate

To calculate the expected fee from estimated gas, use the `computeFee` method with current network fees:

#include_code compute_fee_from_estimate /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::tip
The `estimatedGasPadding` parameter adds a safety margin to the estimate. A value of `0.1` adds 10% padding. Use higher padding for transactions with variable gas costs.
:::

## Get transaction fee from receipt

After a transaction is mined, you can retrieve the fee paid from the receipt:

#include_code get_fee_from_receipt /docs/examples/ts/aztecjs_advanced/index.ts typescript

The `transactionFee` field is a `bigint` representing the total fee paid in the fee token (Fee Juice). You can also check execution status:

#include_code check_receipt_status /docs/examples/ts/aztecjs_advanced/index.ts typescript

## Pay with Fee Juice

Fee Juice is the native fee token on Aztec.

If your account has Fee Juice (for example, from a faucet), is [deployed](./how_to_create_account.md), and is registered in your wallet, it will be used automatically to pay for the fee of the transaction:

#include_code pay_with_fee_juice /docs/examples/ts/aztecjs_advanced/index.ts typescript

## Use Fee Payment Contracts

Fee Payment Contracts (FPCs) pay Fee Juice on your behalf. FPCs must use Fee Juice exclusively on L2 during the setup phase; custom token contract functions cannot be called during setup on public networks. An FPC that accepts other tokens on L1 and bridges Fee Juice works on any network.

### Sponsored Fee Payment Contracts

#if(testnet)
:::note
The Sponsored FPC is not available on testnet or mainnet. It is only available on devnet and local network.
:::
#elif(mainnet)
:::note
The Sponsored FPC is not available on mainnet. It is only available on devnet and local network.
:::
#endif

The Sponsored FPC pays fees unconditionally. It is only available on devnet and local network.

You can derive the Sponsored FPC address from its deployment parameters, register it with your wallet, and use it to pay for transactions:

#include_code deploy_sponsored_fpc_contract /docs/examples/ts/aztecjs_advanced/index.ts typescript

Here's a simpler example from the test suite:

#include_code sponsored_fpc_simple yarn-project/end-to-end/src/e2e_fees/sponsored_payments.test.ts typescript

## Bridge Fee Juice from L1

Fee Juice is non-transferable on L2, but you can bridge it from L1, claim it on L2, and use it. This involves a few components that are part of a running network's infrastructure:

- An L1 fee juice contract
- An L1 fee juice portal
- An L2 fee juice portal
- An L2 fee juice contract

`aztec.js` provides helpers to simplify the process:

#include_code bridge_fee_juice_setup /docs/examples/ts/aztecjs_connection/index.ts typescript

Under the hood, `L1FeeJuicePortalManager` gets the L1 addresses from the node `node_getNodeInfo` endpoint. It then exposes an easy method `bridgeTokensPublic` which mints fee juice on L1 and sends it to an L2 address via the L1 portal:

#include_code bridge_fee_juice_execute /docs/examples/ts/aztecjs_connection/index.ts typescript

After this transaction is minted on L1 and a few blocks pass, you can claim the message on L2 and use it directly to pay for fees:

#include_code bridge_fee_juice_claim /docs/examples/ts/aztecjs_connection/index.ts typescript

## Configure gas settings

### Understanding gas dimensions

Gas settings specify limits and fees for both DA and L2 dimensions:

- **gasLimits**: Maximum mana for main execution phase
- **teardownGasLimits**: Maximum mana for teardown phase (used by FPCs for refunds)
- **maxFeesPerGas**: Maximum price you're willing to pay per mana unit
- **maxPriorityFeesPerGas**: Priority fee for faster inclusion

The fee limit is calculated as `gasLimits × maxFeesPerGas` for each dimension.

### Set custom gas limits

Set custom gas limits by importing from `stdlib`:

#include_code custom_gas_settings /docs/examples/ts/aztecjs_advanced/index.ts typescript

Then pass the settings when sending:

#include_code send_with_gas_settings /docs/examples/ts/aztecjs_advanced/index.ts typescript

Note that `gasLimits` and `teardownGasLimits` use `daGas`/`l2Gas` field names, while `maxFeesPerGas` and `maxPriorityFeesPerGas` use `feePerDaGas`/`feePerL2Gas`.

### Use automatic gas estimation

:::note
When using `EmbeddedWallet`, gas estimation happens automatically on every `send()` — you don't need to pass `estimateGas`. This option is useful for custom wallet implementations or when you want to estimate gas during a `simulate()` call.
:::

#include_code auto_gas_estimation /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::tip
Gas estimation runs a simulation first to determine actual gas usage, then adds padding for safety. This works with all payment methods, including FPCs.
:::

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Explore [authentication witnesses](./how_to_use_authwit.md) for delegated payments
- See [testing guide](./how_to_test.md) for fee testing strategies
