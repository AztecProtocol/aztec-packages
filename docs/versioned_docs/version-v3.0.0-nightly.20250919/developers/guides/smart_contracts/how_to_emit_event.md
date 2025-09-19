---
title: Emitting Events
tags: [contracts, events]
sidebar_position: 5
description: Learn how to emit events from your Aztec smart contracts for offchain applications to consume.
---

This guide shows you how to emit events and logs from your Aztec contracts to communicate with offchain applications.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private vs public functions in Aztec
- Basic knowledge of event handling in blockchain applications

## Emit private events

### Emit encrypted events

Use encrypted events to send private data to specific recipients:

```rust
// Import from aztec.nr
use aztec::event::event_emission::emit_event_in_private;

emit_event_in_private(
    MyEvent { param1, param2, param3 },
    &mut context,
    recipient,
    MessageDelivery.UNCONSTRAINED_ONCHAIN,
);
```

:::note
Developer can choose whether to emit encrypted events or not. Emitting the events means that they will be posted to Ethereum, in blobs, and will inherit the availability guarantees of Ethereum. Developers may choose not to emit events and to share information with recipients offchain, or through alternative mechanisms that are to be developed (e.g. alternative, cheaper data availability solutions).
:::

The `MessageDelivery` enum provides three modes:

- `MessageDelivery.CONSTRAINED_ONCHAIN` (value: 1): Constrained encryption, guarantees correct recipient
- `MessageDelivery.UNCONSTRAINED_ONCHAIN` (value: 2): Faster but trusts sender, may lose events if tagged incorrectly
- `MessageDelivery.UNCONSTRAINED_OFFCHAIN` (value: 3): Lowest cost, requires custom offchain infrastructure

### Event processing

Events are automatically discovered and decrypted by the PXE when contract functions are invoked.

## Emit public events

Emit structured public events using the `emit` function:

```rust
// Import from aztec.nr
use aztec::event::event_emission::emit_event_in_public;

emit_event_in_public(
    MyPublicEvent { field1: values[0], field2: values[1] },
    &mut context,
);
```

## Emit public logs

### Emit unstructured data

Emit unstructured public logs using `emit_public_log`:

```rust
context.emit_public_log(my_value);
context.emit_public_log([1, 2, 3]);
context.emit_public_log("My message");
```

### Query public events

Query public events from offchain applications:

```typescript
const fromBlock = await pxe.getBlockNumber();
const logFilter = {
  fromBlock,
  toBlock: fromBlock + 1,
};
const publicLogs = (await pxe.getPublicLogs(logFilter)).logs;
```

## Consider costs

Event data is published to Ethereum as blobs, which incurs costs. Consider:

- Encrypted events are optional - use alternative communication methods if needed
- Future alternatives for data availability may become available
- Balance event utility with cost implications
