---
title: Note Delivery
tags: [storage, concepts, notes]
description: Learn how to deliver notes to recipients in Aztec smart contracts using different delivery modes to balance proving time, transaction costs, and delivery guarantees.
sidebar_position: 4
---

When you create a note in an Aztec smart contract, you must deliver it to the recipient so they can use it. This page explains how note delivery works and how to choose the right delivery mode for your use case.

## Overview

In Aztec, creating a note involves two steps:
1. **Creating the note** - Adding the note hash to the note hash tree
2. **Delivering the note** - Sending the note contents to the recipient so they can decrypt and use it

Without delivery, the recipient won't know the note exists or be able to access its contents, even though the note hash is onchain.

## The `.deliver()` method

When you create a note using state variables like `PrivateMutable`, `PrivateSet`, `BalanceSet`, or `SinglePrivateMutable`, the creation methods return a `NoteMessage` or `MaybeNoteMessage` object. A message contains arbitrary information emitted from a contract - currently this includes notes and private events, though developers may define other message types in the future. You must call `.deliver()` on this object to send the message (containing the note) to the recipient.

```rust
#[aztec]
pub contract PrivateToken {
    use aztec::messages::message_delivery::MessageDelivery;

    #[external("private")]
    fn mint(amount: u128, recipient: AztecAddress) {
        // Adding to the balance returns a MaybeNoteMessage
        self.storage.balances.at(recipient).add(amount)
            .deliver(MessageDelivery::onchain_constrained());
    }
}
```

## Delivery Modes

Aztec provides three delivery modes that offer different tradeoffs between cost, proving time, and guarantees:

### `MessageDelivery::offchain()`

**Fully offchain delivery with no guarantees.**

This delivery method encrypts messages without constraints and emits them via an oracle call as offchain effects, rather than through the protocol's log stream (which would post data to Ethereum blobs). With offchain delivery, you must manually handle both message transmission and processing.

#### How it works

Offchain messages bypass Aztec's default private log infrastructure entirely:

1. **Message emission**: The contract encrypts the message (without constraints) and emits it via an oracle call. This creates an "offchain effect" that is included in the transaction but not posted to L1.

2. **Extraction**: When the transaction is sent, you read the emitted messages from the send result (`offchainMessages` in aztec.js), or extract them from a proven transaction's offchain effects.

3. **Manual delivery**: You deliver the message through your own channel - a claim link, QR code, messaging service, cloud storage, etc.

4. **Receipt and processing**: The recipient calls the `offchain_receive` utility function on the contract that emitted the message (this function is generated automatically by the `#[aztec]` macro). The message is stored in a local inbox and processed during private state sync once the transaction that emitted it is found onchain.

The PXE cannot automatically discover offchain messages during private state sync because they are not in the log stream that nodes load from Ethereum blobs. **You are responsible for implementing the delivery mechanism and ensuring the recipient receives the message.**

See [Offchain message delivery](./offchain_message_delivery.md) for the complete workflow, including sender and recipient code, message processing details, and how to test it from Noir.

#### When to use

- **Use when:** The sender is incentivized to deliver correctly (e.g., sending to yourself, payment for goods/services where recipient must receive the note to complete the transaction)
- **Costs:** Zero delivery fees (no blob space), zero proving time overhead
- **Guarantees:** None. The sender can fail to deliver or deliver incorrect content
- **Privacy:** Maximum. No onchain data is emitted

This is expected to be the most common delivery method when you don't need constrained delivery guarantees, as it completely eliminates blob space costs.

#### Example use cases

