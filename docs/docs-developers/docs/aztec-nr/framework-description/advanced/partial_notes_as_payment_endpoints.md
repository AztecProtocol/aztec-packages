---
title: Partial notes as payment endpoints
sidebar_position: 2
tags: [Developers, Contracts, Notes, Privacy]
description: Using partial notes as a recipient's offer to be paid, enabling naming-service style flows where the recipient does not need to be online.
references:
  [
    "noir-projects/aztec-nr/uint-note/src/uint_note.nr",
    "noir-projects/aztec-nr/aztec/src/messages/discovery/partial_notes.nr",
  ]
---

:::note Assumed token standard
This page assumes the [AIP-20 fungible token standard](../../standards/aip-20.md), which exposes commitment-based transfers directly: the completer is an explicit argument to `initialize_transfer_commitment`, and completion debits a separately authorized account. Tokens that instead hardcode the completer to `msg_sender` (such as the example `token_contract` in aztec-packages) need a more roundabout flow that this page does not cover.
:::

## The problem

Consider a naming service that resolves `alice.aztec` to something that anyone can pay. If the name resolves to a stable Aztec address, every sender and every registry observer can link payments to the same recipient identifier, even when the payment notes themselves are private. The recipient is forced to share that identifier with every sender, so two senders can collude to confirm they paid the same person.

A privacy-conscious naming service should let a sender pay `alice.aztec` without:

- learning the recipient's actual Aztec address,
- producing a sender-visible or registry-visible link between any two payments to the same name,
- requiring the recipient to be online when the payment is made.

[Partial notes](./partial_notes.md) provide the primitive. This page covers how to use them to back a stable name with a rotating supply of unlinkable, one-shot payment endpoints.

The term _payment endpoint_ in this page is application-level. Aztec's protocol terminology stays with "partial note," "completer," and "completion log."

## A partial note as an offer to be paid

A partial note is a commitment to `(owner, randomness)`. Once minted, the commitment is just a `Field`: it can be copied freely, stored anywhere, and shared with any sender. Holding the commitment is not enough to complete it, though; only the note's designated _completer_ can fill in `(storage_slot, value)` and finalize it.

With AIP-20, the recipient mints a partial note by calling `initialize_transfer_commitment`, choosing both the eventual owner and the completer:

```rust
#[external("private")]
fn initialize_transfer_commitment(to: AztecAddress, completer: AztecAddress) -> Field
```

The completer is bound into a validity commitment `H(partial_commitment, completer)` recorded in the nullifier tree. Completion (`transfer_private_to_commitment` or `transfer_public_to_commitment`) sets the completer to the caller's `msg_sender` and checks that the matching validity commitment exists, so a partial note can only be finalized by the address set as its completer. Completion debits a separate, authorized `from` account, so the payer and the completer can be different parties.

Two properties make this useful as a payment endpoint:

- **The recipient does not need to be online during the payment.** When the note is minted, the token sends the recipient a private message identifying it. The recipient's Private eXecution Environment (PXE) holds this pending entry and scans for the completion log whenever it has the chance.
- **The completer is fixed when the note is minted.** The recipient chooses who can finalize the note at mint time, and that choice is enforced cryptographically.

