---
sidebar_position: 0
title: Putting forward Proposals
---

Sequencers of the *current* canonical rollup (as indicated by the Registry) can propose changes to the Aztec community for voting. In order for a proposal to be voted on through the governance process, N sequencers must nominate the proposal in any given round. A round is defined as a sequence of contiguous M L2 blocks.

Sequencers can only nominate a proposal during an L2 slot for which they’ve been assigned proposer duties. This minimizes timing games and provides a lower bound on the time required to successfully bring about a vote by governance.
This however would lead to an inability to nominate proposals for voting in the event that the sequencer rotation mechanism goes down. To mitigate this risk, a mechanism is proposed whereby any digital asset (ETH or any other relevant ERC-20 asset)(“Hypothetical Assetˮ) holder (“Holderˮ) can burn a large quantity of Hypothetical Asset to trigger a vote on a proposal, without having the sequencers nominating the proposal. Note that Hypothetical Asset holders would still need to approve any proposal before it becomes effective - see “Governance Contract” section below. 

To nominate a proposal, a validator of the current canonical rollup would deploy two sets of contracts:
1. The upgraded contracts they wish to upgrade to
2. `code` which can be executed by governance to upgrade into these contracts 

Then when it is their turn as the proposer, they call `vote(address _proposal)` on the `Proposals` contract, where `_proposal ` is the address of the `code` payload.

