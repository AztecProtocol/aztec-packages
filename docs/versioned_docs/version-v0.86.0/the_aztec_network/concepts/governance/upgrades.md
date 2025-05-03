---
sidebar_position: 4
title: Upgrades
---

Upgrades involve transitioning the network to a new instance of the Rollup contract. They might fix vulnerabilities, introduce new features, or enhance performance.

## AZIP

It is expected that the community will coordinate upgrade proposals via an AZIP process, which is a design document outlining the upgrade rationale and one that allows for collecting technical input from and by the community.

Once developers of client software agree to support the upgrade, sequencers can begin signaling to table this proposal from a certain block height.

## Initial Contract Deployment

The initial deployment creates a set of contracts, as described in the [Deployment section](../deployments/what_is_deployment.md).

## Upgrading the Rollup Contract

1. **Proposal Creation:**

   - A new Rollup contract is deployed to the network
   - Proposal code to execute the upgrade is deployed separately

2. **Sequencer Participation:**

   - Sequencers must signal their readiness by voting through the Proposals contract.
   - This vote occurs during their assigned L2 slot, as dictated by the L1 Rollup smart contract.

3. **Governance Approval:**
   - Hypothetical Asset holders vote to approve or reject the proposal. Votes are proportional to the amount of Hypothetical Asset locked in the Governance contract.

## Proposal Execution

After governance approval and a delay period, the proposal becomes executable:

- Any Ethereum account can call `execute(_proposalId)` on the Governance contract.
- The `execute` function calls the proposal code, transitioning the network to the new Rollup instance.

For a more hands-on guide to reacting to upgrades as a sequencer/validators, read [this](../../guides/reacting_to_upgrades.md).
