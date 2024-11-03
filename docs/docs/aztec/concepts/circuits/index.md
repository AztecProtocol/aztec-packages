---
title: Circuits
sidebar_position: 7
tags: [protocol, circuits]
---

Central to Aztec's operations are 'circuits' derived from both the core Aztec protocol and developer-written Aztec.nr contracts. 

These circuits enhance privacy by adding additional security checks and preserving transaction details—a characteristic that is often limited in Ethereum.

On this page, you’ll learn more about these circuits and their integral role in promoting secure and efficient transactions within Aztec's privacy-centric framework.

# Motivation

In Aztec, circuits come from two sources:

1. Core protocol circuits
2. User-written circuits (written as Aztec.nr contracts and deployed to the network)

This page focuses on the core protocol circuits. These circuits check that the rules of the protocol are being adhered to.

When a function in an Ethereum smart contract is executed, the EVM performs checks to ensure that Ethereum's transaction rules are being adhered to correctly. Examples include:

- "Does this tx have a valid signature?"
- "Does this contract address contain deployed code?"
- "Does this function exist in the requested contract?"
- "Is this function allowed to call this function?"
- "How much gas has been paid, and how much is left?"
- "Is this contract allowed to read/update this state variable?"
- "Perform the state read/state write"
- "Execute these opcodes"

All of these checks have a computational cost, for which users are charged gas.

Many existing L2s move this logic off-chain to save their users gas costs and increase transaction throughput.

zk-Rollups, in particular, move these checks off-chain by encoding them in zk-SNARK circuits. Instead of paying a committee of Ethereum validators to perform these checks, L2 users pay a sequencer to execute them via the circuits that encode the checks. It is often cheaper for users to pay the sequencer for this than to execute a smart contract on Ethereum directly.

But there's a problem.

Ethereum (and the EVM) does not support privacy.

The EVM does not have the concept of private state variables or private functions. This means users cannot keep the values of private state variables hidden from Ethereum validators or from existing (non-private) L2 sequencers. They also cannot keep the details of executed functions private from validators or sequencers.

# How does Aztec add privacy?

Aztec addresses this by encoding additional checks in our zk-Rollup's zk-SNARK circuits. These extra checks introduce the concepts of private state and private functions, enforcing privacy-preserving constraints on every transaction sent to the network.

In other words, since neither the EVM nor other rollups have rules for preserving privacy, we have developed a new rollup that introduces such rules and written circuits to enforce them!

What extra rules and checks does a rollup need to enforce notions of private states and private functions? For example:

- "Perform state reads and writes using new tree structures that prevent transaction linkability" (see [trees](../storage/trees/index.md)).
- "Hide the executed function by wrapping it in a zk-SNARK"
- "Hide all executed functions as part of this transaction's stack trace by wrapping the entire transaction in a zk-SNARK"

# Aztec core protocol circuits

What kinds of core protocol circuits does Aztec have?
## Kernel Circuits

Read more about the kernel circuits in the protocol specifications [here](../../../protocol-specs/circuits/high-level-topology.md).

## Rollup Circuits

- [Rollup Circuits](../../../protocol-specs/rollup-circuits/index.md)

## Squisher Circuits

We haven't fully specified these yet, as the Honk and Goblin Plonk schemes are still being improved! However, we will need additional circuits to compress a Honk proof (produced by the Root Rollup Circuit) into a Standard Plonk or Fflonk proof for efficient verification on Ethereum.
