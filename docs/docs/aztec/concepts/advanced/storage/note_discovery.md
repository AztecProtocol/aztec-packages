---
title: Note discovery
tags: [storage, concepts, advanced]
sidebar_position: 4
---


Note discovery refers to the process of a [PXE](../../pxe/index.md) finding the notes that it owns.

Existing protocols use the brute force method of note discovery, also known as trial-decrypt. This involves downloading all notes in the network and attempting to decrypt each one. If you can decrypt it, it means you own it. However, this gets expotentially more computationally expensive as the network grows. It also relies on a server to coninually collect notes and trial-decrypt them, adding another point of failure. 

Another solution could be that the sender of the note communicates the note content to the recipient in some off-chain way. This would allow the recipient to find the note that belongs to them and decrypt it. However, we want the network to be able to exist by itself.

To solve this, Aztec utilizes somethnig called *note tagging* that allows users to register an expected note sender in their PXE. This tells the PXE to expect notes coming from that expected sender, which helps more efficiently discover the encrypted notes being created for its registered accounts.


