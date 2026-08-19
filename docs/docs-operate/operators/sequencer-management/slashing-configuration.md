---
id: slashing_and_offenses
displayed_sidebar: operatorsSidebar
title: Slashing and Offenses
description: Learn how the slashing mechanism works, what offenses are detected, and how to configure your sequencer to participate in consensus-based slashing
references: ["yarn-project/slasher/src/*", "yarn-project/aztec-node/src/sentinel/*", "l1-contracts/src/core/slashing/*", "yarn-project/stdlib/src/interfaces/aztec-node-admin.ts"]
---

## Overview

This guide explains how the Aztec network's slashing mechanism works and how your sequencer automatically participates in detecting and voting on validator offenses. You'll learn about the types of offenses that are automatically detected and how to configure your sequencer's slashing behavior.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer node (see [Sequencer Setup Guide](../setup/sequencer-setup.md))
- Understand that slashing actions are executed automatically when you propose blocks
- Have the Sentinel enabled if you want to detect inactivity offenses

## Understanding the Slashing Model

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
- **Round Size**: 128 L2 slots (approximately 2.6 hours at 72 seconds per slot)
- **Slashing Offset**: 2 rounds (proposers in round N vote on offenses from round N-2)
- **Execution Delay**: 28 rounds (~3 days)
- **Grace Period**: First 8,400 slots after the rollup becomes canonical (~7 days; configurable per node via `SLASH_GRACE_PERIOD_L2_SLOTS`)

### Slashing Amounts

The L1 contract defines three fixed slashing tiers that can be configured for different offenses. These amounts are set on L1 deployment and can only be changed via governance.

:::info Network Configuration
On mainnet, **offenses are currently configured to slash 2,000 tokens for small offenses and 5,000 tokens for medium and large offenses (1% and 2.5% of the Activation Threshold - the minimum stake required to join the validator set)**. A validator is ejected when a slash would drop its stake below the rollup's local ejection threshold (190,000 tokens on mainnet, 95% of the Activation Threshold). A validator that joined at exactly the 200,000 token Activation Threshold is therefore ejected by the first slash that would push its total slashed amount above 10,000 tokens (5% of its stake). See [Ejection from the validator set](#ejection-from-the-validator-set) for details.
:::

## Slashable offenses

