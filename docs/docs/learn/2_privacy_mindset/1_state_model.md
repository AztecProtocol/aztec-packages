---
title: "State model: Notes, commitments & nullifiers"
description: "How Aztec models private state with notes, commitments, and nullifiers, and how five state trees preserve privacy and prevent double‑spend."
sidebar_position: 1
tags: [privacy, notes, commitments, nullifiers, state]
---

import Image from "@theme/IdealImage";

This page introduces the core ideas behind Aztec’s private state model: what notes are, how commitments and nullifiers work, and the state Merkle trees that hold everything together.

## What you’ll learn

- What a note is and why we use them
- How notes relate to UTXOs (cash-like state)
- What a commitment is and why it preserves privacy
- What a nullifier is and how it prevents double spending
- The five state Merkle trees in Aztec and their roles

## Prerequisites

- You’ve seen account-based blockchains (like Ethereum).
- You’ve heard of Merkle trees at a high level.

For deeper technical references, see:

- [State model](../../developers/docs/concepts/storage/state_model)
- [Notes](../../developers/docs/concepts/storage/notes)

## Public and Private State

Aztec has _two_ types of state: public and private state. This enables **programmable privacy** so you can build applications with selective transparency to keep sensitive data private while maintaining public verifiability where needed.

These two types of state are managed by **two different state models**

### Public state: Account based

**Public state** can be directly updated and read by everyone. It works similarly to state on Ethereum. It is transparent. On Aztec, this public state is managed by smart contracts and stored and updated by the sequencers using an account-based model.

Whenever data, for example, an accounts balance, is stored, a `key: value` pair is created. For example:

```
0x123...abc_balance: 1
```

When the data is modified, the `value` corresponding to the `key` is updated. Account state is updated directly when transactions are executed. It can then be read by anyone.

This is how **public state** works on Aztec. This public data, which follows this account model, is stored in a **public state Merkle tree**, one of Aztec's 5 Merkle trees!

### Private state: UTXO based

**Private state** works differently. Why? Let's go through it. Let's imagine we are still working with an account-based model but let's now say we encrypt the data:

```
0x$$$_$$$_balance: $
```

When we send a transaction, it will modify this specific slot directly. So, even if the key and value themselves are encrypted, the data location is leaked. Using correlation techniques, this would expose information about the contract and variable being updated and break the privacy assumption.

Therefore, we use a different model that breaks the link between the user and their balance. This means that balances can be updated whilst keeping the account and their associated data separate and private.

Enter UTXO-based private state using **notes**, which we will go through shortly. For now, just think of them as a sealed envelope that contains the data (e.g. a balance) sealed inside.

We have explained UTXO-based state models in a previous lesson, but let's do a recap.

Think of the UTXO model like physical cash. When you have cash in your wallet, you don't have "a balance", you have individual bills: a \$20 bill, two \$10 bills, and some $5 bills.

**Cash:**

```
Alice has a $20 bill and a $10 bill (total: $30).
She wants to pay Bob $25.
Alice gives Bob both bills ($30 total)
Bob gives Alice back a $5 bill as change.
Result: Bob has $25, Alice has $5.
```

**UTXO Transaction:**

```
Alice has a 20-token note and a 10-token note (total: 30 tokens).
She wants to pay Bob 25 tokens.
Alice consumes (this is called nullifying) both her existing notes and creates two new notes: a 25-token note for Bob and a 5-token note for herself as change.
Result: Bob has a 25-token note, Alice has a 5-token note.
```

