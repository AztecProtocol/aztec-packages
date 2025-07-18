---
title: Notes (UTXOs)
sidebar_position: 5
tags: [notes, storage]
---

import Image from "@theme/IdealImage";

The [state model page](./state_model.md) explains that there is a difference between public and private state. Private state uses UTXOs (unspent transaction ouputs), also known as notes. This page introduces the concept of UTXOs and how notes are abstracted on Aztec.

## What are notes?

In an account-based model such as Ethereum, each account is typically associated with a specific location in the data tree. In a UTXO model, each note specifies its owner and there is no relationship between an account and data's location in the data tree. Notes are encrypted pieces of data that can only be decrypted by their owner.

Rather than storing entire notes in a data tree, note commitments (hashes of the notes) are stored in a merkle tree, aptly named the note hash tree. Users will prove that they have the note pre-image information when they update private state in a contract.

When a note is updated, Aztec nullifies the original commitment in the note hash tree by creating a nullifier from the note data, and may create a new note with the updated information, encrypted to a new owner if necessary. This helps to decouple actions of creating, updating and deleting private state.

<Image img={require("@site/static/img/public-and-private-state-diagram.png")} />

Notes are comparable to cash, with some slight differences. When you want to spend \$3.50 USD in real life, you give your \$5 note to a cashier who will keep \$3.50 and give you separate notes that add up to \$1.50. Using private notes on Aztec, when you want to spend a \$5 note, you nullify it and create a \$1.5 note with yourself as the owner and a \$3.5 note with the recipient as the owner. Only you and the recipient are aware of \$3.5 transaction, they are not aware that you "split" the \$5 note.

## Sending notes

When creating notes for a recipient, you need a way to send the note to them. There are a few ways to do this:

### On-chain (encrypted logs):

This is the common method and works well for most use cases. You can emit an encrypted log as part of a transaction. The encrypted note data will be posted onchain, allowing the recipient to find the note through [note discovery](../advanced/storage/note_discovery.md).

### Off-chain (out of band):

In some cases, if you know the recipient off-chain, you might choose to share the note data directly with them. The recipient can store that note in their PXE and later spend it.

### Self-created notes (not emitted):

If you create a note for yourself, you don’t need to broadcast it to the network or share anything. You will only need to keep the note somewhere, such as in your PXE, so you can prove ownership and spend it in future transactions.

## Abstracting notes from apps & users

When using the Aztec protocol, users may not be aware of the specific notes that they own. Their experience should be similar to Ethereum, and should instead see the amount of their assets inside their account.

This is accomplished through the smart contract library, Aztec.nr, which abstracts notes by allowing developers to specify custom note types. This means they can specify how notes are interacted with, nullified, transferred, and displayed. Aztec.nr also helps users discover all of the notes that have been encrypted to their account and posted to the chain, known as [note discovery](../advanced/storage/note_discovery.md).

To understand note abstraction in Aztec.nr, you can read the [Build section](../../../developers/guides/smart_contracts/writing_contracts/notes/index.md).
