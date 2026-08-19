---
id: claiming-rewards
title: Claiming rewards
description: When rewards show up, how much you earn, and how to claim across many sequencers and rollups from the staking dashboard.
displayed_sidebar: operatorsSidebar
references: ["l1-contracts/src/core/libraries/rollup/RewardLib.sol", "l1-contracts/src/core/libraries/rollup/RewardExtLib.sol", "l1-contracts/src/core/Rollup.sol", "l1-contracts/src/governance/RewardDistributor.sol", "yarn-project/cli/src/cmds/validator_keys/*"]
---

This page explains when Aztec rewards become claimable and how to claim them. The [staking dashboard](https://stake.aztec.network) is the primary path: it finds your rewards across every rollup and bundles the claims into a single wallet flow, which is what makes claiming practical once you run more than one sequencer or operate at provider scale. The `cast` recipes for a single attester live in [Advanced operations](/operate/operators/sequencer-management/claiming-rewards).

## TL;DR

- Rewards accrue **on the Rollup contract** under your coinbase address. Nothing reaches your wallet until they are claimed.
- You earn **350 AZTEC per checkpoint you propose** (70% of the 500 AZTEC checkpoint reward).
- After a rollup upgrade, rewards earned before the upgrade stay on the old Rollup contract. The dashboard claims across both.
- Claim from the [staking dashboard](https://stake.aztec.network): **self-stakers** use the per-sequencer Claim in the stake breakdown on the My position page; **providers** use the Operator Commission tab.
- Slashing reduces your stake, not your accrued rewards.

## When rewards show up

Rewards are credited to your coinbase **after the epoch containing your proposed checkpoint has been proven**, not at proposal time. Proving happens within the proof submission window (typically a few epochs after the block).

Practical timing: most rewards land within 1 to 2 hours of the corresponding block. During gas-spike periods or proving incidents, the lag can extend. If an epoch is pruned (provers missed the window), the rewards for that epoch do not credit at all.

## How much you earn

You earn **350 AZTEC** to your coinbase for each checkpoint you propose. This can change by governance proposal.

## Claiming from the staking dashboard

The dashboard reads pending rewards across every rollup the Registry has ever made canonical, so it surfaces rewards on both the current and previous Rollup contracts in one place, and routes the claim through a single transaction cart. Connect the wallet that holds your stake position: for a direct stake that is the **withdrawer** address, and for a stake from a token vault it is the vault **beneficiary** wallet. The dashboard then shows the path that applies to you.

### Self-stakers: claiming your own sequencer rewards

If you run your own sequencers (whether one or many), open your position on [stake.aztec.network/my-position](https://stake.aztec.network/my-position). The **Stake breakdown** section lists each sequencer you run, with a **Claim** button on each row.

![Stake breakdown on the staking dashboard position page, listing each self-staked sequencer with a per-row Claim button](/img/claim_self_stake_breakdown.jpg)

That per-sequencer Claim opens a dialog with a **Coinbase address** field: you enter the coinbase, and the dashboard finds the pending rewards for it across every rollup and adds one claim to the transaction cart per rollup.

![Claim Self-Stake Rewards dialog, with the coinbase address entered and a claim available per rollup](/img/claim_self_stake_dialog.jpg)

Which address you enter depends on how you configured your node. Rewards always accrue on the Rollup contract under the **coinbase address**, so the coinbase is what you claim against.

#### Scenario 1: coinbase is a separate address

If you set the coinbase to an address you control when you generated your keystore (`aztec validator-keys new --coinbase <address>`) or manually added a coinbase address to your keystore, rewards accrue to that address. In the per-sequencer Claim dialog, enter that **coinbase address**. The claimed AZTEC lands at the coinbase, which is already an address you hold the keys to.

To make all sequencer rewards claimable in one pass, add your coinbase addresses to the dashboard's tracking list (see [Tracking addresses for the Claimable Rewards total](#tracking-addresses-for-the-claimable-rewards-total) below). The **Claimable Rewards** card at the top of the page then sums the pending rewards across the coinbases you have added and every rollup. When that total is above zero, expanding the card reveals **Claim All Rewards**, which batches the claims into a single flow rather than one Claim per sequencer.

#### Scenario 2: coinbase is the attester address

If you did not set a coinbase when you generated your keystore, the coinbase **defaults to the attester address**. Rewards accrue to the attester address itself.

Two consequences:

- In the per-sequencer Claim dialog, enter the **attester address** in the Coinbase address field (the dialog shows the attester address, so you can copy it from there).
- The claimed AZTEC lands at the attester address. To move it afterward you need that address's key, which lives in your node's keystore.

The **Claimable Rewards** card does not auto-detect self-stake rewards earned to a coinbase that equals the attester address. So when your coinbase is the attester, the card's **Self-Stake Rewards** line can read zero even while each sequencer has earned, until you add the attester address to the tracking list (see below). The per-sequencer Claim still works regardless.

#### Tracking addresses for the Claimable Rewards total

The **Claimable Rewards** card discovers your delegation rewards automatically, but for **self-stake** rewards it only counts the coinbase addresses you have told the dashboard to track. The tracking list is stored in your browser per connected wallet, so it does not carry across browsers or devices. To populate it:

1. On [stake.aztec.network/my-position](https://stake.aztec.network/my-position), expand the **Claimable Rewards** card at the top of the page.
2. Click **Manage Addresses**.

   ![Expanded Claimable Rewards card showing the Claim All Rewards and Manage Addresses buttons](/img/claim_claimable_rewards_card.png)

3. On the **Coinbase** tab, paste a coinbase address (in scenario 2, that is your attester address) and click **Add**. Repeat for each address.

   ![Manage Reward Addresses dialog open on the Coinbase Addresses tab, with the address input and Add button](/img/claim_manage_addresses.png)

The card then sums pending rewards across the addresses you added and every rollup. Removing an address only stops the dashboard tracking it; it does not affect your rewards or your ability to claim per sequencer.

### Providers: claiming commission across delegations

If you operate as a **staking provider**, rewards from your delegators' sequencers route into a **Splits contract** (one per delegation) that divides rewards between you and each delegator. Your **commission** routes to the `providerRewardsRecipient` address you set on the provider record; the remainder is claimable by each delegator.

Open the **Operator Commission** tab at [stake.aztec.network/operator](https://stake.aztec.network/operator). The tab is visible when your connected wallet is the admin or rewards-recipient for at least one provider. It surfaces every split that pays you and bundles the full claim chain (claim the rollup rewards onto the split, distribute the split, withdraw your share) into the transaction cart, across all of your delegations and rollups at once.

![Operator Commission tab on the staking dashboard, listing the splits that pay a provider with per-split pending commission and batch actions](/img/claim_operator_commission.jpg)

This tab claims your **commission** on delegated stake. Rewards from any sequencers you self-stake are claimed on your position page, described above.

## Prover rewards

This page covers sequencer and provider rewards. Provers earn separately, per epoch, and claim with a different contract function. See [Claiming prover rewards](/operate/operators/prover/claiming-rewards).

## Can my rewards disappear after a slash?

Slashing reduces your **stake**, not your **pending rewards**. Rewards already accrued to your coinbase are unaffected by slashing events. You can still claim them.

If you have been ejected (stake fell below the local 190,000 AZTEC threshold), you stop *earning new* rewards on subsequent epochs, but the rewards you have already accrued are still claimable.

## See also

- [Detailed claim guide](/operate/operators/sequencer-management/claiming-rewards): `cast` recipes including keystore and hardware-wallet variants, and gas-limit troubleshooting
- [Identity model](./identity-model): what the coinbase, publisher, and withdrawer addresses each do
- [Slashing](./slashing): what happens to your stake (not your rewards) when offenses occur
- [Claiming prover rewards](/operate/operators/prover/claiming-rewards): the separate per-epoch prover claim flow
- [Operator tooling](/operate/operators/tooling): the staking dashboard and other tools operators rely on
