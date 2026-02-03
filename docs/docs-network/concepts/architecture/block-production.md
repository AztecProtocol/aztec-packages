---
title: Block Production
description: Learn about how blocks are produced on the Aztec network through sequencers and provers.
displayed_sidebar: conceptsSidebar
---

# Block Production

Both sequencing and proving in the Aztec Network are intended to be fully decentralized.

## Overview

Block production in Aztec involves two key roles:

- **Sequencers**: Order transactions and produce blocks
- **Provers**: Generate cryptographic proofs for blocks

Sequencers are chosen via a random election using randomness derived from L1 RANDAO, while provers independently monitor for completed epochs and submit proofs to L1.

## How It Works

### Block Proposal

1. A sequencer is selected for each slot using a RANDAO-based random selection
2. The selected sequencer collects transactions from the mempool
3. The sequencer orders transactions and proposes a block

### Attestation

1. Committee members receive the proposed block
2. Each committee member re-executes the transactions
3. If valid, committee members sign attestations
4. The proposer collects attestations (needs 2/3 + 1)

### Proof Generation

After an epoch ends, provers generate a validity proof covering all blocks in the epoch. The proof must be submitted to L1 via `submitEpochRootProof` within the configured proof submission window. If no proof is submitted in time, the unproven checkpoints will be pruned and the epoch will need to be re-proposed.

---

:::tip Ready to operate?
- [Run a sequencer](../../operators/setup/sequencer_management)
- [Run a prover](../../operators/setup/running_a_prover)
:::
