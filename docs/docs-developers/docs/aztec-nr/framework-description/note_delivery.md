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
    use aztec::messages::delivery::MessageDelivery;

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

This mode provides the same low proving time as offchain delivery while avoiding the need to implement custom delivery infrastructure. The tradeoff: you pay for DA (blob space) without gaining additional guarantees. If you're willing to build offchain delivery, use it instead - it's strictly cheaper with the same guarantees.

- **Use when:** The sender is incentivized to deliver correctly but you don't want to implement offchain delivery infrastructure
- **Costs:** DA gas fees for the encrypted log, zero proving time overhead
- **Guarantees:** Message stored onchain and retrievable, but sender can deliver incorrect content or wrong tag
- **Privacy:** High for the message contents. By default, reaching a recipient the sender has not handshaked with before establishes a handshake that reveals the recipient was contacted (see [Tagging secret strategy](#tagging-secret-strategy))

```rust
// Minting to an admin who controls the contract
self.storage.balances.at(admin).add(amount)
    .deliver(MessageDelivery::onchain_unconstrained());
```

### `MessageDelivery::onchain_constrained()`

**Onchain delivery with guaranteed correct content.**

- **Use when:** The sender cannot be trusted to deliver correctly (e.g., paying fees, creating notes for others, multisig configuration changes). Use this when you need to prove to a contract that the delivery has been done correctly. You can imagine a private NFT sale escrow contract where the escrow would be holding the NFT (the contract itself would be the NFT note owner) and then the escrow would release the NFT to the buyer once the NFT buyer pays the seller. In this case the `NFTSale::buy(...)` function would trigger the payment token transfer from the buyer to the seller and it would need to use constrained delivery otherwise the escrow contract would be willing to transfer the NFT without the NFT seller actually being able to then spend the money. Note that for the transfer of the NFT from the escrow contract to the buyer you could use offchain delivery because the delivery and encryption would be done in the buyer's PXE and hence there is alignment.
- **Costs:** DA gas fees for the encrypted log, proving time overhead for encryption and tagging
- **Guarantees:** Recipient will always be able to find correctly encrypted content: both the encryption and the discovery tag are constrained and stored onchain.
- **Privacy:** High for the message contents. By default, reaching a recipient the sender has not handshaked with before establishes a handshake that reveals the recipient was contacted (see [Tagging secret strategy](#tagging-secret-strategy))

```rust
// Minting to an arbitrary recipient - must guarantee delivery
self.storage.balances.at(recipient).add(amount)
    .deliver(MessageDelivery::onchain_constrained());
```

## Choosing a delivery mode

Ask yourself: **"Is the sender incentivized to deliver this note correctly?"**

- **Yes, and they can contact the recipient offchain** Use offchain delivery
- **Yes, but they cannot or prefer not to contact them offchain or you don't want to implement offchain delivery** Use unconstrained delivery
- **No, the sender might not deliver correctly** Use constrained delivery

## Tagging secret strategy

Onchain delivery tags every message so the recipient can find it efficiently (see [note discovery](#note-discovery-and-the-sender) below). Computing a tag requires a secret shared between sender and recipient, and there is more than one way for the two parties to come to share it. The derivation is decided in this order:

1. A contract can fix it itself at the point of delivery (see [overriding the strategy from the contract](#overriding-the-strategy-from-the-contract)).
2. Otherwise, when an onchain handshake has been registered for the pair, the secret derived from it is reused directly.
3. Otherwise, the wallet decides how to proceed, since it knows which secrets it holds and how it wants to reach the recipient.

The wallet's answer is a **tagging secret strategy**: it expresses *which* secret to use, and if necessary, PXE performs a [Diffie-Hellman key exchange](https://www.geeksforgeeks.org/computer-networks/diffie-hellman-key-exchange-and-perfect-forward-secrecy/) and/or app-siloing before handing the ready-to-use secret to the contract. Wallets therefore never reimplement that derivation. There are four strategies today:

- **Non-interactive handshake**: the secret comes from a handshake published onchain that the recipient can derive. A non-recipient can at most learn that a sender did a handshake with the recipient, not the message itself, but the recipient discovers it without any prior coordination. Works for both constrained and unconstrained delivery.
- **Interactive handshake**: the secret comes from a handshake the recipient authorizes with a signature, which the registry requests through the custom request oracle and verifies in-circuit. Nothing announcing the handshake is published onchain (the recipient learns the secret while signing), but the recipient must be reachable to answer the request, or the send fails. Works for both constrained and unconstrained delivery.
- **Address-derived secret**: the PXE derives the secret from the sender's and recipient's address keys via Diffie-Hellman. The wallet supplies no material, only the choice. It leaves no onchain trace, but the recipient only finds the message if they registered the sender in their PXE. Unconstrained delivery only.
- **Arbitrary secret**: a raw secret point the two parties already share offchain, having coordinated out of band to agree on it. The wallet supplies the point and the PXE app-silos it. It leaves no onchain trace, but no onchain handshake backs the secret. Unconstrained delivery only.

| | Non-interactive handshake | Interactive handshake | Address-derived secret | Arbitrary secret |
|---|---|---|---|---|
| Onchain footprint when establishing | A handshake revealing information about the recipient | None | None | None |
| Who provides the material | The onchain registry | The onchain registry, with the recipient's signed authorization | Nobody (PXE computes it) | The wallet (a raw point) |
| Recipient coordination | None | The recipient must answer the signature request | The recipient must have registered the sender | Agreed out of band |
| Constrained delivery | Supported | Supported | Not sound: not backed by an onchain handshake | Not sound: not backed by an onchain handshake |

### Defaults

When no `resolveTaggingSecretStrategy` hook is configured, the PXE applies a default:

- **Unconstrained delivery**: a non-interactive handshake when the recipient is external, so the recipient discovers the message without having registered the sender in advance. When the recipient is one of the wallet's own accounts (a self-send), an address-derived secret is used instead: the wallet holds both sides' keys, so no handshake is needed and nothing is revealed onchain.
- **Constrained delivery**: a non-interactive handshake (constrained delivery must be backed by a handshake).

An interactive handshake is never the default, since it fails when the recipient cannot be reached: a wallet opts in through the hook when it knows how to reach them.

### Configuring the strategy

Wallets provide the strategy through the `resolveTaggingSecretStrategy` [execution hook](../../foundational-topics/pxe/execution_hooks.md) when creating their PXE. The hook receives the message context (executing contract, sender, recipient and delivery mode), so a wallet can answer per message instead of with a fixed value. That page also covers how to configure a strategy in Noir tests.

### Overriding the strategy from the contract

A contract can fix the derivation at the point of delivery with the builder's `via_*` methods. When it does, the wallet is not consulted at all; otherwise the wallet resolves the strategy as usual:

```rust
MessageDelivery::onchain_unconstrained().via_address_derived_secret()
```

Unconstrained delivery exposes `via_non_interactive_handshake()`, `via_interactive_handshake()` and `via_address_derived_secret()`. Constrained delivery exposes only `via_non_interactive_handshake()` and `via_interactive_handshake()`, since an address-derived secret cannot back constrained delivery.

## Note discovery and the sender

When a note is delivered, recipients need to discover it among all the encrypted logs on the network. Aztec.nr uses a **tagging system** that requires computing a shared secret between the sender and recipient.

### Who is the "sender"?

The "sender" for note discovery is **not the contract calling `.deliver()`**. Instead, it's the **account contract** that initiated the transaction.

When your wallet submits a transaction, it tells PXE which address to use as the sender for tags (typically the originating account). Recipients compute the tag to find their notes from a secret shared between the sender and recipient, and there is [more than one way to establish that secret](#tagging-secret-strategy), chosen by the wallet. Contracts can override the sender at message delivery via the `with_sender` builder method, which works for both constrained and unconstrained delivery, e.g. `MessageDelivery::onchain_constrained().with_sender(address)`. They can similarly override how the tag secret is derived via the builder's `via_*` methods; see [overriding the strategy from the contract](#overriding-the-strategy-from-the-contract).

**Example:** If Alice uses her account contract to call a token contract that mints tokens to Bob, the "sender for tags" is Alice's account contract address, not the token contract address.

### Discovering notes from unknown senders

When the tag is derived from an address-based shared secret, you cannot compute it for a sender you haven't registered in advance, so you cannot receive those notes from an unknown sender. Handshake protocols let the two parties agree on the secret another way and lift this restriction.

See [You cannot receive address-derived tagged notes from an unknown sender](../../foundational-topics/advanced/storage/note_discovery.md#you-cannot-receive-address-derived-tagged-notes-from-an-unknown-sender) in the note discovery documentation for the approaches and workarounds.

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