Each partial note is single-use (see [single-use semantics](./partial_notes.md#single-use-semantics)), so an endpoint that accepts many payments must hold many partial notes.

## The completer choice

The choice of `completer` determines who can pay through a given partial note. Two options matter:

### Completer = a specific sender

The recipient pre-mints one partial note per known sender, with each `completer` set to that sender's address. The sender finalizes the note with their own funds by calling `transfer_private_to_commitment` (or `transfer_public_to_commitment`), acting as both the `from` and the `msg_sender`/completer.

This works without any new contracts but requires the recipient to know each sender's address in advance. It is useful for repeat payers (subscriptions, regular invoices) but does not scale to "anyone can pay this name."

### Completer = a relayer contract

The recipient mints partial notes whose `completer` is a known _relayer_ contract: a contract whose only job is to forward a sender's payment into the token's completion function. Any sender can invoke the relayer, the relayer is what the token sees as `msg_sender` (so the validity commitment check passes), and the sender is debited as the authorized `from`.

This is the option that scales to unknown senders. The relayer needs no per-name logic, so a single global relayer contract could serve every payment endpoint on the network.

## The relayer contract

An illustrative sketch (not a compilable reference):

```rust
contract PaymentRelayer {
    // Called by any sender holding a commitment. Forwards into the token's
    // completion from the relayer's call frame, so the token sees the relayer
    // as the completer, while the sender is debited as the authorized `from`.
    #[external("private")]
    fn pay_private(token: AztecAddress, commitment: Field, amount: u128, authwit_nonce: Field) {
        let from = self.context.msg_sender();
        self.call(Token::at(token).transfer_private_to_commitment(
            from,
            commitment,
            amount,
            authwit_nonce,
        ))
    }
}
```

How the flow works:

- The recipient mints notes with `initialize_transfer_commitment(to: recipient, completer: relayer)` and publishes the commitments through their lookup channel. Minting goes straight to the token; no call through the relayer is needed.
- A sender calls `pay_private` with a commitment obtained from the recipient's lookup channel. The relayer reads `from = msg_sender` (the sender) and forwards into the token. At the token's frame, `msg_sender` is the relayer, matching the completer the note was minted with, so the token debits the sender and completes the note.
- An authwit signed by the sender authorizes the relayer to call `transfer_private_to_commitment` with these specific arguments, since the token sees the relayer, not the sender, as the immediate caller.

Both private and public payments are supported: `transfer_private_to_commitment` debits the sender's private balance, `transfer_public_to_commitment` debits their public balance. Both take an explicit authorized `from`, so the relayer never needs to hold or be pre-funded with the sender's tokens. Fee sponsorship is separate, handled by a [Fee Payment Contract (FPC)](../../../foundational-topics/fees.md) during the transaction's setup phase.

## The distribution choice

Where the mapping "name → partial-note commitments" lives is independent of who completes the notes:

- **Offchain.** A static file at `alice.example/aztec.json`, an ENS text record, IPFS, or any other lookup channel. The chain never sees the name or the pool size. Requires trust in the hosting and a way to authenticate the result.
- **Onchain.** A registry contract with public storage mapping names to commitments. Censorship-resistant and allows atomic lookup-and-pay in a single transaction, but exposes the pool size, refill cadence, and the plaintext name on every payment.

The two choices are orthogonal. Either channel can hand out commitments minted with any completer; only the lookup mechanism differs.

## A recommended pattern

For "name → unlinkable payment endpoint, recipient offline," the combination that gives the best privacy / UX ratio is offchain distribution (the recipient hosts the lookup), a relayer contract as the completer, and private→private completion so the amount stays hidden from observers who do not hold the commitment.

The recipient is responsible for:

1. Periodically minting fresh partial notes with the relayer as completer.
2. Publishing the resulting commitments through whatever lookup channel they choose.
3. Pruning commitments that have been consumed (the recipient's PXE knows when each partial note has been completed).

Refill cadence is an operational concern. If senders consume commitments faster than the recipient refills, the lookup will return nothing. Batching the mint of many partial notes in a single transaction reduces the per-payment cost.

## What is hidden, what leaks

The pattern hides:

- The recipient's Aztec address from senders.
- The link between any two payments to the same name, as long as each payment consumes a different partial note.
- The amount, in private→private completion, provided the commitment is not exposed to the observer. The completion log payload is plaintext but only discoverable by a party who can derive the tag, and the tag derives from the commitment. If the recipient's lookup channel hands out the same pool to every viewer, any observer who fetches the pool can derive tags and read completed amounts for that pool. Authenticated or sender-specific distribution narrows this exposure.

The pattern leaks:

- The fact that the relayer contract was invoked in a transaction.
- The completion log tag for each payment. The tag does not reveal the recipient, but it confirms that _some_ completion happened against _some_ partial note.
- Anything the lookup channel itself reveals. An offchain channel can hide the existence of the name; an onchain registry cannot.
- The recipient's refill cadence, if their minting transactions are visible.

A reused partial note breaks both the privacy property (linkable completions) and the discovery property (the recipient's wallet will miss the second completion). Endpoint pools must rotate; commitments must not be republished after consumption.

## What this does not solve

This pattern is not a stealth-address scheme. It requires the recipient to pre-mint and publish a pool of commitments ahead of time, and to keep refilling it; senders draw from that pool. A stealth-address scheme, by contrast, lets a recipient publish a single meta-address once and stay otherwise passive, with each sender deriving a fresh one-time address non-interactively. Partial-note endpoints trade that recipient passivity for an explicit, recipient-controlled supply of payment slots.

The pattern also does not protect against an attacker who can break the underlying hash function used to build the partial commitment. The commitment is a one-way hash of `(owner, randomness)`, and a published pool of commitments creates a public corpus that would be vulnerable in that scenario.

## Forward-looking note

Partial-note creation uses `MessageDelivery.ONCHAIN_UNCONSTRAINED` today. Constrained tagging and handshaking is tracked in [aztec-packages issue #14565](https://github.com/AztecProtocol/aztec-packages/issues/14565) and may change how recipients discover partial-note creation messages. The concepts on this page (single-use commitments, completer binding, distribution choice) are stable across that change; specific code patterns on the recipient's discovery side may shift.

## Related

- [Partial notes](./partial_notes.md): the underlying primitive.
- [AIP-20: Fungible Token](../../standards/aip-20.md): the token standard assumed throughout this page.
- [Keys](../../../foundational-topics/accounts/keys.md): how Aztec accounts derive addresses. Partial-note endpoints offer an alternative to addresses for the specific use case of being paid.
- [Fees](../../../foundational-topics/fees.md): how fee payment and sponsorship work, independent of the partial-note pattern.
