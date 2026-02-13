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

---

## 6. Source Integration Tracking

Legacy protocol spec files that need review and integration into the new specs. For each source, the agent reads the old document, compares it to the target new spec, verifies uncertain content against the codebase, and integrates still-valid content.

### Source Status Key

| Status           | Meaning                                           |
| ---------------- | ------------------------------------------------- |
| `Not Integrated` | Not yet reviewed                                  |
| `In Progress`    | Currently being reviewed/integrated               |
| `Integrated`     | Valid content merged into target spec              |
| `Skipped`        | No actionable content (index page, outdated, etc) |

### Sources → Spec #1: Protocol Overview

| S#  | Source File                       | Status         | Notes |
| --- | --------------------------------- | -------------- | ----- |
| 1   | `old-protocol-specs/intro.md`     | Integrated     | TOC only |

### Sources → Spec #2: Constants

| S#  | Source File                       | Status         | Notes |
| --- | --------------------------------- | -------------- | ----- |
| 2   | `old-protocol-specs/constants.md` | In Progress    |       |

### Sources → Spec #3: Cryptographic Primitives

| S#  | Source File                                                            | Status         | Notes |
| --- | ---------------------------------------------------------------------- | -------------- | ----- |
| 3   | `old-protocol-specs/cryptography/index.md`                             | Not Integrated |       |
| 4   | `old-protocol-specs/cryptography/hashing/hashing.md`                   | Not Integrated |       |
| 5   | `old-protocol-specs/cryptography/hashing/pedersen.md`                  | Not Integrated |       |
| 6   | `old-protocol-specs/cryptography/hashing/poseidon2.md`                 | Not Integrated |       |
| 7   | `old-protocol-specs/cryptography/merkle-trees.md`                      | Not Integrated |       |
| 8   | `old-protocol-specs/cryptography/proving-system/overview.md`           | Not Integrated |       |
| 9   | `old-protocol-specs/cryptography/proving-system/data-bus.md`           | Not Integrated |       |
| 10  | `old-protocol-specs/cryptography/proving-system/performance-targets.md` | Not Integrated |       |

### Sources → Spec #4: State Model & Merkle Trees

| S#  | Source File                                          | Status         | Notes |
| --- | ---------------------------------------------------- | -------------- | ----- |
| 11  | `old-protocol-specs/state/index.md`                  | Not Integrated |       |
| 12  | `old-protocol-specs/state/archive.md`                | Not Integrated |       |
| 13  | `old-protocol-specs/state/note-hash-tree.md`         | Not Integrated |       |
| 14  | `old-protocol-specs/state/nullifier-tree.md`         | Not Integrated |       |
| 15  | `old-protocol-specs/state/public-data-tree.md`       | Not Integrated |       |
| 16  | `old-protocol-specs/state/tree-implementations.md`   | Not Integrated |       |
| 17  | `old-protocol-specs/state/wonky-tree.md`             | Not Integrated |       |

### Sources → Spec #5: Transaction Format & Lifecycle

| S#  | Source File                                          | Status         | Notes |
| --- | ---------------------------------------------------- | -------------- | ----- |
| 18  | `old-protocol-specs/transactions/index.md`           | Not Integrated |       |
| 19  | `old-protocol-specs/transactions/local-execution.md` | Not Integrated |       |
| 20  | `old-protocol-specs/transactions/public-execution.md` | Not Integrated |       |
| 21  | `old-protocol-specs/transactions/tx-object.md`       | Not Integrated |       |
| 22  | `old-protocol-specs/transactions/validity.md`        | Not Integrated |       |
| 23  | `old-protocol-specs/calls/index.md`                  | Not Integrated |       |
| 24  | `old-protocol-specs/calls/batched-calls.md`          | Not Integrated |       |
| 25  | `old-protocol-specs/calls/enqueued-calls.md`         | Not Integrated |       |
| 26  | `old-protocol-specs/calls/static-calls.md`           | Not Integrated |       |
| 27  | `old-protocol-specs/calls/sync-calls.md`             | Not Integrated |       |
| 28  | `old-protocol-specs/calls/unconstrained-calls.md`    | Not Integrated |       |

### Sources → Spec #7: Private Kernel Circuits

