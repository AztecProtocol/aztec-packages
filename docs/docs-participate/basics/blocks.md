---
title: Blocks and Epochs
description: Learn how blocks are produced on Aztec, the role of sequencers and provers, and how epochs organize proving work.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/core/Rollup.sol", "l1-contracts/src/core/libraries/rollup/ValidatorSelectionLib.sol", "l1-contracts/src/core/libraries/rollup/EpochProofLib.sol"]
---

# Blocks and Epochs

Aztec uses a decentralized block production system with two key roles: sequencers who produce blocks and provers who generate validity proofs.

## Block Production Overview

Block production on Aztec involves several steps:

1. **Selection** - A sequencer is randomly chosen
2. **Block proposal** - The sequencer creates and proposes a block
3. **Attestation** - Committee members validate and sign
4. **Proving** - Provers generate validity proofs
5. **Settlement** - Proofs are verified on Ethereum

## Sequencers

Sequencers are responsible for ordering transactions and producing blocks. They:

- Collect transactions from the network
- Order them into blocks
- Propose blocks to the committee
- Earn rewards for successful blocks

### How Sequencers Are Selected

Each time slot, a sequencer is randomly selected to propose a block. The selection uses randomness from Ethereum (RANDAO), making it unpredictable but verifiable.

This ensures:
- **Fairness** - All staked sequencers have a chance to propose
- **Unpredictability** - Nobody knows who will propose until the slot arrives
- **Decentralization** - No single party controls block production

## Provers

Provers generate the cryptographic proofs that make Aztec a valid rollup. They:

- Watch for completed epochs
- Generate validity proofs for all blocks in the epoch
- Submit proofs to Ethereum
- Earn rewards for successful proving

### Why Proving Matters

The proofs guarantee that all transactions in a block were valid. Without a proof, Ethereum has no way to verify that Aztec's state transitions are correct.

## Epochs

Aztec organizes time into **epochs**, which are groups of consecutive slots. Epochs serve as the unit for proving:

- Multiple blocks are produced during an epoch
- After the epoch ends, provers generate a single proof covering all blocks
- This aggregated proof is submitted to Ethereum

### Why Use Epochs?

Generating a proof for every block would be expensive and slow. By batching blocks into epochs:

- **Efficiency** - One proof covers many blocks
- **Cost savings** - Fewer proofs mean lower L1 costs
- **Parallelization** - Different provers can work on different parts

## The Attestation Committee

Not all sequencers propose blocks, but many participate in **attestation**. Committee members:

1. Receive proposed blocks
2. Verify the transactions
3. Sign attestations if valid
4. Return attestations to the proposer

A block needs attestations from at least 2/3 + 1 of the committee to be considered valid. This provides Byzantine fault tolerance - the network can handle some malicious or offline validators.

## Timeline of a Block

Here's what happens during a typical slot:

| Phase | What Happens |
|-------|--------------|
| Selection | Randomness determines the proposer |
| Collection | Proposer gathers pending transactions |
| Ordering | Proposer arranges transactions into a block |
| Proposal | Block is sent to committee members |
| Validation | Committee members verify the block |
| Attestation | Committee members sign if valid |
| Finalization | Proposer collects attestations |

## Rewards

Both sequencers and provers earn rewards:

- **Sequencers** receive 70% of checkpoint rewards plus transaction fees
- **Provers** receive 30% of checkpoint rewards

See [Economics](../token/economics) for details on how rewards work.

## What Happens If Things Go Wrong

The system has safeguards for various failure scenarios:

- **Proposer offline** - The slot is skipped; next slot's proposer takes over
- **Insufficient attestations** - Block isn't finalized; transactions return to mempool
- **Proof not submitted** - Unproven blocks are pruned and must be re-proposed

---

:::tip For operators
Want to run a sequencer or prover? See the [Operator Guides](/operate/operators).
:::
