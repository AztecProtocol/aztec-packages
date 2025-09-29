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

Aztec has _two_ types of state: public and private state. This enables **programmable privacy** so you can build applications with selective transparency to keep sensitive data encrypted while maintaining public verifiability where needed.

These two types of state are managed by **two different state models**

### Public state: Account based

**Public state** can be directly updated and read by everyone. It works similarly to state on Ethereum. It is transparent. On Aztec, this public state is managed by smart contracts and stored and updated by the sequencers using an account-based model.

Whenever data, for example, an accounts balance, is stored, a `key: value` pair is created. For example:

```
0x123...abc_balance: 1
```

When the data is modified, the `value` corresponding to the `key` is updated. Account state is updated directly when transactions are executed. It can then be read by anyone.

This is how **public state** works on Aztec.

### Private state: UTXO based

**Private state** works differently. Why? Let's go through it. Let's say we encrypt the data:

```
0x$$$_$$$_balance: $
```

When we send a transaction, it will modify this specific slot directly. So, even if the key and value themselves are encrypted, the data location is leaked. Using correlation techniques, this would expose information and break the privacy assumption. Therefore, we use a different model that breaks the link between the user and their balance. This means that balances can be updated whilst keeping the account and their associated data seperate and private.

Enter UTXO-based private state using **notes**, which we will go through shortly. For now, just think of them as a sealed envelope that contains the data (e.g. a balance) sealed inside.

We have explained UTXO-based state models in a previous lesson, but let's do a recap.

Think of the UTXO model like physical cash. When you have cash in your wallet, you don't have "a balance", you have individual bills: a $20 bill, two $10 bills, and some $5 bills.

**Cash:**

Alice has a $20 bill and a $10 bill (total: $30).
She wants to pay Bob $25.
Alice gives Bob both bills ($30 total)
Bob gives Alice back a $5 bill as change.
Result: Bob has $25, Alice has $5.

**UTXO Transaction (Private Notes):**

Alice has a 20-token note and a 10-token note (total: 30 tokens).
She wants to pay Bob 25 tokens.
Alice consumes (this is called nullifying) both her existing notes and creates two new notes: a 25-token note for Bob and a 5-token note for herself as change.
Result: Bob has a 25-token note, Alice has a 5-token note.

There's no "Alice has 30 tokens" stored anywhere, only individual encrypted notes that _only she can decrypt_. When Alice spends her notes, observers see "some notes were consumed and some new notes were created" but can't tell who owns them or link them together.

Each note can be encrypted separately and independently, breaking the connection between a user and their total balance.

Just like with physical cash, only the people involved in the transaction know their respective amounts and identities (Alice knows how much she sent to Bob and her remaining balance and Bob only knows that he recieved 25 tokens not Alice's remaining balance). Everyone else just sees "some transaction happened" without knowing who, what, or how much.

On Aztec, private state follows the following pattern:

- New encrypted notes are **replaced** appended rather than "edited in place". This is a UTXO-based model rather than an account-based model.
- Private data is hidden using commitments (hashes).
- Private data is prevented from being reused using nullifiers (an identifier which determines that the note has been spent).

This model mirrors how cash works: you don't edit a banknote—you hand it over and, if needed, you get new banknotes as change. This is called a **UTXO-based model**.

<Image img={require("@site/static/img/public-and-private-state-diagram.png")} />

## Notes

A note a piece of private data owned by someone, they are fundamental building blocks of private state. Notes may be encrypted, by hashing them to create a **commitment** and posted onchain to make the data easily retrievable by their intended owner, but it is not required.

Think of it as an envelope or sealed box that contains tokens inside, and only the note owner has the key to open:

- Ownership: Only the owner with the key (called the nullification key) can spend the note.
- Location: In order to maintain privacy, notes aren't tied to a fixed storage slot like an Ethereum account balance. Instead they are appended to a Merkle tree.
- UTXO-like: To "spend" or "update", you consume old notes and create new ones.

## Commitments

We do not store the raw note onchain. Instead, we store a commitment, which is just a hash of the note content plus some randomness to ensure that the commitment is not linkable to the note and so that observers cannot brute-force hash note preimages to reveal the note data. Note commitments are stored in an _append-only_ **Note hash Merkle tree** (the first of Aztec's 5 Merkle trees). To spend a note, the owner proves knowledge of the note by providing the associated commitment's "preimage".

Commitments have **two key properties**:
- **Hiding**: The commitment reveals nothing about the note contents or owner.
- **Binding**: The data (the note) cannot be modified once it has been commited to.

Note commitments let users prove note ownership, and the protocol check that a it exists without revealing its data.

## Nullifiers

To prevent double-spends, we need a public record that "this specific note commitment is now used" without revealing which note.

- A nullifier is a unique value, derived from the note and owner secrets.
- It's designed so that outsiders can't link it to a specific commitment.
- Nullifiers live in one of the five state trees, the Nullifier Tree.
- No transaction can emit a nullifier that already exists in the tree.

Together, commitments say "a note was created", and nullifiers say "a note was consumed once—and only once".

## A simple private transfer

1. Create commitments:

- The sender proves ownership of their input notes.
- New output note commitments are produced (e.g., one to the recipient, one as change).

2. Emit a nullifier:

- The spent input note(s) emit nullifiers to mark them as consumed.

3. Prove and publish:

- The sender’s wallet generates proofs that the user is following the rules of the contract they are interacting with, as well as the protocol rules.
- The sequencer includes the commitment inserts and nullifiers in the block and updates the trees.

Result: Observers see new commitments and nullifiers, but not who paid whom or how amounts were split.

## Five State Trees

- The **Note Hash Tree** holds commitments (hashes) of private notes. It is append-only and used for membership proofs when spending.
- The **Nullifier Tree** holds nullifiers (unique "spent" markers) to prevent reusing the same note.
- The **Public Data Tree** holds public contract storage (keyed by contract and slot). It is transparent like traditional blockchains.
- The **Contract Tree** records deployed contracts and related data. Some deployment details are evolving toward nullifier-based storage, but conceptually this tree tracks deployments. [TODO] what does this mean "some deployment details..."
- The **Archive Tree** tracks historical roots to enable proving against past states (e.g., "as of block N"). [TODO] historical note roots? Roots of which tree?

:::note
Why append‑only for private data?
Updating a specific slot would leak that "something changed here". Append‑only commits avoid that leak. Nullifiers carry the "delete" semantics without linking to a specific note.
:::

## Public state

[TODO: add more detail about public state. mention that it is similar to traditional blockchains. Aztec enables interactivity between private and public state, more on this in a future section.]

## Developer mindset tips

- Think "consume and create" (UTXO style), not "overwrite in place".
- Use fresh randomness and avoid patterns that could make notes linkable.
- Rely on the PXE to handle proofs and note discovery; apps should present balances and state at a higher level than individual notes.

## Check your understanding

- Which structure holds private note inserts?
  Answer: The Note Hash Tree stores commitments to notes.

- What prevents a note from being spent twice?
  Answer: A nullifier is emitted once; the Nullifier Tree enforces uniqueness.

- Why not update a private value in a fixed slot?
  Answer: Slot updates leak that a specific value changed; append-only commitments avoid this.

## Next steps

- Concept deep dive on notes: [Notes](../../developers/docs/concepts/storage/notes)
- Hybrid state model details: [State model](../../developers/docs/concepts/storage/state_model)
- How users receive notes (discovery): [Note discovery](../../developers/docs/concepts/advanced/storage/note_discovery)
