---
title: Voting on Proposals
description: Learn how to vote on governance proposals on the Aztec network using your staked tokens.
displayed_sidebar: usersSidebar
---

# Voting on Proposals

As a token holder with staked tokens, you can vote on governance proposals that shape the future of the Aztec protocol.

:::info Conceptual Background
Understanding these concepts will help you participate effectively:
- [How governance works](../concepts/governance/) - Overview of the governance system
- [Proposal lifecycle](../concepts/governance/proposal-lifecycle) - The stages from signaling to execution
- [Voting mechanics](../concepts/governance/voting) - How voting power and timestamps work
:::

## How Voting Works

### Voting Power

Your voting power is determined by the amount of tokens you have locked in the Governance contract. Key points:

- **Locking Required**: You must lock tokens in the Governance contract to activate voting power
- **No Slashing on Votes**: Locked voting tokens are not subject to slashing (unlike staked tokens)
- **Withdrawal Delay**: After voting, there's a delay before you can withdraw tokens to prevent governance attacks

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

## Default Voting (Delegated to Rollup)

If you've staked tokens as a sequencer or delegated to one, your voting power is delegated to the rollup contract by default. This means:

- The rollup automatically votes "yea" on proposals that reached quorum through sequencer signaling
- **You don't need to take any action** if you support proposals created through normal governance
- If you want to vote differently, you must delegate your voting power to yourself (see below)

## Custom Voting

To vote differently from the default, you need to delegate your voting power to an address you control.

### Step 1: Delegate Voting Power

Use the Governance Staking Escrow (GSE) contract to delegate to yourself:

```bash
cast send [GSE_ADDRESS] \
  "delegate(address,address,address)" \
  [ROLLUP_ADDRESS] \
  [YOUR_ATTESTER_ADDRESS] \
  [YOUR_VOTING_ADDRESS] \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_WITHDRAWER_PRIVATE_KEY]
```

:::warning Timing Matters
You must complete delegation **before** the voting period begins. Voting power is timestamped at the moment a proposal becomes active.
:::

### Step 2: Cast Your Vote

Once delegated, vote through the GSE contract:

```bash
# Vote "yea"
cast send [GSE_ADDRESS] \
  "vote(uint256,uint256,bool)" \
  [PROPOSAL_ID] \
  [AMOUNT] \
  true \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_VOTING_PRIVATE_KEY]

# Vote "nay" (change true to false)
cast send [GSE_ADDRESS] \
  "vote(uint256,uint256,bool)" \
  [PROPOSAL_ID] \
  [AMOUNT] \
  false \
  --rpc-url [YOUR_RPC_URL] \
  --private-key [YOUR_VOTING_PRIVATE_KEY]
```

### Step 3: Verify Your Vote

Check that your vote was recorded:

```bash
cast call [GOVERNANCE_CONTRACT_ADDRESS] \
  "getProposal(uint256)" [PROPOSAL_ID] \
  --rpc-url [YOUR_RPC_URL]
```

## Finding Active Proposals

To see what proposals are currently up for vote:

1. Monitor the [Aztec Discord](https://discord.gg/aztec) governance channels
2. Query the Governance contract for active proposals
3. Review proposal details before voting

## Best Practices

1. **Research Before Voting**: Always review proposal details and community discussions
2. **Delegate Early**: Complete delegation well before voting opens
3. **Verify Payloads**: For technical proposals, review the payload code on Etherscan
4. **Stay Informed**: Follow governance discussions to understand proposal implications

## Next Steps

- [Learn about staking](./staking) to acquire voting power
- [Understand governance concepts](../concepts/governance/) for deeper knowledge
- [Become a sequencer](../operators/setup/sequencer_management) to participate in proposal signaling
