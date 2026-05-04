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

#include_code simulate_function /docs/examples/ts/aztecjs_connection/index.ts typescript

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

## Simulating with state and contract overrides

`.simulate()` accepts two override options that are scoped to that single simulation; real chain state is untouched.

- `stateOverrides`: state-tree overrides (e.g. `publicStorage` writes).
- `contractOverrides`: an array of `ContractInstanceWithAddress` to override deployed contract instances. Register the new class artifact locally first via `wallet.registerContractClass(artifact)`.

Override a public-storage slot:

```typescript
const result = await contract.methods.read_balance(account).simulate({
  stateOverrides: {
    publicStorage: [{ contract: contract.address, slot: BALANCE_SLOT, value: new Fr(1_000_000n) }],
  },
});
```

Use these to:

- Set up state preconditions without running a full setup transaction
- Reproduce a bug from production by pinning storage to the values seen at a specific block
- Simulate a contract instance as if it had been upgraded
- Test branches that depend on rare values without orchestrating the contract calls that produce them

### Fast-forwarding a contract update

`fastForwardContractUpdate` builds the override blobs needed to simulate a deployed instance as if it had already been upgraded to a new contract class. The new class must already be registered on chain. Mirrors a real `pxe.updateContract` followed by waiting out the upgrade delay.

It returns `stateOverrides` (registry storage rewrites) and `contractOverrides` (instance with bumped class id). A single spread covers any mix of private and public function calls on the upgraded contract.

Register the new class artifact in your local PXE first via `wallet.registerContractClass(artifact)`.

```typescript
import { fastForwardContractUpdate } from '@aztec/aztec.js';
import { getContractClassFromArtifact } from '@aztec/aztec.js/contracts';

// One-time local PXE registration of the new class artifact
await wallet.registerContractClass(UpdatedContract.artifact);

const newClassId = (await getContractClassFromArtifact(UpdatedContract.artifact)).id;
const overrides = await fastForwardContractUpdate({
  instanceAddress: contract.address,
  newClassId,
  node,
});

const upgradedContract = UpdatedContract.at(contract.address, wallet);
const result = await upgradedContract.methods.upgraded_method().simulate({ ...overrides });
```

Use this to test code paths that only execute after an upgrade, without orchestrating the full delayed-mutable upgrade flow.

## Further reading

- [How to read contract data](./how_to_read_data.md)
- [How to send transactions](./how_to_send_transaction.md)
- [How to deploy a contract](./how_to_deploy_contract.md)
- [How to create an account](./how_to_create_account.md)
- [How to compile a contract](../aztec-nr/compiling_contracts.md)
