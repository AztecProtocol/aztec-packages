---
sidebar_position: 0
title: Provers and Sequencers
draft: true
---

## Block Production Overview

Both sequencing and proving in the Aztec Network are intended to be fully decentralized.

Sequencers will be chosen via a random election, while provers will be selected by sequencers via an out-of-protocol coordination mechanism.

The proposers in the first `C=13` slots in epoch `N+1` will accept quotes to prove epoch N from provers. The winning prover will have until the end of epoch `N+1` to produce and submit the proof to L1.

If are you interested in running a validator node (also known as a sequencer node) or a prover node, you can refer to [the guides section](./../../guides/run_nodes/index.md).
