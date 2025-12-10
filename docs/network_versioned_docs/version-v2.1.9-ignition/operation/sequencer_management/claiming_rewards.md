---
sidebar_position: 4
title: Claiming Rewards
description: Learn how to claim your sequencer rewards from the Aztec Rollup contract using cast commands.
---

## Overview

Sequencer rewards accumulate in the Rollup contract but are not automatically distributed. You must manually claim them by calling the Rollup contract. This guide shows you how to check pending rewards and claim them using Foundry's `cast` command.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer that earned rewards (see [Sequencer Setup Guide](../../setup/sequencer_management.md))
- Have Foundry installed with the `cast` command available ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- Know your Rollup contract address (see [Useful Commands](./useful_commands.md#get-the-rollup-contract-address))
- Have your sequencer's coinbase address
- Have an Ethereum RPC endpoint for the network you're querying

## Understanding Reward Claiming

### How Rewards Accumulate

When your sequencer proposes blocks and participates in consensus, rewards accumulate in the Rollup contract under your coinbase address. These rewards come from:

- Block rewards distributed by the protocol
- Transaction fees from processed transactions

Rewards are tracked per coinbase address in the Rollup contract's storage but remain in the contract until you claim them.

### Manual vs Automatic

Rewards are not automatically sent to your coinbase address. You must explicitly claim them by calling the `claimSequencerRewards` function on the Rollup contract.

### Claim Requirements

Before claiming, verify these conditions:

1. **Rewards must be claimable**: A governance vote must pass to enable the claiming of rewards (only possible after a minimum configured timestamp) and governance must have called `setRewardsClaimable(true)` on the rollup contract.
2. **Rewards have accumulated**: Query your pending rewards before attempting to claim.
3. **Sufficient gas**: Ensure you have ETH to pay transaction gas costs.

## Checking Reward Status

### Set Up Your Environment

For convenience, set your RPC URL as an environment variable:

```bash
export RPC_URL="https://your-ethereum-rpc-endpoint.com"
export ROLLUP_ADDRESS="[YOUR_ROLLUP_CONTRACT_ADDRESS]"
```

Replace `[YOUR_ROLLUP_CONTRACT_ADDRESS]` with your actual Rollup contract address.

### Check if Rewards Are Claimable

Verify reward claiming is enabled before attempting to claim:

```bash
cast call $ROLLUP_ADDRESS "isRewardsClaimable()" --rpc-url $RPC_URL
```

**Expected output:**
- `0x0000000000000000000000000000000000000000000000000000000000000001` - Rewards are claimable (true)
- `0x0000000000000000000000000000000000000000000000000000000000000000` - Rewards are not yet claimable (false)

If rewards are not claimable, check when they will become claimable:

```bash
cast call $ROLLUP_ADDRESS "getEarliestRewardsClaimableTimestamp()" --rpc-url $RPC_URL
```

This returns a Unix timestamp indicating the earliest time when governance can enable reward claiming.

### Query Your Pending Rewards

Check accumulated rewards:

```bash
cast call $ROLLUP_ADDRESS "getSequencerRewards(address)" [COINBASE_ADDRESS] --rpc-url $RPC_URL
```

Replace `[COINBASE_ADDRESS]` with your sequencer's coinbase address.

**Example:**
```bash
# Query and convert to decimal tokens (assuming 18 decimals)
cast call $ROLLUP_ADDRESS "getSequencerRewards(address)" 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb --rpc-url $RPC_URL | cast --to-dec | cast --from-wei
# Output: 0.1
```

## Claiming Your Rewards

The `claimSequencerRewards` function is permissionless - anyone can call it for any address. Rewards are always sent to the `coinbase` address, regardless of who submits the transaction.

### Basic Claim Command

Use `cast send` to claim rewards:

```bash
cast send $ROLLUP_ADDRESS \
  "claimSequencerRewards(address)" \
  [COINBASE_ADDRESS] \
  --rpc-url $RPC_URL \
  --private-key [YOUR_PRIVATE_KEY]
```

Replace:
- `[COINBASE_ADDRESS]` - The coinbase address whose rewards you want to claim
- `[YOUR_PRIVATE_KEY]` - The private key of the account paying for gas

**Example:**
```bash
cast send $ROLLUP_ADDRESS \
  "claimSequencerRewards(address)" \
  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb \
  --rpc-url $RPC_URL \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Using a Keystore File

For better security, use a keystore file instead of exposing your private key:

```bash
cast send $ROLLUP_ADDRESS \
  "claimSequencerRewards(address)" \
  [COINBASE_ADDRESS] \
  --rpc-url $RPC_URL \
  --keystore [PATH_TO_KEYSTORE] \
  --password [KEYSTORE_PASSWORD]
```

### Using a Hardware Wallet

If you're using a Ledger wallet:

```bash
cast send $ROLLUP_ADDRESS \
  "claimSequencerRewards(address)" \
  [COINBASE_ADDRESS] \
  --rpc-url $RPC_URL \
  --ledger
```

This will prompt you to confirm the transaction on your Ledger device.

## Verifying Your Claim

Check that the transaction succeeded and your pending rewards were reset to zero:

```bash
# Check transaction succeeded (look for status: 1)
cast receipt [TRANSACTION_HASH] --rpc-url $RPC_URL

# Verify pending rewards are now zero
cast call $ROLLUP_ADDRESS "getSequencerRewards(address)" [COINBASE_ADDRESS] --rpc-url $RPC_URL
```

## Troubleshooting

### "Rewards not claimable" Error

**Symptom**: Transaction reverts with "Rewards not claimable" error.

**Solution**:
1. Check if rewards are claimable using `isRewardsClaimable()`
2. If `false`, wait until governance enables claiming via `setRewardsClaimable(true)`
3. Check the earliest claimable timestamp using `getEarliestRewardsClaimableTimestamp()`

### No Pending Rewards

**Symptom**: `getSequencerRewards()` returns zero.

**Possible causes**:
1. Your sequencer has not proposed any blocks yet
2. You already claimed all available rewards
3. Your coinbase address is configured incorrectly

**Solutions**:
1. Verify your sequencer is active and proposing blocks (check [monitoring](../monitoring.md))
2. Check your sequencer logs for block proposals
3. Verify the coinbase address in your sequencer configuration matches the address you're querying
4. Check if blocks you proposed have been proven (rewards are distributed after proof submission)

### Transaction Fails with "Out of Gas"

**Symptom**: Transaction reverts due to insufficient gas.

**Solution**:
1. Increase the gas limit when sending the transaction using `--gas-limit`:
   ```bash
   cast send $ROLLUP_ADDRESS \
     "claimSequencerRewards(address)" \
     [COINBASE_ADDRESS] \
     --rpc-url $RPC_URL \
     --private-key [YOUR_PRIVATE_KEY] \
     --gas-limit 200000
   ```
2. Ensure your account has sufficient ETH to cover gas costs

### Insufficient Funds for Gas

**Symptom**: Transaction fails because the sending account has insufficient ETH.

**Solution**:
1. Check your account balance:
   ```bash
   cast balance [YOUR_ADDRESS] --rpc-url $RPC_URL
   ```
2. Send ETH to your account to cover gas costs (recommended: at least 0.005 ETH)

### Wrong Network

**Symptom**: Transaction fails or contract calls return unexpected results.

**Solution**:
1. Verify your RPC URL points to the correct network (Ethereum mainnet)
2. Verify the Rollup contract address matches your target network
3. Check your account has ETH on the correct network

## Best Practices

**Claim Regularly**: Claim rewards periodically to reduce accumulated balances in the Rollup contract. This minimizes risk and simplifies accounting.

**Monitor Pending Rewards**: Set up automated scripts to query pending rewards and alert you when they exceed a threshold.

**Use Keystore Files**: Avoid exposing private keys in command history. Use keystore files or hardware wallets for production operations.

**Verify Before Claiming**: Check pending rewards before claiming to ensure the transaction justifies the gas cost.

**Track Claim History**: Keep records of claim transactions for accounting purposes using transaction hashes on blockchain explorers.

**Coordinate with Delegators**: If operating with delegated stake, communicate with delegators about claiming and distribution schedules.

## Next Steps

- Set up [monitoring](../monitoring.md) to track reward accumulation automatically
- Learn about [delegated stake management](./running_delegated_stake.md) if operating with delegators
- Review [useful commands](./useful_commands.md) for other sequencer queries
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and community discussions
