---
sidebar_position: 0
title: Putting forward Proposals
---

Sequencers of the _current_ canonical rollup (as indicated by the Registry) can propose changes to the Aztec community for voting. In order for a proposal to be voted on through the governance process, _N_ sequencers must nominate the proposal in any given round. A round is defined as a sequence of contiguous _M_ L2 blocks. Both _N_ and _M_ are governance defined parameters.

Sequencers can only nominate a proposal during an L2 slot for which they’ve been assigned proposer duties. This minimizes timing games and provides a lower bound on the time required to successfully bring about a vote by governance.

A mechanism is also proposed whereby any Hypothetical Asset holder (“Holderˮ) can burn a large quantity of Hypothetical Asset to trigger a vote on a proposal, without having the sequencers nominating the proposal. Note that Hypothetical Asset holders would still need to vote to approve any proposals nominated via this mechanism.

To nominate a proposal, a validator of the current canonical rollup would deploy two sets of contracts:

1. The upgraded contracts they wish to upgrade to
2. `code` which can be executed by governance to upgrade into these contracts

Then when it is their turn as the proposer, they call `vote(address _proposal)` on the `Proposals` contract, where `_proposal ` is the address of the `code` payload. Alternatively, validators can set the `GOVERNANCE_PROPOSAL_PAYLOAD=_proposal` env variable which will call `vote(address _proposal)` during a slot they're eligible to signal in.
