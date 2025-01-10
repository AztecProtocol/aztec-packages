---
sidebar_position: 2
title: Slashing
---

We need to make sure that the chain is always (eventually) finalizing new blocks. 
The conditions required for the chain to finalize new blocks:

1. More than 2/3 of the committee is making attestations 
2. Provers are producing proofs.
3. Some actions that impact the chainʼs ability to finalize new blocks:

In the event that a significant portion of the validator set goes offline (i.e. geopolitical emergency) and proposers are unable to get enough attestations on block proposals, the Aztec Rollup will be unable to finalize new blocks. This will require the community to engage to fix the issue and make sure new blocks are being finalized.

In the event of a prolonged period where the Aztec Rollup is not finalizing new blocks, it may enter Based Fallback mode. The conditions that lead to [Based Fallback (forum link)](https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155) mode are expected to be well defined by the community of sequencers, provers, client teams and all other Aztec Rollup  stakeholders and participants.

During Based Fallback mode, anyone can propose blocks if they supply proofs for these blocks alongside them. This is in contrast to the usual condition that only the sequencer assigned to a particular slot can propose blocks during that slot. This means that the inactive validator set is bypassed and anyone can advance the chain in the event of an inactive / non-participating validator set. 

But terminally inactive validators must be removed from the validator set or otherwise we end up in Based Fallback too often. Slashing is a method whereby the validator set votes to “slash” the stake of inactive validators down to a point where they are kicked off the validator set. For example, if we set `MINIMUM_STAKING_BALANCE=50%` then as soon as 50% or more of a validator’s balance is slashed, they will be kicked out of the set. 

**1. Committee is withholding data from the provers**

Provers need the transaction data (i.e. `TxObjects`) plus the client-side generated proofs to produce the final rollup proof, none of which are posted onchain. Client side proofs + transaction data are gossiped on the p2p instead so that committee members can re-execute block proposals and verify that the proposed state root is correct.

Recall from the [RFC (forum link)](https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155) on block production that the committee is a subset of validators, randomly sampled from the entire validator set. Block proposers are sampled from this committee. ⅔ + 1 of this committee  must attest to L2 block proposals before they are posted to the L1 by the block proposer.

A malicious committee may not gossip the transaction data or proofs to the rest of the validator set, nor to the provers. As a result, no prover can produce the proof and the epoch in question will reorg by design.Recall from the RFC on block production that if no proof for epoch N is submitted to L1 by the end of epoch N+1, then epoch N + any blocks built in epoch N+1 are reorged. 

**2. A committee proposed an invalid state root**

Committee members who receive a block proposal from a proposer, must execute the block’s transaction to compare the resulting state root with that contained in the proposal. In theory, a committee member should only attest to a block proposal’s validity  after checking for the correctness of the state root. 

A committee member could skip re-executing block proposals, for a number of reasons including saving compute, faulty client software or maliciousness. This opens up the possibility of a malicious proposer posting an invalid state transition to L1. Or a malicious entity that bribes ⅔ + 1 of the committee can obtain the required signatures to post an invalid state transition.
The epoch will not be proven and will be re-orged.

**3. L1 congestion has made it impossible for provers to land proofs on time**

An honest prover who has funds at stake (i.e. posted a bond to produce the epoch proof), could be unable to post the proof on L1 due to congestion, an L1 reorg or just an inactivity of the L1 proposers (i.e. inactivity leak).

In all the previous cases, it is very hard to verify and automatically slash for these events onchain. This is mainly due to the fact that neither TxObjects nor client side proofs are posted onchain. Committee members also gossip attestations on the p2p and do not post them directly on chain.

Therefore a slashing mechanism is required as a deterrence against the malicious behaviour by validators and to make sure that the Aztec Rollup retains liveness. The validator set votes to slash dishonest validators based on evidence that is collected onchain + offchain, and discussed and analyzed offchain (i.e. on a forum).

A validator must aggregate BLS signatures on slashing proposals and post them to the L1 for slash execution.
