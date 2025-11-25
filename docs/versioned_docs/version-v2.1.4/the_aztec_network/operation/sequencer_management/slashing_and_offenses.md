---
id: slashing_and_offenses
sidebar_position: 2
title: Slashing and Offenses
description: Learn how the slashing mechanism works, what offenses are detected, and how to configure your sequencer to participate in consensus-based slashing
---

## Overview

This guide explains how the Aztec network's slashing mechanism works and how your sequencer automatically participates in detecting and voting on validator offenses. You'll learn about the Tally Model of slashing, the types of offenses that are automatically detected, and how to configure your sequencer's slashing behavior.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer node (see [Sequencer Setup Guide](../../setup/sequencer_management))
- Understand that slashing actions are executed automatically when you propose blocks
- Have the Sentinel enabled if you want to detect inactivity offenses

## Understanding the Tally Model of Slashing

The Aztec network uses a consensus-based slashing mechanism where validators vote on individual validator offenses during block proposal.

### How Slashing Works

**Automatic Detection**: Your sequencer runs watchers that continuously monitor the network and automatically detect slashable offenses committed by other validators.

**Voting Through Proposals**: Time is divided into slashing rounds (typically 128 L2 slots per round). When you propose a block during round N, your sequencer automatically votes on which validators from round N-2 should be slashed. This 2-round offset gives the network time to detect offenses before voting.

**Vote Encoding**: Votes are encoded as bytes where each validator's vote is represented by 2 bits indicating the slash amount (0-3 slash units). The L1 contract tallies these votes and slashes validators that reach quorum.

**Execution**: After a round ends, there's an execution delay period (approximately 3 days) during which the slashing vetoer can pause execution if needed. Once the delay passes, anyone can execute the round to apply the slashing.

### Slashing Rounds and Offsets

```
Round 1 (Grace Period): No voting happens
Round 2 (Grace Period): No voting happens
Round 3: Proposers vote on offenses from Round 1 (which are typically forgiven due to grace period)
Round 4: Proposers vote on offenses from Round 2
Round N: Proposers vote on offenses from Round N-2
```

**Key parameters**:
- **Round Size**: 128 L2 slots (approximately 1.28 hours at 36 seconds per slot)
- **Slashing Offset**: 2 rounds (proposers in round N vote on offenses from round N-2)
- **Execution Delay**: 28 rounds (~3 days)
- **Grace Period**: First 128 slots (configurable per node)

### Slashing Amounts

The L1 contract defines three fixed slashing tiers that can be configured for different offenses. These amounts are set on L1 deployment and can only be changed via governance.

:::info Network Configuration
On the current network, **all offenses are currently configured to slash 2,000 tokens (1% of the Activation Threshold - the minimum stake required to join the validator set)**. With the ejection threshold at 98%, validators can be slashed a maximum of **3 times** (totaling 3% of their Activation Threshold) before being automatically ejected from the validator set.
:::

## Slashable Offenses

Your sequencer automatically detects and votes to slash the following offenses:

### 1. Inactivity

**What it is**: A validator fails to attest to block proposals when selected for committee duty, or fails to propose a block when selected as proposer.

**Detection criteria**:
- Measured **per epoch** for validators on the committee during that epoch (committees are assigned per epoch and remain constant for all slots in that epoch)
- The Sentinel calculates: `(missed_proposals + missed_attestations) / (total_proposals + total_attestations)`
- A validator is considered inactive for an epoch if this ratio meets or exceeds `SLASH_INACTIVITY_TARGET_PERCENTAGE` (e.g., 0.8 = 80% or more duties missed)
- Requires **consecutive committee participation with inactivity**: Must be inactive for N consecutive epochs where they were on the committee (configured via `SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD=2`). Epochs where the validator was not on the committee are not counted, so a validator inactive in epochs 1, 3, and 5 meets the threshold for 3 consecutive inactive epochs even though epochs 2 and 4 are skipped.

**Proposed penalty**: 1% of stake

