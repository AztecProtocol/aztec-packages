---
title: Emitting Events
tags: [contracts, events]
sidebar_position: 7
description: Learn how to emit events from your Aztec smart contracts for offchain applications to consume.
---

Events allow contracts to communicate with offchain applications. Private events are encrypted and delivered to specific recipients, while public events are visible to everyone.

## Prerequisites

- An Aztec contract project set up with `aztec-nr` dependency
- Understanding of private vs public functions in Aztec

## Define an event

Declare events using the `#[event]` attribute:

```rust
#[event]
struct Transfer {
    from: AztecAddress,
    to: AztecAddress,
    amount: u128,
}
```

## Emit private events

In private functions, emit events using `self.emit()` and deliver them to recipients:

```rust
use aztec::messages::message_delivery::MessageDelivery;

#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    let from = self.msg_sender().unwrap();

    // ... transfer logic ...

    self.emit(Transfer { from, to, amount }).deliver_to(
        to,
        MessageDelivery.UNCONSTRAINED_ONCHAIN,
    );
}
```

:::warning
You **must** call `deliver_to()` on the returned `EventMessage`. If you don't, the event information is lost forever. The compiler will warn you about unused `EventMessage` values.
:::

### Deliver to multiple recipients

You can deliver the same event to multiple recipients with different delivery modes:

```rust
let message = self.emit(Transfer { from, to, amount });
message.deliver_to(from, MessageDelivery.UNCONSTRAINED_OFFCHAIN);
message.deliver_to(to, MessageDelivery.CONSTRAINED_ONCHAIN);
```

The `MessageDelivery` options are:

- **`CONSTRAINED_ONCHAIN`** - Constrained encryption with onchain delivery. Slowest proving but provides cryptographic guarantees that recipients can decrypt messages.
- **`UNCONSTRAINED_ONCHAIN`** - Unconstrained encryption with onchain delivery. Faster proving, but trusts the sender to encrypt correctly.
- **`UNCONSTRAINED_OFFCHAIN`** - Unconstrained encryption with offchain delivery. Lowest cost, but requires custom infrastructure to deliver messages to recipients.

:::note
Emitting private events is optional. Onchain delivery publishes encrypted data to Ethereum blobs, inheriting Ethereum's data availability guarantees. You can choose to share information offchain instead.
:::

## Emit public events

In public functions, emit events using `self.emit()`:

```rust
#[external("public")]
fn update_value(value: Field) {
    // ... update logic ...

    self.emit(ValueUpdated { value });
}
```

Public events are emitted as plaintext logs, similar to Solidity events.

## Emit unstructured public logs

For unstructured data, use `emit_public_log` directly on the context:

```rust
self.context.emit_public_log("My message");
self.context.emit_public_log([1, 2, 3]);
```

## Query public logs

Query public logs from offchain applications using the Aztec node:

```typescript
const fromBlock = await node.getBlockNumber();
const logFilter = {
  fromBlock,
  toBlock: fromBlock + 1,
};
const publicLogs = (await node.getPublicLogs(logFilter)).logs;
```

## Cost considerations

Event data published onchain is stored in Ethereum blobs, which incurs costs. Consider:

- Use `UNCONSTRAINED_OFFCHAIN` delivery for lower costs when you have custom delivery infrastructure
- Only emit events when necessary for your application's functionality

## Next steps

- Learn about [storage](./state_variables.md) to persist data in your contracts
- Explore [calling other contracts](./how_to_call_contracts.md) for cross-contract interactions
- Understand [cross-chain communication](./how_to_communicate_cross_chain.md) between Ethereum and Aztec
