---
title: "State model: Notes, commitments & nullifiers"
description: "How Aztec models private state with notes, commitments, and nullifiers, and how five state trees preserve privacy and prevent double‑spend."
sidebar_position: 1
tags: [privacy, notes, commitments, nullifiers, state]
---

import Image from "@theme/IdealImage";

This page introduces the core ideas behind Aztec’s private state model—what notes are, how commitments and nullifiers work, and the state trees that hold everything together.

## What you’ll learn

- What a note is and why we use them
- How notes relate to UTXOs (cash-like state)
- What a commitment is and why it preserves privacy
- What a nullifier is and how it prevents double‑spends
- The five state trees in Aztec and their roles

## Prerequisites

- You’ve seen account-based blockchains (like Ethereum).
- You’ve heard of Merkle trees at a high level.

For deeper technical references, see:

- [State model](../../developers/docs/concepts/storage/state_model)
- [Notes](../../developers/docs/concepts/storage/notes)

## The privacy mindset

Public state can be directly updated and read by everyone.

[TODO] add more detail about the account-based model and the UTXO model

Private state can't: updating "the same place" would reveal that something changed, even if the value is encrypted. So in Aztec, private data follows a different pattern:

- We append new encrypted records rather than "edit in place".
- We hide contents with commitments (hashes).
- We prevent reuse with nullifiers (unique, un-linkable deletes).

This model mirrors how cash works: you don't edit a banknote—you hand it over and, if needed, get change.

<Image img={require("@site/static/img/public-and-private-state-diagram.png")} />

## Notes

A note a piece of private data owned by someone, they are fundamental building blocks of private state. Notes may be encrypted and posted onchain to make the data easily retrievable by their intended owner, but it is not required.

Think of it as a private coin or token fragment:

- Ownership: Only the owner with the nullification key can spend the note.
- Location-less: In order to maintain privacy, notes aren't tied to a fixed storage slot like an Ethereum account balance.
- UTXO-like: To "spend" or "update", you consume old notes and create new ones.

Analogy: You have a 5 dollar note. To pay 3.50, you hand over the 5 and get new notes (3.50 to the recipient, 1.50 back to you). On Aztec, you "nullify" the 5 note and create two new notes with the appropriate owners and values. Observers don't learn who owned which note or how it was split.

## Commitments

We do not store the raw note onchain. Instead, we store a commitment—essentially a hash of the note content plus randomness. We add randomness to the commitment to ensure that the commitment is not linkable to the note and so that observers cannot brute-force hash note preimages to reveal the note data.

- Privacy: The hash reveals nothing about the note contents or owner.
- Proofs: The owner later proves knowledge of the note "preimage" to spend or update it.
- Commitments live in the append-only Note Hash Tree.

This lets users prove, and the protocol check that a note exists without revealing its data.

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
- The **Contract Tree** records deployed contracts and related data. Some deployment details are evolving toward nullifier-based storage, but conceptually this tree tracks deployments.
- The **Archive Tree** tracks historical roots to enable proving against past states (e.g., "as of block N").

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
