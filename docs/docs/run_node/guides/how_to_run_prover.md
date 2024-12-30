---
sidebar_position: 2
title: How to run a prover
---

# Running Prover Nodes

TODO(https://github.com/AztecProtocol/aztec-packages/issues/9190)
*Details about how to configure a prover node and hardware requirements are to be determined. This guide will be updated once the information becomes available.*

For the current state of design please see the RFC at https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155.

## Overview of Prover Nodes

Prover nodes play a critical role in the Aztec network by generating zero-knowledge proofs (ZKPs) that finalize blocks on the Proven Chain.

### Role of Prover Nodes

- **Proof Generation**: Provers generate zero-knowledge proofs for entire epochs, ensuring the validity of transactions and state transitions. These are verified by the solidity rollup smart contract on Ethereum.
- **Finalizing Blocks**: Proofs are submitted to the rollup contract on Layer 1 (L1) to finalize blocks on the Proven Chain.

### Prover Bond

- **Bond Requirement**: Provers must post a bond denominated in TST tokens (bond details subject to change).
- **Commitment**: The bond serves as a commitment to produce valid proofs within a specified time frame.
- **Slashing**: Failure to deliver proofs results in bond slashing, incentivizing timely and accurate proof generation.

### Consensus Participation

- **Collaboration with Validators**: Provers work alongside validators to secure the network and advance the Proven Chain.
- **Proof Submission**: Provers submit proofs to the rollup contract, which are then verified and used to finalize blocks.
- **Incentives**: Provers are rewarded for timely and accurate proof generation, promoting network health.
