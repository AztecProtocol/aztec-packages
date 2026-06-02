---
title: Delegating Stake
description: Learn how to delegate your stake to operators on the Aztec network without running infrastructure.
displayed_sidebar: participateSidebar
---

# Delegating stake

If you want to participate in staking but don't want to run your own infrastructure, you can delegate your tokens to professional operators who run sequencers on your behalf.

## Before you delegate

Understanding these concepts will help you choose the right operator:

- [Staking tokens](/participate/token/staking): how proof of stake works
- [Economics and rewards](/participate/token/economics): how rewards are distributed
- [How governance works](/participate/governance): understand voting power

## How delegation works

When you delegate tokens to an operator:

1. **Your tokens are staked** through the operator's sequencer
2. **The operator runs infrastructure** on your behalf
3. **Rewards are shared** between you and the operator based on their fee structure
4. **Slashing risk falls on your stake**: each attester is funded by exactly one Token Vault. If the operator runs the node poorly and the attester is slashed, the burn comes out of your Token Vault's position. The operator does not contribute tokens to the same attester and so does not share the financial loss directly.

For how unstaking and slashing affect a delegator's balance specifically, see [Withdrawing delegated stake](#withdrawing-delegated-stake) and [What happens if your operator is slashed](#what-happens-if-your-operator-is-slashed) below.

## Choosing an operator

When selecting an operator to delegate to, consider:

### Performance metrics

- **Uptime**: how reliably does the operator maintain their infrastructure?
- **Attestation rate**: do they consistently participate in consensus?
- **Slashing history**: have they been slashed before?

### Economic terms

- **Commission rate**: what percentage of rewards does the operator keep?

### Reputation

- **Track record**: how long have they been operating?
- **Community standing**: are they known in the Aztec community?
- **Transparency**: do they communicate openly about their operations?

## Delegation process

### Prerequisites

- An Ethereum wallet that owns an Aztec Token Vault (the same wallet you connected during the token sale)
- A Token Vault balance of at least 200,000 AZTEC tokens

:::note Stake amount
Staking requires exactly 200,000 AZTEC per validator, a fixed protocol constant rather than a minimum.
:::

### Step 1: connect your wallet

