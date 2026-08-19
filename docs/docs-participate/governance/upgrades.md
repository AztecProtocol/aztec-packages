---
title: Network Upgrades
description: Learn how the Aztec network upgrades to new rollup versions and how validators transition.
displayed_sidebar: participateSidebar
references: ["l1-contracts/src/governance/Registry.sol", "l1-contracts/src/governance/GSE.sol"]
---

# Network Upgrades

Network upgrades transition the Aztec network to a new rollup contract instance. This page explains why upgrades happen, how the Registry model works, and how validators migrate to new versions.

For the detailed governance stages (signaling, voting, execution), see [Proposal Lifecycle](./proposal-lifecycle).

## Why Upgrades Happen

The Aztec protocol evolves over time. Common reasons for upgrades include:

- **Security Fixes**: Patching vulnerabilities discovered in the rollup
- **Feature Additions**: Adding new functionality to the protocol
- **Performance Improvements**: Optimizing proof generation or block processing
- **Parameter Changes**: Adjusting staking requirements, fees, or timing

## The Registry Model

The Aztec governance system maintains a [Registry](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Registry.sol) of all rollup contract instances. This design enables:

1. **Backwards Compatibility**: Every rollup that has ever existed remains accessible. Users can always bridge assets in or out of any historical rollup version.

2. **Canonical Selection**: Only the most recent rollup in the Registry is "canonical" and receives block rewards.

When an upgrade passes governance, the new rollup address is added to the Registry via `addRollup()`.

## Validator Transition

The [GSE](./gse) enables smooth validator transitions during upgrades.

### Automatic Migration

Validators who deposited with `moveWithLatestRollup = true`:
- Stake automatically becomes available to the new rollup
- No action required—they can validate immediately
- Voting power moves with their stake

### Manual Migration

Validators who deposited with `moveWithLatestRollup = false`:
- Must initiate withdrawal from the old rollup (has a delay)
- Then deposit into the new rollup (may have an entry queue)
- Temporary gap in validation ability

### Best Practice

Use `moveWithLatestRollup = true` for seamless upgrades. Only use `false` if you specifically want to remain on an older rollup version.

## After an Upgrade

Once an upgrade is executed:

1. **New Rollup is Canonical**: Block rewards go to the new rollup; Governance Proposer accepts signals only from new rollup validators

2. **Old Rollup Remains Accessible**: Users can still bridge assets in/out; validators with unmoved stake can still operate

## Related Topics

- [Proposal Lifecycle](./proposal-lifecycle) - Detailed stages from signaling to execution
- [GSE and Stake Mobility](./gse) - How stake transitions work
- [Governance Participation](/operate/operators/sequencer-management/creating_and_voting_on_proposals) - How to participate as a sequencer
