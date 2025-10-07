# Aztec Node

The Aztec Node is the core component that orchestrates all the subsystems required to participate in the Aztec network. It integrates the archiver, world state, P2P networking, sequencer, validator, and prover components into a cohesive system that can sync with L1, maintain state, build blocks, and participate in consensus.

## Overview

The Aztec Node serves multiple roles in the network:

- **Full Node**: Maintains complete chain state and serves queries
- **Sequencer Node**: Builds and proposes new blocks when selected
- **Validator Node**: Participates in attestation and consensus
- **Prover Node**: Generates validity proofs for state transitions

## System Architecture

### Component Interaction Flow

```mermaid
graph TB
    subgraph "L1 Ethereum"
        L1RC[Rollup Contract]
        L1MC[Message Bridge]
        L1REG[Registry Contract]
    end

    subgraph "Aztec Node"
        subgraph "Data Layer"
            ARCH[Archiver]
            WS[World State]
            MT[Merkle Trees]
            DB[(Database)]
        end

        subgraph "Network Layer"
            P2P[P2P Client]
            MP[Mempool]
            SYNC[Sync Controller]
        end

        subgraph "Execution Layer"
            SEQ[Sequencer]
            VAL[Validator]
            PP[Public Processor]
            BB[Block Builder]
        end

        subgraph "Proving Layer"
            PROV[Prover]
            PQ[Proof Queue]
        end

        subgraph "API Layer"
            RPC[JSON-RPC Server]
            API[Node API]
        end
    end

    subgraph "External Clients"
        PXE[PXE Clients]
        APPS[Applications]
    end

    %% L1 Interactions
    L1RC -->|Blocks & Proofs| ARCH
    L1MC -->|Messages| ARCH
    L1REG -->|Registry Data| ARCH

    %% Archiver Flow
    ARCH -->|Chain Data| WS
    ARCH -->|Block Headers| DB
    ARCH -->|Messages| DB

    %% World State Management
    WS -->|Tree Updates| MT
    WS -->|State Queries| SEQ
    WS -->|State Queries| VAL
    WS -->|State Queries| PROV
    DB -->|Historical Data| WS

    %% P2P Network Flow
    P2P -->|Transactions| MP
    P2P -->|Attestations| VAL
    P2P -->|Block Proposals| VAL
    MP -->|Pending Txs| SEQ

    %% Sequencer Flow
    SEQ -->|Build Block| BB
    BB -->|Execute| PP
    BB -->|State Updates| WS
    SEQ -->|Proposal| P2P
    SEQ -->|Publish Block| L1RC

    %% Validator Flow
    VAL -->|Reexecute| PP
    VAL -->|Verify State| WS
    VAL -->|Send Attestations| P2P

    %% Prover Flow
    P2P -->|Block Data| PROV
    PROV -->|State Access| WS
    PROV -->|Proofs| PQ
    PQ -->|Submit Proof| L1RC

    %% API Access
    API -->|Query| WS
    API -->|Submit Tx| MP
    RPC -->|External API| API
    PXE -->|RPC Calls| RPC
    APPS -->|Requests| PXE

    style ARCH fill:#e1f5fe
    style WS fill:#fff9c4
    style SEQ fill:#c8e6c9
    style P2P fill:#f3e5f5
    style VAL fill:#e8f5e9
    style PROV fill:#fce4ec
```

### Data Flow Patterns

```mermaid
sequenceDiagram
    participant L1 as L1 Ethereum
    participant Arch as Archiver
    participant WS as World State
    participant P2P as P2P Network
    participant MP as Mempool
    participant Seq as Sequencer
    participant Val as Validator
    participant Prov as Prover

    Note over L1,Prov: Continuous Synchronization Flow

    loop Every L1 Block
        L1->>Arch: New L1 blocks
        Arch->>Arch: Extract rollup data
        Arch->>WS: Update chain tip
        WS->>WS: Update merkle trees
    end

    Note over L1,Prov: Transaction Processing Flow

    P2P->>MP: Receive transactions
    MP->>MP: Validate & store

    Note over L1,Prov: Block Production Flow (When Proposer)

    Seq->>MP: Get pending txs
    Seq->>WS: Get current state
    Seq->>Seq: Build block
    Seq->>Val: Create proposal
    Val->>P2P: Broadcast proposal

    P2P->>Val: Receive attestations
    Val->>Val: Aggregate signatures
    Val->>Seq: Return attestations
    Seq->>L1: Submit block

    Note over L1,Prov: Validation Flow (When Attester)

    P2P->>Val: Receive proposal
    Val->>WS: Get state for validation
    Val->>Val: Re-execute block
    Val->>P2P: Send attestation

    Note over L1,Prov: Proving Flow

    P2P->>Prov: Get block data
    Prov->>WS: Access witness data
    Prov->>Prov: Generate proof
    Prov->>L1: Submit proof
```

