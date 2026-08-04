---
id: identity-model
title: Identity model
description: Which keys earn rewards, which are slashable, which can be rotated. The role each address plays in operating an Aztec sequencer or prover.
displayed_sidebar: operatorsSidebar
---

A single sequencer is identified by **several different addresses**, each with a different job. Confusing them can result in misrouted rewards or an inability to initiate withdrawal.

## The five-second mental model

- The **attester** is the validator's identity. It signs, it gets slashed.
- The **publisher** pays L1 gas to do the attester's work.
- The **coinbase** receives the block rewards.
- The **withdrawer** is the only one who can move your stake.
- The **fee recipient** is an unused placeholder in the protocol today. Transaction fees do not route to it.

Providers add two more (provider admin, provider rewards recipient) for managing the provider entry and receiving commission; see below.

## Address roles in detail

| Role | Type | Purpose | Slashable? | Rotatable? |
|---|---|---|---|---|
| **Attester** | L1 address plus a BLS key pair | Signs attestations and proposals. Identifies the validator onchain. | Yes (offenses listed in [Slashing](./slashing)) | No. The attester address and its BLS key are bound permanently the first time they register. If the attester exits or is ejected, that address cannot return to sequencer duties; generate a new attester identity and stake again. |
| **Publisher** | L1 EOA | Pays L1 gas to submit checkpoints and proposals. Holds ETH only. | No directly. A single missed proposal is not slashable, but a publisher that stays out of ETH long enough for the attester to miss almost all its duties over a full epoch hits the inactivity threshold, which is slashable (see [Slashing](./slashing)). | Yes (edit publisher config and restart) |
| **Coinbase** | L1 EOA, or a Split contract (provider default flow) | Receives sequencer block rewards. Configured per attester in the node's keystore. | No | Yes (edit keystore and restart) |
| **Fee recipient** | L2 (Aztec) address | An unused placeholder in the protocol today. Transaction fees do not route here; they go to the coinbase, see below. | No | Yes |
| **Withdrawer** | L1 EOA | The only address authorized to initiate stake withdrawal. At withdrawal time the withdrawer can send unstaked AZTEC to **any** destination (it does not have to be the withdrawer itself). | No | No (set at registration) |
| **Provider admin** | L1 EOA | Provider-only. Manages the provider entry on the Staking Registry contract. | No | Yes |
| **Provider rewards recipient** | L1 EOA | Provider-only. Receives the operator's commission share when delegators claim. | No | Yes |

## Which address gets which kind of reward

- **Block rewards** (per checkpoint you propose) go to your **coinbase**.
- **Transaction fees**: part of each fee is burned, and the sequencer's share is credited to your **coinbase**. The **fee recipient** header field is not used for this and does not receive fees today.
- **Stake** is held against the **attester address**; only the **withdrawer** can move it. When stake leaves, it does not return to the attester: a voluntary withdrawal goes to the recipient the withdrawer chooses, and an ejection (stake slashed below the threshold) creates an exit that returns the stake to the withdrawer.
- **Provider commission** routes through the splits contract to the **provider rewards recipient**.

Each of these is configured in a different place (keystore for coinbase, the registration deposit for withdrawer, splits contract for provider). A misconfigured coinbase routes rewards to the wrong address until you edit `key1.json` and reload the keystore; see [Claiming rewards](./claiming-rewards).

:::warning Provider coinbase is the Split contract (default flow)
For provider-run attesters, the default flow sets each delegated attester's coinbase to that delegation's **Split contract**, which enforces the commission split onchain; a coinbase pointing anywhere else routes the delegation's rewards around the Split, so it must be a deliberate choice (see below). Each Split's address is on the [staking dashboard](https://stake.aztec.network/providers): open your provider page and expand the **Sequencer Registered** dropdown, which maps each attester to its Split. The per-delegation update procedure is in [Configure environment](/operate/operators/provider/configure-environment#after-delegation-set-coinbase-to-the-split-contract).
:::

:::info Alternative: EOA coinbase with the payout script
The Split flow is the default, not the only option. A provider can set the coinbase to an address they control and run the [payout script](https://github.com/AztecProtocol/aztec-staking-payout) to calculate and distribute delegator rewards at a published commission and cadence. See [the configuration step](/operate/operators/provider/configure-environment#alternative-eoa-coinbase-with-the-payout-script) and the [forum announcement](https://forum.aztec.network/t/operator-commission-adjustments/8588).
:::

## Where each address lives and how to check it

Your node's keystore (`key1.json`) is the source of truth for what **you** configured. Each validator entry holds:

- `attester.eth` and `attester.bls`: the attester identity (address and signing key)
- `publisher`: the key(s) that pay L1 gas
- `coinbase`: where block rewards accrue
- `feeRecipient`: currently unused, set to zeros

For the **onchain side**, check dashboards first:

- **[Aztec staking dashboard](https://stake.aztec.network/my-position)**: your registered sequencers, stake, and pending rewards. The dashboard does not display your coinbase (it cannot read it from the chain). To claim self-stake rewards: open **Stake breakdown**, click **Claim** next to a sequencer, and enter the coinbase in the **Coinbase Address** field of the **Claim Self-Stake Rewards** window. If you never set `--coinbase` during setup, the rewards flow to that sequencer's attester address, so paste the attester address there. Add the claim transaction to the batch and repeat for each sequencer. Providers see each delegated attester's coinbase (the Split contract) in the **Sequencer Registered** dropdown on their provider page.
- **[Dashtec](https://dashtec.xyz/)** or **[Aztec Vision](https://aztec.vision/)**: paste any attester address to see its status, queue position, and attestation activity.

The coinbase has no onchain getter: the node sends it with each proposal, so the keystore is where to look (and where to fix it).

To query the contracts from the CLI, use the `check-attester.sh` script from the [verify page](/operate/operators/solo-sequencer/verify#3-p2p-port-reachable): it reports each attester's status, effective balance, exit state, and withdrawer, with a health verdict per attester.

## Frequently asked questions

- **"I sent rewards to my coinbase but the staking dashboard still shows them pending."** Rewards accrue on the Rollup contract; the dashboard shows accrued, not delivered. Claiming moves them to the coinbase wallet. See [Claiming rewards](./claiming-rewards).
- **"I lost access to my coinbase, can I change it?"** Yes. Edit the keystore on your node and restart. Future rewards route to the new coinbase. Rewards already accrued on the old coinbase are claimed by whoever still controls that address.
- **"I changed the coinbase in my keystore but rewards still accrue to the old address."** The node reads the keystore at startup. Edits take effect only after you reload the keystore (admin API call or node restart). Until then, proposals still carry the old coinbase.
- **"Can someone else claim my rewards?"** Anyone can pay the gas to call `claimSequencerRewards(coinbase)`, but the AZTEC goes to the coinbase.

## See also

- [Keystore management](/operate/operators/keystore): how the keys are generated and stored locally
- [Claiming rewards](./claiming-rewards): claiming block rewards from the Rollup contract
- [Slashing](./slashing): which conditions slash the attester