- Change notes when transferring tokens (you're sending to yourself)
- Payments where the recipient won't provide goods/services without the note
- Messages to local accounts controlled by the sender
- Low-value use-cases like delivering game state updates to a game server

```rust
// Change note - sender is motivated to deliver to themselves
self.storage.balances.at(sender).add(change_amount)
    .deliver(MessageDelivery::offchain());
```

#### JavaScript implementation

When using offchain delivery, extract the emitted messages from the send result and deliver them to the recipient in your application. The recipient hands each message to their wallet via the auto-generated `offchain_receive` utility function:

```typescript
// Sender: send the transaction and extract the emitted offchain messages
const { receipt, offchainMessages } = await token.methods
  .transfer_in_private_with_offchain_delivery(alice, bob, amount, 0)
  .send({ from: alice });

const messageForBob = offchainMessages.find((msg) => msg.recipient.equals(bob));

// Deliver via your chosen channel (e.g. a claim link, QR code, messaging service).
// This is what you'd have to implement.
await deliverViaMyChannel(messageForBob, receipt.txHash, recipient);

// Recipient: receive the message so it gets processed during sync
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

See [Offchain message delivery](./offchain_message_delivery.md) for the full workflow.

### `MessageDelivery::onchain_unconstrained()`

**Onchain delivery with no content guarantees.**

This mode provides the same low proving time as `OFFCHAIN` while avoiding the need to implement custom delivery infrastructure. The tradeoff: you pay for DA (blob space) without gaining additional guarantees. If you're willing to build offchain delivery, use `OFFCHAIN` instead - it's strictly cheaper with the same guarantees.

- **Use when:** The sender is incentivized to deliver correctly but you don't want to implement offchain delivery infrastructure
- **Costs:** DA gas fees for the encrypted log, zero proving time overhead
- **Guarantees:** Message stored onchain and retrievable, but sender can deliver incorrect content or wrong tag
- **Privacy:** High - encrypted log reveals minimal information

```rust
// Minting to an admin who controls the contract
self.storage.balances.at(admin).add(amount)
    .deliver(MessageDelivery::onchain_unconstrained());
```

### `MessageDelivery::onchain_constrained()`

**Onchain delivery with guaranteed correct content.**

**WARNING**: This mode is [currently NOT fully constrained](https://github.com/AztecProtocol/aztec-packages/issues/14565). The log's tag is unconstrained, meaning a malicious sender could prevent the recipient from finding the message.

- **Use when:** The sender cannot be trusted to deliver correctly (e.g., paying fees, creating notes for others, multisig configuration changes). Use this when you need to prove to a contract that the delivery has been done correctly. You can imagine a private NFT sale escrow contract where the escrow would be holding the NFT (the contract itself would be the NFT note owner) and then the escrow would release the NFT to the buyer once the NFT buyer pays the seller. In this case the `NFTSale::buy(...)` function would trigger the payment token transfer from the buyer to the seller and it would need to use `ONCHAIN_CONSTRAINED` delivery otherwise the escrow contract would be willing to transfer the NFT without the NFT seller actually being able to then spend the money. Note that for the transfer of the NFT from the escrow contract to the buyer you could use `OFFCHAIN` delivery because the delivery and encryption would be done in the buyer's PXE and hence there is alignment.
- **Costs:** DA gas fees for the encrypted log, proving time overhead for encryption and tagging
- **Guarantees:** Recipient receives correctly encrypted content (once tag constraining is implemented, recipient will be able to find it)
- **Privacy:** High - encrypted log reveals minimal information

```rust
// Minting to an arbitrary recipient - must guarantee delivery
self.storage.balances.at(recipient).add(amount)
    .deliver(MessageDelivery::onchain_constrained());
```

## Choosing a delivery mode

Ask yourself: **"Is the sender incentivized to deliver this note correctly?"**

- **Yes, and they can contact the recipient offchain** Use `OFFCHAIN`
- **Yes, but they cannot or prefer not to contact them offchain or you don't want to implement offchain delivery** Use `ONCHAIN_UNCONSTRAINED`
- **No, the sender might not deliver correctly** Use `ONCHAIN_CONSTRAINED`

## Note discovery and the sender

When a note is delivered, recipients need to discover it among all the encrypted logs on the network. Aztec.nr uses a **tagging system** that requires computing a shared secret between the sender and recipient.

### Who is the "sender"?

The "sender" for note discovery is **not the contract calling `.deliver()`**. Instead, it's the **account contract** that initiated the transaction.

When your wallet submits a transaction, it tells PXE which address to use as the sender for tags (typically the originating account). This sender address is then used along with the recipient address to compute a shared secret (via [Diffie-Hellman key exchange](https://www.geeksforgeeks.org/computer-networks/diffie-hellman-key-exchange-and-perfect-forward-secrecy/)), which generates the tag that allows recipients to efficiently find their notes. Contracts can override the sender at message delivery via the `with_sender` builder method, e.g. `MessageDelivery::onchain_unconstrained().with_sender(address)`.

**Example:** If Alice uses her account contract to call a token contract that mints tokens to Bob, the "sender for tags" is Alice's account contract address, not the token contract address.

### Discovering notes from unknown senders

**You cannot receive notes from an unknown sender** without additional mechanisms. The tagging system requires you to know the sender's address in advance to compute the shared secret needed to find the note (i.e., the sender needs to be added to your wallet).

There are three approaches to solve this:

**a) Brute force search** - Download every log and attempt to decrypt it. This becomes prohibitively expensive as the network grows.

**b) Known sender tagging** (current implementation) - Only receive notes from senders whose addresses you've registered in your PXE. This is very fast and allows you to block spammers by removing them from your sender list. However, you must know who might send you notes in advance.

**c) Handshaking protocols** (not yet implemented) - A two-phase approach where senders first perform a "handshake" that notifies you of their existence, then use regular tagging afterward. This trades off either privacy (public handshake events) or performance (scanning all handshake logs).

**Workarounds for receiving notes from unknown senders:**
- Require senders to register in a contract first, then search for notes from all registered senders
- Share sender addresses through offchain communication
- Implement a custom discovery mechanism in your contract

See the [Note Discovery](../../foundational-topics/advanced/storage/note_discovery.md) documentation for technical details on the tagging mechanism.

## Delivering to someone other than the note owner

You can deliver a note to an address other than the note's owner using `.deliver_to()`:

```rust
// Create a note owned by `owner` but deliver it to `auditor`
self.storage.balances.at(owner).add(amount)
    .deliver_to(auditor, MessageDelivery::onchain_constrained());
```

**Important:** The recipient (e.g. an `auditor`) can see the note was created but **cannot use it** - only the owner can spend the note (this is authorized by the contract logic). The recipient also cannot see when/if the note is nullified.

**Use cases:**
- Traditional finance model of compliance where the third party sees all the activity (e.g. a bank)
- Game servers that track all note creation and then quickly serve you the game state (results in better UX)
- Analytics or monitoring services

## Code examples

### Private token transfer

```rust
#[external("private")]
fn transfer(amount: u128, sender: AztecAddress, recipient: AztecAddress) {
    // Subtract from sender - unconstrained since sender is the caller
    self.storage.balances.at(sender)
        .sub(amount)
        .deliver(MessageDelivery::onchain_unconstrained());

    // Add to recipient - constrained delivery for untrusted sender
    self.storage.balances.at(recipient)
        .add(amount)
        .deliver(MessageDelivery::onchain_constrained());
}
```

### Admin initialization

```rust
#[external("private")]
#[initializer]
fn constructor(admin: AztecAddress) {
    // Admin is the owner of the note and is motivated to receive it
    // Use unconstrained delivery since we don't know if deployer is incentivized
    self.storage.admin
        .initialize(AddressNote { address: admin }, admin)
        .deliver(MessageDelivery::onchain_constrained());
}
```
