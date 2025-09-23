---
title: "Transaction lifecycle"
description: "Walk through the complete journey of an Aztec transaction from user action to L1 finality, understanding how privacy is maintained at every step"
sidebar_position: 2
tags: [transaction, lifecycle]
---

import Image from '@theme/IdealImage';

You've learned about private state with notes and client-side execution with zero-knowledge proofs. Now let's see how these concepts come together in the lifecycle of an Aztec transaction. By the end of this page, you'll understand exactly what happens from the moment you click "send" to when your transaction becomes final on Ethereum.

## What you'll learn

1. The complete user-to-network-to-finality flow
2. How the components interact: PXE, nodes, sequencer, and L1
3. How finality works and what it means for your transactions
4. How user information remains private throughout the entire process

## Prerequisites

- Understanding of notes, commitments, and nullifiers from the [State model lesson](../2_privacy_mindset/1_state_model.md)
- Familiarity with client-side execution from the [previous lesson](../2_privacy_mindset/2_client_side_execution.md)
- Basic knowledge of Ethereum and rollups

## Private and public execution

Here's something that might surprise you: Aztec transactions can have both private AND public components, and they happen at completely different times! This hybrid model is what makes Aztec so powerful - you get privacy when you need it and transparency when you want it, all in the same transaction.

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

Let's say you want to send 100 private tokens to your friend Alice. Here's what happens the moment you click "Send" in your wallet:

### Private execution

Running entirely on your device, your PXE:

1. **Retrieves your notes**: Finds your note(s) that contain at least 100 tokens
2. **Executes the transfer locally**: Runs the smart contract's transfer function with your inputs
3. **Creates new notes**:
   - One note for Alice with 100 tokens
   - One change note for you if your input note was larger than 100
4. **Generates the proof**: Creates a zero-knowledge proof that all of this was done correctly

This all happens on your device. Your actual balance, Alice's address, and the amount never leave your computer in plain text.

### What's in the proof?

Your PXE generates a proof that:

- You own the notes you're spending (without revealing which notes)
- You have sufficient balance (without revealing how much)
- The transfer follows all the contract's rules
- The new notes are created correctly
- The math all adds up (inputs = outputs, no tokens created from thin air)

## Step 2: Entering the public arena (privately!)

Now your transaction needs to leave the safety of your PXE and enter the wider network, while maintaining privacy.

### What your PXE sends

Your PXE transmits:

- The zero-knowledge proof(s)
- New note commitments (hashes that reveal nothing about the notes)
- Nullifiers (to mark your spent notes as consumed)
- Any public function calls that need to be executed
- Optionally: encrypted notes to post onchain (so Alice can later discover and decrypt her new tokens). These notes can also be shared offchain to save onchain storage costs.

Notice what's NOT sent:

- Your actual balance
- The real transfer amount
- Alice's address in plain text
- Which notes you're actually spending

### The kernel circuits step in

Before your transaction can be accepted, it needs to pass through the kernel circuits. These protocol circuits:

1. **Verify your proof**: Ensure your private execution was valid
2. **Add protocol checks**:
   - Verify nullifiers haven't been used before (no double-spending)
   - Check that new commitments are properly formatted
   - Ensure gas fees are properly handled
3. **Prepare for public execution**: If your transaction includes public functions, set them up for processing

The kernel circuits use recursive proofs - they create a new proof that says "I verified the application's proof and added my own checks."

## Step 3: The sequencer's role

Your transaction has now reached the sequencer network. In Aztec, sequencers are like air traffic controllers - they take all the incoming transactions and organize them into orderly blocks.

### Selection and validation

The chosen sequencer:

1. **Collects transactions**: Gathers proofs and transaction data from many users
2. **Validates everything**:
   - Checks all proofs are valid
   - Ensures nullifiers aren't duplicated
   - Verifies sufficient gas fees
3. **Orders transactions**: Determines the sequence for the block

### The public/private split

