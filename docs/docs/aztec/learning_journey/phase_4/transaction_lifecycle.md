---
title: "Transaction Lifecycle"
description: "Following a complete transaction from private execution through public processing to L1 settlement."
sidebar_position: 2
tags: [transaction-lifecycle, private-execution, public-execution, settlement]
---

# Transaction Lifecycle: Private → Public → L1

## The Journey of a Transaction

Let's follow a complete Aztec transaction from start to finish. We'll use a private token transfer as our example: Alice privately sending 25 tokens to Bob while keeping her balance and the transfer amount hidden.

## Phase 1: Private Execution (On Alice's Device)

### Step 1: Transaction Initiation

```
Alice's Wallet (PXE):
├── Alice wants to send 25 tokens to Bob
├── Scans her notes to find sufficient balance
├── Finds: Note1 (60 tokens), Note2 (40 tokens) 
├── Selects: Note1 (60 tokens) for this transaction
└── Plans: 25 to Bob, 35 change back to Alice
```

### Step 2: Private Function Execution

```
Private Transfer Function Execution:
├── Input: Note1 (60 tokens, owned by Alice)
├── Verify: Alice owns Note1 (cryptographic proof)
├── Check: Note1 hasn't been spent (nullifier not in tree)
├── Create: New note for Bob (25 tokens)
├── Create: Change note for Alice (35 tokens)
├── Generate: Nullifier for Note1 (marks it as spent)
└── Output: Transaction components ready for proof
```

**What Happens Behind the Scenes:**
- Alice's PXE executes the private contract function
- All computation happens on Alice's device
- Private data (amounts, identities) never leave Alice's device
- Only cryptographic commitments are prepared for public submission

### Step 3: Private Kernel Proof Generation

```
Private Kernel Circuit:
├── Proves: Alice owns the input note
├── Proves: Input note sum = Output note sum (conservation)
├── Proves: Nullifier generation is correct
├── Proves: New note commitments are well-formed
├── Proves: All private logic executed correctly
└── Generates: Private kernel proof + public inputs
```

**Public Inputs (Revealed):**
- Note commitment for Bob's new note (encrypted)
- Note commitment for Alice's change note (encrypted)  
- Nullifier for Alice's spent note (unlinkable to note)
- Proof that all rules were followed correctly

**Private Inputs (Hidden):**
- Note amounts (25, 35, 60)
- Alice's identity and keys
- Bob's identity  
- Relationships between notes

### Step 4: Transaction Submission

```
Alice's PXE → Aztec Network:
├── Submits: Private kernel proof
├── Submits: Public inputs (commitments, nullifiers)
├── Submits: Any public function calls to execute
└── Transaction enters the mempool
```

## Phase 2: Public Execution (On Aztec Network)

### Step 5: Transaction Ordering

```
Sequencer Operations:
├── Receives: Alice's transaction from mempool
├── Orders: Alice's transaction with others in block
├── Verifies: Private kernel proof is valid
├── Checks: Nullifiers don't already exist (no double-spending)
└── Prepares: Transaction for public execution
```

### Step 6: Public Function Execution (If Any)

```
If Alice's transaction includes public calls:
├── Execute: Public functions on AVM (Aztec Virtual Machine)
├── Update: Public state based on function logic
├── Generate: Public execution trace
└── Create: Public kernel proof for this execution
```

**Note:** In our simple private transfer, there might be no public execution, but complex transactions often combine private and public operations.

### Step 7: State Tree Updates

```
State Tree Updates:
├── Note Hash Tree: Add Alice's and Bob's note commitments
├── Nullifier Tree: Add nullifier for Alice's spent note
├── Public Data Tree: Update any public state changes
└── Archive Tree: Will record this block's state root
```

### Step 8: Block Formation

```
Sequencer Block Creation:
├── Includes: Alice's transaction + others in block
├── Aggregates: All private kernel proofs in block
├── Executes: All public functions in order
├── Updates: All affected state trees
├── Computes: New state roots for all trees
└── Creates: Block ready for proving
```

## Phase 3: Proof Generation (By Provers)

### Step 9: Base Rollup Proof

```
Base Rollup Circuit:
├── Verifies: All private kernel proofs in block
├── Verifies: All public kernel proofs in block  
├── Proves: State tree updates are correct
├── Proves: All transactions follow protocol rules
├── Aggregates: Individual transaction proofs
└── Generates: Base rollup proof for this block
```

### Step 10: Proof Aggregation

```
If multiple blocks exist:
├── Merge Rollup Circuit: Combines base rollup proofs
├── Recursive Aggregation: Proves proofs-of-proofs
├── Efficiency: Many block proofs → single proof
└── Output: Root rollup proof ready for L1
```

## Phase 4: L1 Settlement (On Ethereum)

### Step 11: L1 Submission

