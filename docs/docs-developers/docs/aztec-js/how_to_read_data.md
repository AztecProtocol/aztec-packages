---
title: Reading Contract Data
tags: [functions, simulation, events, logs]
sidebar_position: 5
description: How to read data from contracts including simulating functions, reading logs, and retrieving events.
---

This guide shows you how to read data from Aztec contracts in TypeScript, including simulating function calls, reading raw logs, and retrieving typed events.

## Prerequisites

- [Connected to a network](./how_to_connect_to_local_network.md) with a `EmbeddedWallet` instance and funded accounts
- A deployed contract instance (see [How to Deploy a Contract](./how_to_deploy_contract.md))

## Simulating functions

The `simulate` method executes a contract function locally and returns its result. It works with private, public, and utility functions. No transaction is created and no gas is spent.

#include_code simulate_function /docs/examples/ts/aztecjs_connection/index.ts typescript

The `from` option specifies which address context to use for the simulation. This is required for all simulations, though it only affects private function execution (public functions ignore this value).

### Basic simulation

#include_code simulate_function yarn-project/end-to-end/src/composed/docs_examples.test.ts typescript

### Handling return values

For functions returning multiple values, destructure the result:

```typescript
// contract and callerAddress are from the example above
const [value1, value2] = await contract.methods
  .get_multiple_values()
  .simulate({ from: callerAddress });
```

### Including metadata

Set `includeMetadata: true` to get additional information about the simulation:

```typescript
// contract and callerAddress are from the examples above
const result = await contract.methods
  .balance_of_public(address)
  .simulate({ from: callerAddress, includeMetadata: true });

// Result includes:
// - result: the function return value
// - stats: execution statistics (timing, circuit sizes)
// - offchainEffects: any offchain effects emitted
// - estimatedGas: gas limit estimates (gasLimits and teardownGasLimits)
console.log("Balance:", result.result);
console.log("L2 gas limit:", result.estimatedGas.gasLimits.l2Gas);
console.log("DA gas limit:", result.estimatedGas.gasLimits.daGas);
```

### Private function considerations

When simulating private functions, the caller must have access to any private state being read. The PXE only has visibility into notes belonging to registered accounts.

```typescript
// contract and callerAddress are from the examples above
// This works if callerAddress owns the notes
const balance = await contract.methods
  .balance_of_private(callerAddress)
  .simulate({ from: callerAddress });

// This fails if callerAddress doesn't have access to otherAddress's notes
const otherBalance = await contract.methods
  .balance_of_private(otherAddress)
  .simulate({ from: callerAddress }); // Error: cannot access private state
```

:::warning
Simulation runs locally without generating proofs. No correctness guarantees are provided on the result. See [Call Types](../foundational-topics/call_types.md#simulate) for more details.
:::

## Reading logs vs events

Contracts emit data in two forms you can read:

| Aspect             | Logs                        | Events                                             |
| ------------------ | --------------------------- | -------------------------------------------------- |
| **What**           | Raw field arrays (untyped)  | Decoded domain objects with type info              |
| **Storage**        | Archiver (node-level)       | PXE (client-level) for private events              |
| **API**            | `aztecNode.getPublicLogs()` | `wallet.getPrivateEvents()` or `getPublicEvents()` |
| **Type awareness** | None - raw `Fr[]` data      | Requires ABI metadata to decode                    |

**Logs** are the low-level transport layer, while **events** are the semantic application layer decoded using ABI metadata from your contract.

## Reading raw public logs

Use `aztecNode.getPublicLogs()` to retrieve raw log data:

```typescript
// aztecNode is from createAztecNodeClient() in the connection guide
// receipt is from a transaction's send() call
// Get logs for a specific transaction
const logs = await aztecNode.getPublicLogs({ txHash: receipt.txHash });
const rawFields = logs.logs[0].log.getEmittedFields(); // Fr[]

// Get logs for a block range
const logFilter = {
  fromBlock: startBlock,
  toBlock: endBlock,
};
const publicLogs = (await aztecNode.getPublicLogs(logFilter)).logs;
```

## Reading events

Events provide typed access to contract emissions. The event metadata from your contract artifact (`Contract.events.EventName`) contains the ABI type information needed for decoding.

### Reading public events

Use the `getPublicEvents` helper to retrieve typed public events:

```typescript
import { getPublicEvents } from "@aztec/aztec.js/events";
```

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

```typescript
import type { PrivateEventFilter } from "@aztec/aztec.js/wallet";
import { BlockNumber } from "@aztec/foundation/branded-types";
```

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
