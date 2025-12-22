---
sidebar_position: 5
title: Useful Commands
description: Essential Etherscan operations for querying Registry, Rollup, and Governance contracts as a sequencer operator.
---

## Overview

This reference provides instructions for common sequencer operator tasks using Etherscan's web interface. You'll query onchain contract state, check sequencer status, and monitor governance processes through Etherscan's "Read Contract" and "Write Contract" features.

Using Etherscan instead of command-line tools like `cast` provides a more secure approach—you never need to expose private keys in terminal commands. Etherscan integrates with browser wallets (MetaMask, Ledger, etc.) for signing transactions.

If you need help with something not covered here, visit the [Aztec Discord](https://discord.gg/aztec) in the `#operator-faq` channel.

## Prerequisites

Before using these methods, ensure you have:

- **A web browser** with a wallet extension (MetaMask, Rabby, etc.) for write operations
- **Aztec CLI tool** installed (see [prerequisites guide](../../prerequisites.md#aztec-toolchain))
- **Contract addresses** for your deployment (Registry, Rollup, Governance)

## Understanding Etherscan

### Mainnet vs Testnet

Use the appropriate Etherscan URL for your network:

| Network | Etherscan URL |
|---------|---------------|
| Ethereum Mainnet | [etherscan.io](https://etherscan.io) |
| Sepolia Testnet | [sepolia.etherscan.io](https://sepolia.etherscan.io) |

### Read Contract vs Write Contract

Etherscan provides two interfaces for interacting with smart contracts:

**Read Contract** (no wallet needed):
- Query contract state without making transactions
- Free to use—no gas required
- Returns data immediately

**Write Contract** (wallet required):
- Execute transactions that modify state
- Requires connecting your wallet and signing
- Costs gas (ETH)

### How to Use Read Contract

1. Navigate to the contract address on Etherscan (e.g., `https://etherscan.io/address/[CONTRACT_ADDRESS]`)
2. Click the **"Contract"** tab
3. Click **"Read Contract"** (or **"Read as Proxy"** if it's a proxy contract)
4. Find the function you want to call
5. Enter any required parameters
6. Click **"Query"** to see the result

### How to Use Write Contract

1. Navigate to the contract address on Etherscan
2. Click the **"Contract"** tab
3. Click **"Write Contract"** (or **"Write as Proxy"** if it's a proxy contract)
4. Click **"Connect to Web3"** and connect your wallet
5. Find the function you want to call
6. Enter the required parameters
7. Click **"Write"** and confirm the transaction in your wallet

## Getting Started

### Understanding Deployments

Assume there are multiple deployments of Aztec, such as `testnet` and `ignition-testnet`. Each deployment has a unique Registry contract address that remains constant across upgrades. If a governance upgrade deploys a new rollup contract, the Registry contract address stays the same.

<!-- The Registry contract for a particular deployment can be retrieved from the [Chain Info](../..link) page. -->

### Find the Registry Contract Address

The Registry contract is your entrypoint to all other contracts for a specific deployment. You'll need this address to discover other contract addresses.

Contact the Aztec team or check the documentation for the Registry contract address for your target network (testnet, ignition-testnet, etc.).

### Get the Rollup Contract Address

Once you have the Registry address, retrieve the Rollup contract using Etherscan:

1. Go to `https://etherscan.io/address/[REGISTRY_CONTRACT_ADDRESS]#readContract` (use `sepolia.etherscan.io` for testnet)
2. Find the `getCanonicalRollup` function
3. Click **"Query"**
4. Copy the returned address

**Example:**
Navigate to `https://etherscan.io/address/0x1234567890abcdef1234567890abcdef12345678#readContract` and query `getCanonicalRollup()`.

The result displays the Rollup contract address. Etherscan automatically formats addresses correctly.

## Query the Sequencer Set

### Get the GSE Contract Address

The GSE (Governance Staking Escrow) contract manages sequencer registrations and balances. Get its address from the Rollup contract:

1. Go to `https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`
2. Find the `getGSE` function
3. Click **"Query"**
4. Copy the returned GSE contract address

You'll need this address for some queries below.

### Count Active Sequencers

Get the total number of active sequencers in the set:

1. Go to `https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`
2. Find the `getActiveAttesterCount` function
3. Click **"Query"**

Etherscan displays the result in both hexadecimal and decimal formats.

### List Sequencers by Index

Retrieve individual sequencer addresses by their index (0-based):

1. Go to `https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`
2. Find the `getAttesterAtIndex` function
3. Enter the index number (e.g., `0` for the first sequencer, `1` for the second)
4. Click **"Query"**

**Example:**
To get the first sequencer, enter `0` in the index field and query. To get the second, enter `1`.

### Check Sequencer Status

Query the complete status and information for a specific sequencer:

1. Go to `https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`
2. Find the `getAttesterView` function
3. Enter the attester address (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
4. Click **"Query"**

The result shows a structured view of the sequencer's status, balance, and configuration.

### Interpret the Response

The `getAttesterView` command returns an `AttesterView` struct containing:

1. **status** - The sequencer's current status code (see Status Codes below)
2. **effectiveBalance** - The sequencer's effective stake balance
3. **exit** - Exit information struct (if the sequencer is exiting):
   - `withdrawalId` - Withdrawal ID in the GSE contract
   - `amount` - Amount being withdrawn
   - `exitableAt` - Timestamp when withdrawal can be finalized
   - `recipientOrWithdrawer` - Address that receives funds or can initiate withdrawal
   - `isRecipient` - Whether the exit has a recipient set
   - `exists` - Whether an exit exists
4. **config** - Attester configuration struct:
   - `publicKey` - BLS public key (G1 point with x and y coordinates)
   - `withdrawer` - Address authorized to withdraw stake

### Get Individual Sequencer Information

Query specific pieces of information using Etherscan. Navigate to the appropriate contract's Read Contract page:

**On the GSE contract** (`https://etherscan.io/address/[GSE_ADDRESS]#readContract`):

| Function | Parameters | Description |
|----------|------------|-------------|
| `isRegistered` | rollup address, attester address | Check if a sequencer is registered |
| `balanceOf` | rollup address, attester address | Get sequencer's balance on this rollup instance |
| `effectiveBalanceOf` | rollup address, attester address | Get effective balance (includes bonus if latest rollup) |

**On the Rollup contract** (`https://etherscan.io/address/[ROLLUP_ADDRESS]#readContract`):

| Function | Parameters | Description |
|----------|------------|-------------|
| `getConfig` | attester address | Get sequencer's configuration (withdrawer and public key) |
| `getStatus` | attester address | Get only the sequencer's status code |

### Status Codes

| Status | Name | Meaning |
| ------ | ---- | ------- |
| 0 | NONE | The sequencer does not exist in the sequencer set |
| 1 | VALIDATING | The sequencer is currently active and participating in consensus |
| 2 | ZOMBIE | The sequencer is not active (balance fell below ejection threshold, possibly due to slashing) but still has funds in the system |
| 3 | EXITING | The sequencer has initiated withdrawal and is in the exit delay period |

## Governance Operations

### Get Governance Contract Addresses

First, get the Governance contract from the Registry, then query it for the GovernanceProposer contract:

1. **Get Governance from Registry:**
   - Go to `https://etherscan.io/address/[REGISTRY_ADDRESS]#readContract`
   - Query `getGovernance()`
   - Copy the returned Governance contract address

2. **Get GovernanceProposer from Governance:**
   - Go to `https://etherscan.io/address/[GOVERNANCE_ADDRESS]#readContract`
   - Query `governanceProposer()`
   - Copy the returned GovernanceProposer contract address

### Check Governance Quorum Requirements

Query the quorum parameters on the GovernanceProposer contract:

Go to `https://etherscan.io/address/[GOVERNANCE_PROPOSER_ADDRESS]#readContract` and query:

| Function | Description |
|----------|-------------|
| `M()` | The size of any signaling round, measured in L2 blocks (e.g., 1000 blocks) |
| `N()` | The number of signals needed within a round for a payload to reach quorum (e.g., 750 signals, which is 75% of M) |

### Find the Current Round Number

Calculate which governance round corresponds to a specific L2 slot:

1. Go to `https://etherscan.io/address/[GOVERNANCE_PROPOSER_ADDRESS]#readContract`
2. Find the `computeRound` function
3. Enter the L2 slot number (e.g., `5000`)
4. Click **"Query"**

The result shows the round number. Etherscan displays values in both hex and decimal formats.

### Check Signal Count for a Payload

Check how many sequencers have signaled support for a specific payload in a given round:

1. Go to `https://etherscan.io/address/[GOVERNANCE_PROPOSER_ADDRESS]#readContract`
2. Find the `yeaCount` function
3. Enter the parameters:
   - `_instance`: Your Rollup contract address
   - `_round`: The round number (decimal)
   - `_payload`: The payload contract address
4. Click **"Query"**

The result shows the number of signals the payload has received. Compare this to the quorum threshold (N) to determine if the payload can be promoted to a proposal.

### Get Current Proposal Count

Check how many governance proposals exist:

1. Go to `https://etherscan.io/address/[GOVERNANCE_CONTRACT_ADDRESS]#readContract`
2. Query `proposalCount()`

### Query a Specific Proposal

Get details about a specific proposal:

1. Go to `https://etherscan.io/address/[GOVERNANCE_CONTRACT_ADDRESS]#readContract`
2. Find the `proposals` function
3. Enter the proposal ID (zero-indexed, so the first proposal is `0`)
4. Click **"Query"**

The result shows the proposal struct containing:
- Payload address
- Creation timestamp
- Voting start and end times
- Current vote tallies

## Tips and Best Practices

### Bookmarking Contract Pages

For frequently accessed contracts, bookmark the Etherscan Read Contract pages:

- Registry: `https://etherscan.io/address/[REGISTRY]#readContract`
- Rollup: `https://etherscan.io/address/[ROLLUP]#readContract`
- GSE: `https://etherscan.io/address/[GSE]#readContract`
- Governance: `https://etherscan.io/address/[GOVERNANCE]#readContract`

For testnet, use `sepolia.etherscan.io` instead.

### Monitoring Automation

For automated monitoring, consider using:
- **Etherscan API**: Query contract state programmatically without exposing keys
- **The Graph**: Create custom subgraphs for Aztec contract events
- **Block explorers**: Set up address watch alerts on Etherscan

This helps you:
- Track your sequencer's health
- Monitor governance proposals you care about
- Receive alerts when action is needed

### Understanding Etherscan Output

Etherscan automatically handles data formatting:
- **Addresses**: Displayed in checksum format with links
- **Numbers**: Shown in both hex and decimal
- **Structs**: Expanded with labeled fields
- **Booleans**: Displayed as `true` or `false`

### Checking ETH Balances

To check an address's ETH balance:

1. Go to `https://etherscan.io/address/[ADDRESS]`
2. The balance is displayed at the top of the page

For testnet balances, use `https://sepolia.etherscan.io/address/[ADDRESS]`

## Troubleshooting

### Query Returns Empty or Zero

**Issue**: Etherscan query returns empty data or all zeros.

**Solutions**:
- Verify the contract address is correct for your network (mainnet vs testnet)
- Check that you're using the correct Etherscan domain (`etherscan.io` for mainnet, `sepolia.etherscan.io` for testnet)
- Ensure the sequencer or address you're querying exists in the system
- Verify the contract is verified on Etherscan (unverified contracts may not show the Read Contract interface)

### "Execution Reverted" Error

**Issue**: Query shows "execution reverted" in Etherscan.

**Solutions**:
- Verify you're entering parameters in the correct format (addresses with `0x` prefix)
- Check that address parameters are valid Ethereum addresses
- Ensure numeric parameters are within valid ranges
- Verify the contract is deployed on the network you're querying

### Contract Not Verified

**Issue**: The "Read Contract" tab doesn't appear on Etherscan.

**Solutions**:
- The contract may not be verified—contact the Aztec team for verification status
- Try using "Read as Proxy" if available
- Check if there's a proxy contract you should be interacting with instead

### Wrong Network

**Issue**: Queries return unexpected results or contract not found.

**Solutions**:
- Verify you're on the correct Etherscan domain:
  - Mainnet: `etherscan.io`
  - Sepolia testnet: `sepolia.etherscan.io`
- Double-check the contract address for your target network
- Contract addresses differ between mainnet and testnet deployments

## Next Steps

- [Learn about sequencer management](../../setup/sequencer_management) to operate your sequencer node
- [Participate in governance](./creating_and_voting_on_proposals.md) by signaling, voting, and creating proposals
- [Monitor your node](../monitoring.md) with metrics and observability tools
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and community discussions
