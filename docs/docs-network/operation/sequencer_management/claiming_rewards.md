---
sidebar_position: 4
title: Claiming Rewards
description: Learn how to claim your sequencer rewards from the Aztec Rollup contract using Etherscan.
---

## Overview

Sequencer rewards accumulate in the Rollup contract but are not automatically distributed. You must manually claim them by calling the Rollup contract. This guide shows you how to check pending rewards and claim them using Etherscan's web interface.

Using Etherscan instead of command-line tools provides a more secure approach—you never need to expose private keys in terminal commands. Etherscan integrates with browser wallets (MetaMask, Ledger, etc.) for signing transactions.

## Prerequisites

Before proceeding, you should:

- Have a running sequencer that earned rewards (see [Sequencer Setup Guide](../../setup/sequencer_management.md))
- Have a browser wallet (MetaMask, Rabby, etc.) connected to the appropriate network
- Know your Rollup contract address (see [Useful Commands](./useful_commands.md#get-the-rollup-contract-address))
- Have your sequencer's coinbase address
- Have ETH in your wallet to pay for gas

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

### Navigate to the Rollup Contract

Go to your Rollup contract on Etherscan:
- **Mainnet**: `https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`
- **Testnet (Sepolia)**: `https://sepolia.etherscan.io/address/[ROLLUP_ADDRESS]#readContract`

Replace `[ROLLUP_ADDRESS]` with your actual Rollup contract address.

### Check if Rewards Are Claimable

Verify reward claiming is enabled before attempting to claim:

1. Go to the Rollup contract's **Read Contract** page
2. Find the `isRewardsClaimable` function
3. Click **"Query"**

**Expected output:**
- `true` - Rewards are claimable
- `false` - Rewards are not yet claimable

If rewards are not claimable, check when they will become claimable:

1. Find the `getEarliestRewardsClaimableTimestamp` function
2. Click **"Query"**

This returns a Unix timestamp indicating the earliest time when governance can enable reward claiming. Use an online converter to translate the timestamp to a human-readable date.

### Query Your Pending Rewards

Check accumulated rewards:

1. Find the `getSequencerRewards` function
2. Enter your coinbase address (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
3. Click **"Query"**

Etherscan displays the result in both hexadecimal and decimal formats. The value is in wei (10^18 wei = 1 token), so divide by 10^18 to get the token amount.

**Example:**
If the result shows `100000000000000000` (decimal), that equals `0.1` tokens.

## Claiming Your Rewards

The `claimSequencerRewards` function is permissionless - anyone can call it for any address. Rewards are always sent to the `coinbase` address, regardless of who submits the transaction.

### Claim via Etherscan

1. Go to your Rollup contract's **Write Contract** page:
   - **Mainnet**: `https://etherscan.io/address/[ROLLUP_ADDRESS]#writeContract`
   - **Testnet (Sepolia)**: `https://sepolia.etherscan.io/address/[ROLLUP_ADDRESS]#writeContract`

2. Click **"Connect to Web3"** and connect your wallet (MetaMask, WalletConnect, etc.)

3. Find the `claimSequencerRewards` function

4. Enter the coinbase address whose rewards you want to claim (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)

5. Click **"Write"**

6. Confirm the transaction in your wallet

### Using Hardware Wallets

Etherscan supports hardware wallet connections through:

- **MetaMask + Ledger/Trezor**: Connect your hardware wallet to MetaMask, then use MetaMask to connect to Etherscan
- **WalletConnect**: Many hardware wallet apps support WalletConnect for direct connection

This ensures your private keys never leave your hardware device.

## Verifying Your Claim

### Check Transaction Status

After submitting the claim transaction:

1. Copy the transaction hash from your wallet or Etherscan
2. Go to `https://etherscan.io/tx/[TRANSACTION_HASH]` (use `sepolia.etherscan.io` for testnet)
3. Verify the transaction status shows **"Success"**

### Verify Rewards Are Claimed

Confirm your pending rewards are now zero:

1. Go to the Rollup contract's **Read Contract** page
2. Find the `getSequencerRewards` function
3. Enter your coinbase address
4. Click **"Query"**

The result should show `0` if all rewards were successfully claimed.

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
1. When using Etherscan, MetaMask typically estimates gas automatically. If the transaction fails:
   - In MetaMask, click "Edit" on the gas settings before confirming
   - Increase the gas limit to 200,000 or higher
2. Ensure your account has sufficient ETH to cover gas costs

### Insufficient Funds for Gas

**Symptom**: Transaction fails because the sending account has insufficient ETH.

**Solution**:
1. Check your account balance on Etherscan:
   - Go to `https://etherscan.io/address/[YOUR_ADDRESS]`
   - The ETH balance is displayed at the top of the page
2. Send ETH to your account to cover gas costs (recommended: at least 0.005 ETH)

### Wrong Network

**Symptom**: Transaction fails or contract calls return unexpected results.

**Solution**:
1. Verify you're using the correct Etherscan domain:
   - Mainnet: `etherscan.io`
   - Sepolia testnet: `sepolia.etherscan.io`
2. Ensure your wallet is connected to the correct network (check the network selector in MetaMask)
3. Verify the Rollup contract address matches your target network
4. Check your account has ETH on the correct network

## Best Practices

**Claim Regularly**: Claim rewards periodically to reduce accumulated balances in the Rollup contract. This minimizes risk and simplifies accounting.

**Monitor Pending Rewards**: Set up automated scripts to query pending rewards and alert you when they exceed a threshold.

**Use Hardware Wallets**: For production operations, use hardware wallets connected through MetaMask or WalletConnect for maximum security.

**Verify Before Claiming**: Check pending rewards before claiming to ensure the transaction justifies the gas cost.

**Track Claim History**: Keep records of claim transactions for accounting purposes using transaction hashes on blockchain explorers.

**Coordinate with Delegators**: If operating with delegated stake, communicate with delegators about claiming and distribution schedules.

## Next Steps

- Set up [monitoring](../monitoring.md) to track reward accumulation automatically
- Learn about [delegated stake management](./running_delegated_stake.md) if operating with delegators
- Review [useful commands](./useful_commands.md) for other sequencer queries
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and community discussions
