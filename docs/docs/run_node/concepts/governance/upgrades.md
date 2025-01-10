---
sidebar_position: 3
title: Upgrades
---

Letʼs walk through an example where there is an upgrade to a new Rollup contract.

## Deploying the initial contracts

Assume that there is an  initial deployment, which is a set of contracts as described in the Aztec Deployment section.
Offline coordination

It is expected that the community will coordinate upgrade proposals via an AZIP process which will be outlined separately. In summary, an AZIP is a design document outlining the upgrade rationale and one that allows for collecting technical input from and by the community. Please see here for a preliminary overview of an example AZIP proposal process.

Once an AZIP garners enough buy-in from the community, and developers of client software agree to support the upgrade, sequencers can begin signaling to table this proposal from a certain block height.

## New Rollup contract is deployed to L1 and a proposal is initiated

To upgrade to a new Rollup instance is to:

1. Convince the Governance contract to call `Registry.upgrade(_addressOfNewRollup)`

2. Sequencers move stake to the new Rollup contract to be eligible for any Hypothetical Asset rewards.

To achieve 1, a new Rollup contract is deployed at address `0xRollup` (for example) and the code for calling `Registry.upgrade(_addressOfNewRollup)` is deployed at address `0xProposal`.

Sequencers of the current canonical rollup, that is the current rollup as pointed to by the Registry, must then call `vote(0xProposal)` on the Proposals contract. Sequencers can only vote during L2 slots for which they’ve been assigned as the block proposer by the L1 Rollup smart contract. For any given L2 slot, there is only one such sequencer. 

Sequencers vote by updating an environment variable `PROPOSAL_PAYLOAD` in their client software. If enough votes are received by the Proposals contract, any Ethereum account can call `pushProposal(_roundNumber)` where `_roundNumber` can be read from the L1.

## Voting starts and proposal executed after delay

Holders who locked their Hypothetical Assets in the Governance contract can vote on proposals. Each vote specifies whether it is in support of the upgrade or not, and the amount of locked Hypothetical Assets the holder wishes to vote.

If the vote passes, a proposal is moved to an Executable state after some delay.
 
## Proposal executed

Anyone can call `execute(_proposalId)` on the Governance contract which in turn will call the code deployed to `0xProposal`.
