---
title: Notes (UTXOs)
sidebar_position: 5
tags: [notes, storage]
---

import Image from "@theme/IdealImage";

The [state model page](./state_model.md) explains that there is a difference between public and private state. Private state uses UTXOs (unspent transaction ouputs), also known as notes. This page introduces the concept of UTXOs and how notes are abstracted on Aztec.

## What are notes?

In an account-based model such as Ethereum, each account is typically associated a specific location in the data tree. In a UTXO model, each note specifies its owner and there is no relationship between an account and data's location in the data tree. Notes are encrypted pieces of data that can only be decrypted by their owner. 

Commitments to notes are stored in a merkle tree of hashes of all notes (aptly named the note hash tree). Users will prove that they have the note pre-image information when they update private state in a contract.

When a note is updated, Aztec nullifies the original commitment in the note hash tree by creating a nullifier from the note data, and may create a new note with the updated information, encrypted to a new owner if necessary. This helps to decouple actions of creating, updating and deleting private state.

 <Image img={require("/img/public-and-private-state-diagram.png")} />

Notes are comparable to cash. When you want to spend $3.50 USD in real life, you give your $5 note to a cashier who will keep $3.50 and give you separate notes that add up to $1.50. Only you and the cashier are aware of this transaction.

## Abstracting notes from from apps & users

When using the Aztec protocol, users may not be aware of the specific notes that they own. Their experience should be similar to Ethereum, and should instead see the amount of their assets inside their account. 

This is accomplished through the smart contract library, Aztec.nr, which abstracts notes by allowing developers to specify custom note types and also helps users discover all of the notes that have been encrypted to their account and posted to the chain. This means they can specify how notes are interacted with, nullified, transferred, and displayed. 

To understand note abstraction in Aztec.nr, you can read the [Build section](../../../developers/guides/smart_contracts/writing_contracts/notes/index.md).
