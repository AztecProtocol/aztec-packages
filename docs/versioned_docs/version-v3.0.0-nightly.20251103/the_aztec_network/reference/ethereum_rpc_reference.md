---
id: ethereum_rpc_reference
sidebar_position: 3
title: Ethereum RPC call reference
description: A comprehensive reference of Ethereum RPC calls used by different Aztec node components, including archiver, sequencer, prover, and slasher nodes.
---

This guide provides a comprehensive reference of Ethereum RPC calls used by different Aztec node components. Understanding these calls helps with infrastructure planning, monitoring, and debugging.

## Prerequisites

Before proceeding, you should:

- Understand how Aztec nodes interact with Ethereum L1
- Be familiar with Ethereum JSON-RPC API specifications
- Have basic knowledge of the viem library (Aztec's Ethereum client library)

## Overview

Aztec nodes interact with Ethereum L1 through the [viem](https://viem.sh) library, which provides a type-safe interface to Ethereum JSON-RPC methods. Different node components make different RPC calls based on their responsibilities:

- **Archiver**: Monitors L1 for new blocks and events
- **Sequencer**: Proposes blocks and submits them to L1
- **Prover**: Submits proofs to L1
- **Validator**: Reads L1 state for validation
- **Slasher**: Monitors for misbehavior and submits slashing payloads

## RPC call mapping

This table shows the Ethereum JSON-RPC calls used by Aztec nodes:

| Ethereum RPC Call | Description |
|------------------|-------------|
| `eth_getBlockByNumber` | Retrieve block information |
| `eth_blockNumber` | Get latest block number |
| `eth_getTransactionByHash` | Get transaction details |
| `eth_getTransactionReceipt` | Get transaction receipt |
| `eth_getTransactionCount` | Get account nonce |
| `eth_getLogs` | Retrieve event logs |
| `eth_getBalance` | Get account ETH balance |
| `eth_getCode` | Get contract bytecode |
| `eth_getStorageAt` | Read contract storage slot |
| `eth_chainId` | Get chain identifier |
| `eth_estimateGas` | Estimate gas for transaction |
| `eth_call` | Execute read-only call |
| `eth_sendRawTransaction` | Broadcast signed transaction |
| `eth_gasPrice` | Get current gas price |
| `eth_maxPriorityFeePerGas` | Get priority fee (EIP-1559) |

## Archiver node

The archiver continuously monitors L1 for new blocks and retrieves historical data.

### Block retrieval

**Purpose**: Sync L2 block data published to L1

**RPC calls used**:
- `eth_blockNumber` - Get latest L1 block number
- `eth_getLogs` - Retrieve rollup contract events
- `eth_getBlockByNumber` - Get block timestamps and metadata

**Example RPC calls**:
```json
// eth_blockNumber
{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}

// eth_getLogs
{"jsonrpc":"2.0","method":"eth_getLogs","params":[{
  "fromBlock":"0x100",
  "toBlock":"0x200",
  "address":"0x...",
  "topics":["0x..."]
}],"id":2}

// eth_getBlockByNumber
{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["0x100",false],"id":3}
```

### L1 to L2 message retrieval

**Purpose**: Track messages sent from L1 to L2

**RPC calls used**:
- `eth_getLogs` - Retrieve `MessageSent` events from Inbox contract

### Contract event monitoring

**Purpose**: Monitor contract deployments and updates

**RPC calls used**:
- `eth_getLogs` - Retrieve events from ClassRegistry and InstanceRegistry

**Events monitored**:
- `ContractClassPublished`
- `ContractInstancePublished`
- `ContractInstanceUpdated`
- `PrivateFunctionBroadcasted`
- `UtilityFunctionBroadcasted`

## Sequencer node

Sequencers propose blocks and submit them to L1, they also read L1 state to validate blocks and participate in consensus.

### Transaction broadcasting

**Purpose**: Submit block proposals to L1

**RPC calls used**:
- `eth_getTransactionCount` - Get nonce for sender account
- `eth_estimateGas` - Estimate gas for proposal transaction
- `eth_sendRawTransaction` - Broadcast signed transaction
- `eth_getTransactionReceipt` - Verify transaction inclusion

**Example RPC calls**:
```json
// eth_getTransactionCount
{"jsonrpc":"2.0","method":"eth_getTransactionCount","params":["0x...","latest"],"id":1}

// eth_estimateGas
{"jsonrpc":"2.0","method":"eth_estimateGas","params":[{
  "from":"0x...",
  "to":"0x...",
  "data":"0x..."
}],"id":2}

// eth_sendRawTransaction
{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["0x..."],"id":3}

// eth_getTransactionReceipt
{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0x..."],"id":4}
```

### State reading

**Purpose**: Read rollup state and validate proposals

**RPC calls used**:
- `eth_call` - Read contract state
- `eth_getStorageAt` - Read specific storage slots
- `eth_blockNumber` - Get current L1 block for validation context
- `eth_getBlockByNumber` - Get block timestamps

**Example RPC calls**:
```json
// eth_call
{"jsonrpc":"2.0","method":"eth_call","params":[{
  "to":"0x...",
  "data":"0x..."
},"latest"],"id":1}

// eth_getStorageAt
{"jsonrpc":"2.0","method":"eth_getStorageAt","params":["0x...","0x0","latest"],"id":2}
```

### Gas management

**Purpose**: Monitor gas prices and publisher account balances

**RPC calls used**:
- `eth_getBalance` - Check publisher account balance
- `eth_gasPrice` / `eth_maxPriorityFeePerGas` - Get current gas prices

### Block simulation

**Purpose**: Validate block proposals before submission

**RPC calls used**:
- `eth_call` - Simulate contract call to validate proposals

## Prover node

The prover submits validity proofs to L1.

### Proof submission

**Purpose**: Submit epoch proofs to the Rollup contract

**RPC calls used**:
- `eth_getTransactionCount` - Get nonce for prover publisher
- `eth_estimateGas` - Estimate gas for proof submission
- `eth_sendRawTransaction` - Broadcast proof transaction
- `eth_getTransactionReceipt` - Confirm proof inclusion

**Note**: Uses the same transaction flow as sequencer broadcasting

### Chain state monitoring

**Purpose**: Track L1 state for attestation validation

**RPC calls used**:
- `eth_getBlockByNumber` - Get L1 timestamps for epoch calculations
- `eth_chainId` - Verify connected to correct chain

## Slasher node

The slasher monitors for validator misbehavior and submits slashing payloads.

### Misbehavior detection

**Purpose**: Monitor for slashable offenses and create slash payloads

**RPC calls used**:
- `eth_getLogs` - Retrieve rollup events for analysis
- `eth_getBlockByNumber` - Get block timestamps for slashing proofs
- `eth_call` - Read validator state

### Slashing payload submission

**Purpose**: Submit slash payloads to L1

**RPC calls used**:
- `eth_getTransactionCount` - Get nonce for slasher account
- `eth_sendRawTransaction` - Broadcast slashing transaction
- `eth_getTransactionReceipt` - Verify slash transaction inclusion

**Note**: Uses the same transaction flow as sequencer broadcasting

## Shared infrastructure

Aztec provides shared transaction management utilities for all components that submit to L1.

### Core functionality

**RPC calls used**:
- `eth_getTransactionCount` - Nonce management
- `eth_estimateGas` - Gas estimation
- `eth_gasPrice` / `eth_maxPriorityFeePerGas` - Gas pricing (EIP-1559)
- `eth_sendRawTransaction` - Transaction broadcasting
- `eth_getTransactionReceipt` - Transaction status checking
- `eth_getTransactionByHash` - Transaction lookup for replacement
- `eth_getBlockByNumber` - Block timestamp for timeout checks
- `eth_getBalance` - Publisher balance monitoring

### Transaction lifecycle

1. **Preparation**: Estimate gas and get gas price
2. **Nonce management**: Get and track nonce via `NonceManager`
3. **Signing**: Sign transaction with keystore
4. **Broadcasting**: Send via `eth_sendRawTransaction`
5. **Monitoring**: Poll with `eth_getTransactionReceipt`
6. **Replacement**: Replace stuck transactions if needed
7. **Cancellation**: Send zero-value transaction to cancel

## RPC endpoint configuration

### Environment variables

Configure L1 RPC endpoints using:

```bash
# Single endpoint
ETHEREUM_HOSTS=https://eth-mainnet.example.com

# Multiple endpoints (fallback)
ETHEREUM_HOSTS=https://eth-mainnet-1.example.com,https://eth-mainnet-2.example.com

# Consensus endpoints for archiver
L1_CONSENSUS_HOST_URLS=https://beacon-node.example.com
```

### Fallback configuration

Aztec automatically retries failed requests on alternative endpoints when multiple RPC URLs are configured. This provides reliability and redundancy for critical operations.

## Monitoring and debugging

### RPC call logging

Enable detailed RPC logging:

```bash
LOG_LEVEL=debug # or verbose
```

Look for log entries related to:
- Transaction lifecycle and nonce management
- Block sync and event retrieval
- Block proposal submissions
- Contract interactions

### Common issues

**Issue**: `eth_getLogs` query exceeds limits

**Solution**:
- Reduce block range in queries
- Use archive node with higher limits
- Implement chunked log retrieval

**Issue**: Transaction replacement failures

**Solution**:
- Ensure `eth_getTransactionCount` returns consistent nonces
- Configure appropriate gas price bumps
- Monitor transaction pool status

**Issue**: Stale state reads

**Solution**:
- Use specific block tags (not `latest`)
- Disable caching with `cacheTime: 0`
- Ensure RPC node is fully synced

## Next steps

- Review [How to Run a Sequencer Node](../setup/sequencer_management) for operational guidance
- Learn about [High Availability Sequencers](../setup/high_availability_sequencers.md) for production redundancy configurations
- Explore [Advanced Keystore Patterns](../operation/keystore/advanced_patterns.md) for complex key management
- Check [Useful Commands](../operation/sequencer_management/useful_commands.md) for monitoring tools
- Join the [Aztec Discord](https://discord.gg/aztec) for infrastructure support