Navigate to [staking.aztec.network](https://staking.aztec.network) and click **Connect Wallet**. Connect the wallet that owns your Token Vaults.

The dashboard displays all your Token Vaults and an overview of the assets under your control. Click on any Token Vault to view details such as its vesting schedule.

### Step 2: navigate to the stake tab

Above the Token Vaults overview, select the **Stake** tab. You are presented with two options: **Delegate** and **Self-Stake**. Choose **Delegate**.

![Stake tab showing delegate and self-stake options](/img/stake-choice.png)

With delegation, you pay a commission to a provider who runs a sequencer on your behalf. With self-stake, you run your own sequencer, pay no commission, and contribute directly to network decentralization. See the [Sequencer Setup Guide](/operate/operators/setup/sequencer_management) if you prefer self-staking.

:::note Transaction queue
The following steps add transactions to a queue. Nothing is submitted to the chain until you reach [Step 9](#step-9-execute-batch). At that point, Gnosis Safe wallets execute everything as a single batched transaction, while EOA wallets submit each transaction one by one.
:::

### Step 3: choose a provider

Click **Choose Provider** and inspect the delegation table to find your preferred operator. Click on any provider to view details including their contact information, commission rate, and capacity.

![Delegation table showing available providers](/img/delegation-table.png)

Click delegate stake to continue.

![Delegation operator](/img/delegation-info.png)

:::note Greyed-out Providers
Some providers appear greyed out because they are not currently accepting delegations (usually because they have not registered enough sequencer keys). You can contact them directly or choose another provider.
:::

:::tip Avoid Centralization
One of your responsibilities as a delegator is choosing good providers without overly centralizing the network. Avoid providers that already have very high staking concentration.
:::

### Step 4: select Token Vault and amount

Choose a Token Vault with at least 200,000 tokens available. Then select how much you want to delegate.

Your delegation amount is capped by:

- The provider's remaining capacity (they must have registered enough keys to run additional validators), or
- Your available token balance

whichever is lower.

![Token vault selection and delegation amount](/img/delegation-token-vault.png)

:::note
You cannot consolidate multiple Token Vaults into a single delegation. Each vault must be staked individually.
:::

### Step 5: set operator address

The operator address controls sequencer operations for this vault. Confirm the address is correct, as this address can choose who to delegate to and pick the reward attribution address

The staking dashboard defaults the operator to the connected wallet address. If you need a separate operator address for security separation, interact directly with the staking contracts via the CLI.

Click **Add to Batch** to continue.

:::note One-time Action
Setting the operator address is a one-time action per Token Vault. If the vault already has an operator configured, this step is skipped automatically.
:::

### Step 6: select staking version

Every Token Vault uses a **Staker Contract** that handles staking and unstaking operations. Governance may periodically approve new staker contract versions that add features (such as unstaking) or improve security.

On the **Set Staker Version** screen, upgrade to **Latest** to stay current with governance-approved contracts, or select a specific older version. The dashboard describes each version's capabilities.

Click **Add to Batch** to continue.

![Staking version selection screen](/img/staker-version.png)

:::note One-time Action
Selecting the staking version is a one-time action per Token Vault. If the vault already has a staker version configured, this step is skipped automatically.
:::

### Step 7: approve tokens

Approve the staker contract to move funds from your Token Vault. Each validator requires 200,000 tokens, so the approval amount matches your delegation.

### Step 8: delegate

Review your delegation configuration and click **Delegate** / **Add to Batch**.

### Step 9: execute batch

Review the full set of queued transactions and click **Execute All**.

![Batch execution review screen](/img/batch-execute.png)

:::tip Subsequent delegations
When you delegate again from a vault that already has an operator and staker version configured, Steps 5 and 6 are skipped, making future delegations faster.
:::

## Managing your delegation

### Monitoring performance

Keep track of your delegated stake:

- Check operator uptime and performance
- Monitor for any slashing events
- Review reward distributions

### Changing operators

If you want to switch to a different operator:

1. Initiate undelegation from your current operator
2. Wait for the unbonding period
3. Delegate to your new chosen operator

## Withdrawing delegated stake

When you initiate withdrawal of delegated stake from the dashboard, the same exit timing applies as for self-staking: roughly **38 days on mainnet** and **2 days on testnet** before you can finalize. The dashboard shows the exact unlock time for your position.

The reason: delegated stake reaches the same Governance Staking Escrow (GSE) as self-staked tokens, so the governance withdrawal delay (`votingDelay/5 + votingDuration + executionDelay`) applies in both cases. See [Staking tokens, exit delays](/participate/token/staking#exit-delays) for the full breakdown of the two concurrent delays and why the governance delay applies to every exit.

:::note Upcoming change (AZIP-1)
[AZIP-1](https://github.com/AztecProtocol/governance/pull/4) will cut the mainnet exit from ~38 days to ~10 days. The figures here reflect the current live parameters.
:::

If your operator is slashed during the exit window, the penalty comes out of your delegated position before you can finalize the withdrawal. There is no way to exit faster after a slash.

## What happens if your operator is slashed

Each attester (validator key) is funded by exactly one Token Vault holding the 200,000-token activation threshold. When you delegate, your Token Vault funds that attester; the operator runs the node on your behalf but does not contribute tokens to the same attester. Slashing penalties for that attester therefore come entirely out of the position your Token Vault funded.

- Each slashable offense reduces the attester's stake by a fixed per-offense penalty. Once the remaining stake falls below the ejection threshold, the attester is automatically removed from the validator set. See [Slashing and offenses](/operate/operators/sequencer-management/slashing_and_offenses) for the offenses that trigger slashing and how ejection works.
- The operator running the node does not share that financial loss directly. Their exposure is reputational and through lost future rewards on an ejected validator.
- After a slash, the remaining stake still has to wait out the governance withdrawal delay (~38 days on mainnet) before you can finalize an exit.

This is why operator selection matters: the criteria in [Choosing an operator](#choosing-an-operator) (uptime, attestation rate, slashing history, transparency) are the levers you actually have against this failure mode.

## Voting with delegated stake

By default, when you delegate to an operator, they may vote on your behalf in governance decisions.

To maintain control over your votes:

- Check if the operator allows custom voting preferences
- Consider delegating voting power separately from stake
- See [Voting on proposals](/participate/token/voting) for voting options

## Next steps

- [Learn about voting](/participate/token/voting) with your staked or delegated tokens
- [Staking tokens](/participate/token/staking) to understand slashing risks
- [Run your own sequencer](/operate/operators/setup/sequencer_management) if you prefer direct control
