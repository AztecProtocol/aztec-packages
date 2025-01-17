---
sidebar_position: 0
title: Provers and Sequencers
---

## Block Production Overview

Both sequencing and proving in the Aztec Network are intended to be fully decentralized. We expect sequencers to submit blocks to L1 every ~36 seconds, and provers to prove batches of 32 blocks to finalize the L2 chain.

Sequencers will be chosen via a random election, while provers will be selected by sequencers via an out-of-protocol coordination mechanism. The plan is to steadily scale throughput to 1TPS (i.e. 36tx blocks posted every 36s), and we expect provers to be able to prove at 1TPS throughput by mid November.

The proposers in the first `C=13` slots in epoch `N+1` will accept quotes to prove epoch N from provers. The winning prover will have until the end of epoch `N+1` to produce and submit the proof to L1. In the case where a quote is accepted in slot 1 of epoch `N+1`, the prover will have 18.6mins to compute the proof and land it on L1. In the case where a quote is accepted in slot 13, the prover will only have 11.4 mins.

At 1 TPS, each epoch is 1,152 txs. Based on timeliness requirements and depending on proof computational complexity, we should expect the number of prover agents to be up to 1,000 at 1TPS.

If are you interested in running a validator node (also known as a sequencer node) or a prover node, you can refer to [the guides section](./../../guides/run_nodes/index.md).
