# Aztec Protocol Specs — Master Plan & Progress Tracker

## 1. Purpose & Process

This document is the master planning and progress tracker for the Aztec protocol specification effort. It defines what specs need to be written, their scope, formatting requirements, and current status.

New specs live in the top-level `specs/` directory, one markdown file per topic.

### Review Workflow

Each spec follows this review pipeline:

| Stage              | Reviewer           | Action                        |
| ------------------ | ------------------ | ----------------------------- |
| 1. Draft           | Claude             | Writes spec from codebase     |
| 2. Initial Review  | Author (you)       | Reviews and provides feedback |
| 3. Protocol Review | Protocol Architect | Final technical review        |
| 4. Team Review     | Team Leads         | Final review and sign-off     |
| 5. Publish         | —                  | Spec is published             |

A spec's status in the inventory below tracks where it is in this pipeline.

---

## 2. Scope Definition

### Compatibility Criterion

> A topic MAY only be included in the protocol spec if changing the thing it describes would cause alternative implementations to be incompatible.

The protocol spec describes how transactions are processed in this privacy-preserving stage-2 rollup. It must contain sufficient detail for an independent engineering team to build a compatible implementation.

### In Scope

- Block format, headers, and block production rules
- Transaction format, lifecycle, and validation rules
- P2P messaging formats and protocols
- State model and state transitions
- Rollup circuit constraints and verification
- L1 rollup contract behavior, including the blob sub-protocol
- Cross-chain messaging (inbox/outbox)
- Cryptographic primitives used by the protocol
- Gas and fee mechanics that affect transaction validity
- Address and key derivation schemes

### Out of Scope

- RPC methods (client interface, not protocol-level)
- Sandbox or local development tooling
- SDK/library APIs
- Frontend or wallet implementation details
- Specific compiler or language toolchain internals
- Deployment infrastructure and DevOps

---

## 3. Formatting Guidelines

### File Conventions

- One markdown file per spec in `specs/`, e.g. `specs/01-protocol-overview.md`
- Files are numbered to reflect reading order, not priority
- Use standard markdown (no Docusaurus-specific syntax)

### Required Sections Per Spec

Each spec must include these sections:

1. **Overview** — What this spec covers and why it matters
2. **Requirements** — What the protocol requires in this area, and why
3. **Specification** — The normative protocol description; sufficient for an independent implementation
4. **Data Structures** — Tables or diagrams defining all relevant structures
5. **Validation Rules** — How nodes validate correctness
6. **Open Questions** — Unresolved items flagged for review (removed before final publication)

Optional sections as needed:

- **Discarded Alternatives** — Options that were considered and why they were rejected
- **Security Considerations** — Threat model or security properties
- **References** — Links to discourse, papers, or related specs

### Markdown Conventions

