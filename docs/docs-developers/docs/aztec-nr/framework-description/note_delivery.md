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

## The `.deliver()` Method

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

#### How It Works

Offchain messages bypass Aztec's default private log infrastructure entirely:

1. **Message emission**: The contract encrypts the message (without constraints) and emits it via an oracle call. This creates an "offchain effect" that is included in the transaction but not posted to L1.

2. **Manual extraction**: When the transaction is sent, you must extract the offchain message from the transaction's offchain effects (available via `provenTx.offchainEffects` in aztec.js).

3. **Manual delivery**: You deliver the message through your own channel - Signal, cloud storage, QR codes, peer-to-peer networks, etc.

4. **Manual processing**: The recipient calls `process_message` on the target contract (as an unconstrained function), passing the ciphertext and message context. This decrypts the message and processes it (e.g., adding notes to the PXE database).

The PXE cannot automatically discover offchain messages during private state sync because they are not in the log stream that nodes load from Ethereum blobs. **You are responsible for implementing both the delivery mechanism and ensuring the recipient processes the message.**

#### When to Use

- **Use when:** The sender is incentivized to deliver correctly (e.g., sending to yourself, payment for goods/services where recipient must receive the note to complete the transaction)
- **Costs:** Zero delivery fees (no blob space), zero proving time overhead
- **Guarantees:** None. The sender can fail to deliver or deliver incorrect content
- **Privacy:** Maximum. No onchain data is emitted

This is expected to be the most common delivery method when you don't need constrained delivery guarantees, as it completely eliminates blob space costs.

#### Example Use Cases

