---
title: Block Production
description: Learn about how blocks are produced on the Aztec network through sequencers and provers.
displayed_sidebar: conceptsSidebar
---

# Block Production

Both sequencing and proving in the Aztec Network are intended to be fully decentralized.

![Block Production Flow](/img/diagrams/block-production.png)

## Overview

Block production in Aztec involves two key roles:

- **Sequencers**: Order transactions and produce blocks
- **Provers**: Generate cryptographic proofs for blocks

Sequencers are chosen via a random election using a verifiable random function (VRF), while provers are selected by sequencers via an out-of-protocol coordination mechanism.

## How It Works

### Block Proposal

1. A sequencer is selected for each slot using a VRF-based random selection
2. The selected sequencer collects transactions from the mempool
3. The sequencer orders transactions and proposes a block

### Attestation

1. Committee members receive the proposed block
2. Each committee member re-executes the transactions
3. If valid, committee members sign attestations
4. The proposer collects attestations (needs 2/3 + 1)

### Proof Generation

The proposers in the first `C=13` slots in epoch `N+1` will accept quotes to prove epoch N from provers. The winning prover will have until the end of epoch `N+1` to produce and submit the proof to L1.

See [Proving Coordination](./proving-coordination) for details on how provers coordinate.

## Related Topics

- [Proving Coordination](./proving-coordination) - How provers are selected and coordinated

---

:::tip Ready to operate?
- [Run a sequencer](../../operators/setup/sequencer_management)
- [Run a prover](../../operators/setup/running_a_prover)
:::
