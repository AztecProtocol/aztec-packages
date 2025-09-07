---
title: "State Trees"
description: "Understanding Aztec's five-tree state model that enables hybrid public and private state management."
sidebar_position: 3
tags: [state-trees, five-tree-model, hybrid-state, merkle-trees]
---

# State Trees: The Five-Tree Model

## Beyond Single State: Hybrid State Architecture

Most blockchains use a single state tree to track all data. Aztec uses **five specialized trees**, each optimized for different types of data and privacy requirements. This sophisticated architecture enables the hybrid public/private state model that makes Aztec unique.

## The Five Trees Overview

```
Aztec State Architecture:
├── Note Hash Tree (Private data commitments)
├── Nullifier Tree (Spent note tracking)  
├── Public Data Tree (Public state storage)
├── L1→L2 Message Tree (Cross-chain messages)
└── Archive Tree (Historical state snapshots)
```

Each tree serves a specific purpose in maintaining privacy while enabling verification and coordination.

## Tree 1: Note Hash Tree

### Purpose: Private Data Commitments

The Note Hash Tree stores **commitments** (hashes) to all private notes created in the system.

```
Note Hash Tree (Append-Only):
├── Commitment 1: hash(note_data_1)
├── Commitment 2: hash(note_data_2)  
├── Commitment 3: hash(note_data_3)
└── ... (millions of commitments)
```

### Key Properties

**Append-Only:**
- New commitments are always added to the end
- No modifications or deletions allowed
- Creates permanent record of all private data creation

**Privacy-Preserving:**
- Commitments reveal nothing about note contents
- Only note owners can link commitments to actual notes
- Provides plausible deniability for note ownership

**Membership Proofs:**
- Users can prove their notes exist in the tree
- Proofs don't reveal which commitment is theirs
- Enables private balance verification

### Example Usage

```
Alice's Private Transfer:
├── Creates note for Bob: 25 tokens
├── Creates change note for Alice: 35 tokens  
├── Generates commitments: hash(bob_note), hash(alice_note)
├── Adds to tree: Two new commitments appended
└── Privacy: Amounts and recipients hidden in commitments
```

## Tree 2: Nullifier Tree

### Purpose: Spent Note Tracking

The Nullifier Tree tracks **nullifiers** - unique identifiers for spent notes that prevent double-spending.

```
Nullifier Tree (Indexed):
├── Nullifier 1: unique_id_for_spent_note_1
├── Nullifier 2: unique_id_for_spent_note_2
├── Nullifier 3: unique_id_for_spent_note_3
└── ... (millions of nullifiers, sorted)
```

### Key Properties

**Indexed Structure:**
- Nullifiers stored in sorted order
- Supports both membership and non-membership proofs
- Enables efficient double-spending prevention

**Unlinkable to Notes:**
- Nullifiers don't reveal which notes were spent
- Multiple notes from same user have unlinkable nullifiers
- Provides transaction privacy

**Permanent Record:**
- Once added, nullifiers never removed
- Creates permanent spend history
- Prevents replay attacks

### Double-Spending Prevention

```
Transaction Validation:
├── User generates nullifier for note being spent
├── Check: Nullifier not already in Nullifier Tree
├── If exists: Reject (double-spending attempt)
├── If new: Accept and add nullifier to tree
└── Result: Each note can only be spent once
```

### Example Usage

```
Alice Spends Her Note:
├── Note to spend: 60 token note
├── Generates nullifier: hash(note + alice_secret_key)  
├── Proves: Nullifier not in tree (non-membership proof)
├── After spending: Nullifier added to tree
└── Result: This note can never be spent again
```

## Tree 3: Public Data Tree

### Purpose: Public State Storage

The Public Data Tree stores all public smart contract state - just like Ethereum's state tree but optimized for Aztec.

```
Public Data Tree (Key-Value):
├── Contract_A_Storage_Slot_1: value_1
├── Contract_B_Storage_Slot_5: value_2
├── Token_Contract_Supply: total_supply
└── ... (all public state variables)
```

### Key Properties

**Transparent:**
- All data publicly visible and verifiable
- Standard blockchain state management
- No privacy features needed

**Updatable:**
- Values can be modified by public functions
- Supports all standard state operations
- Immediate consistency

**Efficient:**
- Optimized for fast reads and writes
- Supports standard database operations
- Compatible with existing tools

### Example Usage

```
Public Token Operations:
├── Total supply: Stored in public tree
├── Public balances: Stored in public tree
├── Contract configurations: Stored in public tree
└── Governance parameters: Stored in public tree
```

## Tree 4: L1→L2 Message Tree

### Purpose: Cross-Chain Message Handling

This tree manages messages sent from Ethereum L1 to Aztec L2, enabling cross-chain communication.

```
L1→L2 Message Tree (Append-Only):
├── Message 1: deposit_100_ETH_to_alice
├── Message 2: update_contract_parameter_X
├── Message 3: cross_chain_governance_action
└── ... (all L1→L2 messages)
```

### Key Properties

**Ordered Processing:**
- Messages processed in FIFO order
- Prevents race conditions in cross-chain operations
- Ensures deterministic execution

**Tamper-Proof:**
- Messages cryptographically committed on L1
- Cannot be modified or censored by L2
- Provides strong security guarantees

**Consumption Tracking:**
- Messages marked as consumed after processing
- Prevents double-processing
- Maintains cross-chain consistency

### Example Usage

