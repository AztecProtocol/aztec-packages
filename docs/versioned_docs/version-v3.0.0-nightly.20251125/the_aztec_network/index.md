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

## Best Practices

### Snapshot Sync

Nodes can synchronize state in two ways:

1. **L1 sync**: Queries the rollup and data availability layer for historical state directly from Layer 1
2. **Snapshot sync**: Downloads pre-built state snapshots from a storage location for faster synchronization

Since Aztec uses blobs, syncing from L1 requires an archive node that stores complete blob history from Aztec's deployment. Snapshot sync is significantly faster, doesn't require archive nodes, and reduces load on L1 infrastructure, making it the recommended approach for most deployments.

**Configuring sync mode:**

```bash
aztec start --node --sync-mode [MODE]
```

Available sync modes:
- **`snapshot`**: Downloads and uses a snapshot only if no local data exists (default behavior)
- **`force-snapshot`**: Downloads and uses a snapshot even if local data exists, overwriting it
- **`l1`**: Syncs directly from Layer 1 without using snapshots

[Learn more about using and uploading snapshots →](./setup/syncing_best_practices.md)

### Using Bootnodes

Bootnodes facilitate peer discovery by maintaining lists of active peers that new nodes can connect to. To connect your node to a bootnode, pass the bootnode's ENR (Ethereum Node Record) at startup:

```bash
aztec start --node --p2p.bootstrapNodes [ENR1],[ENR2],[ENR3]
```

[Learn more about bootnodes →](./setup/bootnode_operation.md)

### Using Your Own L1 Node

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

## Node Reference

For detailed configuration options and command-line reference, see:

- [CLI Reference](./reference/cli_reference.md) - Complete list of all available flags and environment variables
- [Useful Commands](./operation/sequencer_management/useful_commands.md) - Common operational commands
- [Operator FAQ](./operation/operator_faq.md) - Frequently asked questions for node operators

## Full Node Quick Start

Get a full node running quickly with this one-liner:

```bash
aztec supervised-start --node --archiver --p2p.p2pIp $(curl -s ipv4.icanhazip.com) --network testnet --l1-rpc-urls [YOUR_L1_EXECUTION_RPC] --l1-consensus-host-urls [YOUR_L1_CONSENSUS_RPC]
```

Replace `[YOUR_L1_EXECUTION_RPC]` and `[YOUR_L1_CONSENSUS_RPC]` with your Ethereum Sepolia endpoints.

**Before running this command:**
- Ensure you've met the [prerequisites](./prerequisites.md) for the CLI method
- Configure port forwarding for ports 8080 (HTTP) and 40400 (P2P, both TCP/UDP)

[Full installation guide →](./setup/running_a_node.md)

## Next Steps

- **Check Prerequisites**: Review the [prerequisites guide](./prerequisites.md) to ensure you have everything needed
- **Run a Full Node**: Follow the [complete full node guide](./setup/running_a_node.md) for detailed setup instructions
- **Operate a Sequencer**: Learn how to [run a sequencer node](./setup/sequencer_management.md) and join the validator set
- **Operate a Prover**: Set up [prover infrastructure](./setup/running_a_prover.md) to generate rollup proofs
- **Join the Community**: Connect with other operators on [Discord](https://discord.gg/aztec)
