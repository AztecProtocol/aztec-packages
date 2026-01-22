---
title: Network Architecture
description: Understand how the Aztec network architecture works - block production, sequencer selection, and proving.
displayed_sidebar: conceptsSidebar
---

# Network Architecture

The Aztec network operates through coordinated interaction between different node types. Together, they process transactions, produce blocks, and generate proofs.

## How Nodes Work Together

1. **Transaction Flow**: Users submit transactions to full nodes, which validate and propagate them through the P2P network
2. **Block Production**: Sequencer nodes collect transactions from the mempool, order them, and propose new blocks
3. **Consensus**: The sequencer committee validates proposed blocks and provides attestations
4. **Proof Generation**: Prover nodes generate cryptographic proofs for epochs of blocks
5. **L1 Submission**: Sequencers submit attested blocks and provers submit epoch proofs to Ethereum

## Topics

- [Block Production](architecture/block-production) - How sequencers and provers work together to produce and finalize blocks
- [Proving Coordination](architecture/proving-coordination) - How provers coordinate to generate epoch proofs

---

:::tip Ready to operate?
- [Run a sequencer](../operators/setup/sequencer_management)
- [Run a prover](../operators/setup/running_a_prover)
:::