Your sequencer automatically detects and votes to slash the following offenses. The set of offenses, and the rationale behind them, is specified in [AZIP-7](https://github.com/AztecProtocol/governance/blob/main/AZIPs/azip-7-update_slashing.md).

### 1. Inactivity

**What it is**: A validator fails to attest to checkpoint proposals when selected for committee duty, or fails to produce checkpoints and block proposals when selected as proposer.

**Detection criteria**:
- Measured per epoch by the Sentinel for validators on the committee during that epoch.
- Evaluated at the end of each epoch (plus a small buffer) without waiting for the epoch to be proven on L1, so inactive validators can be slashed regardless of prover availability.
- Block re-execution is used to attribute fault between proposers and attestors based on what actually happened in each slot, rather than using attestation count as a proxy.
- A validator is considered inactive for an epoch if their failure ratio meets or exceeds `SLASH_INACTIVITY_TARGET_PERCENTAGE`.
- Requires consecutive committee participation with inactivity: must be inactive for N consecutive epochs where they were on the committee (configured via `SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD`). Epochs where the validator was not on the committee are not counted, so a validator inactive in epochs 1, 3, and 5 meets the threshold for 3 consecutive inactive epochs even though epochs 2 and 4 are skipped.

**Note**: Requires the Sentinel to be enabled (`SENTINEL_ENABLED=true`).

### 2. Data withholding

**What it is**: After a checkpoint is published, the transactions it contains were not made available on the P2P network within the tolerance window.

**Detection criteria**:
- Once `SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS` full L2 slots have elapsed past the checkpoint's slot, your node checks whether it has all the transactions for that checkpoint in its local mempool.
- If any are missing, the validators who attested to the checkpoint are flagged.
- The check runs regardless of whether the epoch is eventually proven. Slashing still applies if the data was withheld, to prevent committees from striking side deals with specific provers by releasing data only to them.

**Responsibility**: Validators who attested to the checkpoint.

### 3. Broadcasted invalid block proposal

**What it is**: A proposer broadcast an invalid block proposal over the P2P network.

**Detection criteria**: Detected by validators during proposal validation, for example when a transaction in the proposal fails validation or the proposed block header is structurally invalid.

**Responsibility**: The proposer who broadcast the invalid block.

### 4. Broadcasted invalid checkpoint proposal

**What it is**: A proposer broadcast an invalid checkpoint proposal over the P2P network. This includes the AZIP-7 "submitting a block proposal after the checkpoint" case, because a later block signed by the same proposer in the same slot makes the prior checkpoint retroactively invalid.

**Detection criteria**: Detected when the checkpoint terminates before a higher-index block proposal signed by the same proposer in the same slot, when the signed header does not match deterministic validator recomputation, or when the fee asset price modifier is malformed.

**Responsibility**: The proposer who broadcast the invalid checkpoint.

### 5. Proposed insufficient attestations

**What it is**: A proposer submitted a block to L1 without collecting enough valid committee attestations.

**Detection criteria**:
- Block published to L1 has fewer than 2/3 + 1 attestations from the committee.
- Your node detects this through L1 block validation.

**Responsibility**: The proposer who published the block.

### 6. Proposed incorrect attestations

**What it is**: A proposer submitted a block with invalid signatures, or signatures from non-committee members.

**Detection criteria**:
- Block contains attestations with invalid ECDSA signatures.
- Block contains signatures from addresses not in the committee.

**Responsibility**: The proposer who published the block.

### 7. Proposed descendant of checkpoint with invalid attestations

**What it is**: A proposer published a checkpoint to L1 that builds on an earlier checkpoint with invalid or insufficient attestations.

**Detection criteria**:
- Your node has previously identified a checkpoint as having invalid or insufficient attestations.
- A later proposer publishes a descendant checkpoint to L1 on top of it.

**Responsibility**: The proposer of the descendant checkpoint. Under pipelining, the next proposer may have started building optimistically before the prior checkpoint's signatures were submitted to L1, so only the proposer who actually publishes the descendant checkpoint to L1 is slashed.

### 8. Attested to invalid checkpoint proposal

**What it is**: A committee member attested to a checkpoint proposal in a slot where your node detected a slashable invalid block proposal.

**Detection criteria**:
- Your node detected an invalid block proposal for the slot via re-execution.
- A committee member subsequently attested to a checkpoint covering that slot.

**Responsibility**: Committee members who attested in the invalid proposal slot.

### 9. Duplicate proposal

**What it is**: A proposer broadcast multiple block or checkpoint proposals for the same position with different content (equivocation).

**Detection criteria**: Detected at the P2P layer by the AttestationPool, which tracks proposals by position (slot plus `indexWithinCheckpoint` for blocks, or slot for checkpoints). A second proposal for the same position with a different archive flags the duplicate.

**Responsibility**: The proposer who broadcast the duplicate proposal.

### 10. Duplicate attestation

**What it is**: A validator signed attestations for different proposals at the same slot (equivocation).

**Detection criteria**: Detected at the P2P layer when conflicting attestations are observed from the same signer for the same slot.

**Responsibility**: The attestor.

## Configuring Your Sequencer for Slashing

The slashing module runs automatically when your sequencer is enabled.

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

**CLI Method**:

```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"aztecAdmin_getConfig",
    "id":1
  }'
```

**Docker Method**:

```bash
docker exec -it aztec-sequencer curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "method":"aztecAdmin_getConfig",
    "id":1
  }'
```

## Automatic Slashing

Your sequencer handles slashing automatically:

### 1. Continuous Offense Detection

Watchers run in the background, monitoring:
- Validator attestations and proposals via the Sentinel (when enabled)
- Invalid block and checkpoint proposals from the P2P network
- Transaction data availability after each checkpoint
- L1 block data for attestation validation
- Equivocation (duplicate proposals and attestations) on the P2P network

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

**Execution Delay**: All slashing proposals have a ~3 day execution delay (28 rounds on mainnet) during which the vetoer can review and potentially block execution.

**Temporary Disable**: The vetoer can disable all slashing for up to 3 days if needed, with the ability to extend this period.

**Purpose**: This failsafe protects sequencers from being unfairly slashed due to client software bugs or network issues that might cause false positives in offense detection.

## Ejection from the Validator Set

If a slash would drop a validator's stake below the rollup's **local ejection threshold**, the validator's entire remaining stake is withdrawn instead of just the slashed amount: the slash is burned and the remainder is sent to their registered withdrawer address after the exit delay.

**Local Ejection Threshold**: 190,000 tokens on mainnet (95% of the 200,000 token Activation Threshold). This is a per-rollup parameter, and other networks use different values (199,000 tokens on testnet).

With mainnet's current slash amounts (2,000 tokens for small offenses, 5,000 for medium and large), a validator that joined at exactly the Activation Threshold is ejected by the first slash that would push its total slashed amount above 10,000 tokens (5% of its stake). A separate protocol-level ejection threshold (100,000 tokens, 50% of the Activation Threshold) applies to all stake withdrawals at the GSE level, but with current parameters the local ejection threshold is the one that triggers ejection from slashing.

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

You can query the SlashingProposer contract to see voting activity:

```bash
# Get current round information
cast call [SLASHING_PROPOSER_ADDRESS] \
  "getCurrentRound()" \
  --rpc-url [YOUR_RPC_URL]

# Check a specific round's vote count
cast call [SLASHING_PROPOSER_ADDRESS] \
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

- Review [Governance and Proposal Process](./governance-participation.md) to understand how slashing parameters can be changed
- Set up [monitoring](../monitoring/index.md) to track your sequencer's slashing activity
- Join the [Aztec Discord](https://discord.gg/aztec) to discuss slashing behavior and network health with other operators
