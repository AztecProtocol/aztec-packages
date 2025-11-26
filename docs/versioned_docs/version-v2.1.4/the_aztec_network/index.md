---
id: index
sidebar_position: 0
title: Introduction
description: Learn about the Aztec network, node types, roles, best practices, and how to participate in the network.
---

## Overview

The Aztec network is a decentralized privacy-focused rollup on Ethereum. Network nodes work together to process transactions, maintain state, and generate proofs that ensure rollup integrity. This guide provides an overview of node types, their roles, best practices, and how to get started.

## Actors and Roles

The Aztec network consists of several types of actors, each serving a specific purpose:

### Full Nodes

Full nodes provide users with the ability to connect and interact with the network. They maintain a complete copy of the blockchain state and allow users to send and receive transactions without relying on third parties.

**Key responsibilities:**
- Maintain synchronized copy of the blockchain state
- Provide RPC interface for transaction submission
- Validate and relay transactions
- Offer privacy-preserving interaction with the network

[Learn more about running a full node →](./setup/running_a_node.md)

### Sequencer Nodes

Sequencer nodes order transactions and produce blocks. Selected via a proof-of-stake mechanism, they play a critical role in the consensus process.

**Key responsibilities:**
- Assemble unprocessed transactions and propose new blocks
- Execute public functions in transactions
- Attest to correct execution when part of the sequencer committee
- Submit successfully attested blocks to L1

Before publication, blocks must be validated by a committee of sequencer nodes who re-execute public transactions and verify private function proofs. Committee members attest to validity by signing the block header. Once sufficient attestations are collected (two-thirds of the committee plus one), the block can be submitted to L1.

[Learn more about running a sequencer →](./setup/sequencer_management.md)

### Provers

Provers generate cryptographic proofs that attest to transaction correctness. They produce the final rollup proof submitted to Ethereum, ensuring rollup integrity.

**Key components and responsibilities:**
- **Prover node**: Polls L1 for unproven epochs, creates prover jobs, and submits final proofs
- **Prover broker**: Manages job queues and distributes work to agents
- **Prover agents**: Execute proof generation jobs in a stateless manner

Note that running provers require:
- High-performance hardware (typically data center-grade)
- Significant computational resources for proof generation
- Technical expertise in operating distributed systems

[Learn more about running a prover →](./setup/running_a_prover.md)

## How Nodes Work Together

The Aztec network operates through the coordinated interaction of these different node types:

1. **Transaction Flow**: Users submit transactions to full nodes, which validate and propagate them through the P2P network
2. **Block Production**: Sequencer nodes collect transactions from the mempool, order them, and propose new blocks
3. **Consensus**: The sequencer committee validates proposed blocks and provides attestations
4. **Proof Generation**: Prover nodes generate cryptographic proofs for epochs of blocks
5. **L1 Submission**: Sequencers submit attested blocks and provers submit epoch proofs to Ethereum

## Using Your Own L1 Node

For optimal performance and reliability, it's highly recommended to run your own Ethereum L1 node rather than relying on third-party RPC providers.

**Benefits:**
- Better performance and lower latency
- No rate limiting or request throttling
- Greater reliability and uptime control
- Enhanced privacy for your node operations

**Requirements:**
- Access to both execution and consensus client endpoints
- Endpoints must support high throughput
- Must be connected to Sepolia testnet for Aztec testnet

See [Eth Docker's guide](https://ethdocker.com/Usage/QuickStart) for setting up your own L1 node.

## Next Steps

- **Check Prerequisites**: Review the [prerequisites guide](./prerequisites.md) to ensure you have everything needed
- **Run a Full Node**: Follow the [complete full node guide](./setup/running_a_node.md) for detailed setup instructions
- **Operate a Sequencer**: Learn how to [run a sequencer node](./setup/sequencer_management.md) and join the validator set
- **Operate a Prover**: Set up [prover infrastructure](./setup/running_a_prover.md) to generate rollup proofs
- **Join the Community**: Connect with other operators on [Discord](https://discord.gg/aztec)
