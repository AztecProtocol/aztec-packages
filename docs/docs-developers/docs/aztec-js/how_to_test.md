---
title: Testing Smart Contracts
tags: [contracts, tests]
sidebar_position: 8
description: Learn how to write and run tests for your Aztec smart contracts using Aztec.js and a local network.
---

This guide covers how to test Aztec smart contracts by connecting to a local network, deploying contracts, and verifying their behavior.

## Prerequisites

- A running [local Aztec network](../../getting_started_on_local_network.md)
- A compiled contract artifact (see [How to compile a contract](../aztec-nr/compiling_contracts.md))
- Node.js test framework (Jest, Vitest, or similar)

## Setting up the test environment

Connect to your local Aztec network and create an embedded wallet:

#include_code connect_to_network /docs/examples/ts/aztecjs_connection/index.ts typescript

The `EmbeddedWallet` manages accounts, tracks deployed contracts, and handles transaction proving. It connects to the Aztec node which provides access to both the Private eXecution Environment (PXE) and the network.

## Loading test accounts

The local network comes with pre-funded accounts. Load them into your wallet:

#include_code load_test_accounts /docs/examples/ts/aztecjs_testing/index.ts typescript

## Deploying contracts in tests

Deploy contracts using the generated contract class:

#include_code deploy_test_contract /docs/examples/ts/aztecjs_testing/index.ts typescript

## Verifying contract state

Use `.simulate()` to read contract state without creating a transaction:

#include_code simulate_function docs/examples/ts/aztecjs_connection/index.ts typescript

Simulations are free (no gas cost) and return the function's result directly. Use them for:

- Checking balances and state before/after transactions
- Validating expected outcomes in assertions
- Debugging contract behavior

## Sending test transactions

Send transactions and wait for confirmation:

#include_code send_transaction /docs/examples/ts/aztecjs_connection/index.ts typescript

The `send()` method returns when the transaction is included in a block.

## Example test structure

Here's a complete test example showing the typical structure with setup, test cases, and assertions:

#include_code complete_test_example /docs/examples/ts/aztecjs_testing/index.ts typescript

## Testing failure cases

Test that invalid operations revert as expected:

#include_code test_revert_case /docs/examples/ts/aztecjs_testing/index.ts typescript

Use `.simulate()` to test reverts without spending gas. The simulation will throw if the transaction would fail onchain.

## Further reading

- [How to read contract data](./how_to_read_data.md)
- [How to send transactions](./how_to_send_transaction.md)
- [How to deploy a contract](./how_to_deploy_contract.md)
- [How to create an account](./how_to_create_account.md)
- [How to compile a contract](../aztec-nr/compiling_contracts.md)
