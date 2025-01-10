---
sidebar_position: 1
title: Voting on Proposals
---

## Tabling proposals for voting

Once a proposal has been initiated, and the upgrade code deployed to address `_proposal` , other proposers call the vote `(address _proposal)` function on the Proposal contract specifying the same address.

Nominations (or “signalsˮ for proposals) occur in “roundsˮ of M = 1, 000 blocks. Round 0 is the interval from L2 slot 0 - L2 slot 999 and so on. The Proposals contract keeps count of the validators who signaled for a proposal during any given round. A proposal must receive N = 667 signals in any single round to move forward to the second ratification stage by governance.

To move a proposal into the voting phase, anyone can call the `pushProposal(uint256 _roundNumber)` on the Proposals contract which will in turn call `GOVERNANCE.propose(_proposal)` on the Governance contract and start the voting process.

## Voting on proposals

Holders have the ability to vote on proposals as long as they lock any Hypothetical Assets within the Governance contract. The act of locking the funds can be thought of as “activatingˮ the voting power of Hypothetical Asset. Locked Hypothetical Assets used to vote on a proposal must wait a delay before being withdrawn to prevent malicious governance attacks.

Hypothetical Assets locked in the Governance contract are simply locked and not “at stakeˮ i.e. there are no slashing conditions.

Since sequencers may be able to stake Hypothetical Assets with the rollup instances in order to join the validator set, the rollup instance could in turn lock those Hypothetical Assets in the Governance contract and vote on behalf of the sequencers. This is expected behavior.
