---
title: Public Kernel Circuit
description: Understand the Public Kernel Circuit executed by sequencers that manages public state transitions in Aztec.
tags: [protocol, circuits]
---

This circuit is executed by a Sequencer, since only a Sequencer knows the current state of the [public data tree](../../../storage/state_model.md#public-state) at any time. A Sequencer might choose to delegate proof generation to the Prover pool.
