---
title: Reading Contract Data
tags: [functions, simulation, events, logs]
sidebar_position: 5
description: How to read data from contracts including simulating functions, reading logs, and retrieving events.
---

This guide shows you how to read data from Aztec contracts in TypeScript, including simulating function calls, reading raw logs, and retrieving typed events.

import { General } from '@site/src/components/Snippets/general_snippets';

## Prerequisites

- <General.AztecJSPrerequisites />
- A deployed contract instance (see [How to Deploy a Contract](./how_to_deploy_contract.md))

## Simulating functions

The `simulate` method executes a contract function locally and returns its result. It works with private, public, and utility functions. No transaction is created and no gas is spent.

#include_code simulate_function /docs/examples/ts/aztecjs_connection/index.ts typescript

The `from` option specifies which account context to use for the simulation. This is required for all simulations. For private functions, it determines which account's private state is accessed. For public functions, it sets the `msg_sender` context.

### Handling return values

For functions returning multiple values, destructure the result:

```typescript
// contract and callerAddress are from the example above
const { result: [value1, value2] } = await contract.methods
  .get_multiple_values()
  .simulate({ from: callerAddress });
```

### Including metadata

Set `includeMetadata: true` to get additional information about the simulation:

#include_code simulate_with_metadata /docs/examples/ts/aztecjs_advanced/index.ts typescript

The result includes `result` (the function return value), `stats` (execution statistics), `offchainEffects`, and `gasUsed` (the raw gas the simulation consumed, with `totalGas` and `teardownGas`). Derive your own gas limits from `gasUsed` if you want to declare them explicitly; otherwise the wallet fills in the network's per-tx admission limits.

### Private function considerations

When simulating private functions, the caller must have access to any private state being read. The PXE only has visibility into notes belonging to registered accounts.

#include_code simulate_private_access /docs/examples/ts/aztecjs_advanced/index.ts typescript

If the caller doesn't have access to another address's notes, the simulation will fail with an error.

:::tip
If `.simulate()` is prompting the user to sign every call, or failing with `min_revertible_side_effect_counter must not be 0` when you pass `from: AztecAddress.ZERO`, see [Simulate without signing prompts](./how_to_simulate_without_signing.md).
:::

:::warning
Simulation runs locally without generating proofs. No correctness guarantees are provided on the result. See [Call Types](../foundational-topics/call_types.md#simulate) for more details.
:::

## Reading logs vs events

Contracts emit data in two forms you can read:

| Aspect             | Logs                        | Events                                             |
| ------------------ | --------------------------- | -------------------------------------------------- |
| **What**           | Raw field arrays (untyped)  | Decoded domain objects with type info              |
| **Storage**        | Archiver (node-level)       | PXE (client-level) for private events              |
| **API**            | `aztecNode.getBlock()` tx effects | `wallet.getPrivateEvents()` or `getPublicEvents()` |
| **Type awareness** | None - raw `Fr[]` data      | Requires ABI metadata to decode                    |

**Logs** are the low-level transport layer, while **events** are the semantic application layer decoded using ABI metadata from your contract.

## Reading raw public logs

Raw public logs are carried on each block's transaction effects. Fetch a block with `includeTransactions: true` and read `body.txEffects[*].publicLogs`:

#include_code read_public_logs /docs/examples/ts/aztecjs_advanced/index.ts typescript

You can scope this to a single transaction (by locating its block and matching its tx hash) or to a block range (by reading each block's tx effects):

#include_code read_logs_by_filter /docs/examples/ts/aztecjs_advanced/index.ts typescript

## Reading events

Events provide typed access to contract emissions. The event metadata from your contract artifact (`Contract.events.EventName`) contains the ABI type information needed for decoding.

### Reading public events

Use the `getPublicEvents` helper to retrieve typed public events:

#include_code import_get_public_events /docs/examples/ts/aztecjs_advanced/index.ts typescript

#include_code get_public_events yarn-project/end-to-end/src/e2e_event_logs.test.ts typescript

The function parameters are:

- `aztecNode` - The node to query
- `Contract.events.EventName` - Event metadata from the contract artifact (contains the event selector)
- `filter` - An object with optional fields:
  - `fromBlock` - Starting block number (inclusive)
  - `toBlock` - Ending block number (exclusive)
  - `contractAddress` - Filter to a specific contract
  - `txHash` - Filter to a specific transaction

Each returned event includes both the decoded `event` data and `metadata` (block number, block hash, tx hash, contract address).

### Reading private events

Private events are stored in the PXE with privacy scoping. Use `wallet.getPrivateEvents()` to retrieve them:

#include_code import_private_event_types /docs/examples/ts/aztecjs_advanced/index.ts typescript

The `BlockNumber` type is a branded type that wraps raw numbers for type safety. Use it when setting `fromBlock` and `toBlock` in filters.

#include_code get_private_events yarn-project/end-to-end/src/e2e_event_logs.test.ts typescript

The `PrivateEventFilter` includes:

- `contractAddress` - The contract that emitted the events
- `fromBlock` / `toBlock` - Block range to search
- `scopes` - Array of account addresses whose private state is being queried
- `txHash` (optional) - Filter to a specific transaction

Private events return objects with an `event` property containing the decoded data:

```typescript
collectedEvents.forEach((ev) => {
  console.log(ev.event.value0); // Access event fields via .event
});
```

## Polling for events

To continuously monitor for new events, poll at regular intervals while tracking the last processed block:

#include_code poll_for_events /docs/examples/ts/aztecjs_advanced/index.ts typescript

For private events, use the same pattern with `wallet.getPrivateEvents()` and update the `fromBlock` in your filter accordingly.

## Next steps

- [Send transactions](./how_to_send_transaction.md) to modify contract state
- Learn about [call types](../foundational-topics/call_types.md) and when to use simulation vs transactions
- Explore [testing patterns](./how_to_test.md) that use simulation