- Change notes when transferring tokens (you're sending to yourself)
- Payments where the recipient won't provide goods/services without the note
- Messages to local accounts controlled by the sender
- Low-value use-cases like delivering game state updates to a game server

```rust
// Change note - sender is motivated to deliver to themselves
self.storage.balances.at(sender).add(change_amount)
    .deliver(MessageDelivery::offchain());
```

:::info TODO
This section will be updated with a complete TypeScript example showing how to extract offchain messages from transaction effects and manually deliver them once the API in Aztec.js is finalized. The full workflow example will make the offchain delivery pattern clearer.
:::

#### JavaScript Implementation

When using offchain delivery, extract and manually deliver messages in your application:

```typescript
import { MessageContext } from "@aztec/stdlib/logs"

// Prove transaction and get offchain effects
const txProvingResult = await wallet.pxe.proveTx(txRequest);
const provenTx = new ProvenTx(
    wallet.node,
    await txProvingResult.toTx(),
    txProvingResult.getOffchainEffects(),
    txProvingResult.stats,
);

// Extract offchain message
const offchainEffects = provenTx.offchainEffects;
const ciphertext = offchainEffects[0].data.slice(2);

// Send tx
const sentTx = provenTx.send()
const tx = await sentTx.wait()
const txHash = await sentTx.getTxHash()

// Deliver via your chosen channel (e.g., send to recipient via Signal, cloud storage, etc.). This is what you'd have to implement
await deliverViaMyChannel(ciphertext, recipient);

// Recipient processes the message
const txEffect = await aztecNode.getTxEffect(txHash);
const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);
await contract.methods.process_message(ciphertext, messageContext.toNoirStruct()).simulate();
```

See the [aztec.js documentation](../../aztec-js/index.md) for more details on accessing transaction effects.

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

## Choosing a Delivery Mode

Ask yourself: **"Is the sender incentivized to deliver this note correctly?"**

- **Yes, and they can contact the recipient offchain** Use `OFFCHAIN`
- **Yes, but they cannot or prefer not to contact them offchain or you don't want to implement offchain delivery** Use `ONCHAIN_UNCONSTRAINED`
- **No, the sender might not deliver correctly** Use `ONCHAIN_CONSTRAINED`

## Delivery privacy preference

Onchain delivery tags every message so the recipient can find it efficiently (see [note discovery](#note-discovery-and-the-sender) below). Computing a tag requires a secret shared between sender and recipient. That secret can be derived in several ways, and the choice involves a privacy trade-off. Each party involved in message delivery owns a different part of the decision:

- **Contracts** choose a delivery mode, and can optionally pin a tag-secret derivation via the `MessageDelivery` builders. By default they pin nothing and delegate the decision to the wallet. This is the recommended setting unless the contract requires a specific mechanism to work.
- **Wallets** answer that delegation with the **delivery privacy preference**: a wallet-level setting with two values, **max privacy** and **best effort**. It decides how much privacy the user is willing to trade so that delivery works with less sender-recipient coordination.

The preference is consulted whenever a message needs a tagging secret and the contract has not pinned a derivation.

### Max privacy vs best effort

- **Max privacy** (the PXE default): nothing that could link sender and recipient is ever published, and delivery relies on sender-recipient coordination. Unconstrained delivery uses a secret derived from the sender and recipient addresses, which leaves no onchain trace, but the recipient only finds the message if they registered the sender in their PXE. Constrained delivery requires an interactive handshake with the recipient, and fails when none exists, because there is no privacy-preserving way to establish a secret on the fly.
- **Best effort**: tags are derived from a non-interactive handshake, reusing an existing one or establishing it onchain as part of the send. The recipient discovers the message without knowing the sender in advance or coordinating with them in any other way, at the cost of publishing a handshake that reveals information about the recipient.

| | Max privacy | Best effort |
|---|---|---|
| Onchain footprint when establishing a secret | None | A handshake revealing information about the recipient |
| Unconstrained delivery to an unknown recipient | Found only if the recipient registered the sender | Found without sender-recipient coordination |
| Constrained delivery | Requires an interactive handshake signed by the recipient | Works without recipient involvement |

### Configuring the preference

Wallets configure the preference through the `getDeliveryPrivacyPreference` [execution hook](../../foundational-topics/pxe/execution_hooks.md) when creating their PXE. The hook receives the message context (executing contract, sender, recipient and delivery mode), so a wallet can answer per message instead of with a fixed value.

The defaults differ by environment:

- **PXE**: max privacy. A bare PXE makes the conservative choice and never leaks without opt-in.
- **Embedded wallet** (`@aztec/wallets/embedded`): best effort. It targets development scenarios where delivery working out of the box matters more than handshake privacy. Override it by passing your own `hooks.getDeliveryPrivacyPreference` in its `pxe` options.
- **TXE tests**: max privacy, matching the bare PXE. Tests opt into best effort via `env.set_delivery_privacy_preference(DeliveryPrivacyPreference::best_effort())`.

## Note Discovery and the Sender

When a note is delivered, recipients need to discover it among all the encrypted logs on the network. Aztec.nr uses a **tagging system** that requires computing a shared secret between the sender and recipient.

### Who is the "Sender"?

The "sender" for note discovery is **not the contract calling `.deliver()`**. Instead, it's the **account contract** that initiated the transaction.

When your wallet submits a transaction, it tells PXE which address to use as the sender for tags (typically the originating account). This sender address is then used along with the recipient address to compute a shared secret (via [Diffie-Hellman key exchange](https://www.geeksforgeeks.org/computer-networks/diffie-hellman-key-exchange-and-perfect-forward-secrecy/)), which generates the tag that allows recipients to efficiently find their notes. Contracts can override the sender at message delivery via the `with_sender` builder method, e.g. `MessageDelivery::onchain_unconstrained().with_sender(address)`.

**Example:** If Alice uses her account contract to call a token contract that mints tokens to Bob, the "sender for tags" is Alice's account contract address, not the token contract address.

### Discovering Notes from Unknown Senders

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

## Delivering to Someone Other Than the Note Owner

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

## Code Examples

### Private Token Transfer

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

### Admin Initialization

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
