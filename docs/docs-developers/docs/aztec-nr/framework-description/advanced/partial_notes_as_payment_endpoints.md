---
title: Partial notes as payment endpoints
sidebar_position: 2
tags: [Developers, Contracts, Notes, Privacy]
description: Using partial notes as a recipient's offer to be paid, enabling naming-service style flows where the recipient does not need to be online.
references: ["noir-projects/aztec-nr/uint-note/src/uint_note.nr", "noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr", "noir-projects/aztec-nr/aztec/src/messages/discovery/partial_notes.nr"]
---

## The problem

Consider a naming service that resolves `alice.aztec` to something that anyone can pay. If the name resolves to a stable Aztec address, every sender and every registry observer can link payments to the same recipient identifier, even when the payment notes themselves are private. The recipient is forced to share that identifier with every sender, so two senders can collude to confirm they paid the same person.

A privacy-conscious naming service should let a sender pay `alice.aztec` without:

- learning the recipient's actual Aztec address,
- producing a sender-visible or registry-visible link between any two payments to the same name,
- requiring the recipient to be online when the payment is made.

[Partial notes](./partial_notes.md) provide the primitive. This page covers how to use them to back a stable name with a rotating supply of unlinkable, one-shot payment endpoints, and walks through the design choices that fall out of the primitive's constraints.

The term *payment endpoint* in this page is application-level. Aztec's protocol terminology stays with "partial note," "completer," and "completion log."

## A partial note as an offer to be paid

A partial note is a commitment to `(owner, randomness)`. Once minted, the commitment is just a `Field`: it can be copied freely, stored anywhere, and shared with any sender. Holding the commitment is not enough to complete it, though; only the note's designated completer can complete it with `(storage_slot, value)`.

Two properties make a partial note useful as a payment endpoint:

- **The recipient does not need to be online during the payment.** When a partial note is minted, the contract sends the recipient a private message identifying the partial note. The recipient's Private eXecution Environment (PXE) holds this pending entry and scans for the completion log whenever it has the chance.
- **The completer is fixed when the note is minted.** The minting contract records a validity commitment `H(partial_commitment, completer)` in the nullifier tree. Completion takes a `completer` argument and checks that the matching validity commitment exists, so it only succeeds for the completer the note was minted with. The primitive itself does not inspect `msg_sender`; the standard token is what binds the two, passing `self.msg_sender()` as the completer in both its prepare and finalize entrypoints. In practice, then, only the address the note was minted for (or, in the shim pattern below, the shim) can finalize it.