| S#  | Source File                                            | Status         | Notes |
| --- | ------------------------------------------------------ | -------------- | ----- |
| 29  | `old-protocol-specs/circuits/high-level-topology.md`   | Not Integrated |       |
| 30  | `old-protocol-specs/circuits/private-function.md`      | Not Integrated |       |
| 31  | `old-protocol-specs/circuits/private-kernel-reset.md`  | Not Integrated |       |
| 32  | `old-protocol-specs/circuits/private-kernel-tail.md`   | Not Integrated |       |

### Sources → Spec #8: Public VM (AVM)

| S#  | Source File                                                    | Status         | Notes |
| --- | -------------------------------------------------------------- | -------------- | ----- |
| 33  | `old-protocol-specs/bytecode/index.md`                         | Not Integrated |       |
| 34  | `old-protocol-specs/public-vm/index.md`                        | Not Integrated |       |
| 35  | `old-protocol-specs/public-vm/intro.md`                        | Not Integrated |       |
| 36  | `old-protocol-specs/public-vm/execution.md`                    | Not Integrated |       |
| 37  | `old-protocol-specs/public-vm/memory-model.md`                 | Not Integrated |       |
| 38  | `old-protocol-specs/public-vm/state.md`                        | Not Integrated |       |
| 39  | `old-protocol-specs/public-vm/control-flow.md`                 | Not Integrated |       |
| 40  | `old-protocol-specs/public-vm/alu.md`                          | Not Integrated |       |
| 41  | `old-protocol-specs/public-vm/type-structs.md`                 | Not Integrated |       |
| 42  | `old-protocol-specs/public-vm/security.md`                     | Not Integrated |       |
| 43  | `old-protocol-specs/public-vm/_nested-context.md`              | Not Integrated |       |
| 44  | `old-protocol-specs/public-vm/avm-circuit.md`                  | Not Integrated |       |
| 45  | `old-protocol-specs/public-vm/bytecode-validation-circuit.md`  | Not Integrated |       |
| 46  | `old-protocol-specs/public-vm/circuit-index.md`                | Not Integrated |       |
| 47  | `old-protocol-specs/circuits/public-kernel-initial.md`         | Not Integrated |       |
| 48  | `old-protocol-specs/circuits/public-kernel-inner.md`           | Not Integrated |       |
| 49  | `old-protocol-specs/circuits/public-kernel-tail.md`            | Not Integrated |       |

### Sources → Spec #9: Rollup Circuits

| S#  | Source File                                         | Status         | Notes |
| --- | --------------------------------------------------- | -------------- | ----- |
| 50  | `old-protocol-specs/rollup-circuits/index.md`       | Not Integrated |       |
| 51  | `old-protocol-specs/rollup-circuits/base-rollup.md` | Not Integrated |       |
| 52  | `old-protocol-specs/rollup-circuits/merge-rollup.md` | Not Integrated |       |
| 53  | `old-protocol-specs/rollup-circuits/root-rollup.md` | Not Integrated |       |
| 54  | `old-protocol-specs/rollup-circuits/tree-parity.md` | Not Integrated |       |

### Sources → Spec #10: L1 Rollup Contract

| S#  | Source File                                       | Status         | Notes |
| --- | ------------------------------------------------- | -------------- | ----- |
| 55  | `old-protocol-specs/l1-smart-contracts/index.md`  | Not Integrated |       |
| 56  | `old-protocol-specs/l1-smart-contracts/frontier.md` | Not Integrated |       |

### Sources → Spec #11: Cross-Chain Messaging

| S#  | Source File                                              | Status         | Notes |
| --- | -------------------------------------------------------- | -------------- | ----- |
| 57  | `old-protocol-specs/calls/public-private-messaging.md`   | Not Integrated |       |

### Sources → Spec #12: Data Availability & Blobs

| S#  | Source File                                                            | Status         | Notes |
| --- | ---------------------------------------------------------------------- | -------------- | ----- |
| 58  | `old-protocol-specs/data-publication-and-availability/index.md`        | Not Integrated |       |
| 59  | `old-protocol-specs/data-publication-and-availability/overview.md`     | Not Integrated |       |
| 60  | `old-protocol-specs/data-publication-and-availability/published-data.md` | Not Integrated |       |
| 61  | `old-protocol-specs/data-publication-and-availability/blobs.md`        | Not Integrated |       |

### Sources → Spec #13: Addresses & Keys

