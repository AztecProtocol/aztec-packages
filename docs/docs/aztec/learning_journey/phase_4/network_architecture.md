---
title: "Network Architecture"
description: "Understanding the structure of the Aztec network: nodes, sequencers, provers, and how they interact."
sidebar_position: 1
tags: [network-architecture, nodes, sequencers, provers]
---

# Network Architecture: Nodes, Sequencers, and Provers

## The Aztec Network Topology

Aztec's network is designed around **specialized roles** that work together to provide privacy-preserving blockchain functionality. Unlike traditional blockchains where all nodes do everything, Aztec's architecture separates concerns for better efficiency and privacy.

## Network Participants

### 1. Users with PXE (Private Execution Environment)

**Role:** Execute private functions and generate proofs

```
User's Device (PXE):
├── Manages private keys and notes
├── Executes private smart contract functions
├── Generates zero-knowledge proofs
├── Submits transactions to sequencers
└── Synchronizes with network state
```

**Responsibilities:**
- **Private Computation:** Run sensitive operations locally
- **Proof Generation:** Create cryptographic evidence of correct execution
- **Key Management:** Secure private keys and viewing keys
- **Note Discovery:** Find and decrypt personal notes
- **Transaction Submission:** Send proofs to the network

**Hardware Requirements:** Consumer devices (laptops, phones) with proof generation capability

### 2. Sequencers

**Role:** Order transactions and execute public functions

```
Sequencer Responsibilities:
├── Collect transactions from users
├── Order transactions into blocks
├── Execute public functions (AVM)
├── Update public state trees
├── Generate block commitments
└── Submit blocks to provers
```

**Key Functions:**
- **Transaction Ordering:** Determine the sequence of transactions
- **Public Execution:** Run public smart contract functions
- **State Management:** Update public state trees
- **Block Production:** Create blocks for the network
- **MEV Prevention:** Fair ordering of transactions

**Selection Mechanism:** Initially centralized, evolving to decentralized selection

### 3. Provers

**Role:** Generate proofs for blocks and submit to L1

```
Prover Responsibilities:
├── Receive blocks from sequencers
├── Generate rollup proofs for blocks
├── Aggregate multiple block proofs
├── Submit final proofs to Ethereum L1
└── Ensure proof validity and correctness
```

**Proof Types:**
- **Base Rollup Proofs:** Prove individual block validity
- **Merge Rollup Proofs:** Combine multiple base proofs
- **Root Rollup Proofs:** Final proof submitted to L1

**Hardware Requirements:** High-performance machines with specialized proving hardware

### 4. Full Nodes

**Role:** Maintain complete state and validate the network

```
Full Node Responsibilities:
├── Store complete state trees
├── Validate all transactions and proofs
├── Serve data to light clients
├── Participate in network consensus
└── Provide network resilience
```

**Storage Requirements:**
- Complete note hash tree
- Complete nullifier tree  
- Complete public data tree
- Historical block data
- L1-L2 message queues

### 5. Light Nodes

**Role:** Efficient participation without full state

```
Light Node Capabilities:
├── Store only block headers (~1GB)
├── Validate block header chains
├── Request specific data when needed
├── Verify proofs without full state
└── Provide efficient user interfaces
```

**Use Cases:**
- Mobile wallets
- Browser-based applications
- Resource-constrained environments
- Quick sync scenarios

## Network Communication Flow

### Transaction Processing Flow

```
1. Private Execution (PXE)
   ├── User executes private functions
   ├── Generates private kernel proof
   └── Submits to sequencer

2. Public Execution (Sequencer)
   ├── Receives private kernel proofs
   ├── Orders transactions in block
   ├── Executes public functions (AVM)
   ├── Generates public kernel proofs
   └── Creates block with state updates

3. Proof Generation (Prover)
   ├── Receives block from sequencer
   ├── Generates base rollup proof
   ├── Aggregates with other proofs
   └── Submits final proof to L1

4. Settlement (Ethereum L1)
   ├── Verifies submitted proof
   ├── Updates state commitment
   └── Finalizes block
```

### Data Availability Patterns

**Private Data:**
```
Private Function Outputs:
├── Note commitments (public)
├── Nullifiers (public, unlinkable)
├── Encrypted note data (public, only owner can decrypt)
└── Zero-knowledge proofs (public, hide computation details)
```

