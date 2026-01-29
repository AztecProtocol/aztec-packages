# Chapter 2: High-Level Architecture

## What is a Layer 2?

Before diving into Aztec's architecture, let's clarify what a Layer 2 (L2) is.

**Ethereum (Layer 1)** is the base blockchain - secure but slow and expensive. Every transaction must be processed by thousands of validators worldwide.

**Layer 2s** are systems built "on top" of Ethereum that:
1. Process transactions off-chain (faster, cheaper)
2. Periodically submit summaries to Ethereum (inherits security)
3. Allow users to withdraw funds back to L1 if needed

### Types of L2s

| Type | How it Works | Examples |
|------|--------------|----------|
| **Optimistic Rollup** | Assume transactions are valid; allow challenges | Optimism, Arbitrum |
| **ZK Rollup** | Prove transactions are valid with ZKPs | Aztec, zkSync, Starknet |

Aztec is a **ZK Rollup** - it uses zero-knowledge proofs to prove that all transactions were processed correctly. This means:
- No waiting period for withdrawals (unlike optimistic rollups)
- Privacy is possible (ZKPs hide transaction details)
- Verification is cheap (one proof covers thousands of transactions)

## System Overview

The Aztec network consists of several components working together:

```
+------------------+     +------------------+     +------------------+
|      User        |     |   Aztec Node     |     |    Ethereum      |
|  +------------+  |     |  +------------+  |     |  +------------+  |
|  |   Wallet   |  |     |  | Sequencer  |  |     |  |  Rollup    |  |
|  +------------+  |     |  +------------+  |     |  |  Contract  |  |
|  |    PXE     |  |---->|  |   Prover   |  |---->|  +------------+  |
|  +------------+  |     |  +------------+  |     |  |  Verifier  |  |
|  | Local Exec |  |     |  |    AVM     |  |     |  +------------+  |
+------------------+     +------------------+     +------------------+
```

### User Side

- **Wallet**: User interface for managing accounts and signing transactions
- **PXE (Private Execution Environment)**: Client-side runtime that executes private functions, manages keys and notes, and generates proofs
- **Local Execution**: Private functions run entirely on the user's device

### Network Side

- **Sequencer**: Orders transactions, builds blocks, coordinates with provers
- **Prover**: Generates cryptographic proofs for transactions and epochs
- **AVM**: Executes public functions with access to current state

### Ethereum

- **Rollup Contract**: Receives block data and epoch proofs
- **Verifier Contract**: Verifies the validity of submitted proofs

## The Two-Phase Execution Model

Every Aztec transaction follows a two-phase execution model:

### Phase 1: Private Execution (Client-Side)

```
User Device (PXE)
+------------------------------------------+
| 1. Execute private functions             |
| 2. Generate proofs (kernel circuits)     |
| 3. Produce: note hashes, nullifiers,     |
|    encrypted logs, public call requests  |
+------------------------------------------+
            |
            v
    Transaction sent to network
```

Private execution:
- Happens on the user's device
- Has access to user's private keys and decrypted notes
- Cannot see current public state (uses historical snapshots)
- Produces a proof that execution was correct
- May enqueue public function calls for phase 2

### Phase 2: Public Execution (Network-Side)

```
Sequencer Node (AVM)
+------------------------------------------+
| 1. Execute public functions              |
| 2. Access/modify public state            |
| 3. Generate AVM proof                    |
| 4. Finalize transaction effects          |
+------------------------------------------+
            |
            v
    Transaction included in block
```

Public execution:
- Happens on sequencer nodes
- Has access to current public state
- Can read (but not modify) private state commitments
- Processes public call requests from phase 1

## State Model

Aztec maintains several types of state:

### Private State

Private state is stored as **notes** - encrypted pieces of data. The protocol only stores:

- **Note Hashes**: Cryptographic commitments to note contents
- **Nullifiers**: Values that mark notes as "consumed"

