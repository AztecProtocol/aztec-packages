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

```typescript title="simulate_function" showLineNumbers 
const { result: balance } = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress });

console.log(`Alice's token balance: ${balance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_connection/index.ts#L151-L157" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_connection/index.ts#L151-L157</a></sub></sup>


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

```typescript title="simulate_with_metadata" showLineNumbers 
const metaResult = await token.methods
  .balance_of_public(aliceAddress)
  .simulate({ from: aliceAddress, includeMetadata: true });
console.log("Balance:", metaResult.result);
// `gasUsed` is the raw gas the simulation consumed; derive your own limits from it (see below).
console.log("L2 gas used:", metaResult.gasUsed!.totalGas.l2Gas);
console.log("DA gas used:", metaResult.gasUsed!.totalGas.daGas);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L355-L363" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L355-L363</a></sub></sup>


The result includes `result` (the function return value), `stats` (execution statistics), `offchainEffects`, and `gasUsed` (the raw gas the simulation consumed, with `totalGas` and `teardownGas`). Derive your own gas limits from `gasUsed` if you want to declare them explicitly; otherwise the wallet fills in the network's per-tx admission limits.

### Private function considerations

When simulating private functions, the caller must have access to any private state being read. The PXE only has visibility into notes belonging to registered accounts.

```typescript title="simulate_private_access" showLineNumbers 
// This works if aliceAddress owns the notes
const { result: privateBalance } = await token.methods
  .balance_of_private(aliceAddress)
  .simulate({ from: aliceAddress });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L492-L497" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L492-L497</a></sub></sup>


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

```typescript title="read_public_logs" showLineNumbers 
// Raw public logs are carried on each block's transaction effects.
const latestBlockNumber = await node.getBlockNumber();
const block = await node.getBlock(latestBlockNumber, {
  includeTransactions: true,
});
const publicLogs = block?.body.txEffects.flatMap((tx) => tx.publicLogs) ?? [];
if (publicLogs.length > 0) {
  const rawFields = publicLogs[0].getEmittedFields(); // Fr[]
  console.log("Raw log fields:", rawFields.length);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L365-L376" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L365-L376</a></sub></sup>


You can scope this to a single transaction (by locating its block and matching its tx hash) or to a block range (by reading each block's tx effects):

```typescript title="read_logs_by_filter" showLineNumbers 
// Get raw public logs for a specific transaction by locating its block and tx effect.
const txReceiptForLogs = await node.getTxReceipt(gsReceipt.txHash);
const txBlock = await node.getBlock(txReceiptForLogs.blockNumber!, {
  includeTransactions: true,
});
const txLogs =
  txBlock?.body.txEffects
    .filter((tx) => tx.txHash.equals(gsReceipt.txHash))
    .flatMap((tx) => tx.publicLogs) ?? [];

// Get raw public logs for a block range by reading each block's tx effects.
const tipBlockNumber = await node.getBlockNumber();
const rangeLogs = (
  await Promise.all(
    Array.from({ length: tipBlockNumber }, (_, i) => BlockNumber(i + 1)).map(
      async (blockNumber) => {
        const rangeBlock = await node.getBlock(blockNumber, {
          includeTransactions: true,
        });
        return rangeBlock?.body.txEffects.flatMap((tx) => tx.publicLogs) ?? [];
      },
    ),
  )
).flat();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L447-L472" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L447-L472</a></sub></sup>


## Reading events

Events provide typed access to contract emissions. The event metadata from your contract artifact (`Contract.events.EventName`) contains the ABI type information needed for decoding.

### Reading public events

Use the `getPublicEvents` helper to retrieve typed public events:

```typescript title="import_get_public_events" showLineNumbers 
import { getPublicEvents as _importCheck } from "@aztec/aztec.js/events";
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L483-L485" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L483-L485</a></sub></sup>


```typescript title="get_public_events" showLineNumbers 
const publicEventFilter: PublicEventFilter = {
  contractAddress: testLogContract.address,
  fromBlock: BlockNumber(firstTx.blockNumber!),
  toBlock: BlockNumber(lastTx.blockNumber! + 1),
};

const { events: collectedEvent0s } = await getPublicEvents<ExampleEvent0>(
  aztecNode,
  TestLogContract.events.ExampleEvent0,
  publicEventFilter,
);

const { events: collectedEvent1s } = await getPublicEvents<ExampleEvent1>(
  aztecNode,
  TestLogContract.events.ExampleEvent1,
  publicEventFilter,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/yarn-project/end-to-end/src/automine/effects/event_logs.test.ts#L148-L166" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/effects/event_logs.test.ts#L148-L166</a></sub></sup>


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

```typescript title="import_private_event_types" showLineNumbers 
import type { PrivateEventFilter } from "@aztec/aztec.js/wallet";
import { BlockNumber } from "@aztec/aztec.js/fields";
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L487-L490" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L487-L490</a></sub></sup>


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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/yarn-project/end-to-end/src/automine/effects/event_logs.test.ts#L77-L96" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/automine/effects/event_logs.test.ts#L77-L96</a></sub></sup>


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

```typescript title="poll_for_events" showLineNumbers 
// Poll for new events at regular intervals
let lastProcessedBlock = await node.getBlockNumber();

async function pollForTransferEvents() {
  const currentBlock = await node.getBlockNumber();

  if (currentBlock > lastProcessedBlock) {
    const { events } = await getPublicEvents<Transfer>(
      node,
      TokenContract.events.Transfer,
      {
        contractAddress: token.address,
        fromBlock: BlockNumber(lastProcessedBlock + 1),
        toBlock: BlockNumber(currentBlock + 1), // toBlock is exclusive
      },
    );

    for (const { event, metadata } of events) {
      // Process each transfer event
      console.log(
        `Transfer: ${event.amount} from ${event.from} to ${event.to}`,
      );
      console.log(
        `  in block ${metadata.l2BlockNumber}, tx ${metadata.txHash}`,
      );
    }

    lastProcessedBlock = currentBlock;
  }
}

// Example: poll once (in production, use setInterval)
await pollForTransferEvents();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0/docs/examples/ts/aztecjs_advanced/index.ts#L297-L331" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_advanced/index.ts#L297-L331</a></sub></sup>


For private events, use the same pattern with `wallet.getPrivateEvents()` and update the `fromBlock` in your filter accordingly.

## Next steps

- [Send transactions](./how_to_send_transaction.md) to modify contract state
- Learn about [call types](../foundational-topics/call_types.md) and when to use simulation vs transactions
- Explore [testing patterns](./how_to_test.md) that use simulation