Only the people involved in the transaction know their respective amounts and identities (Alice knows how much she sent to Bob and her remaining balance and Bob only knows that he received 25 tokens _not_ Alice's remaining balance). Everyone else just sees "some transaction happened" without knowing who, what, or how much. There's no "Alice has 30 tokens" stored anywhere, only individual hashed notes that _only she can knows the preimage for_. Each note is committed to (hashed) and stored separately, rather than the balance being stored in a single note. This allows the connection between a user and their total balance to be broken.

But what actually is a note?

<Image img={require("@site/static/img/public-and-private-state-diagram.png")} />

## Notes

A note is a piece of private data that can optionally be encrypted to share with other users. Notes are fundamental building blocks of private state. They are hashed to create commitments which are stored in a Merkle tree and may be posted onchain to make the data easily retrievable by their intended owner, but it is not required.

Think of a note as an envelope or sealed box that contains tokens inside, and only the note owner has the key to open:

- Ownership: Only the owner with the key (called the nullification key) can spend the note.
- Location: In order to maintain privacy, notes aren't tied to a fixed storage slot like an Ethereum account balance. Instead they are appended to the note hash Merkle tree.
- UTXO-like: To "spend" or "update", you consume old notes and create new ones.

But what actually is a note? A note is just a `struct`, plus some methods, written in Noir, that specify the information about the note itself. Here's an example of what a note looks like:

```rust
#[note]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
```

[TODO] check this cos like what about ID etc?

## Commitments

Raw notes are not stored onchain. Instead, a commitment of the note is stored. A commitment is just a **hash** of the note content plus some randomness to ensure that the commitment is not linkable to the note and so that observers cannot brute-force hash note preimages to reveal the note data.

Note commitments are stored in an _append-only_ **Note hash Merkle tree** (one of Aztec's 5 Merkle trees). To spend a note, the owner proves knowledge of the note by providing the associated commitment's "preimage".

[TODO] diagram of the note commitment tree

Commitments have **two key properties**:

- **Hiding**: The commitment reveals nothing about the note contents or owner.
- **Binding**: The data (the note) cannot be modified once it has been committed to.

Note commitments let users prove note ownership, and the protocol check that a note exists without revealing its data.

## Nullifiers

To prevent double-spends, we need a public record that "this specific note commitment is now used" without revealing which note.

- A nullifier is a unique value, derived from the note and owner secrets.
- It's designed so that outsiders can't link it to a specific commitment.
- Nullifiers live in one of the five state trees, **the Nullifier Tree**.
- No transaction can emit a nullifier that already exists in the tree.

Together, commitments say "a note was created", and nullifiers say "a note was consumed once—and only once".

## Summary

**Public data** is stored in a Merkle tree using an **account-based model** with key-value pairs, in the same way that Ethereum manages state.

**Private data** is stored in a **note**, which is a UTXO-like envelope that contains the private data. These notes are hashed to produce a **commitment** and stored in an **append-only** note hash Merkle tree.

To "spend" a note, the user must prove that they know the **preimage** to the commitment without revealing it (this is done using zero-knowledge proofs, which will be explained in the next lesson). Then, a **nullifier** is created and stored in the nullifier Merkle tree to mark it as used.

## Five State Trees

1. The **Note hash Merkle tree** holds commitments (hashes) of private notes. It is append-only and used for membership proofs when spending.
2. The **Nullifier tree** holds nullifiers (unique "spent" markers) to prevent reusing the same note.
3. The **Public data tree** holds public contract storage (keyed by contract and slot e.g. `contract_address: slot_1`). It is transparent like traditional blockchains.
4. The **L1-to-L2 Message tree** holds messages sent from L1 to L2.
5. The **Archive Tree** tracks historical roots to enable proving against past states (e.g., "as of block N"). [TODO] historical note roots? Roots of which tree?

:::note
Why append‑only for private data?
Updating a specific slot would leak that "something changed here". Append‑only commits avoid that leak. Nullifiers carry the "delete" semantics without linking to a specific note.
:::

## Check your understanding

- Which structure holds private notes?
  Answer: The note hash Merkle tree stores commitments to notes.

- What prevents a note from being spent twice?
  Answer: A nullifier is emitted when a note is spent to mark is as "used". The nullifier Merkle tree stores the used nullifiers.

- Why not update a private value in a fixed slot?
  Answer: Slot updates leak that a specific value changed. Append-only commitments avoid this.

## More Information

If you'd like to learn about notes in more depth:

- Concept deep dive on notes: [Notes](../../developers/docs/concepts/storage/notes)
- Hybrid state model details: [State model](../../developers/docs/concepts/storage/state_model)
- How users receive notes (discovery): [Note discovery](../../developers/docs/concepts/advanced/storage/note_discovery)
