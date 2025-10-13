---
title: "Transaction lifecycle"
description: "Walk through the complete journey of an Aztec transaction from user action to L1 finality, understanding how privacy is maintained at every step"
sidebar_position: 2
tags: [transaction, lifecycle]
---

import Image from '@theme/IdealImage';

Great job making it this far! You've learned about private state with notes and client-side execution with zero-knowledge proofs. Now, let's see how all these concepts come together in the lifecycle of an actual Aztec transaction.

By the end of this lesson, you'll understand exactly what happens from the moment you click "send" in your wallet to when your transaction becomes final on Ethereum. This is where everything clicks into place!

Understanding how a transaction flows through Aztec is like watching all the puzzle pieces fit together. We'll follow a transaction from creation to finality, seeing exactly how your PXE, the sequencer network, provers, and Ethereum L1 all interact at each stage. This walkthrough will transform abstract concepts like "client-side execution" and "zero-knowledge proofs" into concrete steps in a real process. You're building a complete mental model of how Aztec actually works!

## What you'll learn

1. The complete user-to-network-to-finality flow
2. How the components interact: PXE, nodes, sequencer, and L1
3. How finality works and what it means for your transactions
4. How user information remains private throughout the entire process

## Prerequisites

Understanding of:

- Notes, commitments, and nullifiers from the [State model lesson](../2_privacy_mindset/1_state_model.md)
- Private function client-side execution from the [previous lesson](../2_privacy_mindset/2_client_side_execution.md)
- Basic knowledge of Ethereum and rollups

## Private and public execution

Aztec transactions can have both private AND public components, and they happen at completely different times! This hybrid model is what makes Aztec so powerful, you get privacy when you need it and transparency when you want it, all in the same transaction. This is programmable privacy!

Let's start with the big picture, then dive into the details.

### The journey

<Image img={require("@site/static/img/transaction-lifecycle.png")} />

Think of an Aztec transaction like sending a package through a sophisticated postal system:

1. **You prepare the package** (create and prove the transaction locally)
2. **Drop it at the post office** (submit to the sequencer network)
3. **It gets sorted and bundled** (sequencer processes and aggregates)
4. **Final delivery confirmation** (settlement on Ethereum L1)

But unlike a regular postal system, at each step there are cryptographic guarantees ensuring your package arrives exactly as intended, without anyone peeking inside!

## Step 1: Local execution

Let's make this concrete with a real example! Imagine you want to send 100 private tokens to your friend Alice. Here's what happens the moment you click "Send" in your wallet - and remember, all of this happens on *your* device first:

### Private execution

Running entirely on your device, your PXE does the following:

1. **Retrieves your notes**: Finds one or more of your notes that add up to at least 100 tokens (remember, notes work like cash bills!)
2. **Executes the transfer locally**: Runs the smart contract's transfer function with your private inputs
3. **Creates new notes**:
   - One note for Alice with exactly 100 tokens
   - One change note for you if your input note(s) totaled more than 100 (just like getting change when you pay with a $20 bill for a $15 item)
4. **Generates the proof**: Creates a zero-knowledge proof that mathematically guarantees all of this was done correctly, including:
   - You own the notes you're spending (without revealing which specific notes)
   - You have sufficient balance (without revealing your total balance)
   - The transfer follows all the contract's rules
   - The new notes are created correctly
   - The math all adds up perfectly (inputs = outputs, no tokens created from thin air!)

Pretty amazing, right? This all happens on your device. Your actual balance, Alice's address, and the amount never leave your computer in plain text. Privacy from the very first step!

## Step 2: Network execution

Now your transaction needs to leave the safety of your PXE and enter the wider network. But don't worry - privacy is maintained every step of the way!

Your PXE transmits:

- The zero-knowledge proof(s) (remember, these prove correctness without revealing details!)
- New note commitments (not the notes themselves - maintaining privacy!)
- Nullifiers (to mark your spent notes as consumed and prevent double-spending)
- Any public function calls that need to be executed
- Optionally: the encrypted note to post onchain (so Alice can later discover and decrypt her new tokens). These notes can also be shared directly offchain to save onchain storage costs!

Here's what's really cool - notice what's NOT sent:

- Your actual balance
- The real transfer amount
- Alice's address in plain text
- Which specific notes you're spending

The network gets everything it needs to verify your transaction is valid, but nothing about your private data!

### The kernel circuits

Before your transaction can be accepted, it needs to pass through the kernel circuits. These protocol circuits:

1. **Verify your proof**: Ensure your private execution was valid
2. **Add protocol checks**:
   - Verify nullifiers haven't been used before (no double-spending)
   - Check that new commitments are properly formatted
   - Ensure gas fees are properly handled
3. **Prepare for public execution**: If your transaction includes public functions, set them up for processing

The kernel circuits use **recursive proofs**, which we learned about in the previous lesson. They create a new proof that says "I verified the application's proof and added my own checks."

## Step 3: The sequencer's role

Your transaction has now reached the sequencer network! In Aztec, **sequencers are full nodes responsible for producing blocks within the network**. Think of them like air traffic controllers - they take all the incoming transactions and organize them into orderly blocks.

