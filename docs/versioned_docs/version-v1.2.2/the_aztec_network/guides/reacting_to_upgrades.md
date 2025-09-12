---
sidebar_position: 4
title: Reacting to upgrades
---

This is a guide for sequencer operators to understand how to react to protocol upgrades. To learn about how upgrades work, read the [concept section](../concepts/governance/upgrades.md).

## Sequencers signal for governance upgrades

To signal for governance upgrades, sequencers must set their `GOVERNANCE_PROPOSER_PAYLOAD` on their sequencer node to the address of a `payload`. This will register their signal with the GovernanceProposer contract.

:::info
the `payload` is a contract on L1 that specifies the address of the new rollup contract to be upgraded to. The payloads to be voted on during alpha-testnet will be communicated to sequencers on the forum and on community channels like discord.
:::

This signalling phase will pass once `N` sequencers in a round of `M` L2 blocks have signalled for the same payload. Once the quorum is met, anyone can call the `executeProposal(roundNumber)` function on the Governance Proposer contract to advance the upgrade into the next stage.

:::info
The `N` and `M` are public variables on the Governance Proposer contract, and can be read by anyone (i.e. using a `cast call`). To get the round number, you can call the `computeRound(slotNumber)` on the Governance Proposer contract.
:::