**Public Data:**
```
Public Function Outputs:
├── Public state changes (transparent)
├── Public event logs (transparent)  
├── Contract calls (transparent)
└── Execution traces (transparent)
```

## Decentralization Roadmap

### Current State (Early Network)

**Sequencer:** 
- Initially centralized for development and testing
- Single sequencer operated by Aztec team
- Focus on correctness and feature development

**Provers:**
- Decentralized proof generation from launch
- Multiple independent provers can compete
- Proof validity ensures correctness regardless of prover

### Future Decentralization

**Sequencer Decentralization:**
```
Phase 1: Multiple Sequencers
├── Multiple sequencer candidates
├── Rotation-based selection
├── Slashing for misbehavior
└── Gradual increase in sequencer count

Phase 2: Decentralized Selection
├── Cryptographic leader election  
├── Stake-based participation
├── Economic incentives alignment
└── Full decentralization
```

**Network Effects:**
- More sequencers → better censorship resistance
- More provers → higher availability and competition
- More full nodes → greater network resilience

## Economic Incentives

### Fee Structure

**User Fees:**
```
Transaction Components:
├── Private execution: Paid in Fee Juice (free client-side execution)
├── Public execution: Gas fees for AVM computation
├── Data availability: Costs for storing commitments/nullifiers
└── L1 settlement: Amortized L1 gas costs across batch
```

**Revenue Distribution:**
```
Fee Distribution:
├── Sequencers: Public execution fees + MEV
├── Provers: Proof generation rewards + L1 submission fees
├── L1 validators: Standard Ethereum fees
└── Network: Protocol development fund
```

### Incentive Alignment

**Sequencer Incentives:**
- Collect transaction fees
- Capture MEV from public transactions
- Slashing penalties for misbehavior
- Reputation effects on future selection

**Prover Incentives:**
- Competition for proof generation rewards
- First-to-submit advantages
- Hardware specialization benefits
- Long-term token rewards

## Privacy and Network Architecture

### Privacy-Preserving Network Design

**Metadata Protection:**
```
Network Privacy Features:
├── Transaction mixing at sequencer level
├── Timing randomization for private transactions
├── Encrypted communication channels
└── Anonymous transaction submission
```

**Traffic Analysis Resistance:**
```
Protection Mechanisms:
├── Batch submission of multiple transactions
├── Dummy transaction padding
├── Onion routing for sensitive communications  
└── Private information retrieval protocols
```

### Balancing Privacy and Performance

**Trade-offs:**
- More privacy layers → higher latency
- Stronger anonymity → more bandwidth usage
- Better metadata protection → increased complexity

**Optimization Strategies:**
```
Performance Optimizations:
├── Batching transactions for efficiency
├── Parallel proof generation
├── Efficient state synchronization
└── Cached frequently-accessed data
```

## Network Scalability

### Horizontal Scaling

**Multiple Chains:**
- Deploy multiple Aztec chains for different use cases
- Cross-chain communication protocols
- Shared security model with Ethereum

**Proof Parallelization:**
```
Parallel Proof Generation:
├── Independent proof generation for different transactions
├── Parallel base rollup proof creation
├── Concurrent merge proof aggregation
└── Optimized proof composition
```

### Vertical Scaling  

**Hardware Improvements:**
- Specialized proving hardware
- GPU/FPGA acceleration for proof generation
- Optimized cryptographic implementations
- Memory and storage optimizations

**Protocol Optimizations:**
- More efficient proof systems
- Reduced constraint counts in circuits
- Better compression algorithms
- Optimized tree structures

## Key Takeaways

1. **Specialized roles improve efficiency** - sequencers, provers, and nodes have distinct responsibilities
2. **Privacy is maintained throughout** - network design protects user privacy at all layers
3. **Decentralization is progressive** - starting secure, evolving toward full decentralization
4. **Economic incentives align behavior** - fees and rewards encourage proper network operation
5. **Scalability comes from parallelization** - multiple components can work simultaneously
6. **Trade-offs exist between privacy and performance** - network design balances these carefully

---

## Next Steps

Now that you understand the network architecture, let's follow a transaction through its complete lifecycle from private execution to L1 settlement.

**Continue to:** [Transaction Lifecycle →](/aztec/learning_journey/phase_4/transaction_lifecycle)

---

**Phase 4 Navigation:**  
← *Phase 4 Overview* | **Network Architecture** | [Transaction Lifecycle →](/aztec/learning_journey/phase_4/transaction_lifecycle)