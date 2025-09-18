---
title: CHONK - Client-side Highly Optimized ploNK
description: Learn about CHONK, Aztec's specialized proving system designed for client-side proving with low memory requirements and efficient recursion for private smart contract execution.
keywords: [chonk, plonk, proving system, recursive proofs, protogalaxy, goblin plonk, zero knowledge, aztec, client-side proving, hyperplonk, sumcheck]
image: https://hackmd.io/_uploads/BkpsblXEgg.jpg
sidebar_position: 1
---

![CHONK Overview](https://hackmd.io/_uploads/BkpsblXEgg.jpg)

Aztec's goal is to enable private verifiable execution of smart contracts. This motivates a proving system design where:

- Proofs can be generated with relatively low memory, so that the prover can be run on a phone or browser.
- Proofs can efficiently incorporate many layers of recursion - as the claims being proven are of a recursive nature - one contract function calls another which calls another etc.

The second goal indirectly supports the first - efficient recursion goes hand in hand with low memory proving, as statements can be decomposed via recursion into smaller statements that require less prover memory.

We call the proving system **CHONK - Client-side Highly Optimized ploNK**. As the name suggests, its starting point is the [PlonK proving system](https://eprint.iacr.org/2019/953).

As in the original PlonK system:

- It is based on elliptic curves and pairings.
- Circuit constraints are expressed via selector polynomials and copy constraints.

Its deviations from PlonK, detailed below, are motivated by the above goals.

## Key Deviations from PlonK

### 1. Proving statements about a sequence of circuits

A statement about contract execution will translate to multiple circuits - representing the different contract functions called during the execution. Between each two of these circuits we need to run an Aztec constructed *Kernel circuit* to do "bookkeeping" - like making sure the correct arguments are passed from function to function. More details on this approach can be found in the [Aztec documentation](https://docs.aztec.network) and the [Stackproofs paper](https://eprint.iacr.org/2024/1281).

### 2. Replacing univariate quotienting by sumcheck

This eliminates FFT's and reduces prover time and memory at the expense of proof length. This approach is the main theme of the [hyperplonk paper](https://eprint.iacr.org/2022/1355).

### 3. Using the protogalaxy (PG) folding scheme

Folding schemes enable cheaper recursion than standard recursive proofs. They work most smoothly with elliptic-curve based proofs systems like CHONK. We specifically work with [protogalaxy](https://eprint.iacr.org/2023/1106) which is convenient and efficient for folding non-uniform PlonK circuits (i.e. not a fixed repeating circuit).

### 4. Enhancing PG with "Goblin plonk"

Though PG (as do other folding schemes) already facilitates efficient recursion, it can still be a bit heavy client-side due to the non-native elliptic curve scalar multiplications performed by the folding verifier. For this reason, we use a "lazy" version of PG where the verifier doesn't perform these operations, but rather simply adds them to a queue of EC operations that need to be performed at the final proving stage. We call this deferral mechanism [*Goblin Plonk*](https://hackmd.io/@aztec-network/BkGNaHUJn/%2FdUsu57SOTBiQ4tS9KJMkMQ) (GP) (see also [this paper](https://eprint.iacr.org/2024/1651)).

The advantage of GP is that at this final stage we transition to another elliptic curve called Grumpkin where these operations are more efficient. This curve-switch approach was initiated by [BCTV](https://eprint.iacr.org/2014/595.pdf), and a good example of it in the modern folding context is [CycleFold](https://eprint.iacr.org/2023/1192). GP is arguably simpler than CycleFold where we switch back and forth between the curves at every iteration of the IVC. The approaches are however incomparable, and for example, CycleFold has the advantage of the final IPA verifier size not growing with the number of iterations. (Although this verifier can be run server-side once for all client proofs using the [Halo](https://eprint.iacr.org/2019/1021)/[BCMS](https://eprint.iacr.org/2020/499) accumulation mechanism.)

## Learn More

*For a more colorful video presentation of the above check out [this talk](https://www.youtube.com/watch?v=j6wlamEPKlE).*