Here's where things get interesting. Remember we mentioned that transactions can have both private and public components? The sequencer handles them differently:

**Private functions** (already executed):

- The sequencer just verifies the proofs
- Updates the note hash tree with new commitments
- Updates the nullifier tree with consumed notes
- No re-execution needed!

**Public functions** (executed now):

- The sequencer actually runs these functions
- Updates the public data tree
- Other nodes can see and verify this execution
- Results are deterministic - everyone gets the same answer

This split is crucial! Private functions maintain complete privacy because they've already been executed on your device. Public functions provide transparency where needed, like updating a public AMM pool or recording a public vote.

### Building the block

The sequencer bundles many transactions together:

1. Processes all private function results
2. Executes all public functions in order
3. Updates all the relevant trees (note hash, nullifier, public data)
4. Sends everything to the prover network

## Step 4: The prover network

The prover network is where Aztec's recursive proof magic really shines. These specialized nodes take all the transaction proofs and compress them into a single, compact proof.

### Layers of aggregation

Here's how the prover network uses recursion:

1. **Base layer**: Individual transaction proofs (from users)
2. **Merge layer**: Combines pairs of transaction proofs
3. **Rollup layer**: Aggregates merged proofs into larger groups
4. **Root layer**: Creates the final proof for the entire block

Each layer verifies the proofs from the layer below while adding its own logic. By the time we reach the root, we have a single proof that mathematically guarantees every transaction in the block is valid.

### The power of compression

A block might contain 30 transactions, each with complex proofs, but the final proof submitted to Ethereum is just a few kilobytes!

## Step 5: Settlement on Ethereum

This is where your transaction becomes truly final and unchangeable.

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

"Finality" in Aztec means your transaction has been:

- Included in an Aztec block
- Proven valid through zero-knowledge proofs
- Submitted to and verified by Ethereum
- Included in an Ethereum block

At this point, reversing your transaction would require reversing Ethereum itself - practically impossible!

## The complete picture: Following a DeFi transaction

Let's trace through a real example - swapping private tokens for public tokens on a DEX:

### 1. Initiation (Your device)

You want to swap 100 private DAI for public ETH. You click "Swap" in your wallet.

### 2. Private execution (PXE - still your device)

- Retrieve your private DAI notes
- Execute the swap contract's private function
- Generate proof of valid execution
- Create nullifiers for spent DAI notes
- Prepare a message for the public DEX function

### 3. Transmission (PXE → Network)

Your PXE sends:

- Private execution proof
- Nullifiers (marking DAI as spent)
- Encrypted message for the public DEX
- Gas fee payment proof

### 4. Sequencing (Sequencer node)

- Verify your private proof
- Check nullifiers are unique
- Queue public DEX call
- Execute public swap:
  - DEX receives your private DAI commitment
  - Calculates ETH output amount
  - Updates public pool reserves
  - Assigns public ETH to your address

### 5. Proving (Prover network)

- Aggregate your proof with others
- Create recursive proofs
- Generate final block proof

### 6. Settlement (Ethereum)

- Submit proof to L1
- Ethereum verifies
- State root updated
- Your swap is final!

Throughout this entire process:

- Your DAI balance stayed private
- The swap amount was hidden
- Only the public pool update was visible
- Everything was cryptographically guaranteed

## Key takeaways

Let's recap this journey:

1. **Privacy starts at home**: Your PXE executes and proves transactions locally, so sensitive data never leaves your device
2. **Hybrid execution model**: Private functions run on your device, public functions run on the sequencer
3. **Proofs enable trust**: Zero-knowledge proofs let the network verify without seeing
4. **Recursion scales**: Many proofs compress into one for efficient L1 settlement
5. **Finality comes from Ethereum**: Once on L1, your transaction is permanent

Understanding this lifecycle helps you appreciate why Aztec can offer both complete privacy and public verifiability. Every step is carefully designed to maintain privacy while ensuring the network remains secure and consistent.

## Next steps
