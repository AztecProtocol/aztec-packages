---
id: running_delegated_stake
sidebar_position: 2
title: Running Delegated Stake
description: Learn how to run a sequencer with delegated stake on the Aztec network, including provider registration and sequencer identity management.
---

## Overview

This guide covers running a sequencer with delegated stake on the Aztec network. Unlike conventional setups where you must have your own stake, delegated stake lets you (the "provider") operate sequencers backed by tokens from delegators.

**This is a non-custodial system**: Delegators retain full control and ownership of their tokens at all times. You never take custody of the delegated tokens—they remain in the delegator's control while providing economic backing for your sequencer operations.

## Prerequisites

Before proceeding, ensure you have:

- Knowledge of running a sequencer node (see [Sequencer Setup Guide](../../setup/sequencer_management))
- An Ethereum wallet with sufficient ETH for gas fees
- Understanding of basic Aztec staking mechanics
- Foundry installed for `cast` commands

## How Delegated Stake Works

You register with the StakingRegistry contract and add sequencer identities (keystores) to a queue. When delegators stake to your provider, the system:

1. Dequeues one keystore from your provider queue
2. Creates a [Split contract](https://docs.splits.org/core/split) for reward distribution
3. Registers the sequencer into the staking queue using the dequeued keystore

### Reward Distribution

When a delegator stakes to your provider, a Split contract is automatically created to manage reward distribution. You configure your sequencer to use the Split contract address as the coinbase (see [After Delegation: Configure Sequencer Coinbase](#after-delegation-configure-sequencer-coinbase)).

Rewards are distributed according to your agreed commission rate:
- **Provider commission**: Your `providerRewardsRecipient` address receives your commission rate (e.g., 5% for 500 basis points)
- **Delegator rewards**: The delegator's Aztec Token Vault (ATV) receives the remaining percentage

**Rewards flow:**
1. Rewards accumulate in the rollup under the coinbase address (the Split contract)
2. After governance unlocks rewards, anyone can release them from the rollup to the `coinbase` address.
3. Anyone can then disperse the rewards from the Split contract to both the ATV and your `providerRewardsRecipient`

This design ensures delegators maintain control of their rewards while you earn commission for operating the sequencer infrastructure.

## Setup Process

Before starting these steps, ensure your sequencer node infrastructure is set up (see [Prerequisites](#prerequisites)).

Follow these steps to set up delegated stake:

1. Register your provider with the Staking Registry
2. Add sequencer identities to your provider queue
3. (Optional) Add provider metadata via pull request

**After a delegator stakes:** Configure your sequencer's coinbase (see [After Delegation](#after-delegation-configure-sequencer-coinbase))

### Step 1: Register Your Provider

Register with the `StakingRegistry` contract as a provider for delegated staking. Registration is permissionless and open to anyone.

**Function signature:**

```solidity
function registerProvider(
    address _providerAdmin,
    uint16 _providerTakeRate,
    address _providerRewardsRecipient
) external returns (uint256);
```

**Parameters:**
- `_providerAdmin`: Address that can update provider configuration
- `_providerTakeRate`: Commission rate in basis points (500 = 5%)
- `_providerRewardsRecipient`: Address receiving commission payments

**Returns:** Your unique `providerIdentifier`. Save this—you'll need it for all provider operations.

**Example:**

```bash
# Register a provider with 5% commission rate
cast send [STAKING_REGISTRY_ADDRESS] \
  "registerProvider(address,uint16,address)" \
  [PROVIDER_ADMIN_ADDRESS] \
  500 \
  [REWARDS_RECIPIENT_ADDRESS] \
  --rpc-url [RPC_URL] \
  --private-key [YOUR_PRIVATE_KEY]
```

Once the transaction is confirmed, retrieve your `providerIdentifier` from the transaction receipt:

```bash
cast receipt [TX_HASH] --rpc-url [RPC_URL] | grep "return" | awk '{print $2}' | xargs cast to-dec
```

Replace `[TX_HASH]` with the transaction hash from the `registerProvider` call. Save the resulting `providerIdentifier`—you'll need it for all subsequent provider operations.

### Step 2: Add Sequencer Identities

Add sequencer identities (keystores) to your provider queue. Each keystore represents one sequencer that can be activated when a delegator stakes to you.

**Function signature:**

```solidity
function addKeysToProvider(
    uint256 _providerIdentifier,
    KeyStore[] calldata _keyStores
) external;
```

**Parameters:**
- `_providerIdentifier`: Your provider identifier from registration
- `_keyStores`: Array of keystore structures (max 100 per transaction)

**KeyStore structure:**

```solidity
struct KeyStore {
    address attester;              // Sequencer's attester address
    BN254Lib.G1Point publicKeyG1; // BLS public key (G1)
    BN254Lib.G2Point publicKeyG2; // BLS public key (G2)
    BN254Lib.G1Point proofOfPossession;    // BLS signature (prevents rogue key attacks)
}
```

:::tip Keystore Creation Utility
We will be releasing a utility tool to help you generate properly formatted `KeyStore` structures with correct BLS signatures. This simplifies the process of creating the complex data structures required for this function call.

In the meantime, contact the Aztec team on [Discord](https://discord.gg/aztec) for assistance with generating keystores.
:::

**Example with sample data:**

Due to the complexity of nested struct encoding, here's an example showing the structure (with placeholder BLS values):

```bash
# Example: Add one keystore to your provider
# The KeyStore array is encoded as a tuple array parameter
cast send [STAKING_REGISTRY_ADDRESS] \
  "addKeysToProvider(uint256,(address,(uint256,uint256),(uint256,uint256,uint256,uint256),(uint256,uint256))[])" \
  [YOUR_PROVIDER_IDENTIFIER] \
  "[(0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb,(12345,67890),(11111,22222,33333,44444),(98765,43210))]" \
  --rpc-url [RPC_URL] \
  --private-key [ADMIN_PRIVATE_KEY]
```

Where the tuple structure represents:
- `address`: Attester address
- `(uint256,uint256)`: publicKeyG1 (x, y coordinates)
- `(uint256,uint256,uint256,uint256)`: publicKeyG2 (x0, x1, y0, y1 coordinates)
- `(uint256,uint256)`: proofOfPossession (x, y coordinates)

**Important:** The BLS values shown above are placeholders. You must use properly generated BLS keys and signatures (signing "feedback") for actual registration. Add a maximum of 100 keystores per transaction to avoid gas limit issues.

### Step 3: Add Provider Metadata (Optional)

To be featured on the staking dashboard, submit metadata about your provider via a GitHub pull request. You'll need to provide:

1. Provider name and description
2. Logo image
3. Website and social media URLs
4. Your `providerIdentifier`

Good metadata helps delegators understand your offering and builds trust. Check the [Aztec Discord](https://discord.gg/aztec) for the latest submission instructions.

## After Delegation: Configure Sequencer Coinbase

Once a delegator stakes to your provider, the system creates a Split contract for that delegation and activates the corresponding sequencer. **Configure the sequencer to use the Split contract address as the coinbase.**

### Why This Matters

The coinbase address determines where your sequencer's block rewards are sent. Setting it to the Split contract address ensures rewards are distributed according to your agreed commission rate, which is critical for maintaining trust with your delegators.

### How to Configure the Coinbase

Update the `coinbase` field in your sequencer node's keystore configuration to the Split contract address created for this delegation.

**Example keystore configuration:**

```json
{
  "attester": "0x...",  // Your sequencer's address / identity (from Step 2)
  "publisher": "0x...",  // Address that submits blocks to L1
  "coinbase": "0x[SPLIT_CONTRACT_ADDRESS]"  // Split contract for this delegation
}
```

Replace `[SPLIT_CONTRACT_ADDRESS]` with the actual Split contract address created for this delegation. You can find this address in the staking dashboard (see "Finding Your Split Contract Address" below).

For detailed information about keystore configuration, including different storage methods and advanced patterns, see the [Advanced Keystore Guide](../keystore/index.md).

### Finding Your Split Contract Address

You can retrieve the Split contract address for a specific delegation through the **Staking Dashboard**, where you can view all active delegations and their associated Split contract addresses in your provider dashboard.

### Important Notes

- Configure the coinbase immediately after each delegation to ensure rewards flow correctly from the start
- Each delegation creates a unique Split contract—configure each sequencer with its specific Split contract address
- Restart your sequencer node after updating the keystore for changes to take effect

## Monitoring Keystore Availability

As a provider, you must maintain sufficient sequencer identities (keystores) in your queue to handle incoming delegations. When a delegator stakes to your provider and your queue is empty, they cannot activate a sequencer—this results in a poor delegator experience and lost opportunity.

### Why Monitoring Matters

Each time a delegator stakes to your provider:
1. One keystore is dequeued from your provider queue
2. A sequencer is activated using that keystore
3. Your available keystore count decreases by one

If your queue runs empty, new delegations cannot activate sequencers until you add more keystores. This could cause delegators to choose other providers.

### Checking Available Keystores

Check your current keystore queue with this call:

```bash
# Check provider queue length
cast call [STAKING_REGISTRY_ADDRESS] \
  "getProviderQueueLength(uint256) (uint256)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]

This returns your provider's queue length, which is the number of keystores currently available.

### Setting Up Automated Monitoring

Implement automated monitoring to alert you when your keystore queue runs low.

#### Cron Job Example

The following script monitors your keystore queue and alerts when it drops below a threshold. Replace the placeholder values and uncomment your preferred alert method (webhook or email):

```bash
#!/bin/bash
# check-keystores.sh

THRESHOLD=5  # Alert when fewer than 5 keystores remain
REGISTRY_ADDRESS="[STAKING_REGISTRY_ADDRESS]"
PROVIDER_ID="[YOUR_PROVIDER_IDENTIFIER]"
RPC_URL="[YOUR_RPC_URL]"
WEBHOOK_URL="[YOUR_WEBHOOK_URL]"  # Optional: for Slack/Discord notifications

# Gets current queue length
QUEUE_LENGTH=$(cast call "$REGISTRY_ADDRESS" \
  "getProviderQueueLength(uint256)" \
  "$PROVIDER_ID" \
  --rpc-url "$RPC_URL")

echo "Queue length: $QUEUE_LENGTH"

# Check if queue is running low
if [ "$QUEUE_LENGTH" -lt "$THRESHOLD" ]; then
  echo "WARNING: Keystore queue running low! Only $QUEUE_LENGTH keystores remaining."

  # Send alert (uncomment and configure your preferred method)
  # Slack/Discord webhook:
  # curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" \
  #   -d "{\"text\":\"⚠️ Keystore queue low: $QUEUE_LENGTH remaining (threshold: $THRESHOLD)\"}"

  # Email via mail command:
  # echo "Keystore queue has $QUEUE_LENGTH keys remaining" | mail -s "Low Keystore Alert" your-email@example.com
fi
```

Make the script executable and schedule it with cron:

```bash
# Make the script executable
chmod +x /path/to/check-keystores.sh

# Edit crontab
crontab -e

# Add this line to check every 4 hours
0 */4 * * * /path/to/check-keystores.sh >> /var/log/keystore-monitor.log 2>&1
```

### When to Add More Keystores

Add keystores proactively before running out:
- Monitor your delegation growth rate
- Add in batches (max 100 per transaction)
- Stay ahead of demand during high-activity periods

See [Step 2: Add Sequencer Identities](#step-2-add-sequencer-identities) for instructions.

## Managing Your Provider

Update your provider configuration using these functions. All must be called from your `providerAdmin` address.

### Update Admin Address

Transfer provider administration to a new address:

```bash
cast send [STAKING_REGISTRY_ADDRESS] \
  "updateProviderAdmin(uint256,address)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  [NEW_ADMIN_ADDRESS] \
  --rpc-url [RPC_URL] \
  --private-key [CURRENT_ADMIN_PRIVATE_KEY]
```

### Update Rewards Recipient

Change the address receiving commission payments:

```bash
cast send [STAKING_REGISTRY_ADDRESS] \
  "updateProviderRewardsRecipient(uint256,address)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  [NEW_REWARDS_RECIPIENT_ADDRESS] \
  --rpc-url [RPC_URL] \
  --private-key [ADMIN_PRIVATE_KEY]
```

### Update Commission Rate

Modify your commission rate (applies only to new delegations):

```bash
cast send [STAKING_REGISTRY_ADDRESS] \
  "updateProviderTakeRate(uint256,uint16)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  [NEW_RATE_BASIS_POINTS] \
  --rpc-url [RPC_URL] \
  --private-key [ADMIN_PRIVATE_KEY]
```

:::note
Rate changes only apply to new delegations. Existing delegations retain the original commission rate they agreed to.
:::

## Verification

Verify your setup is working correctly.

### Check Provider Registration

Query the StakingRegistry to confirm your provider details:

```bash
cast call [STAKING_REGISTRY_ADDRESS] \
  "providerConfigurations(uint256) (address,uint16,address)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]
```

This returns:
1. The provider's admin address
2. The provider's commission rate in bps
3. The provider's rewards recipient

### Verify Queue Length

Check your provider queue length:

```bash
cast call [STAKING_REGISTRY_ADDRESS] \
  "getProviderQueueLength(uint256)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]
```

### Monitor Delegations

View these metrics on the staking dashboard:
- Total stake delegated to your provider
- Number of active sequencers
- Commission earned
- Provider performance metrics

### Confirm Node Operation

Ensure your sequencer nodes are running and synced. See [Useful Commands](./useful_commands.md) for commands to check sequencer status.

## Troubleshooting

### Registration transaction fails

**Issue**: The `registerProvider` transaction reverts or fails.

**Solutions**:
- Ensure your wallet has sufficient ETH for gas fees
- Verify the StakingRegistry contract address is correct
- Check that the commission rate is within acceptable bounds (typically 0-10000 basis points)
- Review transaction logs for specific error messages using a block explorer

### Cannot add sequencer identities

**Issue**: The `addKeysToProvider` function fails.

**Solutions**:
- Confirm you're calling from the `providerAdmin` address
- Verify your `providerIdentifier` is correct
- Ensure BLS signatures in `KeyStore` are properly formatted (use the keystore creation utility)
- Check that the attester addresses aren't already registered elsewhere
- Reduce batch size if hitting gas limits (max 100 keystores per transaction)

### No delegators appearing

**Issue**: No delegators are staking to your provider.

**Solutions**:
- Verify your provider is visible on the staking dashboard
- Complete all metadata fields to build trust
- Ensure your commission rate is competitive with other providers
- Confirm your sequencer nodes are operational and performing well
- Engage with the community on Discord to build your reputation

### Commission not being received

**Issue**: Commission payments aren't arriving at the rewards recipient address.

**Solutions**:
- Verify the `providerRewardsRecipient` address is correct
- Check that delegations are active and generating fees
- Confirm your sequencers are producing blocks and earning fees
- Allow time for reward distribution (may not be immediate)
- Check the contract for pending distributions that need to be claimed

## Best Practices

**Maintain Sufficient Keystores**: Set up automated monitoring to ensure your keystore queue never runs empty. See [Monitoring Keystore Availability](#monitoring-keystore-availability) for guidance on implementing alerts.

**Communicate Changes**: Inform delegators about commission rate changes, planned maintenance, or infrastructure updates. Good communication builds trust.

**Monitor Performance**: Track your sequencers' attestation rates, block proposals, and uptime. Poor performance may cause delegators to withdraw.

**Secure Your Keys**: The `providerAdmin` key controls your provider configuration. Store it securely and consider using a hardware wallet or multisig.

## Next Steps

After completing this setup:

1. Monitor your provider's performance through the staking dashboard
2. Maintain high uptime for your sequencer nodes
3. Keep open communication with delegators
4. Regularly add new keystores to your provider queue (see [Monitoring Keystore Availability](#monitoring-keystore-availability))
5. Join the [Aztec Discord](https://discord.gg/aztec) for provider support and community discussions