**Note**: Requires the Sentinel to be enabled (`SENTINEL_ENABLED=true`). The Sentinel tracks attestation and proposal activity for all validators.

### 2. Valid Epoch Not Proven

**What it is**: An epoch was not proven within the proof submission window, even though all data was available and the epoch was valid.

**Detection criteria**:
- An epoch gets pruned (removed from the chain)
- Your node can re-execute all transactions from that epoch
- The state roots match the original epoch (indicating it could have been proven)

**Proposed penalty**: 0% (disabled for initial deployment)

**Responsibility**: The entire committee of the pruned epoch is slashed.

### 3. Data Withholding

**What it is**: The committee failed to make transaction data publicly available, preventing the epoch from being proven.

**Detection criteria**:
- An epoch gets pruned
- Your node cannot obtain all the transactions needed to re-execute the epoch
- The data was not propagated to the sequencer set before the proof submission window ended

**Proposed penalty**: 0% (disabled for initial deployment)

**Responsibility**: The entire committee from the pruned epoch is slashed for failing to propagate data.

### 4. Proposed Insufficient Attestations

**What it is**: A proposer submitted a block to L1 without collecting enough valid committee attestations.

**Detection criteria**:
- Block published to L1 has fewer than 2/3 + 1 attestations from the committee
- Your node detects this through L1 block validation

**Proposed penalty**: 1% of stake

### 5. Proposed Incorrect Attestations

**What it is**: A proposer submitted a block with invalid signatures or signatures from non-committee members.

**Detection criteria**:
- Block contains attestations with invalid ECDSA signatures
- Block contains signatures from addresses not in the committee

**Proposed penalty**: 1% of stake

### 6. Attested to Descendant of Invalid Block

**What it is**: A validator attested to a block that builds on top of an invalid block.

**Detection criteria**:
- A validator attests to block B
- Block B's parent block has invalid or insufficient attestations
- Your node has previously identified the parent as invalid

**Proposed penalty**: 1% of stake

**Note**: Validators should only attest to blocks that build on valid chains with proper attestations.

## Configuring Your Sequencer for Slashing

The slashing module runs automatically when your sequencer is enabled. You can configure its behavior using environment variables or the node's admin API. Remember to enable the Sentinel if you want to detect inactivity offenses.

### Environment Variables

Your sequencer comes pre-configured with default slashing settings. You can optionally override these defaults by setting environment variables before starting your node.

**Default configuration:**

```bash
# Grace period - offenses during the first N slots are not slashed
SLASH_GRACE_PERIOD_L2_SLOTS=128  # Default: first round is grace period

# Inactivity detection (requires SENTINEL_ENABLED=true)
SLASH_INACTIVITY_TARGET_PERCENTAGE=0.8  # Slash if missed proposals + attestations >= 80%
SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD=2  # Must be inactive for 2+ epochs
SLASH_INACTIVITY_PENALTY=2000000000000000000000  # 2000 tokens (1%)

# Sentinel configuration (required for inactivity detection)
SENTINEL_ENABLED=true  # Must be true to detect inactivity offenses
SENTINEL_HISTORY_LENGTH_IN_EPOCHS=100  # Track 100 epochs of history

# Epoch prune and data withholding penalties (disabled by default)
SLASH_PRUNE_PENALTY=0  # Set to >0 to enable
SLASH_DATA_WITHHOLDING_PENALTY=0  # Set to >0 to enable

# Invalid attestations and blocks
SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY=2000000000000000000000  # 2000 tokens
SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY=2000000000000000000000  # 2000 tokens
SLASH_INVALID_BLOCK_PENALTY=2000000000000000000000  # 2000 tokens

# Offense expiration
SLASH_OFFENSE_EXPIRATION_ROUNDS=4  # Offenses older than 4 rounds are dropped

# Execution behavior
SLASH_EXECUTE_ROUNDS_LOOK_BACK=4  # Check 4 rounds back for executable slashing rounds
```

