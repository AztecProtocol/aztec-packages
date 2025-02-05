---
title: Notes (UTXOs)
sidebar_position: 5
tags: [notes, storage]
---

import Image from "@theme/IdealImage";

The [state model page](./state_model.md) explains that there is a difference between public and private state. Private state uses UTXOs, also known as notes. This page introduces the concept of UTXOs and how notes are abstracted on Aztec.

## What are notes?

In an account-based model such as Ethereum, each account owns a specific amount of asset. In a UTXO model, each note has an owner. Notes are encrypted pieces of data that can only be decrypted by their owner. To change the owner of a note, Aztec destroys the original note, creates a nullifier, and creates a new note that is encrypted to the new owner. This helps to maintain privacy.

 <Image img={require("/img/public-and-private-state-diagram.png")} />

Notes are comparable to cash. When you want to spend $3.50 USD in real life, you give your $5 note to a cashier who will keep $3.50 and give you separate notes that add up to $1.50. Only you and the cashier are aware of this transaction.

## Abstracting notes from from apps & users

When using the Aztec protocol, users may not be aware of the specific notes that they own. Their experience should be similar to Ethereum, and should instead see the amount of their assets inside their account. 

This is accomplished through the smart contract library, Aztec.nr, which abstracts notes by allowing developers to specify their own note types. This means they can specify how they are interacted with, nullified, transferred, and displayed. 

To understand note abstraction in Aztec.nr, you can read the [Build section](../../../developers/guides/smart_contracts/writing_contracts/notes/index.md).