Each partial note is single-use (see [single-use semantics](./partial_notes.md#single-use-semantics)), so an endpoint that accepts many payments must hold many partial notes.

## The completer choice

The choice of `completer` determines who can pay through a given partial note. Three options matter:

### Completer = the sender's address

The recipient pre-mints one partial note per known sender, with each `completer` set to that sender's address. The sender completes the note with their own funds.

This works without any new contracts but requires the recipient to know each sender's address in advance. It is useful for repeat payers (subscriptions, regular invoices) but does not scale to "anyone can pay this name."

### Completer = a shim contract

The recipient mints partial notes whose `completer` is a known contract address: a *shim* whose only job is to forward into the token's completion function on a sender's behalf. Any sender can invoke the shim, and the shim's address is what the token sees as `msg_sender`, so the validity commitment check passes.

This is the option that scales to unknown senders. The shim does not need any per-name logic, so a single global shim contract could serve every payment endpoint on the network.

One implementation detail matters: the stock token's `prepare_private_balance_increase` always sets the completer to its own `msg_sender`, so the recipient cannot directly mint a partial note with the shim as completer by calling the token. The recipient mints through the shim instead, which calls the token's prepare function from inside the shim's call frame. The token sees the shim as `msg_sender` and records the shim as the completer.

### Completer = the token contract itself

Not viable with the current standard token. The token's public completion entrypoint `finalize_transfer_to_private` debits `msg_sender`'s public balance, so if the token were also the completer, the token would have to debit its own balance. The private path `finalize_transfer_to_private_from_private` separates these roles cleanly via an authwit, which is what makes the shim pattern work for private→private payments.

## The distribution choice

Where the mapping "name → partial-note commitments" lives is independent of who completes the notes:

- **Offchain.** A static file at `alice.example/aztec.json`, an ENS text record, IPFS, or any other lookup channel. The chain never sees the name or the pool size. Requires trust in the hosting and a way to authenticate the result.
- **Onchain.** A registry contract with public storage mapping names to commitments. Censorship-resistant and allows atomic lookup-and-pay in a single transaction, but exposes the pool size, refill cadence, and the plaintext name on every payment.

The two choices are orthogonal. An onchain registry can hand out commitments minted with the shim as completer; an offchain registry can do the same. Only the lookup channel differs.

## A recommended pattern

For "name → unlinkable payment endpoint, recipient offline," the combination that gives the best privacy / UX ratio is:

- Offchain distribution (the recipient hosts the lookup), and
- A shim contract as the completer, and
- Private→private completion to keep the amount hidden.

### The shim contract

An illustrative sketch (not a compilable reference) showing the two roles the shim needs to play, prepare and pay:

```rust
contract PaymentCompleter {
    // Called by a recipient refilling their pool. Forwards into the token's
    // prepare function from the shim's call frame, so the token records the
    // shim as the completer.
    #[external("private")]
    fn prepare(token: AztecAddress, recipient: AztecAddress) -> PartialUintNote {
        self.call(Token::at(token).prepare_private_balance_increase(recipient))
    }

    // Called by any sender holding a commitment. Forwards into the token's
    // private-pay completion from the shim's call frame, with the sender as
    // the debited account.
    #[external("private")]
    fn pay_private(
        token: AztecAddress,
        commitment: Field,
        amount: u128,
        authwit_nonce: Field,
    ) {
        let from = self.context.msg_sender();
        self.call(Token::at(token).finalize_transfer_to_private_from_private(
            from,
            PartialUintNote::from_field(commitment),
            amount,
            authwit_nonce,
        ))
    }
}
```

What this does:

- The recipient calls `prepare` on the shim, passing themselves as the recipient. At the shim, `msg_sender` is the recipient's account. The shim then calls the token's `prepare_private_balance_increase`. At the token's frame, `msg_sender` is the shim, so the partial note is minted with the shim as completer and the recipient as owner.
- A sender calls `pay_private` on the shim with a commitment they obtained through the recipient's lookup channel. The shim reads `from = msg_sender` (the sender) and forwards into the token. At the token's frame, `msg_sender` is the shim, matching the completer the partial note was minted with. The token debits the sender's private balance via authwit and completes the partial note.
- An authwit signed by the sender authorizes the shim to call the token's `finalize_transfer_to_private_from_private` with these specific args. The authwit is unavoidable because the token sees the shim, not the sender, as the immediate caller.

What the shim does not do:

- It does not act as fee payer. Fee sponsorship is a separate concern handled by a [Fee Payment Contract (FPC)](../../../foundational-topics/fees.md) during the transaction's setup phase. A future shim could combine completion and fee sponsorship, but the partial-note pattern does not require it.
- It does not handle public→private payments with the stock token. `finalize_transfer_to_private` debits `msg_sender`'s public balance, so a shim acting as `msg_sender` would have to be pre-funded or the token would need an alternative public-pay entrypoint that takes `from` and authwit explicitly.

### Recipient operations

The recipient is responsible for:

1. Periodically minting fresh partial notes by calling the shim's `prepare` function, which routes through the token so the shim is recorded as the completer.
2. Publishing the resulting commitments through whatever lookup channel they choose.
3. Pruning commitments that have been consumed (the recipient's PXE knows when each partial note has been completed).

Refill cadence is an operational concern. If senders consume commitments faster than the recipient refills, the lookup will return nothing. Batching the mint of many partial notes in a single transaction reduces the per-payment cost.

## What is hidden, what leaks

The pattern hides:

- The recipient's Aztec address from senders.
- The link between any two payments to the same name, as long as each payment consumes a different partial note.
- The amount, in private→private completion, provided the commitment is not exposed to the observer. The completion log payload is plaintext but only useful to a party who can derive the tag, and the tag derives from the commitment. If the recipient's lookup channel hands out the same pool to every viewer, any observer who fetches the pool can derive tags and read completed amounts for that pool. Authenticated or sender-specific distribution narrows this exposure.

The pattern leaks:

- The fact that the shim contract was invoked in a transaction.
- The completion log tag for each payment. The tag does not reveal the recipient, but it confirms that *some* completion happened against *some* partial note.
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
- [AIP-20: Fungible Token](../../standards/aip-20.md): a token standard that exposes commitment-based transfers directly.
- [Keys](../../../foundational-topics/accounts/keys.md): how Aztec accounts derive addresses. Partial-note endpoints offer an alternative to addresses for the specific use case of being paid.
- [Fees](../../../foundational-topics/fees.md): how fee payment and sponsorship work, independent of the partial-note pattern.
