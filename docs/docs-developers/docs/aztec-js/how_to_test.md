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

## Simulating with state overrides

`.simulate()` accepts a `stateOverrides` option that injects values into the simulator's ephemeral world-state fork before the call runs. The override is scoped to that single simulation; the real chain state is untouched.

Three override flavors are supported:

- `publicStorage`: write `(contract, slot, value)` into the public-data tree.
- `contractClasses`: shadow contract classes in the simulator's contract DB (as if they had been published on the class registry).
- `contractInstances`: shadow contract instances at specific addresses (as if they had been deployed, possibly pointing at one of the shadowed classes).

Override a public-storage slot:

```typescript
const result = await contract.methods.read_balance(account).simulate({
  stateOverrides: {
    publicStorage: [{ contract: contract.address, slot: BALANCE_SLOT, value: new Fr(1_000_000n) }],
  },
});
```

Override a contract's class — useful for testing against a mock implementation:

```typescript
const result = await contract.methods.foo().simulate({
  stateOverrides: {
    contractClasses: [mockClass],
    contractInstances: [{ ...existingInstance, currentContractClassId: mockClass.id }],
  },
});
```

Use this to:

- Set up state preconditions without running a full setup transaction
- Reproduce a bug from production by pinning storage to the values seen at a specific block
- Swap a contract's bytecode for a mock implementation in tests
- Simulate calls against contracts that aren't yet deployed
- Test branches that depend on rare values without orchestrating the contract calls that produce them

### Fast-forwarding a contract update

`fastForwardContractUpdate` builds the full set of overrides needed to simulate a deployed instance as if it had already been upgraded to a new contract class. The new class must already be registered on chain. The cheat mirrors a real `pxe.updateContract` followed by waiting out the upgrade delay: the instance's `currentContractClassId` is bumped, and the `ContractInstanceRegistry`'s delayed-public-mutable storage is rewritten to look like the upgrade was scheduled in the past.

```typescript
import { fastForwardContractUpdate } from '@aztec/aztec.js';

const stateOverrides = await fastForwardContractUpdate({
  instanceAddress: contract.address,
  newClassId: upgradedClass.id,
  node,
});

const result = await contract.methods.upgraded_method().simulate({ stateOverrides });
```

Use this to test code paths that only execute after an upgrade, without orchestrating the full delayed-mutable upgrade flow.

### Lower-level primitives

For composing override blobs by hand, two `spoof*` helpers are exposed:

- `spoofContractClassPublish(class)` returns `{ contractClasses: [class] }`. Useful for testing against a class that hasn't been published.
- `spoofContractInstancePublish(instance)` returns `{ contractInstances: [instance] }`. Throws if the instance's `currentContractClassId` differs from its `originalContractClassId` — divergence requires a coherent registry-storage override, which only `fastForwardContractUpdate` produces.

## Further reading

- [How to read contract data](./how_to_read_data.md)
- [How to send transactions](./how_to_send_transaction.md)
- [How to deploy a contract](./how_to_deploy_contract.md)
- [How to create an account](./how_to_create_account.md)
- [How to compile a contract](../aztec-nr/compiling_contracts.md)
