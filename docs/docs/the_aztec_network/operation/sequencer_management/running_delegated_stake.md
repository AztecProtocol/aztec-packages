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

Before proceeding, you should:

- Know how to run a sequencer node (see [Sequencer Setup Guide](../../setup/sequencer_management))
- Have an Ethereum wallet with sufficient ETH for gas fees
- Understand basic Aztec staking mechanics
- Have Foundry installed for `cast` commands

## How Delegated Stake Works

As a provider, you register with the StakingRegistry contract and add sequencer identities (keystores) to a queue. When delegators stake to your provider, the system:

1. Dequeues one keystore from your provider queue
2. Registers that sequencer identity in the active sequencer set
3. Backs the sequencer with the delegator's stake
4. Creates a [Split contract](https://docs.splits.org/core/split) for reward distribution
5. Routes all staking rewards through the Split contract according to your commission rate

### Reward Distribution

When a delegator stakes to your provider, a new Split contract is automatically created to manage reward distribution between you and the delegator. All staking rewards earned by the sequencer can only be withdrawn to this Split contract, which then distributes them according to the agreed commission rate:

- **Provider commission**: You receive the percentage specified in your `providerTakeRate` (e.g., 5% if you set 500 basis points)
- **Delegator rewards**: The delegator's Aztec Token Pool (ATP) receives the remaining percentage

This design ensures delegators maintain control of their rewards while you earn commission for operating the sequencer infrastructure. You can monitor accumulated rewards for your Split contracts through the staking dashboard.

### Delegation Lifecycle and Unstaking

Delegators can unstake at any time, giving them full flexibility to manage their stake. When a delegator unstakes from one of your sequencers:

1. The sequencer identity is removed from the active sequencer set
2. The backing stake is returned to the delegator's control
3. The Split contract remains for final reward settlement
4. **The sequencer identity (keystore) returns to your provider queue** and becomes available for reuse

This means keystores are reusable—when a delegator unstakes, you don't lose that sequencer identity. It simply returns to your queue and can be activated again by the next delegator who stakes to your provider. This allows you to maintain a pool of sequencer identities that cycle between active use and queue availability as delegators come and go.

## Setup Process

Before starting these steps, ensure your sequencer node infrastructure is set up (see [Prerequisites](#prerequisites)).

Follow these steps to configure delegated stake:

1. Register your provider with the Staking Registry
2. Add sequencer identities to your provider queue
3. (Optional) Add provider metadata via the staking dashboard

### Step 1: Register Your Provider

Register with the `StakingRegistry` contract to indicate your interest in running sequencers for delegators. This process is permissionless—anyone can register.

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

Replace the placeholders:
- `[STAKING_REGISTRY_ADDRESS]`: StakingRegistry contract address
- `[PROVIDER_ADMIN_ADDRESS]`: Your admin address
- `[REWARDS_RECIPIENT_ADDRESS]`: Address to receive commissions
- `[RPC_URL]`: Your Ethereum RPC endpoint
- `[YOUR_PRIVATE_KEY]`: Your wallet's private key

The transaction returns a hash. Once confirmed, retrieve your `providerIdentifier` from the transaction logs.

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
    BN254Lib.G1Point signature;    // BLS signature (prevents rogue key attacks)
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
- `(uint256,uint256)`: signature (x, y coordinates)

**Important:** The BLS values shown above are placeholders. You must use properly generated BLS keys and signatures (signing "feedback") for actual registration. Add a maximum of 100 keystores per transaction to avoid gas limit issues.

### Step 3: Add Provider Metadata (Optional)

To be featured on the staking dashboard, you will have to submit metadata about your provider via a GitHub pull request. You'll need to provide:

1. Provider name and description
2. Logo image
3. Website and social media URLs
4. Your `providerIdentifier`

The exact submission workflow is still being finalized. Check the [Aztec Discord](https://discord.gg/aztec) for the latest instructions. Good metadata helps delegators understand your offering and builds trust.

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

**Note:** Rate changes only apply to new delegations. Existing delegations retain the original commission rate they agreed to.

**Example:**

```bash
# Update commission rate to 3% (300 basis points)
cast send 0x1234567890abcdef1234567890abcdef12345678 \
  "updateProviderTakeRate(uint256,uint16)" \
  42 \
  300 \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY
```

## Verification

Verify your setup is working correctly:

### Check Provider Registration

Query the StakingRegistry to confirm your provider details:

```bash
cast call [STAKING_REGISTRY_ADDRESS] \
  "getProvider(uint256)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]
```

This returns your provider configuration including admin address, commission rate, and rewards recipient.

### Verify Sequencer Identities

Check how many keystores are in your provider queue:

```bash
cast call [STAKING_REGISTRY_ADDRESS] \
  "getProviderQueueLength(uint256)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]
```

### Monitor Delegations

Check the staking dashboard to see:
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

### Delegators not appearing

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

**Maintain Sufficient Keystores**: Keep your provider queue stocked with keystores. When delegators stake and your queue is empty, they can't activate sequencers.

**Communicate Changes**: Inform your delegators about commission rate changes, planned maintenance, or infrastructure updates. Good communication builds trust.

**Monitor Performance**: Track your sequencers' attestation rates, block proposals, and uptime. Poor performance may cause delegators to withdraw.

**Secure Your Keys**: The `providerAdmin` key controls your provider configuration. Store it securely and consider using a hardware wallet or multisig.

**Set Reasonable Commission Rates**: Balance profitability with competitiveness. Too high, and delegators choose other providers. Too low, and you can't sustain operations.

## Next Steps

After completing this setup:

1. Monitor your provider's performance through the staking dashboard
2. Keep your sequencer nodes operational with high uptime
3. Maintain open communication with delegators
4. Regularly add new keystores to your provider queue
5. Join the [Aztec Discord](https://discord.gg/aztec) for provider support and community discussions