Here's something important to understand: even though sequencers are handling your transaction, they have zero visibility into its private contents, purpose, or origin unless you explicitly made parts of it public. They're organizing encrypted packages they can't open!

### Selection and validation

Sequencers have two roles: **proposer** and **attester**. Each epoch, a committee of sequencers is sampled from the sequencer set. Each slot, a sequencer acts as a **proposer** and proposes a block by:

1. **Collecting transactions**: Gathers proofs and transaction data from many users
2. **Validating everything**:
   - Checks all proofs are valid
   - Ensures nullifiers aren't duplicated
   - Verifies sufficient gas fees
3. **Ordering transactions**: Determines the sequence for the block
4. **Distributing to attesters**: Shares the block with committee members who act as attesters and verify and sign the proposed block (requiring 2/3+1 of attesters to agree)

### The public/private split

Remember we mentioned that transactions can have both private and public components? The sequencer handles them differently:

**Private functions** (already executed in the PXE):

- The sequencer just verifies the proofs
- Updates the note hash tree with new commitments
- Updates the nullifier tree with consumed notes
- No re-execution needed!

**Public functions** (executed now):

- The sequencer actually runs these functions
- Updates the public data tree
- Other nodes can see and verify this execution
- Results are deterministic - everyone gets the same answer

Private functions maintain complete privacy because they've already been executed on your device. Public functions provide transparency where needed, like updating a public AMM pool or recording a public vote.

### Building the block

[TODO] so at what point are they bundling then?

The sequencer bundles many transactions together:

1. Processes all private function results
2. Executes all public functions in order
3. Updates all the relevant trees (note hash, nullifier, public data)
4. Sends everything to the prover network

## Step 4: Block proof generation

[TODO] multiple blocks?

After blocks are included in the pending chain (secured by sequencer stake), specialized entities called provers generate zero-knowledge proofs for these blocks. Provers take all the transaction proofs across multiple blocks and compress them into a single, compact proof.

### Layers of aggregation

[TODO] check this

Here's how provers use recursive aggregation through rollup circuits:

1. **Individual proofs**: Transaction proofs generated by users locally
2. **Base rollup circuit**: Processes a batch of transactions and produces the first layer of aggregation
3. **Merge rollup circuit**: Combines multiple base rollup proofs into larger aggregations
4. **Root rollup circuit**: Creates the final proof for the entire epoch (or partial epoch)

Each layer verifies the proofs from the layer below while adding its own logic. By the time we reach the root, we have a single proof that mathematically guarantees every transaction in the block is valid.

### The power of compression

[TODO] What is this even saying? I'm confused af

A block might contain many transactions, each with their own proofs, but the final proof submitted to Ethereum is just a few kilobytes! Multiple provers can submit overlapping proofs, with rewards shared based on proof quality and consistency.

## Step 5: Settlement on Ethereum

This is where your transaction becomes final and immutable by being included in a transaction batch that is included on Ethereum.

### What gets submitted

The sequencer (or more specifically, the proposer) submits to Ethereum:

1. **The root proof**: That single proof representing the entire block
2. **The new state root**: The updated root of all Aztec's state trees
3. **Public inputs**: Minimal data needed for Ethereum to verify the proof

Notably absent:

- Individual transaction details
- User addresses or amounts
- Any private information

### Ethereum's verification

Ethereum's rollup contract:

1. **Verifies the proof**: Using the verification key, confirms the proof is valid
2. **Updates the state root**: Records Aztec's new state
3. **Emits events**: Logs the update for anyone monitoring

This verification takes just milliseconds and costs a fraction of what executing all those transactions directly on Ethereum would cost. Once Ethereum accepts the proof, your transaction is as final as Ethereum itself.

### Understanding finality

"Finality" in Aztec follows a two-phase approach:

**On Aztec** (fast confirmations):

- Block included by sequencers
- Secured by sequencer stake
- Provides quick user feedback
- Can theoretically be reversed if sequencers misbehave

**On Ethereum** (true finality):

- Zero-knowledge proof generated by provers
- Proof verified on Ethereum L1
- Transaction included in an Ethereum block
- Irreversible without Ethereum reorganization

At this point, reversing your transaction would require reversing Ethereum itself, economically infeasible!

## Key takeaways

Let's recap this journey:

1. **Privacy starts at home**: Your PXE executes and proves transactions locally, so sensitive data never leaves your device
2. **Hybrid execution model**: Private functions run on your device, public functions run on the sequencer
3. **Proofs enable trust**: Zero-knowledge proofs let the network verify without seeing
4. **Recursion scales**: Many proofs compress into one for efficient L1 settlement
5. **Finality comes from Ethereum**: Once on L1, your transaction is permanent

Understanding this lifecycle helps you appreciate why Aztec can offer both complete privacy and public verifiability. Every step is carefully designed to maintain privacy while ensuring the network remains secure and consistent.

## Next steps

Next, we are ready to get hands-on and start setting up our development environment to write and deploy smart contracts to Aztec!