- Use ATX headings (`#`, `##`, `###`)
- Data structures as tables: `| Field | Type | Description |`
- Use Mermaid fenced code blocks for diagrams (` ```mermaid `)
- Use `classDiagram` with composition arrows (`*--`) for struct/class relationships
- Pseudocode in fenced code blocks with language tag where applicable
- No monorepo code snippets; pseudocode is fine to explain protocol concepts
- Keep prose concise and direct; favor specification over explanation

---

## 4. Spec Inventory & Status

### Status Key

| Status        | Meaning                      |
| ------------- | ---------------------------- |
| `Not Started` | No work begun                |
| `In Progress` | Draft being written          |
| `In Review`   | Draft complete, under review |
| `Approved`    | Signed off and final         |

### P0 — Foundational

Everything else depends on these. Write first.

NOTE: the key sources may not be accurate, and you may need to explore the codebase to find the right references.

| #   | Spec                             | File                                   | Status      | Assignee | Key Source Paths                                                                                                                                       |
| --- | -------------------------------- | -------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Protocol Overview & Architecture | `specs/01-protocol-overview.md`        | In Review   | Claude   | `docs/docs/protocol-specs/intro.md`                                                                                                                    |
| 2   | Constants                        | `specs/02-constants.md`                | In Review   | Claude   | `yarn-project/constants/`, `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`                                                        |
| 3   | Cryptographic Primitives         | `specs/03-cryptographic-primitives.md` | In Review   | Claude   | `noir-projects/noir-protocol-circuits/crates/types/src/hash.nr`, `docs/docs/protocol-specs/cryptography/`                                              |
| 4   | State Model & Merkle Trees       | `specs/04-state-model.md`              | In Review   | Claude   | `noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/`, `docs/docs/protocol-specs/state/`                                                |
| 5   | Transaction Format & Lifecycle   | `specs/05-transactions.md`             | In Review   | Claude   | `yarn-project/stdlib/src/tx/`, `noir-projects/noir-protocol-circuits/crates/types/src/transaction/`, `docs/docs/protocol-specs/transactions/`          |
| 6   | Block Format & Header            | `specs/06-blocks.md`                   | In Review   | Claude   | `yarn-project/stdlib/src/block/`, `noir-projects/noir-protocol-circuits/crates/types/src/block_header.nr`, `docs/docs/protocol-specs/rollup-circuits/` |

### P1 — Core Protocol Mechanics

Core protocol behavior. Write after P0 specs establish the foundation.

| #   | Spec                                  | File                                  | Status      | Assignee | Key Source Paths                                                                                                                             |
| --- | ------------------------------------- | ------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Private Kernel Circuits               | `specs/07-private-kernel-circuits.md` | In Review   | Claude   | `noir-projects/noir-protocol-circuits/crates/private-kernel-lib/`, `docs/docs/protocol-specs/circuits/`                                      |
| 8   | Public VM (AVM)                       | `specs/08-public-vm.md`               | In Review   | Claude   | `docs/docs/protocol-specs/public-vm/`, `yarn-project/simulator/src/avm/`                                                                     |
| 9   | Rollup Circuits                       | `specs/09-rollup-circuits.md`         | In Review   | Claude   | `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/`, `docs/docs/protocol-specs/rollup-circuits/`                                   |
| 10  | L1 Rollup Contract & State Transition | `specs/10-l1-rollup-contract.md`      | In Review   | Claude   | `l1-contracts/src/core/`, `docs/docs/protocol-specs/l1-smart-contracts/`                                                                     |
| 11  | Cross-Chain Messaging                 | `specs/11-cross-chain-messaging.md`   | In Review   | Claude   | `l1-contracts/src/core/`, `noir-projects/noir-protocol-circuits/crates/types/src/messaging/`, `docs/docs/protocol-specs/l1-smart-contracts/` |
| 12  | Data Availability & Blobs             | `specs/12-data-availability.md`       | In Review   | Claude   | `l1-contracts/src/core/`, `docs/docs/protocol-specs/data-publication-and-availability/`                                                      |

### P2 — Supporting Protocol

Important protocol components that support the core mechanics.

| #   | Spec                         | File                              | Status      | Assignee | Key Source Paths                                                                                                 |
| --- | ---------------------------- | --------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| 13  | Addresses & Keys             | `specs/13-addresses-and-keys.md`  | In Review   | Claude   | `noir-projects/noir-protocol-circuits/crates/types/src/address/`, `docs/docs/protocol-specs/addresses-and-keys/` |
| 14  | Contract Deployment          | `specs/14-contract-deployment.md` | In Review   | Claude   | `yarn-project/protocol-contracts/src/`, `docs/docs/protocol-specs/contract-deployment/`                          |
| 15  | Gas & Fees                   | `specs/15-gas-and-fees.md`        | In Review   | Claude   | `docs/docs/protocol-specs/gas-and-fees/`, `l1-contracts/src/core/`                                               |
| 16  | Logs & Events                | `specs/16-logs-and-events.md`     | In Review   | Claude   | `docs/docs/protocol-specs/logs/`, `noir-projects/noir-protocol-circuits/crates/types/src/log/`                   |
| 17  | P2P Network Protocol         | `specs/17-p2p-network.md`         | In Review   | Claude   | `yarn-project/p2p/`                                                                                              |
| 18  | Block Production & Consensus | `specs/18-block-production.md`    | In Review   | Claude   | `docs/docs/protocol-specs/decentralization/`, `yarn-project/p2p/`                                                |

### P3 — Peripheral

Lower priority. Write after core specs are stable.

| #   | Spec       | File                     | Status      | Assignee | Key Source Paths               |
| --- | ---------- | ------------------------ | ----------- | -------- | ------------------------------ |
| 19  | Governance | `specs/19-governance.md` | In Review   | Claude   | `l1-contracts/src/governance/` |

---

## 5. Spec Descriptions

### 1. Protocol Overview & Architecture

High-level description of the Aztec protocol: what it is, its goals, and how the major components fit together. Covers the lifecycle of a transaction from user intent through private execution, public execution, rollup proving, and L1 settlement. Serves as the entry point and roadmap for all other specs.

**Key references:** old `intro.md`, overall repo structure

### 2. Constants

All protocol-wide constants: field sizes, tree heights, max array lengths, epoch parameters, and version identifiers. These are referenced by nearly every other spec.

**Key references:** `yarn-project/constants/`, `noir-projects/noir-protocol-circuits/crates/types/src/constants.nr`

### 3. Cryptographic Primitives

Hash functions (Poseidon2, SHA-256, pedersen), commitment schemes, nullifier derivation, and Merkle tree hashing used throughout the protocol. Defines the exact instantiations and parameters.

**Key references:** `noir-projects/noir-protocol-circuits/crates/types/src/hash.nr`, old `cryptography/` specs

### 4. State Model & Merkle Trees

The global state representation: note hash tree, nullifier tree, public data tree, L1-to-L2 message tree, and archive tree. Defines tree structure, leaf formats, and how state is committed in block headers.

**Key references:** `noir-projects/noir-protocol-circuits/crates/types/src/merkle_tree/`, old `state/` specs

### 5. Transaction Format & Lifecycle

The complete transaction object: its fields, how it is constructed from private kernel outputs, validation rules, and how it moves through the mempool to block inclusion. Covers both the transaction request and the proven transaction.

**Key references:** `yarn-project/stdlib/src/tx/`, `noir-projects/noir-protocol-circuits/crates/types/src/transaction/`, old `transactions/` specs

### 6. Block Format & Header

Block structure including the header, body, and how they relate to L1 submission. Defines the block header fields, content commitment, state references, and global variables.

**Key references:** `yarn-project/stdlib/src/block/`, `noir-projects/noir-protocol-circuits/crates/types/src/block_header.nr`

### 7. Private Kernel Circuits

The private kernel circuit family: initial, inner, tail, and reset variants. Describes what each circuit proves, its public inputs/outputs, and how they chain together to produce the final private execution result.

**Key references:** `noir-projects/noir-protocol-circuits/crates/private-kernel-lib/`, old `circuits/` specs

### 8. Public VM (AVM)

The Aztec Virtual Machine for public execution: instruction set, memory model, execution context, gas metering, and how public call results are verified. Covers the interface between private kernel outputs and public execution.

**Key references:** old `public-vm/` specs (extensive, ~30 files), `yarn-project/simulator/src/avm/`

### 9. Rollup Circuits

The rollup proving hierarchy: base, merge, block root, and block merge circuits. Describes how transactions are aggregated into blocks and how blocks are aggregated into epochs, including the proof verification chain.

**Key references:** `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/`, old `rollup-circuits/` specs

### 10. L1 Rollup Contract & State Transition Function

The on-chain rollup contract that verifies proofs and advances L2 state. Covers the state transition function, proof submission, epoch management, and the interface with the L1 data availability layer.

**Key references:** `l1-contracts/src/core/`, old `l1-smart-contracts/` specs

### 11. Cross-Chain Messaging

The inbox/outbox mechanism for L1<->L2 communication. Covers message format, insertion, consumption, and how messages are proven to exist on either chain.

**Key references:** `l1-contracts/src/core/`, `noir-projects/noir-protocol-circuits/crates/types/src/messaging/`

### 12. Data Availability & Blobs

How transaction data is published for data availability. Covers blob encoding, the relationship between blobs and block content, and how DA is verified on L1.

**Key references:** `l1-contracts/src/core/`, old `data-publication-and-availability/` specs

### 13. Addresses & Keys

Address derivation, key types (nullifier keys, incoming/outgoing viewing keys, tagging keys), key rotation, and how addresses map to deployed contracts. Covers the complete key hierarchy.

**Key references:** `noir-projects/noir-protocol-circuits/crates/types/src/address/`, old `addresses-and-keys/` specs

### 14. Contract Deployment

How contracts are deployed on Aztec: deployment request format, how contract classes and instances are registered, and how deployment is proven in the protocol.

**Key references:** `yarn-project/protocol-contracts/src/`, old `contract-deployment/` specs

### 15. Gas & Fees

Gas model, fee payment mechanism, fee distribution, and how gas limits affect transaction and block validity. Covers both L2 gas dimensions and L1 cost components.

**Key references:** old `gas-and-fees/` specs, `l1-contracts/src/core/`

### 16. Logs & Events

How private and public logs are emitted, encoded, and included in blocks. Covers encrypted logs, unencrypted logs, and how they are committed in the block body.

**Key references:** old `logs/` specs, `noir-projects/noir-protocol-circuits/crates/types/src/log/`

### 17. P2P Network Protocol

Peer-to-peer networking: transaction propagation, block propagation, attestation gossip, peer discovery, and message formats. Defines the wire protocol for node communication.

**Key references:** `yarn-project/p2p/`

### 18. Block Production & Consensus

How blocks are proposed, attested, and finalized. Covers proposer selection, attestation requirements, timing constraints, and the relationship between L2 consensus and L1 finality.

**Key references:** old `decentralization/` specs, `yarn-project/p2p/`

### 19. Governance

On-chain governance mechanisms: proposal format, voting, execution, and upgrade paths. Lower priority as governance is less coupled to core protocol compatibility.

**Key references:** `l1-contracts/src/governance/`
