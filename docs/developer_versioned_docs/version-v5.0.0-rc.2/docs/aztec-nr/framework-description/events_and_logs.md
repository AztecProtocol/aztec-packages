---
title: Events and Logs
tags: [contracts, events]
sidebar_position: 8
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
use aztec::messages::delivery::MessageDelivery;

#[external("private")]
fn transfer(to: AztecAddress, amount: u128) {
    let from = self.msg_sender();

    // ... transfer logic ...

    self.emit(Transfer { from, to, amount }).deliver_to(
        to,
        MessageDelivery::onchain_unconstrained(),
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
message.deliver_to(from, MessageDelivery::offchain());
message.deliver_to(to, MessageDelivery::onchain_constrained());
```

The `MessageDelivery` options are:

- **`onchain_constrained()`** - Constrained encryption with onchain delivery. Slowest proving but provides cryptographic guarantees that recipients can decrypt messages.
- **`onchain_unconstrained()`** - Unconstrained encryption with onchain delivery. Faster proving, but trusts the sender to encrypt correctly.
- **`offchain()`** - Unconstrained encryption with offchain delivery. Lowest cost, but requires custom infrastructure to deliver messages to recipients.

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

For unstructured data, use `emit_public_log_unsafe` directly on the context. It takes a tag (placed at the first field of the emitted log, which nodes use to index logs) followed by the data:

```rust
self.context.emit_public_log_unsafe(0, "My message");
self.context.emit_public_log_unsafe(0, [1, 2, 3]);
```

The tag should be domain-separated to prevent collisions with unrelated log types. Prefer `self.emit(event)` where possible, which handles tagging automatically.

## Query public logs

Query public logs from offchain applications using the Aztec node. Raw public logs are
attached to each block's transaction effects — fetch a block with `includeTransactions: true`
and read `body.txEffects[*].publicLogs`:

```typescript
const blockNumber = await node.getBlockNumber();
const block = await node.getBlock(blockNumber, { includeTransactions: true });
const publicLogs = block?.body.txEffects.flatMap(tx => tx.publicLogs) ?? [];
```

## Cost considerations

Event data published onchain is stored in Ethereum blobs, which incurs costs. Consider:

- Use `OFFCHAIN` delivery for lower costs when you have custom delivery infrastructure
- Only emit events when necessary for your application's functionality

## Next steps

- Learn about [storage](./state_variables.md) to persist data in your contracts
- Explore [calling other contracts](./calling_contracts.md) for cross-contract interactions
- Understand [cross-chain communication](./ethereum_aztec_messaging.md) between Ethereum and Aztec
