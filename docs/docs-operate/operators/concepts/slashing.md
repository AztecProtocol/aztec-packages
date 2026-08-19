---
id: slashing
title: Slashing
description: What gets you slashed, how much you lose, the ejection thresholds, zombie status, the veto council, and how to recover after being slashed or ejected.
displayed_sidebar: operatorsSidebar
references: ["yarn-project/slasher/src/*", "l1-contracts/src/core/slashing/*", "l1-contracts/src/core/libraries/rollup/StakingLib.sol", "l1-contracts/src/core/interfaces/IStaking.sol", "l1-contracts/src/governance/GSE.sol"]
---

Slashing is the protocol's way of penalizing validators who fail their duties. For the deep technical guide on how your node votes on slashings, see [Slashing and offenses](/operate/operators/sequencer-management/slashing_and_offenses) in Advanced operations.

## TL;DR

- Slashing is live on mainnet.
- Offenses are penalised in tiers: most deduct **2,000 AZTEC** (the small tier), and duplicate proposals or attestations deduct **5,000 AZTEC** (the large tier).
- Your stake is ejected from the active set if it falls below **190,000 AZTEC** (the local ejection threshold). Once ejected, you cannot top the same attester back up: recovering means a full exit and registering a new attester identity. A second, deeper threshold at **100,000 AZTEC** (the GSE floor) is where you are also out at the protocol-wide level.
- That gives you **10,000 AZTEC of headroom** from a full stake before ejection: five small-tier slashes, or two large-tier ones.
- A community **veto council** can stop a benign slash before it executes.

## What gets you slashed

Your node detects these offenses on other validators and votes to slash them; the same rules apply to you. Each offense maps to a penalty tier: **small** (2,000 AZTEC) or **large** (5,000 AZTEC). Some offenses are defined in the protocol but not yet enabled (their penalty is set to zero), so they cannot slash you today.

| Offense | Penalty | What it means |
|---|---|---|
| Inactivity | 2,000 (small) | You missed almost all your committee duties (attesting, or proposing when selected) over a full epoch. Almost every slash comes from this. See the threshold below. |
| Invalid attestations in a proposal | 2,000 (small) | You submitted a checkpoint with too few attestations, with invalid signatures, or with signatures from non-committee members. |
| Invalid block over p2p | 2,000 (small) | You broadcast an invalid block proposal over p2p. |
| Invalid checkpoint proposal | 2,000 (small) | You broadcast an invalid checkpoint proposal. |
| Duplicate proposal | 5,000 (large) | You sent two proposals for the same slot, almost always two of your nodes sharing a key, not malice. |
| Duplicate attestation | 5,000 (large) | You signed conflicting attestations for the same slot, again usually a shared-key misconfiguration. |
| Data withholding | not yet enabled | As a committee member you did not make a checkpoint's transaction data available. Defined but not currently penalised. |
| Proposed a descendant of a checkpoint with invalid attestations | not yet enabled | You proposed a checkpoint that descends from one whose attestations were invalid. Defined but not currently penalised. |
| Attested to an invalid checkpoint proposal | not yet enabled | You attested to a checkpoint proposal that was invalid. Defined but not currently penalised. |

Inactivity is what almost every slash comes from; the others are configured but rarely fire. The duplicate-proposal and duplicate-attestation offenses almost always trace back to two of your nodes sharing keys, not malice. Penalty amounts are network parameters, so confirm the current values for your network rather than treating these as fixed.

### The inactivity threshold

Inactivity is measured per epoch and needs two conditions to be met before a slash payload is created:

- You missed at least **`SLASH_INACTIVITY_TARGET_PERCENTAGE`** of your duties in an epoch. The current network value is **0.9** (90%). The percentage is taken over the slots that actually had a proposal to attest to, not over every slot in the epoch, so a node that is fully offline is counted as missing close to 100%.
- This held for **`SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD`** consecutive epochs. The current network value is **1**, so one full epoch over the threshold is enough.

A single missed slot is not slashable. Being effectively offline for one full epoch is. Both values are network parameters set by governance, so confirm the current ones for your network rather than assuming these defaults. An epoch is `AZTEC_EPOCH_DURATION` slots; at the current mainnet slot time that is roughly 38 minutes.

## How much you lose

Slashing uses three penalty tiers (`SLASH_AMOUNT_SMALL`, `SLASH_AMOUNT_MEDIUM`, `SLASH_AMOUNT_LARGE`), and each offense maps to one of them. On mainnet the small tier is **2,000 AZTEC** and the large tier is **5,000 AZTEC** (the medium tier is also set to 5,000). Most offenses, including inactivity, are small-tier; duplicate proposals and attestations are large-tier.

The 2,000 AZTEC small-tier figure is 1% of the 200,000 AZTEC activation stake. Repeat offenses stack.

## Thresholds you should know

| Threshold | Value | What happens at this level |
|---|---|---|
| Activation | 200,000 AZTEC | What you stake to become an active validator |
| Local ejection | **190,000 AZTEC** | Below this, you are ejected from the active validator set on the canonical rollup. Recovering means a full exit and a new attester identity; you cannot top the same attester back up. |
| Protocol-wide ejection (GSE) | 100,000 AZTEC | A deeper threshold. Below this you are also out at the protocol-wide GSE level, not just on this rollup. |

The local ejection threshold is configurable per rollup deployment by governance. The GSE floor is a protocol-wide constant.

