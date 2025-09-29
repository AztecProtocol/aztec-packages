---
sidebar_position: 5
title: Running Delegated Stake
description: Learn how to run a sequencer with delegated stake on the Aztec network.
---

## Overview

This guide covers the additional steps required to run a sequencer with delegated stake on the Aztec network. In conventional setups, you must have the required stake to join the sequencer set. In a delegated setup, you (the "provider") use someone else's tokens as stake to back your attestations and proposals rather than your own.

## Prerequisites

- Knowledge of how to run a sequencer node (see [How to Run a Sequencer](./run_nodes/how_to_run_sequencer.md))
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
- `_providerTakeRate`: Your commission rate
- `_providerRewardsRecipient`: The address that will receive your commission payments

**Returns:** A `providerIdentifier` that serves as your unique provider identity. Save this identifier as you'll need it for all provider management operations.

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
- `updateProviderTakeRate`: Modify your commission rate

## Next Steps

After completing this setup:
1. Monitor your provider's performance through the staking dashboard
2. Ensure your sequencer node remains operational
3. Manage delegator relationships and communicate any changes
4. Keep your provider metadata current
