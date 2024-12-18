---
title: Storage
description: How are storage slots derived for public and private state
sidebar_position: 2
tags: [protocol, storage]
---

In Aztec, private data and public data are stored in two trees; a public data tree and a note hashes tree.

These trees have in common that they store state for _all_ accounts on the Aztec network directly as leaves. This is different from Ethereum, where a state trie contains smaller tries that hold the individual accounts' storage.

It also means that we need to be careful about how we allocate storage to ensure that they don't collide! We say that storage should be _siloed_ to its contract. The exact way of siloing differs a little for public and private storage. Which we will see in the following sections.
