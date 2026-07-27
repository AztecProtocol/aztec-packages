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

## Two paths to voting power

There are two ways to acquire voting power on the Aztec network:

### Path 1: Through staking (default)

If you've staked tokens as a sequencer or delegated to one, you automatically have voting power. Your voting power is delegated to the rollup contract by default, which votes "yea" on proposals that reached quorum through sequencer signaling.

#### How default voting works for stakers

When you stake tokens (either by running a sequencer or delegating to one):

1. **Your tokens are held in the GSE** (Governance Staking Escrow) contract
2. **Voting power is automatically delegated** to the rollup contract
3. **The rollup votes on your behalf** - it votes "yea" on any proposal that passed the sequencer signaling phase
4. **You earn staking rewards** while participating in governance

This means **most stakers don't need to do anything** to participate in governance. The system is designed so that proposals with broad sequencer support automatically pass, while controversial proposals require active community engagement.

#### When to take action as a staker

You should consider taking manual action if:
- You **disagree** with a proposal that passed sequencer signaling
- You want to vote "nay" on a specific proposal
- You want more control over how your voting power is used

### Path 2: Direct governance participation (non-stakers)

If you want governance participation without staking, you can lock tokens directly in the Governance contract. This is useful for token holders who don't want to run infrastructure or delegate, and want to vote without slashing risk.

To lock tokens for voting, visit the [Governance section of the Staking Dashboard](https://stake.aztec.network/governance). Connect your wallet, choose the amount to lock, and confirm the transaction. After depositing, your voting power will be active for any proposals that enter the voting phase after your deposit.

Note that locked governance tokens do not earn staking rewards and are subject to a withdrawal delay (~1.6 days on testnet, ~9.6 days on mainnet).

## How voting works

### Voting power

Your voting power is determined by the amount of tokens you have locked in the Governance contract. Key points:

- **Locking Required**: You must lock tokens in the Governance contract to activate voting power
- **No Slashing on Votes**: Locked voting tokens are not subject to slashing (unlike staked tokens)
- **Withdrawal Delay**: After voting, there's a delay before you can withdraw tokens to prevent governance attacks (~1.6 days on testnet, ~9.6 days on mainnet)

### Voting timeline

Each proposal goes through these stages:

1. **Signaling** - Sequencers signal support for a payload during a signaling round (~20 hours on mainnet, ~2 hours on testnet)
2. **Proposal creation** - Once quorum is reached, the proposal is submitted
3. **Voting delay** (3 days on mainnet, ~12 hours on testnet) - Mandatory waiting period for community review
4. **Voting period** (7 days on mainnet, ~24 hours on testnet) - Token holders vote on the proposal
5. **Execution delay** (2 days on mainnet, ~12 hours on testnet) - Delay before approved proposals execute
6. **Execution** - Anyone can trigger execution of passed proposals

:::note Live values
Mainnet values are read from the live Governance contract (`getConfiguration()`). All governance parameters can change through governance itself; see the [networks page](/networks#governance-parameters) for the current values.
:::

## Finding active proposals

To see what proposals are currently up for vote:

1. **[Aztec Discord](https://discord.gg/aztec)**: Join the governance channels for proposal discussions and announcements
2. **[Aztec Forum](https://forum.aztec.network/)**: In-depth discussions about proposed changes
3. **Query the Governance contract**: Check proposal state directly on L1
4. **Etherscan**: View proposal transactions and payload contracts

## Best practices

1. **Research Before Voting**: Always review proposal details and community discussions
2. **Delegate Early**: Complete delegation well before voting opens
3. **Verify Payloads**: For technical proposals, review the payload code on Etherscan
4. **Stay Informed**: Follow governance discussions to understand proposal implications

## Next steps

- [Learn about staking](/participate/token/staking) to acquire voting power through staking
- [Learn about unstaking](/participate/token/staking#unstaking) to understand withdrawal delays
- [Understand governance concepts](/participate/governance) for deeper knowledge
- [Become a sequencer](/operate/operators/setup/sequencer_management) to participate in proposal signaling
