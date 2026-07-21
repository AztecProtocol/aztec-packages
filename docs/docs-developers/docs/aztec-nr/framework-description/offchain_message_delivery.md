---
title: Offchain message delivery
tags: [storage, concepts, notes]
description: Deliver notes and events to recipients through your own channel with offchain message delivery, avoiding data availability costs entirely.
sidebar_position: 4
---

Offchain message delivery lets you send notes and events to recipients without posting any data onchain. The encrypted message is returned to the sender's application, which transports it to the recipient through its own channel: a link, a QR code, a direct message, or any other medium. This eliminates data availability (DA) costs and adds zero proving time, at the cost of the application handling transport itself.

This page walks through the complete workflow. For guidance on when offchain delivery is the right choice compared to the onchain modes, see [Note delivery](./note_delivery.md).

## Overview

An offchain-delivered message goes through five stages:

1. **Emission**: The contract delivers a note or event with `MessageDelivery::offchain()`. The message is encrypted to the recipient and emitted as an offchain effect, which is part of the transaction's execution output but never posted onchain.
2. **Extraction**: After sending the transaction, the sender's application reads the emitted messages from the send result (`offchainMessages`).
3. **Transport**: The application delivers each message to its recipient through a channel of its choosing. This step is entirely the application's responsibility.
4. **Receipt**: The recipient hands the message to their wallet by calling the `offchain_receive` utility function on the contract that emitted it. This function is generated automatically by the `#[aztec]` macro, so every Aztec.nr contract has it.
5. **Processing**: The message sits in a local inbox until the transaction that emitted it is found onchain. During private state sync, the wallet decrypts the message, validates the resulting notes and events against onchain data, and adds them to its database.

Because processing validates the message against the onchain transaction, a malformed or dishonest message cannot trick the recipient: a message that cannot be decrypted or validated is simply ignored.

## Emitting offchain messages from a contract

Choose offchain delivery by passing `MessageDelivery::offchain()` to `.deliver()` (for notes) or `.deliver_to()` (for events). The token contract's `transfer_in_private_with_offchain_delivery` function delivers both resulting balance notes and a `Transfer` event offchain:

#include_code transfer_in_private_with_offchain_delivery /noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr rust

Nothing else changes in the contract: the same notes and events are created, only their delivery mechanism differs.

Under the hood, `MessageDelivery::offchain()` encrypts the message without constraints and emits it via the [`deliver_offchain_message`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/messages/offchain_messages/fn.deliver_offchain_message) function. See the [`MessageDelivery`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/messages/message_delivery/struct.MessageDelivery) API reference for details on guarantees, costs, and privacy.

## Extracting messages on the sender side

In `aztec.js`, the result of sending a transaction includes the offchain messages emitted during execution. Each message carries the encrypted `payload`, the `recipient` address, the emitting `contractAddress`, and the `anchorBlockTimestamp` of the transaction:

```typescript
const { receipt, offchainMessages } = await token.methods
  .transfer_in_private_with_offchain_delivery(alice, bob, amount, 0)
  .send({ from: alice });

// Find the message addressed to the recipient
const messageForBob = offchainMessages.find((msg) => msg.recipient.equals(bob));
```

If you manage proving manually, you can extract the messages from a proven transaction's offchain effects with `extractOffchainOutput`:

```typescript
import { extractOffchainOutput } from "@aztec/aztec.js/contracts";

const { offchainMessages } = extractOffchainOutput(
  provenTx.offchainEffects,
  provenTx.data.constants.anchorBlockHeader.globalVariables.timestamp,
);
```

## Transporting messages to the recipient

The recipient needs four pieces of information to receive a message:

- the message payload (ciphertext)
- the recipient address
- the hash of the transaction that emitted the message
- the anchor block timestamp

How you get these to the recipient is up to your application. Common patterns include encoding them into a claim link or QR code that the recipient opens, sending them through a messaging service, or storing them where the recipient can fetch them.

:::warning Back up your messages
Offchain messages are not stored onchain, so they cannot be recovered from the network. Until the recipient has processed a message, losing it means the recipient cannot decrypt the corresponding note contents (the note itself still exists onchain).
:::

## Receiving messages

The recipient calls the auto-generated `offchain_receive` utility function on the contract that emitted the message. Utility functions run locally and do not create a transaction, so this call is free:

```typescript
await token.methods
  .offchain_receive([
    {
      ciphertext: messageForBob.payload,
      recipient: bob,
      tx_hash: receipt.txHash.hash,
      anchor_block_timestamp: messageForBob.anchorBlockTimestamp,
    },
  ])
  .simulate({ from: bob });
```

`offchain_receive` accepts up to 16 messages per call. It stores them in a persistent inbox scoped to each message's recipient; processing happens later, during sync.

## How messages are processed

Once received, messages are managed by an inbox that the wallet syncs against (see [`receive`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/messages/processing/offchain/fn.receive) in the API reference):

- **Transaction resolution**: A message is only processed once the transaction identified by its `tx_hash` is found onchain. This provides the context needed to validate the notes and events the message contains. Until then, the message waits in the inbox.
- **Reorg safety**: Messages remain in the inbox even after processing. If a reorg reverts the transaction that emitted a message, its effects are rolled back; when the transaction is mined again, the message is reprocessed automatically without needing to be delivered again.
- **Expiry**: Messages are evicted from the inbox once they expire, which happens 26 hours after their anchor block timestamp (the maximum transaction lifetime of 24 hours plus a 2 hour tolerance). A transaction can no longer be included after that point, so an unresolved message can never become processable.

## Current limitations

- **Senders must self-deliver their own messages.** Messages addressed to the sender (such as the change note in a token transfer) are not processed automatically yet. Call `offchain_receive` for them just like you would on the recipient side.
- **Messages must be bound to a transaction.** Messages without an associated transaction hash are not processed in the current version; they sit in the inbox until they expire.
- **Batch size**: A single `offchain_receive` call accepts at most 16 messages. Split larger sets into multiple calls.

## Testing offchain delivery from Noir

The TXE test environment buffers offchain messages emitted during calls and exposes them via `env.offchain_messages()`. Feed them back through `offchain_receive` to complete the delivery loop inside a test:

#include_code token_transfer_offchain_delivery_test /noir-projects/noir-contracts/contracts/app/token_contract/src/test/transfer_in_private_with_offchain_delivery.nr rust

`env.offchain_messages()` returns up to 64 messages, so drain it into batches of at most 16 when a test emits more messages than one `offchain_receive` call accepts.

## Next steps

- Compare delivery modes and their guarantees in [Note delivery](./note_delivery.md)
- Learn how onchain-delivered notes are found in [Note discovery](../../foundational-topics/advanced/storage/note_discovery.md)
- Browse the [`MessageDelivery`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/messages/message_delivery/struct.MessageDelivery) API reference