### Runtime Configuration via API

You can update slashing configuration while your node is running using the `nodeAdmin_setConfig` method:

```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"nodeAdmin_setConfig",
    "params":[{
      "slashInactivityPenalty":"2000000000000000000000",
      "slashInactivityTargetPercentage":0.9
    }],
    "id":1
  }'
```

### Excluding Validators from Slashing

You can configure your node to always or never slash specific validators:

```bash
# Always slash these validators (regardless of detected offenses)
SLASH_VALIDATORS_ALWAYS=0x1234...,0x5678...

# Never slash these validators (even if offenses are detected)
SLASH_VALIDATORS_NEVER=0xabcd...,0xef01...
```

**Note**: Validators in `SLASH_VALIDATORS_NEVER` take priority. If a validator appears in both lists, they won't be slashed.

**Automatic protection**: Your own validator addresses (from your keystore) are automatically added to `SLASH_VALIDATORS_NEVER` unless you set `slashSelfAllowed=true` via the node admin API.

### Verify Your Configuration

Check your current slashing configuration:

```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"nodeAdmin_getConfig",
    "id":1
  }'
```

Look for fields starting with `slash` in the response to verify your settings.

## How Automatic Slashing Works

Once configured, your sequencer handles slashing automatically:

### 1. Continuous Offense Detection

Watchers run in the background, monitoring:
- Block attestations via the Sentinel (when enabled)
- Invalid blocks from the P2P network
- Chain prunes and epoch validation
- L1 block data for attestation validation

### 2. Offense Storage

When a watcher detects an offense, it's automatically stored with:
- Validator address
- Offense type
- Epoch or slot number
- Penalty amount

Offenses are kept until they're voted on or expire after the configured number of rounds.

### 3. Automatic Voting

When you're selected as a block proposer:
1. Your sequencer retrieves offenses from 2 rounds ago (the slashing offset)
2. It filters out validators in your `SLASH_VALIDATORS_NEVER` list
3. It adds synthetic offenses for validators in your `SLASH_VALIDATORS_ALWAYS` list
4. Votes are encoded as a byte array, with each validator's vote represented by two bits specifying the proposed slash amount (0–3 units)
5. The votes are submitted to L1 as part of your proposal transaction

**You don't need to take any manual action** - this happens automatically during block proposal.

### 4. Round Execution

When slashing rounds become executable (after the execution delay):
- Your sequencer checks if there are rounds ready to execute
- If you're the proposer and a round is ready, your node includes the execution call in your proposal
- This triggers the L1 contract to tally votes and slash validators that reached quorum

## Understanding the Slashing Vetoer

The slashing vetoer is an independent security group that can pause slashing to protect validators from unfair slashing due to software bugs.

**Execution Delay**: All slashing proposals have a ~3 day execution delay (28 rounds on testnet) during which the vetoer can review and potentially block execution.

**Temporary Disable**: The vetoer can disable all slashing for up to 3 days if needed, with the ability to extend this period.

**Purpose**: This failsafe protects sequencers from being unfairly slashed due to client software bugs or network issues that might cause false positives in offense detection.

## Ejection from the Validator Set

If a validator's stake falls below the ejection threshold after being slashed, they are automatically exited from the validator set.

**Ejection Threshold**: 98% of Activation Threshold

This means a validator can be slashed up to **3 times** (at 1% per slash, totaling 3%) before being automatically ejected. Their remaining stake is sent to their registered withdrawer address.

## Monitoring Slashing Activity

### Check Pending Offenses

Monitor offenses your node has detected but not yet voted on by checking your node logs:

```bash
# Look for these log messages
grep "Adding pending offense" /path/to/node/logs
grep "Voting to slash" /path/to/node/logs
```

### View Executed Slashing Rounds

Your node logs when slashing rounds are executed:

```bash
grep "Slashing round.*has been executed" /path/to/node/logs
```

### Query L1 Contract State

