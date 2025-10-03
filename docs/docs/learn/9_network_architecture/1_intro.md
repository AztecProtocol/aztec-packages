---
title: "Introduction to Network Architecture"
description: "Learn about the architecture of the Aztec network and its key components."
tags: [network, architecture]
---

The Aztec network is built on a sophisticated architecture that combines privacy-preserving computation with the security of Ethereum. At its core, the network consists of three critical types of infrastructure: full nodes, sequencers, and provers. Each plays a distinct role in maintaining network health, security, and privacy guarantees.

## What you'll learn

- The architecture of the Aztec network
- The components of the Aztec network (full nodes, sequencers, provers, rollup contracts)
- How the Aztec network works (transaction flow, block production, proof generation)
- Privacy considerations when interacting with the network

## Full Nodes: Your Gateway to Privacy

Full nodes serve as the primary interface for users to interact with the Aztec network. They allow you to send and receive transactions, query state updates, and monitor the blockchain without relying on third-party infrastructure. While you can interact with the network through remote nodes operated by others, **running your own full node is essential for maximum privacy**.

### Why Run Your Own Full Node?

When you query a remote node for information about specific contracts, accounts, or transactions, you inevitably reveal information about your interests and intentions to the node operator. This creates a privacy leak: the operator can infer which contracts you're interacting with, which accounts you control, and what types of transactions you're preparing to send.

By running your own full node, you eliminate this trust dependency. All queries stay local to your machine, ensuring that no third party can monitor your onchain activity or build a profile of your behavior. This is particularly crucial for Aztec, where privacy isn't just a feature—it's the core value proposition.

### What Full Nodes Do

Full nodes maintain a complete copy of the Aztec blockchain state by:

- Continuously monitoring Ethereum (L1) for new blocks published by the Aztec rollup
- Processing and validating transactions from these blocks
- Updating local state trees to reflect the latest network state
- Providing an RPC interface for wallets and applications to query data and submit transactions
- Participating in peer-to-peer gossip to share unconfirmed transactions with sequencers

Full nodes can be run on consumer hardware (2-core CPU, 16GB RAM, 1TB SSD) and support the network's decentralization goals. Every additional full node strengthens the network's resilience and censorship resistance.

:::tip
For privacy-conscious users, running a full node is strongly recommended. It's the only way to ensure that your queries and transaction patterns remain completely private.
:::

## Sequencers: The Network's Coordinators

Sequencers are specialized nodes responsible for ordering transactions and producing blocks. They are the active coordinators of the Aztec network, determining which transactions get included in blocks and in what order.

### Critical Roles of Sequencers

1. **Transaction Ordering**: Sequencers fetch transactions from the peer-to-peer transaction pool and decide their ordering within blocks. This ordering power is significant—sequencers must resist censorship and provide fair transaction inclusion to maintain network health.

2. **Public Function Execution**: Unlike private functions (which execute client-side in users' PXE), public functions require access to the latest state trees. Sequencers execute these public functions, compute state changes, and include the results in blocks.

3. **Block Production**: Sequencers assemble complete blocks by running transactions through the rollup circuits, updating world state trees, and creating the L2 block structure that will eventually be submitted to Ethereum.

4. **Block Attestation**: Before a block can be published, it must be validated by a committee of sequencer nodes. Committee members re-execute public transactions, verify private function proofs, and attest to the block's validity by signing its header. A block needs attestations from two-thirds of the committee plus one before it can proceed to L1.

### Why Sequencers Matter for Network Health

Sequencers are critical for several reasons:

- **Liveness**: Without active sequencers, the network cannot produce new blocks or process transactions. Sequencer uptime directly impacts the network's availability.

- **Decentralization**: Aztec employs a random sequencer selection mechanism called Fernet (Fair Election Randomized Natively on Ethereum Trustlessly) using verifiable random functions (VRFs) to prevent centralization. Each sequencer stakes collateral and receives a random score each epoch, with the highest scorer earning the right to propose the next block.

- **Fair Ordering**: Sequencers have the power to order transactions, which comes with the responsibility to provide fair access and resist censorship. A healthy network requires multiple independent sequencers to prevent any single entity from controlling transaction inclusion.

- **Soft Finality**: Once a sequencer reveals a block's contents to the data availability layer, transactions achieve "soft finality"—users can assume the block will eventually be proven and finalized, enabling faster confirmation times.

Sequencer nodes can run on the same hardware as full nodes, making it accessible for community members to participate in block production and earn rewards for their service to the network.

## Provers: Guardians of Integrity

Provers are the cryptographic workhorses of the Aztec network, generating zero-knowledge proofs that attest to the correctness of all transactions in a block. These proofs are what allow Ethereum to efficiently verify the validity of potentially thousands of Aztec transactions with a single verification.

### The Proving System Architecture

The Aztec proving system consists of three components:

1. **Prover Node**: Monitors L1 for unproven epochs, creates proving jobs, distributes them to the broker, and ultimately submits the final rollup proof to Ethereum.

2. **Prover Broker**: Manages the job queue, distributing proof generation work to multiple agents and collecting the results.

3. **Prover Agents**: Stateless workers that execute the actual proof generation, running the cryptographic circuits that prove transaction validity.

### Why Provers Are Critical

Provers fulfill several essential functions:

- **Trustless Verification**: Proofs allow anyone to verify that all state transitions in the rollup are correct without re-executing every transaction. This is the foundation of Aztec's security model.

- **Ethereum Settlement**: Only blocks with valid proofs can be finalized on L1. Provers bridge the gap between Aztec's high-throughput L2 and Ethereum's security guarantees.

- **Privacy Preservation**: Zero-knowledge proofs allow transactions to be validated without revealing their private details. Provers generate these privacy-preserving proofs that hide transaction details while proving correctness.

- **Proof Coordination**: Through an out-of-protocol mechanism, sequencers coordinate with provers to ensure that each epoch gets proven. The first 13 slots in epoch N+1 accept quotes from provers to prove epoch N, with the winning prover having until the end of epoch N+1 to submit the proof.

### Resource Requirements

Running a prover is significantly more resource-intensive than running a full node or sequencer. Prover agents require high-performance hardware (32-core CPU, 128GB RAM) typically suitable for data center deployment. This makes proving a more specialized role, though the prover network is designed to be permissionless—anyone with sufficient hardware can participate.

## Network Architecture Overview

Together, these three components form a layered architecture:

1. **Full Nodes** provide data availability, state querying, and transaction submission for users and applications
2. **Sequencers** coordinate transaction ordering, execute public functions, and produce blocks with committee attestation
3. **Provers** generate zero-knowledge proofs of block validity for Ethereum settlement
4. **Ethereum (L1)** serves as the security and data availability layer, storing rollup state roots and verifying proofs

This separation of concerns allows the network to scale efficiently while maintaining decentralization and privacy. Full nodes keep the network accessible, sequencers keep it running, and provers keep it secure and trustless.

## Next Steps

In the following sections, you'll dive deeper into each component, learning about transaction flow, block production, proof generation, and how these pieces fit together to create a privacy-preserving, scalable Layer 2 network on Ethereum.
