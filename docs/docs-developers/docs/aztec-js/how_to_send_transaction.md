---
title: Sending Transactions
sidebar_position: 4
description: Send transactions to Aztec contracts using Aztec.js with various options and error handling
tags: [transactions, contracts, aztec.js]
---

This guide shows you how to send transactions to smart contracts on Aztec.

## Overview

Transactions on Aztec execute contract functions that modify state. Unlike simple reads, transactions go through private execution on your device, proving, and then submission to the network for inclusion in a block. You can send single transactions, batch multiple calls atomically, and query transaction status after submission.

import { General } from '@site/src/components/Snippets/general_snippets';

## Prerequisites

- <General.AztecJSPrerequisites />
- Deployed contract with its address and ABI (see [How to Deploy](./how_to_deploy_contract.md))
- Understanding of [contract interactions](../aztec-nr/framework-description/calling_contracts.md)

## Send a transaction

After connecting to a contract:

#include_code connect_to_contract /docs/examples/ts/aztecjs_advanced/index.ts typescript

Call a function and wait for it to be mined:

#include_code basic_send_transaction /docs/examples/ts/aztecjs_advanced/index.ts typescript

The `from` field specifies which account sends the transaction. If that account has Fee Juice, it pays for the transaction automatically. For other fee payment options, see [paying fees](./how_to_pay_fees.md).

### What happens behind the scenes

When using `EmbeddedWallet`, calling `send()` triggers a **simulation** step before the transaction is actually sent. This simulation:

1. **Estimates gas limits** based on actual execution, with a configurable padding (default 10%) to avoid reverts. If you provide explicit gas limits via `fee.gasSettings`, they take precedence.
2. **Generates private authwits automatically**. If the contract you're calling requires a private [authentication witness](./how_to_use_authwit.md) (e.g., a token transfer on behalf of the sender), the wallet detects this during simulation and creates the authwit on the fly — no manual setup needed.

This means a simple `.send()` is all most apps need. You can adjust the gas padding if desired:

#include_code set_gas_padding /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::note
Public authwits still need to be set explicitly before the transaction, as they require a separate onchain transaction. See [Using Authentication Witnesses](./how_to_use_authwit.md) for details.
:::

### Send without waiting

Use the `NO_WAIT` option to get the transaction hash immediately without waiting for inclusion:

#include_code no_wait_transaction /docs/examples/ts/aztecjs_advanced/index.ts typescript

## Send batch transactions

Execute multiple calls atomically using `BatchCall`:

#include_code batch_call /docs/examples/ts/aztecjs_advanced/index.ts typescript

:::warning
All calls in a batch must succeed or the entire batch reverts. Use batch transactions when you need atomic execution of multiple operations.
:::

## Query transaction status

After sending a transaction without waiting, you can query its receipt using the node:

#include_code query_tx_status /docs/examples/ts/aztecjs_advanced/index.ts typescript

The receipt includes:

- `status` - Transaction status (`pending`, `proposed`, `checkpointed`, `proven`, `finalized`, or `dropped`)
- `blockNumber` - Block where the transaction was included
- `transactionFee` - Fee paid for the transaction
- `error` - Error message if the transaction reverted

## Next steps

- Learn to [read contract data](./how_to_read_data.md) including simulating functions before sending
- Understand [authentication witnesses](./how_to_use_authwit.md) for delegated transactions
- Configure [gas and fees](./how_to_pay_fees.md) for transaction costs
- Set up [transaction testing](./how_to_test.md) in your development workflow
