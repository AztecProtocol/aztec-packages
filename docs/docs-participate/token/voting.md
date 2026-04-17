---
title: Voting on Proposals
description: Learn how to vote on governance proposals on the Aztec network using your staked tokens.
displayed_sidebar: participateSidebar
---

# Voting on Proposals

As a token holder, you can vote on governance proposals that shape the future of the Aztec protocol. You don't need to be a staker to participate in governance - you can lock tokens directly for voting power.

:::info Conceptual Background
Understanding these concepts will help you participate effectively:
- [How governance works](/participate/governance) - Overview of the governance system
- [Proposal lifecycle](/participate/governance/proposal-lifecycle) - The stages from signaling to execution
- [Voting mechanics](/participate/governance/voting) - How voting power and timestamps work
:::

## Two Paths to Voting Power

There are two ways to acquire voting power on the Aztec network:

### Path 1: Through Staking (Default)

If you've staked tokens as a sequencer or delegated to one, you automatically have voting power. Your voting power is delegated to the rollup contract by default, which votes "yea" on proposals that reached quorum through sequencer signaling.

#### How Default Voting Works for Stakers

When you stake tokens (either by running a sequencer or delegating to one):

1. **Your tokens are held in the GSE** (Governance Staking Escrow) contract
2. **Voting power is automatically delegated** to the rollup contract
3. **The rollup votes on your behalf** - it votes "yea" on any proposal that passed the sequencer signaling phase
4. **You earn staking rewards** while participating in governance

This means **most stakers don't need to do anything** to participate in governance. The system is designed so that proposals with broad sequencer support automatically pass, while controversial proposals require active community engagement.

#### When to Take Action as a Staker

You should consider taking manual action if:
- You **disagree** with a proposal that passed sequencer signaling
- You want to vote "nay" on a specific proposal
- You want more control over how your voting power is used

### Path 2: Direct Governance Participation (Non-Stakers)

If you want governance participation without staking, you can lock tokens directly in the Governance contract. This is useful for token holders who don't want to run infrastructure or delegate, and want to vote without slashing risk.

To lock tokens for voting, visit the [Governance section of the Staking Dashboard](https://stake.aztec.network/governance). Connect your wallet, choose the amount to lock, and confirm the transaction. After depositing, your voting power will be active for any proposals that enter the voting phase after your deposit.

Note that locked governance tokens do not earn staking rewards and are subject to a withdrawal delay (~1.6 days on testnet, ~38 days on mainnet).

## How Voting Works

### Voting Power

Your voting power is determined by the amount of tokens you have locked in the Governance contract. Key points:

- **Locking Required**: You must lock tokens in the Governance contract to activate voting power
- **No Slashing on Votes**: Locked voting tokens are not subject to slashing (unlike staked tokens)
- **Withdrawal Delay**: After voting, there's a delay before you can withdraw tokens to prevent governance attacks (~1.6 days on testnet, ~38 days on mainnet)

### Voting Timeline

Each proposal goes through these stages:

1. **Signaling** - Sequencers signal support for a payload
2. **Proposal Creation** - Once quorum is reached, the proposal is submitted
3. **Voting Delay** (~12 hours) - Mandatory waiting period for community review
4. **Voting Period** (~24 hours) - Token holders vote on the proposal
5. **Execution Delay** (~12 hours) - Delay before approved proposals execute
6. **Execution** - Anyone can trigger execution of passed proposals

:::note Testnet Values
These timeline values are specific to testnet and may change for future network phases.
:::

## Finding Active Proposals

To see what proposals are currently up for vote:

1. **[Aztec Discord](https://discord.gg/aztec)**: Join the governance channels for proposal discussions and announcements
2. **[Aztec Forum](https://forum.aztec.network/)**: In-depth discussions about proposed changes
3. **Query the Governance contract**: Check proposal state directly on L1
4. **Etherscan**: View proposal transactions and payload contracts

## Best Practices

1. **Research Before Voting**: Always review proposal details and community discussions
2. **Delegate Early**: Complete delegation well before voting opens
3. **Verify Payloads**: For technical proposals, review the payload code on Etherscan
4. **Stay Informed**: Follow governance discussions to understand proposal implications

## Next Steps

- [Learn about staking](/participate/token/staking) to acquire voting power through staking
- [Learn about unstaking](/participate/token/staking#unstaking) to understand withdrawal delays
- [Understand governance concepts](/participate/governance) for deeper knowledge
- [Become a sequencer](/operate/operators/setup/sequencer_management) to participate in proposal signaling
