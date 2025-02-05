---
title: Notes (UTXOs)
sidebar_position: 5
tags: [notes, storage]
---

The [state model page](./state_model.md) explains that there is a difference between public and private state. Private state uses UTXOs, also known as notes. This page introduces the concept of UTXOs and how notes are abstracted on Aztec.

## What are notes?



## Abstracting UTXOs from from apps & users with Aztec.nr

The goal of the Aztec.nr smart contract library is to abstract the UTXO model away from an app user / developer, contract developers are the only actor who should have to think about UTXO's.

This is achieved with two main features:

1. Users sign over transactions, not over specific UTXO's
2. Aztec.nr contracts support developer defined `unconstrained` getter functions to help dApp's make sense of UTXO's. e.g `getBalance()`. These functions can be called outside of a transaction context to read private state.