| S#  | Source File                                                                         | Status         | Notes |
| --- | ----------------------------------------------------------------------------------- | -------------- | ----- |
| 62  | `old-protocol-specs/addresses-and-keys/index.md`                                   | Not Integrated |       |
| 63  | `old-protocol-specs/addresses-and-keys/address.md`                                 | Not Integrated |       |
| 64  | `old-protocol-specs/addresses-and-keys/keys.md`                                    | Not Integrated |       |
| 65  | `old-protocol-specs/addresses-and-keys/keys-requirements.md`                       | Not Integrated |       |
| 66  | `old-protocol-specs/addresses-and-keys/diversified-and-stealth.md`                 | Not Integrated |       |
| 67  | `old-protocol-specs/addresses-and-keys/precompiles.md`                             | Not Integrated |       |
| 68  | `old-protocol-specs/addresses-and-keys/example-usage/diversified-and-stealth-keys.md` | Not Integrated |       |
| 69  | `old-protocol-specs/addresses-and-keys/example-usage/encrypt-and-tag.md`           | Not Integrated |       |
| 70  | `old-protocol-specs/addresses-and-keys/example-usage/nullifier.md`                 | Not Integrated |       |
| 71  | `old-protocol-specs/addresses-and-keys/example-usage/tag-sequence-derivation.md`   | Not Integrated |       |

### Sources → Spec #14: Contract Deployment

| S#  | Source File                                             | Status         | Notes |
| --- | ------------------------------------------------------- | -------------- | ----- |
| 72  | `old-protocol-specs/contract-deployment/index.md`       | Not Integrated |       |
| 73  | `old-protocol-specs/contract-deployment/classes.md`     | Not Integrated |       |
| 74  | `old-protocol-specs/contract-deployment/instances.md`   | Not Integrated |       |
| 75  | `old-protocol-specs/pre-compiled-contracts/index.md`    | Not Integrated |       |
| 76  | `old-protocol-specs/pre-compiled-contracts/registry.md` | Not Integrated |       |

### Sources → Spec #15: Gas & Fees

| S#  | Source File                                                     | Status         | Notes |
| --- | --------------------------------------------------------------- | -------------- | ----- |
| 77  | `old-protocol-specs/gas-and-fees/index.md`                      | Not Integrated |       |
| 78  | `old-protocol-specs/gas-and-fees/fee-juice.md`                  | Not Integrated |       |
| 79  | `old-protocol-specs/gas-and-fees/fee-schedule.md`               | Not Integrated |       |
| 80  | `old-protocol-specs/gas-and-fees/kernel-tracking.md`            | Not Integrated |       |
| 81  | `old-protocol-specs/gas-and-fees/published-gas-and-fee-data.md` | Not Integrated |       |
| 82  | `old-protocol-specs/gas-and-fees/specifying-gas-fee-info.md`    | Not Integrated |       |
| 83  | `old-protocol-specs/gas-and-fees/tx-setup-and-teardown.md`      | Not Integrated |       |

### Sources → Spec #16: Logs & Events

| S#  | Source File                                                         | Status         | Notes |
| --- | ------------------------------------------------------------------- | -------------- | ----- |
| 84  | `old-protocol-specs/logs/index.md`                                  | Not Integrated |       |
| 85  | `old-protocol-specs/private-message-delivery/index.md`              | Not Integrated |       |
| 86  | `old-protocol-specs/private-message-delivery/private-msg-delivery.md` | Not Integrated |       |
| 87  | `old-protocol-specs/private-message-delivery/send-note-guidelines.md` | Not Integrated |       |

### Sources → Spec #17: P2P Network Protocol

| S#  | Source File                                          | Status         | Notes |
| --- | ---------------------------------------------------- | -------------- | ----- |
| 88  | `old-protocol-specs/decentralization/p2p-network.md` | Not Integrated |       |

### Sources → Spec #18: Block Production & Consensus

| S#  | Source File                                                | Status         | Notes |
| --- | ---------------------------------------------------------- | -------------- | ----- |
| 89  | `old-protocol-specs/decentralization/actors.md`            | Not Integrated |       |
| 90  | `old-protocol-specs/decentralization/block-production.md`  | Not Integrated |       |

### Sources → Spec #19: Governance

| S#  | Source File                                             | Status         | Notes |
| --- | ------------------------------------------------------- | -------------- | ----- |
| 91  | `old-protocol-specs/decentralization/governance.md`     | Not Integrated |       |
