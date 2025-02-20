---
title: Note Discovery
tags: [storage, concepts, advanced, notes]
sidebar_position: 3
---

Note discovery refers to the process of a user identifying and decrypting the [encrypted notes](../../storage/notes.md) that belong to them.

## Existing solutions

### Brute force / trial-decrypt

In some existing protocols, the user downloads all possible notes and tries to decrypt each one. If the decryption succeeds, the user knows they own that note. However, this approach becomes exponentially more expensive as the network grows and more notes are created. It also introduces a third-party server to gather and trial-decrypt notes, which is an additional point of failure. Note that this note discovery technique is not currently implemented for Aztec.

### Off-chain communication

Another proposed solution is having the sender give the note content to the recipient via some off-chain communication. While it solves the brute force issue, it introduces reliance on side channels which we don't want in a self-sufficient network. This option incurs lower transaction costs because fewer logs needs to be posted on-chain. Aztec apps will be able to choose this method if they wish.

## Aztec's solution: Note tagging

Aztec introduces an approach that allows users to identify which notes are relevant to them by having the sender *tag* the log in which the note is created. This is known as note tagging. The tag is generated in such a way that only the sender and recipient can identify it.

### How it works

#### Every log has a tag

In Aztec, each emitted log is an array of fields, eg `[x, y, z]`. The first field (`x`) is a *tag* field used to index and identify logs. The Aztec node exposes an API `getLogsByTags()` that can retrieve logs matching specific tags.

#### Tag generation

The sender and recipient share a predictable scheme for generating tags. The tag is derived from a shared secret and an index (a shared counter that increments each time the sender creates a note for the recipient).

#### Discovering notes in Aztec contracts

This note discovery scheme will be implemented by Aztec contracts rather than by the PXE. This means that users can update or use other types of note discovery to suit their needs.

### Limitations

- **You cannot receive notes from an unknown sender**. If you do not know the sender’s address, you cannot create the shared secret, and therefore cannot create the note tag. There are potential ways around this, such as senders adding themselves to a contract and then recipients searching for note tags from all the senders in the contract. However this is out of scope at this point in time.

- **Index synchronization can be complicated**. If transactions are reverted or mined out of order, the recipient may stop searching after receiving a tag with the latest index they expect. This means they can miss notes that belong to them. We cannot redo a reverted a transaction with the same index, because then the tag will be the same and the notes will be linked, leaking privacy. We can solve this by widening the search window (not too much, or it becomes brute force) and implementing a few restrictions on sending notes. A user will not be able to send a large amount of notes from the same contract to the same recipient within a short time frame.

## Further reading

- [How partial notes are discovered](./partial_notes.md#note-discovery)