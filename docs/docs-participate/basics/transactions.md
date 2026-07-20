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

### 6. Block production
The sequencer assembles transactions into a block and proposes it to the committee, which validates and attests to it. Blocks are produced every few seconds, so this usually happens quickly.

### 7. Checkpointing
At the end of its slot (72 seconds on the current testnet), the sequencer bundles all the blocks it built into a **checkpoint** and posts it to Ethereum in a single transaction. See [Blocks and Epochs](./blocks.md) for how slots and checkpoints work.

### 8. Epoch proving
Provers generate a rollup proof covering all checkpoints in the epoch, aggregating the work into a single proof.

### 9. L1 settlement
The epoch proof is submitted to Ethereum and verified. Once the proof's Ethereum transaction is itself finalized, the state transition is irreversible.

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

## Transaction speed and finality

After submission, a transaction moves through four statuses, each a stronger guarantee than the last:

1. **Proposed** (seconds) - A sequencer included it in a block and propagated the block through the network
2. **Checkpointed** (up to about a slot) - The block was included in a checkpoint posted to Ethereum
3. **Proven** (tens of minutes) - The epoch containing the block was proven and the proof verified on Ethereum
4. **Finalized** - The proof's Ethereum transaction is in a finalized Ethereum block and can no longer revert

Wallets and applications choose which status to treat as "confirmed" based on their needs: `proposed` for fast feedback, `checkpointed` for most purposes (the Aztec.js default), and `proven` or `finalized` for high-value actions.

---

:::tip For developers
Learn how to construct and send transactions in the [Transactions documentation](/developers/docs/foundational-topics/transactions).
:::
