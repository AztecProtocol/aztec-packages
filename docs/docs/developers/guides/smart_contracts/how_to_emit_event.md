---
title: Emitting Events
tags: [contracts, events]
sidebar_position: 6
description: Emit structured events and logs from your Aztec smart contracts for off-chain applications.
---

This guide shows you how to emit events and logs from your Aztec contracts to communicate with off-chain applications.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private vs public functions in Aztec
- Basic knowledge of event handling in blockchain applications

## Emit private events

### Emit encrypted events

Use encrypted events to send private data to specific recipients:

```rust
emit_event_in_private(
    MyEvent { param1, param2, param3 },
    &mut context,
    recipient,
    MessageDelivery.UNCONSTRAINED_ONCHAIN,
);
```

### Choose encryption method

- `encode_and_encrypt_event`: Constrained encryption, guarantees correct recipient
- `encode_and_encrypt_event_unconstrained`: Faster but trusts sender, may lose events

### Event processing

Events are automatically discovered and decrypted by the PXE when contract functions are invoked.

## Emit public events

Emit structured public events using the `emit` function:

```rust
emit_event_in_public_log(
    MyPublicEvent { field1: values[0], field2: values[1] },
    &mut context,
);
```

## Emit public logs

### Emit unstructured data

Emit unstructured public logs using `emit_public_log`:

```rust
context.emit_public_log(/*message=*/ my_value);
context.emit_public_log(/*message=*/ [1, 2, 3]);
context.emit_public_log(/*message=*/ "My message");
```

### Query public events

Query public events from off-chain applications:

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
