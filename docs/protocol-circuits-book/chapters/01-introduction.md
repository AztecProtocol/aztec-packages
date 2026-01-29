# Chapter 1: Introduction to Aztec

## What is Aztec?

Aztec is a privacy-first Layer 2 (L2) on Ethereum. Unlike other L2s that focus primarily on scalability, Aztec introduces native support for **private state** and **private execution**. Smart contracts on Aztec can have both private and public state variables, and functions can execute privately on user devices or publicly on the network.

## Prerequisites: What You Should Know

This book assumes basic familiarity with:
- **Blockchain basics**: Transactions, blocks, smart contracts
- **Ethereum**: How L1 and L2s relate
- **Programming concepts**: Functions, data structures

We will explain these concepts as they arise:
- Zero-knowledge proofs (explained below)
- Merkle trees (Chapter 13)
- Cryptographic commitments (throughout)

## What is a Zero-Knowledge Proof?

Since this entire book is about circuits that generate proofs, let's start with what a zero-knowledge proof (ZKP) actually is.

### The Classic Example: Proving You Know a Password

Imagine you want to prove you know a password without revealing it:

**Without ZKP:**
```
You: "The password is 'secret123'"
Verifier: "Correct! But now I know your password too..."
```

**With ZKP:**
```
You: [Provides a mathematical proof]
Verifier: "I'm convinced you know the password, but I learned nothing about what it is."
```

### How ZKPs Work (Conceptually)

A ZKP has three properties:

1. **Completeness**: If you know the secret, you can always create a valid proof
2. **Soundness**: If you don't know the secret, you can't create a valid proof
3. **Zero-Knowledge**: The proof reveals nothing about the secret itself

### ZKPs in Aztec

In Aztec, ZKPs let users prove things like:

- "I own notes worth 100 tokens" (without revealing which notes)
- "I'm authorized to spend this" (without revealing my identity)
- "This computation was done correctly" (without revealing the inputs)

The "circuits" in this book are programs that define what statements can be proven and how to verify those proofs.

### What is a "Circuit"?

In the context of ZKPs, a "circuit" is NOT an electronic circuit. It's a **program written in a special way** that can be proven.

Think of it like this:

**Regular program:**
```
function transfer(from, to, amount):
    check from has enough balance
    subtract from sender
    add to recipient
    return success
```

**Circuit (provable program):**
```
Same logic, but written so that:
1. Someone can EXECUTE it with private inputs
2. They get a PROOF that they ran it correctly
3. Anyone can VERIFY the proof without seeing the inputs
```

Circuits are written in languages like **Noir** (used by Aztec). The compiler converts them into a mathematical form that supports proof generation.

**Why "circuit"?** Historically, these programs were represented as arithmetic circuits (like digital logic gates). The name stuck even though modern ZKPs use more sophisticated representations.

## The Privacy Problem

Ethereum and most existing L2s have no notion of privacy at the protocol level:

- All state variables are publicly visible
- All function calls and their arguments are visible on-chain
- Transaction senders and recipients are publicly linked

This transparency is problematic for many real-world applications: financial transactions, voting, identity systems, and enterprise use cases often require confidentiality.

## How Aztec Adds Privacy

Aztec introduces privacy through **zero-knowledge circuits** that enforce new rules:

1. **Private State**: Data stored as encrypted commitments (note hashes) rather than plaintext
2. **Private Execution**: Functions run on user devices, producing proofs without revealing inputs
3. **Nullifiers**: A mechanism to "spend" private state without revealing which state was consumed
4. **Encrypted Logs**: Event data encrypted for specific recipients

The protocol defines a set of **core circuits** that validate these privacy-preserving rules. When a user submits a transaction, it includes cryptographic proofs that the transaction follows all protocol rules, without revealing the private details.

## Two Execution Environments

Aztec has two distinct execution environments:

### Private Execution Environment (PXE)

- Runs on the user's device (client-side)
- Executes private functions
- Has access to the user's private keys and notes
- Generates zero-knowledge proofs of correct execution
- The **only** environment where private data is decrypted

### Aztec Virtual Machine (AVM)

- Runs on sequencer nodes (server-side)
- Executes public functions
- Similar conceptually to the Ethereum Virtual Machine (EVM)
- Has access to current public state
- Produces proofs of public execution

## The Circuit Hierarchy

The protocol uses a hierarchy of circuits to process transactions:

```
App Circuits (User Contracts)
        |
        v
Private Kernel Circuits (Init -> Inner -> Reset -> Tail)
        |
        v
[Optional] Public Execution (AVM)
        |
        v
Rollup Circuits (TX -> Block -> Checkpoint -> Epoch)
        |
        v
L1 Verification
```

Each layer aggregates proofs from the layer below, ultimately producing a single proof that can be verified on Ethereum.

## Why Circuits?

In a traditional blockchain, validators re-execute every transaction to verify correctness. In a zk-rollup like Aztec:

1. Execution happens off-chain (on user devices or sequencer nodes)
2. Proofs of correct execution are generated
3. Only the proofs are verified on-chain

This provides:

- **Privacy**: Proofs don't reveal private inputs
- **Scalability**: Verifying a proof is cheaper than re-executing
- **Compression**: One proof can represent thousands of transactions

## Key Concepts Preview

Before diving deeper, let's understand the most important concepts:

### Notes and Nullifiers: Private State

In Ethereum, your token balance is stored publicly: "Address 0x123 has 100 tokens."

In Aztec, private balances work differently using **notes** and **nullifiers**:

**Notes** are like digital cash bills:
```
Note = {
  owner: Alice (encrypted),
  amount: 50 tokens,
  randomness: [random value for uniqueness]
}
```

The blockchain only stores a **hash** of this note (called a "note hash" or "commitment"). The actual note contents are encrypted and stored privately.

**Nullifiers** prevent double-spending:
```
When Alice spends her 50-token note:
1. She proves she owns it (ZKP, without revealing which note)
2. She publishes a "nullifier" - a unique marker derived from the note
3. The nullifier is recorded publicly
4. If she tries to spend again, the same nullifier would appear twice = rejected
```

The clever part: the nullifier is computed in a way that doesn't reveal which note it corresponds to. Observers see "some note was spent" but not "Alice's 50-token note was spent."

### Summary Table

| Concept | Description |
|---------|-------------|
| **Note** | A piece of private state, like a digital cash bill |
| **Note Hash** | A cryptographic commitment to a note's contents (stored on-chain) |
| **Nullifier** | A marker that invalidates a note without revealing which one |
| **Kernel Circuit** | Validates individual function calls and accumulates side effects |
| **Rollup Circuit** | Aggregates transaction proofs into block and epoch proofs |
| **Side Effect** | Any state change: note hashes, nullifiers, logs, messages |

## What This Book Covers

This book explains:

1. **Part I (Chapters 1-3)**: Foundations - Architecture and transaction flow
2. **Part II (Chapters 4-6)**: Private Execution - Kernel circuits in detail
3. **Part III (Chapters 7-8)**: Public Execution - AVM and hiding kernels
4. **Part IV (Chapters 9-12)**: Rollup Circuits - From transactions to epochs
5. **Part V (Chapters 13-14)**: Infrastructure - State trees and data availability
6. **Part VI (Chapters 15-16)**: Reference - Topology and constants

By the end, you will understand how a transaction flows from a user's device all the way to settlement on Ethereum, and how privacy is maintained throughout.

\newpage
