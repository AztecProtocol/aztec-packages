---
title: Delegating Stake
description: Learn how to delegate your stake to operators on the Aztec network without running infrastructure.
displayed_sidebar: sidebar
---

# Delegating Stake

If you want to participate in staking but don't want to run your own infrastructure, you can delegate your tokens to professional operators who run sequencers on your behalf.

## Before You Delegate

Understanding these concepts will help you choose the right operator:

- [How proof of stake works](/network/concepts/proof-of-stake/)
- [Slashing conditions](/network/concepts/proof-of-stake/#slashing) - your delegated stake can be slashed
- [How governance works](/network/concepts/governance/) - understand voting power

## How Delegation Works

When you delegate tokens to an operator:

1. **Your tokens are staked** through the operator's sequencer
2. **The operator runs infrastructure** on your behalf
3. **Rewards are shared** between you and the operator based on their fee structure
4. **Slashing risk is shared** - if the operator misbehaves, your delegated stake can be slashed

## Choosing an Operator

When selecting an operator to delegate to, consider:

### Performance Metrics
- **Uptime**: How reliably does the operator maintain their infrastructure?
- **Attestation Rate**: Do they consistently participate in consensus?
- **Slashing History**: Have they been slashed before?

### Economic Terms
- **Commission Rate**: What percentage of rewards does the operator keep?
- **Minimum Delegation**: Is there a minimum amount required?

### Reputation
- **Track Record**: How long have they been operating?
- **Community Standing**: Are they known in the Aztec community?
- **Transparency**: Do they communicate openly about their operations?

## Delegation Process

:::note Coming Soon
Detailed delegation instructions will be added once the delegation mechanism is fully specified.
:::

## Managing Your Delegation

### Monitoring Performance

Keep track of your delegated stake:
- Check operator uptime and performance
- Monitor for any slashing events
- Review reward distributions

### Changing Operators

If you want to switch to a different operator:
1. Initiate undelegation from your current operator
2. Wait for the unbonding period
3. Delegate to your new chosen operator

## Voting with Delegated Stake

By default, when you delegate to an operator, they may vote on your behalf in governance decisions.

To maintain control over your votes:
- Check if the operator allows custom voting preferences
- Consider delegating voting power separately from stake
- See [Voting on Proposals](./voting) for voting options

## Next Steps

- [Learn about voting](./voting) with your staked or delegated tokens
- [Understand slashing](/network/concepts/proof-of-stake/#slashing) to know the risks
- [Run your own sequencer](/network/operators/setup/sequencer_management) if you prefer direct control
