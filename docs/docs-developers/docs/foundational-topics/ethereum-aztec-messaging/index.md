---
id: portals
title: L1 <--> L2 communication (Portals)
description: A conceptual introduction to Portals and how Aztec communicates with L1 (Ethereum)
keywords: [portals]
tags: [portals, protocol, ethereum]
sidebar_position: 12
references: ["l1-contracts/src/core/messagebridge/*", "l1-contracts/src/core/Rollup.sol", "noir-projects/labs/aztec-nr/aztec/src/messaging.nr"]
---

# L1-L2 Communication (Portals)

import Image from "@theme/IdealImage";

In Aztec, _portals_ facilitate communication between L1 and L2. Unlike typical L2 solutions that rely on synchronous communication, Aztec's privacy-first design and the way transactions are processed (kernel proofs built on historical data) make direct calls between L1 and L2 impossible while maintaining privacy. Portals solve this by acting as bridges for asynchronous message passing, transmitting messages from public functions in L1 to private functions in L2 and vice versa.

## Objective

The goal is to set up a minimal-complexity mechanism, that will allow a base-layer (L1) and the Aztec Network (L2) to communicate arbitrary messages such that:

- L2 functions can `call` L1 functions.
- L1 functions can `call` L2 functions.
- Messages have minimal impact on rollup block size.

## High Level Overview

This document will contain communication abstractions that we use to support interaction between _private_ functions, _public_ functions and Layer 1 portal contracts.

Fundamental restrictions for Aztec:

- L1 and L2 have very different execution environments. Operations that are cheap on L1 are often expensive on L2 and vice versa. For example, `keccak256` is cheap on L1 but very expensive on L2.
- _Private_ function calls are fully "prepared" and proven by the user, which provides the kernel proof along with commitments and nullifiers to the sequencer.
- _Public_ functions altering public state (updatable storage) must be executed at the current "head" of the chain, which only the sequencer can ensure, so these must be executed separately to the _private_ functions.
- _Private_ and _public_ functions within Aztec are therefore ordered such that _private_ functions are executed first, then _public_ functions.
- Messages are consumables, and can only be consumed by the recipient. See [Message Boxes](#message-boxes) for more information.

With the aforementioned restrictions taken into account, cross-chain messages can be operated in a similar manner to when _public_ functions must transmit information to _private_ functions. In such a scenario, a "message" is created and conveyed to the recipient for future use. It is worth noting that any call made between different domains (_private, public, cross-chain_) is unilateral in nature. In other words, the caller is unaware of the outcome of the initiated call until told when some later rollup is executed (if at all). This can be regarded as message passing, providing us with a consistent mental model across all domains, which is convenient.

As an illustration, suppose a private function adds a cross-chain call. In such a case, the private function would not have knowledge of the result of the cross-chain call within the same rollup (since it has yet to be executed).

Similarly to the ordering of private and public functions, we can also reap the benefits of intentionally ordering messages between L1 and L2. When a message is sent from L1 to L2, it has been "emitted" by an action in the past (an L1 interaction), allowing us to add it to the list of consumables at the "beginning" of the block execution. This practical approach means that a message could be consumed in the same block it is included. In a sophisticated setup, rollup $n$ could send an L2 to L1 message that is then consumed on L1, and the response is added already in $n+1$. However, messages going from L2 to L1 will be added as they are emitted.

:::info
Because everything is unilateral and async, application developers must explicitly handle failure cases so users can gracefully recover. Token bridges are a prime example: it would be very inconvenient if funds are locked on one domain but never minted or unlocked on the other.
:::

## Components

### Portal

A "portal" refers to the part of an application residing on L1, which is associated with a particular L2 address (the confidential part of the application). It could be a contract or even an EOA on L1.

### Message Boxes

In a logical sense, a Message Box functions as a one-way message passing mechanism with two ends, one residing on each side of the divide, i.e., one component on L1 and another on L2. Essentially, these boxes are utilized to transmit messages between L1 and L2 via the rollup contract. The boxes can be envisaged as multi-sets that enable the same message to be inserted numerous times, a feature that is necessary to accommodate scenarios where, for instance, "deposit 10 eth to A" is required multiple times. The diagram below provides a detailed illustration of how one can perceive a message box in a logical context.

<Image img={require("@site/static/img/com-abs-5.png")} />

- Here, a `sender` will insert a message into the `pending` set, the specific constraints of the actions depend on the implementation domain, but for now, say that anyone can insert into the pending set.
- At some point, a rollup will be executed, in this step messages are "moved" from pending on Domain A, to ready on Domain B. Note that consuming the message is "pulling & deleting" (or nullifying). The action is atomic, so a message that is consumed from the pending set MUST be added to the ready set, or the state transition should fail. A further constraint is that the `sender` and `recipient` version fields must match the version of their respective inbox/outbox contracts.
- When the message has been added to the ready set, the `recipient` can consume the message as part of a function call.

A difference when compared to other cross-chain setups, is that Aztec is "pulling" messages, and that the message doesn't need to be calldata for a function call. For other rollups, execution is happening FROM the "message bridge", which then calls the L1 contract. For Aztec, you call the L1 contract, and it should then consume messages from the message box.

Why pull instead of push? Privacy. Pushing would require full calldata, which would publicly expose inputs to private functions since L1 → L2 transaction calldata is committed on L1.

By instead pulling, we can have the "message" be something that is derived from the arguments instead. This way, a private function to perform second half of a deposit, leaks the "value" deposited and "who" made the deposit (as this is done on L1), but the new owner can be hidden on L2.

To support messages in both directions we require two of these message boxes (one in each direction). However, due to the limitations of each domain, the message box for sending messages into the rollup and sending messages out are not fully symmetrical. In reality, the setup looks closer to the following:

<Image img={require("@site/static/img/com-abs-6.png")} />

:::info
The L2 -> L1 pending messages set only exist logically, as it is practically unnecessary. For anything to happen to the L2 state (e.g., update the pending messages), the state will be updated on L1, meaning that we could just as well insert the messages directly into the ready set.
:::

### Rollup Contract

The rollup contract has a few very important responsibilities. The contract must keep track of the _L2 rollup state root_, perform _state transitions_ and ensure that the data is available for anyone else to synchronize to the current state.

To ensure that _state transitions_ are performed correctly, the contract will derive public inputs for the **rollup circuit** based on the input data, and then use a _verifier_ contract to validate that inputs correctly transition the current state to the next. All data needed for the public inputs to the circuit must be from the rollup block, ensuring that the block is available. For a valid proof, the _rollup state root_ is updated and it will emit an _event_ to make it easy for anyone to find the data.

As part of _state transitions_ where cross-chain messages are included, the contract must "move" messages along the way, e.g., from "pending" to "ready".

### Kernel Circuit

For L2 to L1 messages, the kernel circuit's public inputs contain a dynamic array of messages, limited to `MAX_L2_TO_L1_MSGS_PER_TX` to ensure transactions can always be included. The circuit scopes each message to the contract address that emitted it, ensuring the sender cannot be spoofed.

When consuming L1 to L2 messages, user contracts call `process_l1_to_l2_message()` which verifies the message exists in the L1 to L2 message tree and creates a nullifier to prevent double-consumption. The kernel circuit accumulates these nullifiers in its public inputs.

### Rollup Circuit

The rollup circuit must ensure that, provided two states $S$ and $S'$ and the rollup block $B$, applying $B$ to $S$ using the transition function must give us $S'$, e.g., $T(S, B) \mapsto S'$. If this is not the case, the constraints are not satisfied.

For cross-chain messages, this means inserting and nullifying L1 → L2 messages in the trees and publishing L2 → L1 messages on chain.

### Messages

While a message could theoretically be arbitrarily long, we want to limit the cost of the insertion on L1 as much as possible. Therefore, we allow the users to send 32 bytes of "content" between L1 and L2. If 32 suffices, no packing required. If the 32 is too "small" for the message directly, the sender should simply pass along a `sha256(content)` instead of the content directly (note that this hash should fit in a field element which is ~254 bits. More info on this below). The content can then either be emitted as an event on L2 or kept by the sender, who should then be the only entity that can "unpack" the message.
In this manner, there is some way to "unpack" the content on the receiving domain.

The message that is passed along requires the `sender/recipient` pair to be communicated as well (we need to know who should receive the message and be able to check). By having the pending messages be a contract on L1, we can ensure that the `sender = msg.sender` and let only `content` and `recipient` be provided by the caller. We only store the commitment (`sha256(LxToLyMsg)`) on chain or in the trees, so we only need to update a single storage slot per message.

See the [Data Structures](./data_structures.md) page for the full message structure definitions (`L1Actor`, `L2Actor`, `L1ToL2Msg`, `L2ToL1Msg`).

:::info
The `bytes32` elements for `content` and `secretHash` hold values that must fit in a field element (~ 254 bits).
:::

:::info
The nullifier computation should include the index of the message in the message tree to ensure that it is possible to send duplicate messages (e.g., 2 x deposit of 500 dai to the same account).

To make it possible to hide when a specific message is consumed, the `L1ToL2Msg` is extended with a `secretHash` field, where the `secretPreimage` is used as part of the nullifier computation. This way, it is not possible for someone just seeing the `L1ToL2Msg` on L1 to know when it is consumed on L2.
:::

## Combined Architecture

The following diagram shows the overall architecture, combining the earlier sections.

<Image img={require("@site/static/img/com-abs-7.png")} />

## Using the L1 contract interfaces in your own project

Portal contracts import Aztec's L1 interfaces (`IRegistry`, `IInbox`, `IOutbox`, `IRollup`, and supporting libraries). These ship in the [`@aztec/l1-artifacts`](https://www.npmjs.com/package/@aztec/l1-artifacts) npm package as a self-contained Foundry project under `l1-contracts/`, versioned to match each Aztec release:

```bash
npm install @aztec/l1-artifacts@<aztec-version>
```

In a Foundry project, add remappings so `@aztec/*` imports (and the bundled OpenZeppelin copy) resolve into the package:

```toml
# foundry.toml
remappings = [
  "@aztec/=node_modules/@aztec/l1-artifacts/l1-contracts/src/",
  "@oz/=node_modules/@aztec/l1-artifacts/l1-contracts/lib/openzeppelin-contracts/contracts/",
  "@aztec-blob-lib/=node_modules/@aztec/l1-artifacts/l1-contracts/src/core/libraries/rollup/"
]
```

Then import interfaces as `@aztec/core/interfaces/IRollup.sol`, `@aztec/governance/interfaces/IRegistry.sol`, and so on. Note that `forge install` cannot fetch the package: it only clones whole git repositories, and the L1 contract sources include generated files that exist only in built distributions, so npm is the supported channel.

In a Hardhat project, import with full package paths (`@aztec/l1-artifacts/l1-contracts/src/core/interfaces/IRollup.sol`), or configure equivalent aliases pointing at `node_modules/@aztec/l1-artifacts/l1-contracts/src`.

## See also

- [Communicating Cross-Chain](../../aztec-nr/framework-description/ethereum_aztec_messaging.md) - Practical guide with code examples for L1-L2 messaging
- [Data Structures](./data_structures.md) - Message and actor type definitions
- [Inbox](./inbox.md) - L1 contract for sending messages to L2
- [Outbox](./outbox.md) - L1 contract for consuming messages from L2
