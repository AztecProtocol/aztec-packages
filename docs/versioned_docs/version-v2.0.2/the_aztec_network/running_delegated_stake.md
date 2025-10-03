---
id: running_delegated_stake
sidebar_position: 5
title: Running Delegated Stake
description: Learn how to run a sequencer with delegated stake on the Aztec network, including provider registration and sequencer identity management.
---

## Overview

This guide covers the additional steps required to run a sequencer with delegated stake on the Aztec network. In conventional setups, you must have the required stake to join the sequencer set. In a delegated setup, you (the "provider") use someone else's tokens as stake to back your attestations and proposals. **This is a non-custodial system**: delegators retain full control and ownership of their tokens at all times. You never take custody of the delegated tokens; they remain in the delegator's control while being used as economic backing for your sequencer operations.

## Prerequisites

- Knowledge of how to run a sequencer node (see [How to Run a Sequencer](./sequencer_management.md))
- Access to an Ethereum wallet with sufficient gas for contract interactions
- Understanding of the Aztec staking mechanism

## Setup Process

To run with delegated stake, follow these steps:

1. Set up your sequencer node (see prerequisites above)
2. Register your provider with the Staking Registry
3. Add sequencer identities to your provider
4. (Optional) Add provider metadata via the web app

### Register Your Provider with the Staking Registry

To indicate your interest in running validators on behalf of others, you must interact with the `StakingRegistry` contract. This process is permissionless, and the web app will automatically detect all providers who register with this contract.

Call the `registerProvider` function with the following signature:

```solidity
function registerProvider(address _providerAdmin, uint16 _providerTakeRate, address _providerRewardsRecipient)
    external
    returns (uint256);
```

**Parameters:**
- `_providerAdmin`: The address that can update your provider information
- `_providerTakeRate`: Your commission rate (in basis points, e.g., 500 = 5%)
- `_providerRewardsRecipient`: The address that will receive your commission payments

**Returns:** A `providerIdentifier` that serves as your unique provider identity. Save this identifier as you'll need it for all provider management operations.

**Example using cast:**

```bash
# Register a provider with 5% commission rate (500 basis points)
cast send [STAKING_REGISTRY_ADDRESS] \
  "registerProvider(address,uint16,address)" \
  [PROVIDER_ADMIN_ADDRESS] \
  500 \
  [REWARDS_RECIPIENT_ADDRESS] \
  --rpc-url [RPC_URL] \
  --private-key [YOUR_PRIVATE_KEY]
```

Replace the placeholders:
- `[STAKING_REGISTRY_ADDRESS]`: Address of the StakingRegistry contract
- `[PROVIDER_ADMIN_ADDRESS]`: Your admin address
- `[REWARDS_RECIPIENT_ADDRESS]`: Address to receive commission payments
- `[RPC_URL]`: Your Ethereum RPC endpoint
- `[YOUR_PRIVATE_KEY]`: Your wallet's private key

The command will return a transaction hash. Once confirmed, you can retrieve your `providerIdentifier` from the transaction logs.

### Add Sequencer Identities

Once you have your `providerIdentifier`, you can add sequencer identities to your provider.

Call `addKeysToProvider` from your `providerAdmin` account with the following signature:

```solidity
    function addKeysToProvider(uint256 _providerIdentifier, KeyStore[] calldata _keyStores) external;
```

**Parameters:**
- `_providerIdentifier`: Your registered provider identifier
- `_keyStores`: The public keys and signatures of sequencer identities available for delegation

The `KeyStore` structure contains BLS signatures where the signed message is "feedback".

```solidity
struct KeyStore {
    /// @notice The address of the attester
    address attester;
    /// @notice The BLS public key - BN254 G1
    BN254Lib.G1Point publicKeyG1;
    /// @notice The BLS public key - BN254 G2
    BN254Lib.G2Point publicKeyG2;
    /// @notice The BLS signature - required to prevent rogue key attacks
    BN254Lib.G1Point signature;
}
```

The contract maintains a mapping between each `providerIdentifier` and a queue of `KeyStore` entries:

```solidity
mapping(uint256 providerIdentifier => Queue attesterKeys) public providerQueues;
```

Once registered, delegators can delegate their stake to you by calling a function on the `StakingRegistry` contract. This dequeues a single `KeyStore` from your provider and registers that sequencer in the sequencer set.

### Add Provider Metadata (Optional)

To be featured on the staking dashboard, provide the following information:

1. Provider name and description
2. Logo image
3. Website URLs
4. Your `providerIdentifier`

Visit the staking dashboard to complete this step.

## Provider Management

You can update your provider configuration using these functions:

```solidity
function updateProviderAdmin(uint256 _providerIdentifier, address _newAdmin) external;

function updateProviderRewardsRecipient(uint256 _providerIdentifier, address _newRewardsRecipient) external;

function updateProviderTakeRate(uint256 _providerIdentifier, uint16 _newTakeRate) external;
```

**Requirements:**
- All functions must be called from your `providerAdmin` address
- Include your `_providerIdentifier` in each call

**Functions:**
- `updateProviderAdmin`: Change the admin address for your provider
- `updateProviderRewardsRecipient`: Update the address that receives commission payments
- `updateProviderTakeRate`: Modify your commission rate (only applies to new delegations; existing stake retains the original commission rate)

## Verification

To verify your delegated stake setup is working correctly:

1. **Check registration**: Query the `StakingRegistry` contract to confirm your provider is registered
2. **Verify sequencer identities**: Ensure all your sequencer identities are properly added to your provider queue
3. **Monitor delegation**: Check the staking dashboard to see if delegators are staking to your provider
4. **Confirm node operation**: Verify your sequencer node is running and synced (see [Become a Sequencer](./sequencer_management.md#verification))

**Example verification using cast:**

```bash
# Query your provider information
cast call [STAKING_REGISTRY_ADDRESS] \
  "getProvider(uint256)" \
  [YOUR_PROVIDER_IDENTIFIER] \
  --rpc-url [RPC_URL]
```

## Troubleshooting

### Registration transaction fails

**Issue**: The `registerProvider` transaction reverts or fails.

**Solutions**:
- Ensure your wallet has sufficient ETH for gas fees
- Verify the `StakingRegistry` contract address is correct
- Check that the commission rate is within acceptable bounds
- Review transaction logs for specific error messages

### Cannot add sequencer identities

**Issue**: The `addKeysToProvider` function fails.

**Solutions**:
- Confirm you're calling from the `providerAdmin` address
- Verify your `providerIdentifier` is correct
- Ensure the BLS signatures in `KeyStore` are properly formatted
- Check that the sequencer identity isn't already registered elsewhere

### Delegators not appearing

**Issue**: No delegators are staking to your provider.

**Solutions**:
- Verify your provider is visible on the staking dashboard
- Check that your metadata is complete and accurate
- Ensure your commission rate is competitive
- Confirm your sequencer node is operational and performing well

### Commission not being received

**Issue**: Your commission payments aren't arriving at the rewards recipient address.

**Solutions**:
- Verify the `providerRewardsRecipient` address is correct
- Check that delegations are active and generating rewards
- Monitor the contract for any pending reward distributions
- Ensure sufficient block production activity to generate fees

## Next Steps

After completing this setup:
1. Monitor your provider's performance through the staking dashboard
2. Ensure your sequencer node remains operational
3. Manage delegator relationships and communicate any changes
4. Keep your provider metadata current
5. Join the [Aztec Discord](https://discord.gg/aztec) for provider support and community discussions
