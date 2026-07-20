---
title: Blocks and Epochs
description: Learn how blocks are produced on Aztec, the role of sequencers and provers, and how epochs organize proving work.
displayed_sidebar: participateSidebar
---

# Blocks and Epochs

Aztec uses a decentralized block production system with two key roles: sequencers who produce blocks and provers who generate validity proofs.

## Block production overview

Block production on Aztec involves several steps:

1. **Selection** - A sequencer is randomly chosen for each slot
2. **Block building** - The sequencer builds blocks every few seconds and proposes them to the committee
3. **Attestation** - Committee members validate and sign each block
4. **Checkpointing** - At the end of the slot, the sequencer bundles its blocks into a checkpoint and posts it to Ethereum
5. **Proving** - Provers generate validity proofs covering an epoch of checkpoints
6. **Settlement** - Proofs are verified on Ethereum

## Slots, blocks, and checkpoints

Time on Aztec is divided into **slots** (72 seconds each on the current testnet). A slot contains more than one block: the selected sequencer keeps building blocks every few seconds for as long as there are transactions to include, then submits everything it built as a single **checkpoint** to Ethereum.

This separation is what gives Aztec low block times without paying for an Ethereum transaction per block:

- **Blocks** are produced every few seconds and spread through the peer-to-peer network, so transactions get fast confirmations
- **Checkpoints** batch all of a slot's blocks into one Ethereum transaction, keeping L1 costs low
- How many blocks a checkpoint contains depends on demand: a quiet slot may produce one block or none, while a busy slot can fill a checkpoint with a dozen or more

## Sequencers

Sequencers are responsible for ordering transactions and producing blocks. They:

- Collect transactions from the network
- Order them into blocks
- Propose blocks to the committee
- Post checkpoints to Ethereum
- Earn rewards for checkpoints that land on Ethereum

### How sequencers are selected

Each time slot, a sequencer is randomly selected to propose the slot's blocks and post its checkpoint. The selection uses randomness from Ethereum (RANDAO), making it unpredictable but verifiable.

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

Aztec organizes time into **epochs**, which are groups of consecutive slots (32 on current networks). Epochs serve as the unit for proving:

- Multiple checkpoints are posted during an epoch
- After the epoch ends, provers generate a single proof covering all of its blocks
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

## Timeline of a slot

Here's what happens during a typical slot:

| Phase | What Happens |
|-------|--------------|
| Selection | Randomness determines the proposer |
| Block building | Proposer gathers pending transactions and arranges them into a block |
| Proposal | Block is sent to committee members over the p2p network |
| Attestation | Committee members verify the block and sign if valid |
| Repeat | The proposer keeps building and proposing blocks while transactions and slot time remain |
| Checkpointing | Near the end of the slot, the proposer bundles its attested blocks into a checkpoint and posts it to Ethereum |

## Rewards

Both sequencers and provers earn rewards:

- **Sequencers** receive 70% of checkpoint rewards plus transaction fees
- **Provers** receive 30% of checkpoint rewards

See [Economics](../token/economics) for details on how rewards work.

## What Happens If Things Go Wrong

The system has safeguards for various failure scenarios:

- **Proposer offline** - The slot is skipped; next slot's proposer takes over
- **Insufficient attestations** - Block isn't included in the checkpoint; transactions return to mempool
- **Checkpoint not posted** - The slot's proposed blocks are pruned and their transactions return to the mempool; repeated failures to propose can be slashed
- **Proof not submitted** - If an epoch isn't proven before its deadline, its unproven checkpoints are pruned and must be re-proposed

---

:::tip For operators
Want to run a sequencer or prover? See the [Operator Guides](/operate/operators).
:::