Starting from a full 200,000 AZTEC stake, you have 10,000 AZTEC of headroom before the local threshold: five small-tier slashes, or two large-tier ones, bring you to it. The next slash ejects you.

Ejection happens at an epoch boundary, not the instant your stake crosses the threshold, and a single slashing round can carry several offenses for the same attester. So a validator can record **more than five slashes**. The headroom figure is a planning guide, not a hard cap on how many slashes can be recorded against you.

## How you know you have been slashed

Each slash emits a `Slashed(address, uint256)` event on the Rollup contract (the address is your attester, the amount is the slashed stake in wei), and it shows up as a reduction in your GSE stake balance.

The community surfaces that catch this for you:

- **slashveto.me** publishes pending slash payloads before they execute, so you get warning before a slash lands.
- **dashtec.xyz** shows per-epoch performance and flags slashing events against tracked attesters.
- **haveibeenslashed.xyz** is a focused tool for checking a single attester address against historical slashing events.

These dashboards typically surface pending or executed slashes before the information becomes visible in your own node logs.

## The veto council

A community group operates as the **Vetoer** for the Slasher contract (`0xBbB4aF368d02827945748b28CD4b2D42e4A37480`, a multisig). When the TallySlashingProposer reports a pending slash payload, the council reviews it. If the slash looks benign (a known HA misconfiguration, a one-time outage on a usually-reliable operator, a bug in the slashing software, etc.) they call `vetoPayload(address)` and the slash does not execute.

The Vetoer can also pause slashing entirely for up to 3 days at a time via `setSlashingEnabled(false)`.

### Requesting a veto

Formal requests to veto or pause slashing are made through the [council's GitHub repository](https://github.com/aztec-slash-veto/council): open an issue with the veto-request template.

The council's scope is deliberately narrow. Requests are **in scope** for events outside an operator's control, such as a confirmed bug in the node software or contracts, a network relaunch needing a halt, or an upstream bug hitting many sequencers at once. They are **out of scope** for anything that is a consequence of not following operator best practices (for example, a single operator's outage or misconfiguration). The full scope and process are in the repository.

The veto is preventative (it stops a slash before it lands, within 72 hours of the voting period ending), not restitutive (it does not restore stake after a slash has executed).

## What to do if you have been slashed

The action depends on how far below thresholds you are.

### Stake is still above 190,000 AZTEC

You are still an active validator. The only loss is the slashed amount.

Action: investigate root cause. Review your node logs around the offense time, identify whether it was an inactivity, proposing, or attestation issue, and fix it so it does not repeat.

### Stake has fallen below 190,000 AZTEC (local ejection, zombie status)

You have been removed from the active validator set on this rollup and stop earning new rewards. Onchain your attester now reports status `2`, which the protocol calls **zombie** (you can check it with `getStatus(attester)` on the Rollup, or `getAttesterView(attester)`). The staking dashboard shows this status as **Inactive**.

Recovery is a fresh start, not a top-up: stake cannot be added to an existing attester, and an exited or ejected attester address can never be registered again. The path differs by stake type:

- **Everyone except genesis sequencers**: ejection does not return your stake to your wallet on its own. The slash that crosses the threshold moves your remaining stake into the rollup's exit queue and starts the withdrawal delay (about 10 days), but the funds stay locked until you claim them. The [staking dashboard](https://stake.aztec.network) handles this in two steps, both on the stake's details panel, connected with the withdrawer wallet. First, **Add Initiate Unstake**; this does not restart the delay, which is already running from the ejection. After the delay has passed, **Add Finalize Withdraw** returns the stake (to your wallet for a direct stake, or to your token vault if you staked from one). Both steps queue into the batch cart, so you confirm them from there. Then top the balance back up to 200,000 AZTEC and register a new sequencer identity (new attester address and BLS key) through the dashboard.
- **Genesis sequencers**: you can run the same two steps, but the funds do not reach your wallet until the genesis vault unlocks on November 13, 2026. **Add Initiate Unstake** and, after the delay, **Add Finalize Withdraw** both work, and they return the stake to your token vault rather than to your wallet, because the vault is the withdrawer. The vault itself stays locked until November 13, so the recovered stake sits there, idle, until then. Re-staking before the unlock also depends on the vault holding a full 200,000 AZTEC, which a slashed-and-recovered position no longer does. After the unlock, you can move the tokens to your wallet, top the balance back up, and register a new sequencer identity.

### Stake has fallen below 100,000 AZTEC (protocol-wide ejection)

This is the deeper threshold, and reaching it takes far more than the handful of slashes that cross local ejection. Local ejection at 190,000 removes you from the active set on a rollup, but it does not stop slash payloads that are already in flight, and the same attester can keep accruing offenses (for example a node left misconfigured and offline through many rounds) until the stake erodes all the way to the GSE floor. In normal operation you would notice and act long before this; it is a sign of an attester left unattended through a sustained problem.

You are out at the GSE level as well. The recovery path is the same as above: withdraw the remaining stake, replenish to 200,000 AZTEC, and register a new sequencer identity. The full exit-and-redeposit cycle takes a minimum of about 10 days plus whatever entry-queue depth exists at the time of re-staking.

## See also

- [Slashing and offenses](/operate/operators/sequencer-management/slashing_and_offenses): the deep technical guide to slashing rounds, offsets, and how your node votes
- [Identity model](./identity-model): which key is at risk when slashing happens (your attester)
- [Claiming rewards](./claiming-rewards): what happens to unclaimed rewards if you are ejected