The actual note contents are encrypted and stored off-chain. Only the intended recipients can decrypt them.

```
Note Hash Tree (Append-Only)
+---+---+---+---+---+---+---+---+
| H1| H2| H3| H4| H5| H6| H7| H8|  <- Note hashes
+---+---+---+---+---+---+---+---+

Nullifier Tree (Indexed)
+---+---+---+---+---+---+---+---+
| N1| N2| N3| N4|   |   |   |   |  <- Nullifiers
+---+---+---+---+---+---+---+---+
```

### Public State

Public state works like Ethereum - directly readable and writable:

```
Public Data Tree
+------------------+------------------+
| Slot: 0x1234...  | Value: 100      |
| Slot: 0x5678...  | Value: "hello"  |
| Slot: 0x9abc...  | Value: 42       |
+------------------+------------------+
```

### Cross-Chain Messages

Two trees handle L1<->L2 communication:

- **L1-to-L2 Message Tree**: Messages from Ethereum to Aztec
- **Out Hash**: Accumulated L2-to-L1 messages (stored as a Merkle root)

## Block and Epoch Structure

Aztec organizes data into a hierarchy:

```
Epoch
+----------------------------------------------------------+
|  Checkpoint 1        Checkpoint 2        Checkpoint 3    |
|  +--------------+    +--------------+    +--------------+|
|  | Block 1      |    | Block 4      |    | Block 7      ||
|  | Block 2      |    | Block 5      |    | Block 8      ||
|  | Block 3      |    | Block 6      |    |              ||
|  +--------------+    +--------------+    +--------------+|
+----------------------------------------------------------+
```

- **Transaction**: One user operation (may have private + public parts)
- **Block**: Contains multiple transactions, has a block header
- **Checkpoint**: Groups blocks, handles blob data commitments
- **Epoch**: Final unit for L1 submission, contains all checkpoints

## The Archive Tree

The **Archive Tree** is the root of all state. Each block adds a new leaf containing the block header hash:

```
Archive Tree
        [Root]
       /      \
    [H12]     [H34]
    /   \     /   \
  [H1] [H2] [H3] [H4]  <- Block header hashes
```

When a transaction executes, it references a specific archive root (the "anchor block"). This provides a consistent view of historical state.

## Proof Aggregation

Proofs are aggregated in a binary tree structure:

```
                    [Root Rollup Proof]
                           |
            +--------------+--------------+
            |                             |
    [Checkpoint Merge]            [Checkpoint Merge]
            |                             |
    +-------+-------+             +-------+-------+
    |               |             |               |
[Checkpoint]  [Checkpoint]  [Checkpoint]  [Checkpoint]
    |               |             |               |
   ...             ...           ...             ...
    |               |             |               |
[TX Base]       [TX Base]     [TX Base]       [TX Base]
```

This tree structure enables:
- **Parallelization**: Different branches can be proved simultaneously
- **Flexibility**: Variable numbers of transactions per block
- **Efficiency**: Logarithmic verification depth

## Data Availability

All transaction data must be available for anyone to reconstruct state. Aztec uses **blobs** (EIP-4844) for data availability:

1. Transaction effects are accumulated into a Poseidon2 sponge
2. At checkpoint boundaries, the sponge is "squeezed" to produce blob commitments
3. Blob data is posted to Ethereum alongside the epoch proof
4. KZG commitments prove the blob data matches what circuits processed

## Security Model

The security of Aztec relies on:

1. **Zero-Knowledge Proofs**: Ensure all rules are followed without revealing private data
2. **Ethereum Security**: Final verification happens on L1
3. **Data Availability**: Blob commitments ensure state can be reconstructed
4. **Cryptographic Primitives**: Poseidon2 hashes, KZG commitments, SNARK proofs

No single party can:
- Create invalid state transitions (proofs would fail)
- Link private transactions (ZK hides the connections)
- Censor indefinitely (data availability ensures recovery)

\newpage
