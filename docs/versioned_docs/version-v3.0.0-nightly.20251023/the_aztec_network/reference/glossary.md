---
id: glossary
sidebar_position: 4
title: Glossary
description: A comprehensive glossary of terms used throughout the Aztec network documentation, covering node operations, consensus, cryptography, and infrastructure concepts.
---

This glossary defines key terms used throughout the Aztec network documentation. Terms are organized alphabetically with cross-references to related concepts.

## A

### Agent

See [Prover Agent](#prover-agent).

### Archiver

A component that monitors Ethereum L1 for rollup events and synchronizes L2 state. The archiver retrieves block data, contract deployments, and L1-to-L2 messages from the data availability layer.

### Attestation

A cryptographic signature from a sequencer committee member confirming the validity of a proposed block. Blocks require attestations from two-thirds of the committee plus one before submission to L1.

### Attester

The identity of a sequencer node in the network. The Ethereum address derived from the attester private key uniquely identifies the sequencer and is used to sign block proposals and attestations.

## B

### BIP44

Bitcoin Improvement Proposal 44 defines a standard derivation path for hierarchical deterministic wallets. Aztec uses BIP44 to derive multiple Ethereum addresses from a single mnemonic seed phrase.

### Block Proposal

A candidate block assembled by a sequencer containing ordered transactions. Proposals must be validated by the sequencer committee before submission to L1.

### Bootnode

A network node that facilitates peer discovery by maintaining lists of active peers. New nodes connect to bootnodes to discover and join the P2P network.

### Broker

See [Prover Broker](#prover-broker).

## C

### Coinbase

The Ethereum address that receives L1 rewards and fees for a sequencer. If not specified in the keystore, defaults to the attester address.

### Committee

See [Sequencer Committee](#sequencer-committee).

### Consensus

The process by which sequencer nodes agree on the validity of proposed blocks through attestations and signatures.

### Contract Class

A published smart contract definition containing bytecode and function signatures. Multiple contract instances can be deployed from a single contract class.

### Contract Instance

A deployed instance of a contract class with a unique address and storage state.

## D

### Data Availability

The guarantee that block data is accessible to network participants. Aztec publishes data to Ethereum L1 to ensure data availability for state reconstruction.

### Derivation Path

A hierarchical path used to derive cryptographic keys from a master seed. Follows the BIP44 standard for deterministic key generation.

## E

### EIP-1559

Ethereum Improvement Proposal 1559 introduces a base fee mechanism for transaction pricing. Aztec nodes use EIP-1559 gas pricing when submitting transactions to L1.

### ENR (Ethereum Node Record)

A signed record containing information about a network node, used for peer discovery in the P2P network. Bootnodes share their ENR for other nodes to connect.

### Epoch

A period of multiple L2 blocks that are proven together. Prover nodes generate a single validity proof for an entire epoch and submit it to the rollup contract.

### Execution Layer

The Ethereum L1 execution client (e.g., Geth, Nethermind) that processes transactions. Aztec nodes require access to an execution layer RPC endpoint.

## F

### Fee Recipient

The Aztec address that receives unburnt transaction fees from blocks produced by a sequencer. Must be a deployed Aztec account.

### Full Node

A node that maintains a complete copy of the Aztec blockchain state and provides RPC interfaces for users to interact with the network without relying on third parties.

## G

### Gas Estimation

The process of calculating the expected gas cost for an Ethereum transaction before submission. Aztec nodes estimate gas for L1 transactions like block proposals and proof submissions.

## I

### Inbox

The L1 contract that receives messages sent from Ethereum to Aztec L2. The archiver monitors the Inbox for new L1-to-L2 messages.

## J

### JSON V3 Keystore

An Ethereum standard for encrypted key storage using AES-128-CTR encryption and scrypt key derivation. Aztec supports JSON V3 keystores for secure key management.

## K

### Keystore

A configuration file or encrypted store containing private keys for sequencer operations. Keystores define attester keys, publisher keys, coinbase addresses, and fee recipients.

## L

### L1 (Layer 1)

Ethereum mainnet or testnet, serving as the base layer for Aztec's rollup. L1 provides data availability, settlement, and consensus for the L2.

### L2 (Layer 2)

The Aztec network, a rollup scaling solution built on top of Ethereum L1. L2 processes transactions offchain and submits validity proofs to L1.

### L1 Sync

A synchronization mode where nodes reconstruct state by querying the rollup contract and data availability layer on Ethereum L1 directly.

## M

### Mempool

The pool of unprocessed transactions waiting to be included in a block. Sequencers select transactions from the mempool when proposing blocks.

### Merkle Tree

A cryptographic data structure that enables efficient verification of data integrity and membership. Aztec uses Merkle trees for state commitments, note storage, and nullifier tracking.

### Mnemonic

A human-readable seed phrase (typically 12 or 24 words) used to generate deterministic cryptographic keys. Follows BIP39 standard for encoding.

## N

### Node

A participant in the Aztec network. See [Full Node](#full-node), [Sequencer Node](#sequencer-node), [Prover Node](#prover-node), or [Bootnode](#bootnode).

### Nonce

A sequential number used to order transactions from an Ethereum account. Aztec nodes manage nonces when submitting transactions to L1.

### Note Tree

A Merkle tree containing encrypted notes representing private state in Aztec contracts.

### Nullifier

A unique value that marks a note as consumed, preventing double-spending. Nullifiers are published to L1 and tracked in the nullifier tree.

## O

### Outbox

The L1 contract that receives messages sent from Aztec L2 to Ethereum. Used for withdrawals and cross-chain communication.

## P

### P2P (Peer-to-Peer)

The network protocol used by Aztec nodes to discover peers, exchange transactions, and propagate blocks without central coordination.

### Proof-of-Stake

The consensus mechanism where sequencers lock collateral (stake) to participate in block production. Misbehavior results in stake slashing.

### Prover Agent

A stateless worker that executes proof generation jobs. Multiple agents can run in parallel to distribute proving workload.

### Prover Broker

A coordinator that manages the prover job queue, distributing work to agents and collecting results.

### Prover Node

Infrastructure that generates validity proofs for epochs of L2 blocks. Consists of a prover node coordinator, broker, and one or more agents.

### Publisher

The Ethereum account used by a sequencer to submit block proposals to L1. Must be funded with ETH to pay gas fees. If not specified, the attester key is used.

### PXE (Private Execution Environment)

The client-side component that executes private functions, manages user keys, and constructs privacy-preserving transactions.

## R

### Registry

The L1 contract that tracks deployed contract classes and instances. The archiver monitors Registry events to maintain a database of available contracts.

### Remote Signer

An external service (e.g., Web3Signer) that stores private keys and signs transactions remotely. Used for enhanced security in production deployments.

### Rollup

A scaling solution that processes transactions offchain and submits compressed data and validity proofs to L1. Aztec is a zkRollup with privacy features.

### RPC (Remote Procedure Call)

A protocol for remote communication. Aztec nodes expose JSON-RPC interfaces for client interaction and use RPC to communicate with Ethereum L1.

## S

### Sequencer Committee

A rotating group of validators responsible for validating proposed blocks through attestations during a specific time period.

### Sequencer Node

A validator that assembles transactions into blocks, executes public functions, and participates in consensus through attestations.

### Slashing

The penalty mechanism that reduces or confiscates a sequencer's stake for provable misbehavior such as double-signing or prolonged downtime.

### Slasher Node

Infrastructure that monitors for validator misbehavior and submits slashing payloads to L1 when violations are detected.

### Snapshot

A pre-built database containing blockchain state at a specific block height. Nodes can download snapshots for faster synchronization.

### Snapshot Sync

A synchronization mode where nodes download pre-built state snapshots instead of reconstructing state from L1. Significantly faster than L1 sync.

### Stake

Collateral locked by a sequencer to participate in block production. Higher stake increases selection probability as block proposer.

### State Tree

A Merkle tree representing the current world state of all Aztec contracts and accounts.

## T

### Transaction Receipt

A record of a transaction's execution on Ethereum, including status, gas used, and emitted events. Aztec nodes poll for receipts to confirm L1 transaction inclusion.

## V

### Validator

See [Sequencer Node](#sequencer-node). The terms are used interchangeably in Aztec documentation.

### Viem

A TypeScript library providing type-safe interfaces to Ethereum JSON-RPC methods. Aztec nodes use viem for all L1 interactions.

## W

### Web3Signer

An open-source remote signing service that stores keys securely and provides signing APIs. Commonly used for production sequencer deployments.

### World State

The complete state of the Aztec network at a given block height, including all contract storage, notes, and nullifiers.

## Related Resources

- [Node API Reference](./node_api_reference.md) - Complete API documentation for node JSON-RPC methods
- [Ethereum RPC Reference](./ethereum_rpc_reference.md) - L1 RPC calls used by Aztec components
- [Advanced Keystore Guide](../operation/keystore/index.md) - Detailed keystore configuration options
- [CLI Reference](./cli_reference.md) - Complete command-line interface documentation
