---
title: Reading Contract Data
tags: [functions, simulation, events, logs]
sidebar_position: 5
description: How to read data from contracts including simulating functions, reading logs, and retrieving events.
---

This guide shows you how to read data from Aztec contracts in TypeScript, including simulating function calls, reading raw logs, and retrieving typed events.

## Prerequisites

- A deployed contract instance (see [How to Deploy a Contract](./how_to_deploy_contract.md))
- A wallet connection (see [How to Create an Account](./how_to_create_account.md))

## Simulating functions

The `simulate` method executes a contract function locally and returns its result. It works with private, public, and utility functions. No transaction is created and no gas is spent.

```typescript
const result = await contract.methods
  .myFunction(arg1, arg2)
  .simulate({ from: callerAddress });
```

The `from` option specifies which address context to use for the simulation. This is required for all simulations, though it only affects private function execution (public functions ignore this value).

### Basic simulation

```typescript title="simulate_function" showLineNumbers 
const balance = await contract.methods.balance_of_public(newAccountAddress).simulate({ from: newAccountAddress });
expect(balance).toEqual(1n);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260202/yarn-project/end-to-end/src/composed/docs_examples.test.ts#L48-L51" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/composed/docs_examples.test.ts#L48-L51</a></sub></sup>


### Handling return values

For functions returning multiple values, destructure the result:

```typescript
const [value1, value2] = await contract.methods
  .get_multiple_values()
  .simulate({ from: callerAddress });
```

### Including metadata

Set `includeMetadata: true` to get additional information about the simulation:

```typescript
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

| Aspect             | Logs                        | Events                                                    |
| ------------------ | --------------------------- | --------------------------------------------------------- |
| **What**           | Raw field arrays (untyped)  | Decoded domain objects with type info                     |
| **Storage**        | Archiver (node-level)       | PXE (client-level) for private events                     |
| **API**            | `aztecNode.getPublicLogs()` | `wallet.getPrivateEvents()` or `getDecodedPublicEvents()` |
| **Type awareness** | None - raw `Fr[]` data      | Requires ABI metadata to decode                           |

**Logs** are the low-level transport layer, while **events** are the semantic application layer decoded using ABI metadata from your contract.

## Reading raw public logs

Use `aztecNode.getPublicLogs()` to retrieve raw log data:

```typescript
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

Use the `getDecodedPublicEvents` helper to retrieve typed public events:

```typescript
import { getDecodedPublicEvents } from "@aztec/aztec.js/events";
```

```typescript title="get_public_events" showLineNumbers 
const collectedEvent0s = await getDecodedPublicEvents<ExampleEvent0>(
  aztecNode,
  TestLogContract.events.ExampleEvent0,
  firstTx.blockNumber!,
  lastTx.blockNumber! - firstTx.blockNumber! + 1,
);

const collectedEvent1s = await getDecodedPublicEvents<ExampleEvent1>(
  aztecNode,
  TestLogContract.events.ExampleEvent1,
  firstTx.blockNumber!,
  lastTx.blockNumber! - firstTx.blockNumber! + 1,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260202/yarn-project/end-to-end/src/e2e_event_logs.test.ts#L132-L146" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_event_logs.test.ts#L132-L146</a></sub></sup>


The function parameters are:

- `aztecNode` - The node to query
- `Contract.events.EventName` - Event metadata from the contract artifact (contains the event selector)
- `fromBlock` - Starting block number
- `limit` - Number of blocks to search

:::note
This function queries all public logs in the block range and filters by **event selector**, not by contract address. If multiple contracts emit events with the same selector, they will all be returned.
:::

### Reading private events

Private events are stored in the PXE with privacy scoping. Use `wallet.getPrivateEvents()` to retrieve them:

```typescript
import type { PrivateEventFilter } from "@aztec/aztec.js/wallet";
import { BlockNumber } from "@aztec/foundation/branded-types";
```

The `BlockNumber` type is a branded type that wraps raw numbers for type safety. Use it when setting `fromBlock` and `toBlock` in filters.

```typescript title="get_private_events" showLineNumbers 
const eventFilter: PrivateEventFilter = {
  contractAddress: testLogContract.address,
  fromBlock: BlockNumber(firstBlockNumber),
  toBlock: BlockNumber(lastBlockNumber + 1),
  scopes: [account1Address, account2Address],
};

// Each emit_encrypted_events call emits 2 ExampleEvent0s and 1 ExampleEvent1
// So with 5 calls we expect 10 ExampleEvent0s and 5 ExampleEvent1s
const collectedEvent0s = await wallet.getPrivateEvents<ExampleEvent0>(
  TestLogContract.events.ExampleEvent0,
  eventFilter,
);

const collectedEvent1s = await wallet.getPrivateEvents<ExampleEvent1>(
  TestLogContract.events.ExampleEvent1,
  eventFilter,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v4.0.0-nightly.20260202/yarn-project/end-to-end/src/e2e_event_logs.test.ts#L63-L82" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_event_logs.test.ts#L63-L82</a></sub></sup>


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

```typescript
import { BlockNumber } from "@aztec/foundation/branded-types";

let lastProcessedBlock = startBlock; // BlockNumber type

async function pollForEvents() {
  const currentBlock = await aztecNode.getBlockNumber();

  if (currentBlock > lastProcessedBlock) {
    const events = await getDecodedPublicEvents<Transfer>(
      aztecNode,
      TokenContract.events.Transfer,
      lastProcessedBlock + 1,
      currentBlock - lastProcessedBlock
    );

    for (const event of events) {
      // Process each event
      console.log(`Transfer: ${event.amount} from ${event.from}`);
    }

    lastProcessedBlock = currentBlock;
  }
}

// Poll every 10 seconds
setInterval(pollForEvents, 10000);
```

For private events, use the same pattern with `wallet.getPrivateEvents()` and update the `fromBlock` in your filter accordingly.

## Next steps

- [Send transactions](./how_to_send_transaction.md) to modify contract state
- Learn about [call types](../foundational-topics/call_types.md) and when to use simulation vs transactions
- Explore [testing patterns](./how_to_test.md) that use simulation