```
Prover → Ethereum L1:
├── Submits: Root rollup proof
├── Submits: Previous state commitment
├── Submits: New state commitment  
├── Submits: Block data (commitments, nullifiers)
└── Requests: L1 verification of proof
```

### Step 12: L1 Verification

```
Aztec L1 Contract (On Ethereum):
├── Verifies: Root rollup proof is cryptographically valid
├── Checks: Previous state commitment matches current state
├── Validates: State transition is legitimate
├── Updates: State commitment to new root
├── Stores: New commitments and nullifiers
└── Emits: Events confirming block finalization
```

### Step 13: Finalization

```
Block Finalization:
├── Transaction is now final on Ethereum
├── State changes are irreversible
├── Alice's spent note is permanently nullified
├── Bob's and Alice's new notes are permanently committed
└── Network state is updated for all participants
```

## Phase 5: State Synchronization (Back to Users)

### Step 14: Note Discovery

```
Bob's PXE:
├── Monitors: New note commitments from L1
├── Downloads: Encrypted note data
├── Attempts: Decryption with Bob's viewing key
├── Success: Discovers he received 25 tokens from someone
├── Updates: Local balance and note database
└── UI: Shows new incoming transaction
```

```
Alice's PXE:
├── Monitors: New nullifiers and commitments
├── Recognizes: Her note was spent (nullifier appeared)
├── Discovers: Her change note (35 tokens)
├── Updates: Balance from 60 → 35 tokens
└── UI: Shows outgoing transaction completed
```

## Transaction States and Timing

### Transaction State Progression

```
1. Initiated (PXE): Transaction created locally
2. Submitted (Network): Sent to sequencer mempool
3. Included (Block): Added to a block by sequencer
4. Proven (L2): Block proof generated by prover
5. Submitted (L1): Proof submitted to Ethereum
6. Verified (L1): Proof verified by L1 contract
7. Finalized (L1): Transaction irreversibly settled
```

### Typical Timing

```
Phase Timing (Approximate):
├── Private Execution: Seconds (client-side)
├── Public Execution: Seconds (network processing)
├── Proof Generation: Minutes (depending on batch size)
├── L1 Submission: Minutes (prover timing + L1 inclusion)
├── L1 Verification: Minutes (Ethereum block confirmation)
└── Total: 5-15 minutes for full finality
```

## Privacy Throughout the Lifecycle

### What Remains Private

**Always Hidden:**
- Transaction amounts (25, 35, 60 tokens)
- Alice's identity and total balance
- Bob's identity and balance change
- The relationship between Alice and Bob
- Alice's other notes and transactions

### What Becomes Public

**Publicly Visible:**
- New note commitments appeared (but encrypted)
- A nullifier was created (but unlinkable)
- A valid proof was submitted
- State trees were updated correctly

### Observer Perspectives

**Alice Knows:**
- She sent 25 tokens to Bob
- She had 60 tokens, now has 35 tokens
- The transaction was successful
- Her complete transaction history

**Bob Knows:**
- He received 25 tokens from someone
- His balance increased by 25 tokens  
- The transaction was successful
- The transaction is finalized

**Network Observers Know:**
- Valid transactions occurred
- State transitions were correct
- New commitments and nullifiers exist
- The network is operating properly

**Nobody Else Knows:**
- Who sent tokens to whom
- How much was transferred
- Current balances of Alice or Bob
- Relationships between transactions

## Error Handling and Edge Cases

### Failed Transactions

**Private Execution Failure:**
- Error caught on user's device
- No network resources consumed
- User can retry with different parameters

**Public Execution Failure:**
- Transaction reverted during public execution
- Private operations already committed
- User may need recovery procedure

**Proof Generation Failure:**
- Block cannot be proven
- Sequencer may need to recreate block
- Transactions return to pending state

**L1 Submission Failure:**
- Prover may retry submission
- Other provers can submit the same proof
- Network continues with next block

## Key Takeaways

1. **Transactions flow through distinct phases** - private → public → settlement
2. **Privacy is maintained throughout** - sensitive data never leaves user devices
3. **Multiple parties validate correctness** - sequencers, provers, and L1 all verify different aspects  
4. **Finality comes from Ethereum** - L1 settlement provides ultimate security
5. **State synchronization enables user experience** - wallets discover and track state changes
6. **Error handling exists at each phase** - failures are recoverable without losing funds

---

## Next Steps

Now that you understand how transactions flow through the system, let's explore the sophisticated state tree system that makes hybrid privacy possible.

**Continue to:** [State Trees →](/aztec/learning_journey/phase_4/state_trees)

---

**Phase 4 Navigation:**  
[← Network Architecture](/aztec/learning_journey/phase_4/network_architecture) | **Transaction Lifecycle** | [State Trees →](/aztec/learning_journey/phase_4/state_trees)