## Core Components

### Archiver

The archiver is responsible for downloading and indexing L1 data:

- **L1 Monitoring**: Continuously polls Ethereum for new blocks
- **Data Extraction**: Parses rollup contract events and messages
- **Chain Tracking**: Maintains canonical and pending chain states
- **Message Bridge**: Tracks L1→L2 and L2→L1 messages
- **Registry Sync**: Updates validator and contract registries

### World State

Manages the complete state of the Aztec network:

- **Merkle Trees**: Maintains note, nullifier, and public data trees
- **State Snapshots**: Provides consistent views for block building
- **Fork Management**: Handles chain reorganizations
- **State Queries**: Serves state proofs and witness data

### P2P Network

Handles all peer-to-peer communication:

- **Transaction Propagation**: Broadcasts and receives transactions
- **Block Proposals**: Distributes proposals to validators
- **Attestation Collection**: Aggregates committee signatures
- **Peer Discovery**: Maintains network connectivity
- **DoS Protection**: Rate limiting and peer scoring

### Mempool

Manages pending transactions:

- **Transaction Validation**: Checks signatures, fees, and nonces
- **Priority Ordering**: Sorts by fee and arrival time
- **Deduplication**: Prevents duplicate processing
- **Expiration**: Removes stale transactions
- **Reorg Handling**: Re-adds transactions after reorgs

### Sequencer

Coordinates block production when selected as proposer:

- **Slot Monitoring**: Tracks proposer eligibility
- **Block Building**: Assembles transactions into blocks
- **Attestation Collection**: Gathers committee signatures
- **L1 Submission**: Publishes blocks to Ethereum
- **State Management**: Updates local state optimistically

### Validator

Handles consensus participation:

- **Proposal Validation**: Re-executes proposed blocks
- **Attestation Creation**: Signs valid proposals
- **Committee Participation**: Fulfills epoch duties
- **Slashing Detection**: Reports misbehavior

### Prover

Generates validity proofs (when enabled):

- **Proof Generation**: Creates ZK proofs for state transitions
- **Witness Collection**: Gathers required state data
- **Proof Submission**: Sends proofs to L1
- **Resource Management**: Handles proof queue and priorities

## Node Modes

The Aztec Node can operate in different modes:

### Full Node Mode

```mermaid
graph LR
    A[Archiver Active]
    B[World State Active]
    C[P2P Active]
    D[API Active]

    A --> B --> C --> D

    X[Sequencer Disabled]
    Y[Validator Disabled]
    Z[Prover Disabled]

    style X fill:#ffcccc
    style Y fill:#ffcccc
    style Z fill:#ffcccc
```

### Sequencer Node Mode

```mermaid
graph LR
    A[All Full Node Components]
    B[Sequencer Active]
    C[Validator Active]
    D[Publisher Active]

    A --> B --> C --> D

    X[Prover Optional]

    style X fill:#ffffcc
```

### Prover Node Mode

```mermaid
graph LR
    A[Archiver Active]
    B[World State Active]
    C[P2P Active]
    D[Prover Active]

    A --> B --> C --> D

    X[Sequencer Disabled]
    Y[Validator Disabled]

    style X fill:#ffcccc
    style Y fill:#ffcccc
```

## Development

### Building

Start by running `bootstrap.sh` in the project root.

To build the package, run `yarn build` in the root.

To watch for changes, `yarn build:dev`.

### Testing

To run the tests, execute `yarn test`.

The end-to-end tests provide examples of initializing an Aztec Node and using it with a Private eXecution Environment (PXE).

### Running a Local Node

```bash
aztec start
```
