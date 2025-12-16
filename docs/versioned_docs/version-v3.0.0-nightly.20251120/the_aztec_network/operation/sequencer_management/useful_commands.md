---
sidebar_position: 5
title: Useful Commands
description: Essential cast commands for querying Registry, Rollup, and Governance contracts as a sequencer operator.
---

## Overview

This reference provides commands for common sequencer operator tasks. You'll use Foundry's `cast` command to query onchain contract state, check sequencer status, and monitor governance processes.

If you need help with something not covered here, visit the [Aztec Discord](https://discord.gg/aztec) in the `#operator-faq` channel.

## Prerequisites

Before using these commands, ensure you have:

- **Foundry installed** with the `cast` command available ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- **Aztec CLI tool** installed (see [prerequisites guide](../../prerequisites.md#aztec-toolchain))
- **Ethereum RPC endpoint** (execution layer) for the network you're querying
- **Contract addresses** for your deployment (Registry, Rollup, Governance)

## Getting Started

### Set Up Your Environment

For convenience, set your RPC URL as an environment variable:

```bash
export RPC_URL="https://your-ethereum-rpc-endpoint.com"
```

All examples below use `--rpc-url $RPC_URL`. In production, always include this flag with your actual RPC endpoint.

### Understanding Deployments

Assume there are multiple deployments of Aztec, such as `testnet` and `ignition-testnet`. Each deployment has a unique Registry contract address that remains constant across upgrades. If a governance upgrade deploys a new rollup contract, the Registry contract address stays the same.

<!-- The Registry contract for a particular deployment can be retrieved from the [Chain Info](../..link) page. -->

### Find the Registry Contract Address

The Registry contract is your entrypoint to all other contracts for a specific deployment. You'll need this address to discover other contract addresses.

Contact the Aztec team or check the documentation for the Registry contract address for your target network (testnet, ignition-testnet, etc.).

### Get the Rollup Contract Address

Once you have the Registry address, retrieve the Rollup contract:

```bash
cast call [REGISTRY_CONTRACT_ADDRESS] "getCanonicalRollup()" --rpc-url $RPC_URL
```

Replace `[REGISTRY_CONTRACT_ADDRESS]` with your actual Registry contract address.

**Example:**
```bash
cast call 0x1234567890abcdef1234567890abcdef12345678 "getCanonicalRollup()" --rpc-url $RPC_URL
```

This returns the Rollup contract address in hexadecimal format.

## Query the Sequencer Set

### Get the GSE Contract Address

The GSE (Governance Staking Escrow) contract manages sequencer registrations and balances. Get its address from the Rollup contract:

```bash
cast call [ROLLUP_ADDRESS] "getGSE()" --rpc-url $RPC_URL
```

This returns the GSE contract address, which you'll need for some queries below.

### Count Active Sequencers

Get the total number of active sequencers in the set:

```bash
cast call [ROLLUP_ADDRESS] "getActiveAttesterCount()" --rpc-url $RPC_URL
```

This returns the count of currently active sequencers as a hexadecimal number.

### List Sequencers by Index

Retrieve individual sequencer addresses by their index (0-based):

```bash
cast call [ROLLUP_ADDRESS] "getAttesterAtIndex(uint256)" [INDEX] --rpc-url $RPC_URL
```

Replace:
- `[ROLLUP_ADDRESS]` - Your Rollup contract address
- `[INDEX]` - The index of the sequencer (starting from 0)

**Example:**
```bash
# Get the first sequencer (index 0)
cast call 0xabcdef1234567890abcdef1234567890abcdef12 "getAttesterAtIndex(uint256)" 0 --rpc-url $RPC_URL

# Get the second sequencer (index 1)
cast call 0xabcdef1234567890abcdef1234567890abcdef12 "getAttesterAtIndex(uint256)" 1 --rpc-url $RPC_URL
```

### Check Sequencer Status

Query the complete status and information for a specific sequencer:

```bash
cast call [ROLLUP_ADDRESS] "getAttesterView(address)" [ATTESTER_ADDRESS] --rpc-url $RPC_URL
```

Replace:
- `[ROLLUP_ADDRESS]` - Your Rollup contract address
- `[ATTESTER_ADDRESS]` - The sequencer's attester address you want to check

**Example:**
```bash
cast call 0xabcdef1234567890abcdef1234567890abcdef12 "getAttesterView(address)" 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb --rpc-url $RPC_URL
```

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

Query specific pieces of information using the GSE contract:

```bash
# Check if a sequencer is registered
cast call [GSE_ADDRESS] "isRegistered(address,address)" [ROLLUP_ADDRESS] [ATTESTER_ADDRESS] --rpc-url $RPC_URL

# Get sequencer's balance on this rollup instance
cast call [GSE_ADDRESS] "balanceOf(address,address)" [ROLLUP_ADDRESS] [ATTESTER_ADDRESS] --rpc-url $RPC_URL

# Get sequencer's effective balance (includes bonus if latest rollup)
cast call [GSE_ADDRESS] "effectiveBalanceOf(address,address)" [ROLLUP_ADDRESS] [ATTESTER_ADDRESS] --rpc-url $RPC_URL

# Get sequencer's configuration (withdrawer and public key)
cast call [ROLLUP_ADDRESS] "getConfig(address)" [ATTESTER_ADDRESS] --rpc-url $RPC_URL

# Get only the status
cast call [ROLLUP_ADDRESS] "getStatus(address)" [ATTESTER_ADDRESS] --rpc-url $RPC_URL
```

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

```bash
# Get the Governance contract
cast call [REGISTRY_ADDRESS] "getGovernance()" --rpc-url $RPC_URL

# Get the GovernanceProposer contract
cast call [GOVERNANCE_ADDRESS] "governanceProposer()" --rpc-url $RPC_URL
```

Replace `[REGISTRY_ADDRESS]` and `[GOVERNANCE_ADDRESS]` with your actual addresses.

### Check Governance Quorum Requirements

Query the quorum parameters for the governance system:

```bash
# Get the signaling round size (in L2 blocks)
cast call [GOVERNANCE_PROPOSER_ADDRESS] "M()" --rpc-url $RPC_URL

# Get the number of signals required for quorum in any single round
cast call [GOVERNANCE_PROPOSER_ADDRESS] "N()" --rpc-url $RPC_URL
```

**What these values mean:**
- **M()** - The size of any signaling round, measured in L2 blocks (e.g., 1000 blocks)
- **N()** - The number of signals needed within a round for a payload to reach quorum (e.g., 750 signals, which is 75% of M)

### Find the Current Round Number

Calculate which governance round corresponds to a specific L2 slot:

```bash
cast call [GOVERNANCE_PROPOSER_ADDRESS] "computeRound(uint256)" [SLOT_NUMBER] --rpc-url $RPC_URL
```

Replace:
- `[GOVERNANCE_PROPOSER_ADDRESS]` - Your GovernanceProposer contract address
- `[SLOT_NUMBER]` - The L2 slot number you want to check

This returns the round number in hexadecimal format. Convert it to decimal for use in the next command.

**Example:**
```bash
# Check which round slot 5000 belongs to
cast call 0x9876543210abcdef9876543210abcdef98765432 "computeRound(uint256)" 5000 --rpc-url $RPC_URL

# Output: 0x0000000000000000000000000000000000000000000000000000000000000005 (round 5)
```

### Check Signal Count for a Payload

Check how many sequencers have signaled support for a specific payload in a given round:

```bash
cast call [GOVERNANCE_PROPOSER_ADDRESS] "yeaCount(address,uint256,address)" [ROLLUP_ADDRESS] [ROUND_NUMBER] [PAYLOAD_ADDRESS] --rpc-url $RPC_URL
```

Replace:
- `[GOVERNANCE_PROPOSER_ADDRESS]` - Your GovernanceProposer contract address
- `[ROLLUP_ADDRESS]` - Your Rollup contract address
- `[ROUND_NUMBER]` - The round number as a decimal integer (not hex)
- `[PAYLOAD_ADDRESS]` - The address of the payload contract you're checking

**Example:**
```bash
cast call 0x9876543210abcdef9876543210abcdef98765432 "yeaCount(address,uint256,address)" 0xabcdef1234567890abcdef1234567890abcdef12 5 0x1111111111111111111111111111111111111111 --rpc-url $RPC_URL
```

This returns the number of signals the payload has received in that round. Compare this to the quorum threshold (N) to determine if the payload can be promoted to a proposal.

### Get Current Proposal Count

Check how many governance proposals exist:

```bash
cast call [GOVERNANCE_CONTRACT_ADDRESS] "proposalCount()" --rpc-url $RPC_URL
```

### Query a Specific Proposal

Get details about a specific proposal:

```bash
cast call [GOVERNANCE_CONTRACT_ADDRESS] "proposals(uint256)" [PROPOSAL_ID] --rpc-url $RPC_URL
```

Replace:
- `[GOVERNANCE_CONTRACT_ADDRESS]` - Your Governance contract address
- `[PROPOSAL_ID]` - The proposal ID (zero-indexed, so the first proposal is 0)

This returns the proposal struct containing:
- Payload address
- Creation timestamp
- Voting start and end times
- Current vote tallies

## Tips and Best Practices

### Using Etherscan

You can also query these contracts through Etherscan's "Read Contract" interface:

1. Navigate to the contract address on Etherscan
2. Go to the "Contract" tab
3. Click "Read Contract" or "Read as Proxy"
4. Find the function you want to call and enter parameters

This provides a user-friendly interface without requiring command-line tools.

### Monitoring Automation

Consider creating scripts that regularly query sequencer status and governance signals. This helps you:
- Track your sequencer's health
- Monitor governance proposals you care about
- Receive alerts when action is needed

### Decoding Hex Output

Some commands return hexadecimal values. Use `cast` to convert them:

```bash
# Convert hex to decimal
cast --to-dec 0x03e8

# Convert hex to address format
cast --to-address 0x000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

## Troubleshooting

### "Invalid JSON RPC response"

**Issue**: Command fails with JSON RPC error.

**Solutions**:
- Verify your RPC endpoint is accessible and correct
- Check that you're connected to the right network (Sepolia for testnet)
- Ensure your RPC provider supports the `eth_call` method
- Try a different RPC endpoint

### "Reverted" or "Execution reverted"

**Issue**: Contract call reverts.

**Solutions**:
- Verify the contract address is correct
- Check that the function signature matches the contract's ABI
- Ensure you're passing the correct parameter types
- Verify the contract is deployed on the network you're querying

### "Could not find function"

**Issue**: Function not found in contract.

**Solutions**:
- Verify the function name spelling and capitalization
- Check that you're querying the correct contract
- Ensure the contract version matches the function you're calling
- Try querying through Etherscan to verify the contract ABI

## Next Steps

- [Learn about sequencer management](../../setup/sequencer_management) to operate your sequencer node
- [Participate in governance](./creating_and_voting_on_proposals.md) by signaling, voting, and creating proposals
- [Monitor your node](../monitoring.md) with metrics and observability tools
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and community discussions
