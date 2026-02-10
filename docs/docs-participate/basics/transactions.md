---
title: Transactions
description: Learn about the Aztec transaction lifecycle, from creation to settlement, including client-side proving.
displayed_sidebar: participateSidebar
---

# Transactions on Aztec

Transactions on Aztec work differently from traditional blockchains. The most significant difference is that your device proves the transaction before it's sent to the network.

## The Key Difference: Client-Side Proving

On Ethereum, you sign a transaction and send it to the network. Miners or validators then execute and validate it.

On Aztec, your wallet does more work:

1. **Execute locally** - Your wallet runs the transaction on your device
2. **Generate proof** - Your wallet creates a zero-knowledge proof that the execution was correct
3. **Send proof** - Only the proof (not your private data) goes to the network

This is called "client-side proving" and it's what enables Aztec's privacy.

## Why Client-Side Proving Matters

### Privacy
Because private execution happens on your device, the network never sees your private inputs. A private transfer doesn't reveal who sent it, who received it, or how much - just a proof that the rules were followed.

### Correctness
The proof guarantees that private execution was performed correctly. The sequencer cannot alter the outcome of your private function calls - it can only verify the proof and include the transaction.

### Account Abstraction
Because your account contract runs on your device, you can define custom authentication logic (like multisig or social recovery) without adding complexity for the network.

## Transaction Lifecycle

Here's what happens when you send a transaction:

### 1. Initiation
You decide to make a transfer, interact with a contract, or perform some action. Your wallet prepares the transaction.

### 2. Private Execution
Your wallet (specifically the PXE - Private eXecution Environment) executes the private portion of the transaction locally. This determines what private state changes will happen.

### 3. Proof Generation
Your wallet generates a zero-knowledge proof of the private execution. This proves correctness without revealing private information.

### 4. Submission
The transaction request - including the private proof and any public function calls - is sent to the network.

### 5. Sequencer Processing
The sequencer verifies the private proof and executes any public function calls. Public execution happens on the sequencer, not on your device, since it reads from and writes to public state that is shared across the network.

### 6. Block Production
The sequencer assembles transactions into a block and proposes it. Validators in the committee validate and attest to the block.

### 7. Epoch Proving
Provers generate a rollup proof covering all transactions in the epoch, aggregating the work into a single proof.

### 8. L1 Settlement
The epoch proof is submitted to Ethereum. Once verified on L1, the state transition is finalized.

## Private vs Public Transactions

Aztec supports both private and public execution:

| Aspect | Private | Public |
|--------|---------|--------|
| Execution location | Your device | Sequencer |
| Data visibility | Hidden | Visible |
| State model | Notes (like UTXOs) | Storage (like Ethereum) |
| Proof generation | You | Network |

Many transactions use both - private functions first, then public functions.

## What the Network Sees

Even with privacy, some information is visible:

- **That a transaction occurred** - The fact of the transaction is public
- **Number of private state updates** - How many notes were created/spent
- **Public function calls** - If any public functions are called
- **Fees paid** - The transaction fee

What stays private:
- Who sent the transaction (for private functions)
- Transaction amounts (for private transfers)
- Which accounts are involved (for private interactions)

## Transaction Speed

Transaction finality depends on several factors:

1. **Inclusion** - When a sequencer includes your transaction in a block
2. **Block finalization** - When the block is attested by the committee
3. **Epoch proving** - When the epoch proof is generated
4. **L1 settlement** - When the proof is verified on Ethereum

For most practical purposes, transactions are "confirmed" after block finalization, even before L1 settlement.

---

:::tip For developers
Learn how to construct and send transactions in the [Transactions documentation](/developers/docs/foundational-topics/transactions).
:::