```
ETH Deposit from L1:
├── User deposits ETH on L1 contract
├── L1 contract creates L1→L2 message
├── Message added to message tree on L2
├── L2 processes message: Creates private ETH note for user
└── Message marked as consumed
```

## Tree 5: Archive Tree

### Purpose: Historical State Snapshots

The Archive Tree maintains a history of all state tree roots, enabling historical state verification and time-travel queries.

```
Archive Tree (Historical):
├── Block 1 State: {note_hash_root, nullifier_root, public_root, ...}
├── Block 2 State: {note_hash_root, nullifier_root, public_root, ...}
├── Block 3 State: {note_hash_root, nullifier_root, public_root, ...}  
└── ... (complete state history)
```

### Key Properties

**Historical Record:**
- Immutable record of all historical states
- Enables time-travel queries
- Supports historical proofs

**State Verification:**
- Proves what the state was at any point in time
- Enables auditing and compliance
- Supports rollback scenarios

**Efficient Storage:**
- Only stores root hashes, not full state
- Compact representation of complete history
- Enables efficient historical queries

### Example Usage

```
Historical Balance Proof:
├── Query: "What was Alice's balance at block 1000?"
├── Archive tree: Provides state roots for block 1000
├── Historical proof: Shows Alice's notes at that time
└── Result: Verifiable historical balance without revealing current state
```

## Tree Interactions and Workflows

### Private Transaction Workflow

```
Alice Sends Private Payment to Bob:

1. Note Hash Tree:
   ├── Add: Commitment to Bob's new note
   └── Add: Commitment to Alice's change note

2. Nullifier Tree:  
   ├── Add: Nullifier for Alice's spent note
   └── Check: Nullifier didn't exist before

3. Archive Tree:
   └── Record: New roots after these updates
```

### Hybrid Transaction Workflow

```
Private Setup + Public Execution:

1. Private Phase (PXE):
   ├── Note Hash Tree: New commitments
   ├── Nullifier Tree: New nullifiers
   └── Queue: Public function calls

2. Public Phase (Network):
   ├── Public Data Tree: Update public state
   └── Process: Queued public functions

3. Archive:
   └── Record: Combined private + public state changes
```

### Cross-Chain Workflow

```
L1 Deposit → L2 Private Note:

1. L1→L2 Message Tree:
   └── Add: Deposit message from L1

2. Message Processing:
   ├── Consume: L1→L2 message
   ├── Create: Private note for recipient
   └── Update: Note Hash Tree with new commitment

3. Archive Tree:
   └── Record: State after cross-chain operation
```

## Privacy Properties of the Tree System

### What Each Tree Reveals

**Note Hash Tree (Privacy-Preserving):**
- Reveals: Something was created
- Hides: What was created, for whom, with what value

**Nullifier Tree (Privacy-Preserving):**
- Reveals: Something was spent
- Hides: What was spent, by whom, when it was created

**Public Data Tree (Transparent):**
- Reveals: Everything (by design)
- Hides: Nothing (public state)

**L1→L2 Message Tree (Transparent):**
- Reveals: Cross-chain messages (necessary for verification)
- Hides: Processing details may be private

**Archive Tree (Metadata Only):**
- Reveals: State transitions occurred  
- Hides: Details of what changed (stored in other trees)

### Correlation Resistance

**Between Trees:**
- Note commitments can't be linked to nullifiers
- Nullifiers can't be linked to public state changes  
- Cross-chain messages can't be linked to private operations
- Archive entries don't reveal transaction patterns

**Within Trees:**
- Multiple commitments from same user appear unrelated
- Nullifiers from same user are unlinkable
- Public state changes follow normal transparency rules

## Performance and Optimization

### Tree-Specific Optimizations

**Note Hash Tree:**
- Append-only structure optimized for insertions
- Batch insertions for efficiency
- Compressed representations for proofs

**Nullifier Tree:**
- Indexed structure optimized for membership queries
- Non-membership proofs for double-spend prevention
- Efficient sorted insertion algorithms

**Public Data Tree:**
- Standard key-value optimizations
- Caching for frequently accessed data
- Efficient diff algorithms for state changes

### Cross-Tree Synchronization

**Atomic Updates:**
- All tree updates within a block are atomic
- Either all succeed or all fail
- Prevents inconsistent state

**Proof Batching:**
- Multiple tree operations batched into single proofs
- Reduces proof generation overhead
- Improves overall system efficiency

## Key Takeaways

1. **Five specialized trees serve different purposes** - each optimized for specific data types and privacy needs
2. **Hybrid state enables flexibility** - choose privacy or transparency per data type
3. **Privacy properties vary by tree** - from fully private to fully transparent
4. **Trees interact in sophisticated ways** - supporting complex transaction patterns
5. **Historical state is preserved** - enabling auditing and time-travel queries
6. **Performance optimizations are tree-specific** - each tree optimized for its use cases

---

## Next Steps

Now that you understand how Aztec manages state through its five-tree system, let's explore how the protocol communicates with Ethereum L1 for cross-chain operations.

**Continue to:** [L1-L2 Communication →](/aztec/learning_journey/phase_4/l1_l2_communication)

---

**Phase 4 Navigation:**  
[← Transaction Lifecycle](/aztec/learning_journey/phase_4/transaction_lifecycle) | **State Trees** | [L1-L2 Communication →](/aztec/learning_journey/phase_4/l1_l2_communication)