You can query the TallySlashingProposer contract to see voting activity:

```bash
# Get current round information
cast call [TALLY_SLASHING_PROPOSER_ADDRESS] \
  "getCurrentRound()" \
  --rpc-url [YOUR_RPC_URL]

# Check a specific round's vote count
cast call [TALLY_SLASHING_PROPOSER_ADDRESS] \
  "getRound(uint256)" [ROUND_NUMBER] \
  --rpc-url [YOUR_RPC_URL]
```

## Troubleshooting

### Slashing Module Not Running

**Symptom**: No slashing-related logs appear in your node output.

**Solutions**:
1. Verify your node is running as a validator (not just an observer)
2. Check that `disableValidator` is not set to `true` in your config
3. Confirm the rollup contract has a slashing proposer configured
4. Restart your node and check for errors during slasher initialization

### Inactivity Offenses Not Detected

**Symptom**: Your node doesn't detect inactivity offenses even when validators miss attestations.

**Solutions**:
1. Enable the Sentinel: Set `SENTINEL_ENABLED=true`
2. Verify Sentinel is tracking data: Check logs for "Sentinel" messages
3. Ensure `SLASH_INACTIVITY_PENALTY` is greater than 0
4. Check that `SENTINEL_HISTORY_LENGTH_IN_EPOCHS` is configured appropriately (see configuration section)
5. Remember: Validators need to be inactive for consecutive epochs (threshold: 2 by default)

### Own Validators Being Slashed

**Symptom**: Your node is voting to slash your own validators.

**Solutions**:
1. Verify that `slashSelfAllowed` is not set to `true`
2. Check that your validator addresses from the keystore are being automatically added to `SLASH_VALIDATORS_NEVER`
3. Manually add your addresses to `SLASH_VALIDATORS_NEVER` as a safeguard:
   ```bash
   SLASH_VALIDATORS_NEVER=0xYourAddress1,0xYourAddress2
   ```

### Penalty Amounts Not Matching L1

**Symptom**: Your configured penalties don't result in slashing on L1.

**Solutions**:
1. For the current network, all penalties should be set to `2000000000000000000000` (2000 tokens, 1%)
2. Verify your penalty configuration matches the default values shown in the Environment Variables section

## Best Practices

**Enable the Sentinel**: If you want to participate in inactivity slashing, make sure `SENTINEL_ENABLED=true`. This is the only way to detect validators who go offline.

**Use Grace Periods**: Set `SLASH_GRACE_PERIOD_L2_SLOTS` to avoid slashing validators during the initial network bootstrap period when issues are more likely.

**Monitor Your Offenses**: Regularly check your logs to see what offenses your node is detecting and voting on. This helps you verify your slashing configuration is working as expected.

**Don't Disable Default Protections**: Unless you explicitly want to slash your own validators, keep `slashSelfAllowed` at its default (`false`) to avoid accidentally voting against yourself.

**Understand the Impact**: Remember that slashing is permanent and affects validators' stake. Only configure `SLASH_VALIDATORS_ALWAYS` for validators you have strong evidence of malicious behavior.

**Stay Updated**: Monitor Aztec Discord and governance proposals for changes to slashing parameters or new offense types being added to the protocol.

## Summary

As a sequencer operator:

1. **Slashing is automatic**: Your sequencer detects offenses and votes during block proposals without manual intervention
2. **Configuration is flexible**: Use environment variables or runtime API calls to adjust penalties and behavior
3. **Safety mechanisms exist**: Grace periods, vetoer controls, and automatic self-protection prevent unfair slashing
4. **Monitoring is important**: Check logs and L1 state to ensure your slasher is operating as expected

## Next Steps

- Review [Governance and Proposal Process](./creating_and_voting_on_proposals.md) to understand how slashing parameters can be changed
- Set up [monitoring](../monitoring.md) to track your sequencer's slashing activity
- Join the [Aztec Discord](https://discord.gg/aztec) to discuss slashing behavior and network health with other operators
