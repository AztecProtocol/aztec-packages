---
id: node_api_reference
sidebar_position: 2
title: Node JSON RPC API reference
description: Complete reference for the Aztec Node JSON RPC API, including block queries, transaction submission, world state access, and administrative operations.
---

This document provides a complete reference for the Aztec Node JSON RPC API. All methods are exposed via JSON RPC on the node's configured port (default: 8080).

## API endpoint

**Default URL**: `http://localhost:8080`

**Admin URL**: `http://localhost:8880` (for admin methods)

All methods use standard JSON RPC 2.0 format with methods prefixed by `node_` or `nodeAdmin_`.

## Block queries

### node_getBlockNumber

Returns the latest block number synchronized by the node.

**Parameters**: None

**Returns**: `number`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getBlockNumber","params":[],"id":1}'
```

### node_getProvenBlockNumber

Returns the latest proven block number.

**Parameters**: None

**Returns**: `number`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getProvenBlockNumber","params":[],"id":1}'
```

### node_getL2Tips

Returns the tips of the L2 chain (latest, pending, proven).

**Parameters**: None

**Returns**: Object containing `latest`, `pending`, and `proven` block info

**Example**:
```bash
curl -s -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
  | jq -r ".result.proven.number"
```

### node_getBlock

Gets a block by its number.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number or "latest"

**Returns**: `L2Block | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getBlock","params":[12345],"id":1}'
```

### node_getBlocks

Gets multiple blocks in a range.

**Parameters**:
1. `from` - `number` - Starting block number (≥ 1)
2. `limit` - `number` - Max blocks to return (1-100)

**Returns**: `L2Block[]`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getBlocks","params":[100,50],"id":1}'
```

### node_getBlockHeader

Gets a block header.

**Parameters**:
1. `blockNumber` - `number | "latest" | undefined` - Block number or omit for latest

**Returns**: `BlockHeader | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getBlockHeader","params":["latest"],"id":1}'
```

## Transaction operations

### node_sendTx

Submits a transaction to the P2P mempool.

**Parameters**:
1. `tx` - `Tx` - The transaction object

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_sendTx","params":[{"data":"0x..."}],"id":1}'
```

### node_getTxReceipt

Gets a transaction receipt.

**Parameters**:
1. `txHash` - `string` - Transaction hash (32-byte hex)

**Returns**: `TxReceipt` - Receipt with status (mined, pending, or dropped)

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getTxReceipt","params":["0x1234..."],"id":1}'
```

### node_getTxEffect

Gets the transaction effect for a given transaction.

**Parameters**:
1. `txHash` - `string` - Transaction hash

**Returns**: `IndexedTxEffect | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getTxEffect","params":["0x1234..."],"id":1}'
```

### node_getTxByHash

Gets a single pending transaction by hash.

**Parameters**:
1. `txHash` - `string` - Transaction hash

**Returns**: `Tx | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getTxByHash","params":["0x1234..."],"id":1}'
```

### node_getPendingTxs

Gets pending transactions from the mempool.

**Parameters**:
1. `limit` - `number | undefined` - Max txs to return (1-100, default: 100)
2. `after` - `string | undefined` - Return txs after this tx hash

**Returns**: `Tx[]`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPendingTxs","params":[50],"id":1}'
```

### node_getPendingTxCount

Gets the count of pending transactions.

**Parameters**: None

**Returns**: `number`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPendingTxCount","params":[],"id":1}'
```

### node_isValidTx

Validates a transaction for correctness.

**Parameters**:
1. `tx` - `Tx` - Transaction to validate
2. `options` - `object | undefined` - Options: `isSimulation`, `skipFeeEnforcement`

**Returns**: `TxValidationResult`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_isValidTx","params":[{"data":"0x..."},{"isSimulation":true}],"id":1}'
```

### node_simulatePublicCalls

Simulates the public part of a transaction.

**Parameters**:
1. `tx` - `Tx` - Transaction to simulate
2. `skipFeeEnforcement` - `boolean | undefined` - Skip fee enforcement

**Returns**: `PublicSimulationOutput`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_simulatePublicCalls","params":[{"data":"0x..."},false],"id":1}'
```

## State queries

### node_getPublicStorageAt

Gets public storage value at a contract slot.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `contract` - `string` - Contract address (32-byte hex)
3. `slot` - `string` - Storage slot (32-byte hex)

**Returns**: `string` - Storage value (32-byte hex)

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPublicStorageAt","params":["latest","0x1234...","0x0000..."],"id":1}'
```

### node_getWorldStateSyncStatus

Gets the sync status of the node's world state.

**Parameters**: None

**Returns**: `WorldStateSyncStatus`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getWorldStateSyncStatus","params":[],"id":1}'
```

## Merkle tree queries

### node_findLeavesIndexes

Finds indexes of leaves in a merkle tree.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `treeId` - `number` - Tree ID (0-6)
3. `leafValues` - `string[]` - Leaf values (max 1000, 32-byte hex each)

**Tree IDs**:
- `0` - NULLIFIER_TREE
- `1` - NOTE_HASH_TREE
- `2` - PUBLIC_DATA_TREE
- `3` - L1_TO_L2_MESSAGE_TREE
- `4` - ARCHIVE
- `5` - BLOCKS_TREE

**Returns**: Array of leaf indexes with block metadata

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_findLeavesIndexes","params":["latest",1,["0x1234...","0x5678..."]],"id":1}'
```

### node_getNullifierSiblingPath

Gets sibling path for a nullifier tree leaf.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `leafIndex` - `string` - Leaf index (bigint as string)

**Returns**: `string[]` - Sibling path

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNullifierSiblingPath","params":[12345,"100"],"id":1}'
```

### node_getNoteHashSiblingPath

Gets sibling path for a note hash tree leaf.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `leafIndex` - `string` - Leaf index (bigint as string)

**Returns**: `string[]` - Sibling path

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNoteHashSiblingPath","params":["latest","100"],"id":1}'
```

### node_getArchiveSiblingPath

Gets sibling path for an archive tree leaf.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `leafIndex` - `string` - Leaf index (bigint as string)

**Returns**: `string[]` - Sibling path

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getArchiveSiblingPath","params":[12345,"50"],"id":1}'
```

### node_getPublicDataSiblingPath

Gets sibling path for a public data tree leaf.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `leafIndex` - `string` - Leaf index (bigint as string)

**Returns**: `string[]` - Sibling path

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPublicDataSiblingPath","params":["latest","200"],"id":1}'
```

## Membership witnesses

### node_getNullifierMembershipWitness

Gets a nullifier membership witness.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `nullifier` - `string` - Nullifier value (32-byte hex)

**Returns**: `NullifierMembershipWitness | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNullifierMembershipWitness","params":[12345,"0x1234..."],"id":1}'
```

### node_getLowNullifierMembershipWitness

Gets a low nullifier membership witness for non-inclusion proofs.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `nullifier` - `string` - Nullifier value (32-byte hex)

**Returns**: `NullifierMembershipWitness | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getLowNullifierMembershipWitness","params":["latest","0x1234..."],"id":1}'
```

### node_getPublicDataWitness

Gets a public data tree witness for a leaf slot.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `leafSlot` - `string` - Leaf slot (32-byte hex)

**Returns**: `PublicDataWitness | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPublicDataWitness","params":[12345,"0x0000..."],"id":1}'
```

### node_getArchiveMembershipWitness

Gets archive tree membership witness.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `archive` - `string` - Archive leaf value (32-byte hex)

**Returns**: `MembershipWitness | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getArchiveMembershipWitness","params":[12345,"0x1234..."],"id":1}'
```

### node_getNoteHashMembershipWitness

Gets note hash tree membership witness.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `noteHash` - `string` - Note hash value (32-byte hex)

**Returns**: `MembershipWitness | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNoteHashMembershipWitness","params":["latest","0x1234..."],"id":1}'
```

## L1 to L2 messages

### node_getL1ToL2MessageMembershipWitness

Gets L1 to L2 message membership witness.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number
2. `l1ToL2Message` - `string` - L1 to L2 message (32-byte hex)

**Returns**: `[string, string[]] | null` - Tuple of [index, sibling path]

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ToL2MessageMembershipWitness","params":[12345,"0x1234..."],"id":1}'
```

### node_getL1ToL2MessageBlock

Gets the L2 block number when an L1 to L2 message becomes available.

**Parameters**:
1. `l1ToL2Message` - `string` - L1 to L2 message (32-byte hex)

**Returns**: `number | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ToL2MessageBlock","params":["0x1234..."],"id":1}'
```

### node_isL1ToL2MessageSynced

Checks if an L1 to L2 message is synced.

**Parameters**:
1. `l1ToL2Message` - `string` - L1 to L2 message (32-byte hex)

**Returns**: `boolean`

**Deprecated**: Use `node_getL1ToL2MessageBlock` instead.

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_isL1ToL2MessageSynced","params":["0x1234..."],"id":1}'
```

### node_getL2ToL1Messages

Gets all L2 to L1 messages in a block.

**Parameters**:
1. `blockNumber` - `number | "latest"` - Block number

**Returns**: `string[][] | null` - Array of message arrays

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL2ToL1Messages","params":[12345],"id":1}'
```

## Log queries

### node_getPrivateLogs

Gets private logs from a block range.

**Parameters**:
1. `from` - `number` - Starting block (≥ 1)
2. `limit` - `number` - Number of blocks (max 1000)

**Returns**: `PrivateLog[]`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPrivateLogs","params":[100,50],"id":1}'
```

### node_getPublicLogs

Gets public logs based on filter.

**Parameters**:
1. `filter` - `LogFilter` - Filter object with `fromBlock`, `toBlock`, `contractAddress`, etc.

**Returns**: `GetPublicLogsResponse`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getPublicLogs","params":[{"fromBlock":100,"toBlock":200}],"id":1}'
```

### node_getContractClassLogs

Gets contract class logs based on filter.

**Parameters**:
1. `filter` - `LogFilter` - Filter object

**Returns**: `GetContractClassLogsResponse`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getContractClassLogs","params":[{"fromBlock":100}],"id":1}'
```

### node_getLogsByTags

Gets logs matching specific tags.

**Parameters**:
1. `tags` - `string[]` - Array of tags (max 1000, 32-byte hex each)
2. `logsPerTag` - `number | undefined` - Max logs per tag (1-10, default: 10)

**Returns**: `TxScopedL2Log[][]` - For each tag, array of matching logs

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getLogsByTags","params":[["0x1234...","0x5678..."],10],"id":1}'
```

## Contract queries

### node_getContractClass

Gets a registered contract class by ID.

**Parameters**:
1. `id` - `string` - Contract class ID (32-byte hex)

**Returns**: `ContractClassPublic | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getContractClass","params":["0x1234..."],"id":1}'
```

### node_getContract

Gets a deployed contract instance by address.

**Parameters**:
1. `address` - `string` - Contract address (32-byte hex)

**Returns**: `ContractInstanceWithAddress | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getContract","params":["0x1234..."],"id":1}'
```

## Node information

### node_isReady

Checks if the node is ready to accept transactions.

**Parameters**: None

**Returns**: `boolean`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_isReady","params":[],"id":1}'
```

### node_getNodeInfo

Gets information about the node.

**Parameters**: None

**Returns**: `NodeInfo` - Node version, protocol version, chain ID, contracts, etc.

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","params":[],"id":42}'
```

### node_getNodeVersion

Gets the node package version.

**Parameters**: None

**Returns**: `string`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getNodeVersion","params":[],"id":1}'
```

### node_getVersion

Gets the rollup protocol version.

**Parameters**: None

**Returns**: `number`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getVersion","params":[],"id":1}'
```

### node_getChainId

Gets the L1 chain ID.

**Parameters**: None

**Returns**: `number`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getChainId","params":[],"id":1}'
```

### node_getL1ContractAddresses

Gets deployed L1 contract addresses.

**Parameters**: None

**Returns**: `L1ContractAddresses`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getL1ContractAddresses","params":[],"id":1}'
```

### node_getProtocolContractAddresses

Gets protocol contract addresses.

**Parameters**: None

**Returns**: `ProtocolContractAddresses`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getProtocolContractAddresses","params":[],"id":1}'
```

### node_getEncodedEnr

Gets the node's ENR for P2P discovery.

**Parameters**: None

**Returns**: `string | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getEncodedEnr","params":[],"id":1}'
```

### node_getCurrentBaseFees

Gets current base fees for transactions.

**Parameters**: None

**Returns**: `GasFees`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getCurrentBaseFees","params":[],"id":1}'
```

## Validator queries

### node_getValidatorsStats

Gets statistics for all validators.

**Parameters**: None

**Returns**: `ValidatorsStats`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getValidatorsStats","params":[],"id":1}'
```

### node_getValidatorStats

Gets statistics for a single validator.

**Parameters**:
1. `validatorAddress` - `string` - Validator address (20-byte hex)
2. `fromSlot` - `string | undefined` - Starting slot (bigint as string)
3. `toSlot` - `string | undefined` - Ending slot (bigint as string)

**Returns**: `SingleValidatorStats | null`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getValidatorStats","params":["0x1234...","100","200"],"id":1}'
```

## Debug operations

### node_registerContractFunctionSignatures

Registers contract function signatures for debugging.

**Parameters**:
1. `functionSignatures` - `string[]` - Array of function signatures (max 100)

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_registerContractFunctionSignatures","params":[["transfer(address,uint256)"]],"id":1}'
```

### node_getAllowedPublicSetup

Gets the list of allowed public setup function calls.

**Parameters**: None

**Returns**: `AllowedElement[]`

**Example**:
```bash
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"node_getAllowedPublicSetup","params":[],"id":1}'
```

## Admin API

Administrative operations are exposed on port 8880 under the `nodeAdmin_` namespace.

### nodeAdmin_getConfig

Gets the current node configuration.

**Parameters**: None

**Returns**: `AztecNodeAdminConfig`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getConfig","params":[],"id":1}'
```

### nodeAdmin_setConfig

Updates the node configuration.

**Parameters**:
1. `config` - `Partial<AztecNodeAdminConfig>` - Configuration updates

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_setConfig","params":[{"archiverPollingIntervalMS":1000}],"id":1}'
```

### nodeAdmin_pauseSync

Pauses archiver and world state syncing.

**Parameters**: None

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_pauseSync","params":[],"id":1}'
```

### nodeAdmin_resumeSync

Resumes archiver and world state syncing.

**Parameters**: None

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_resumeSync","params":[],"id":1}'
```

### nodeAdmin_rollbackTo

Rolls back the database to a target block.

**Parameters**:
1. `targetBlockNumber` - `number` - Block to roll back to
2. `force` - `boolean | undefined` - Clear world state/p2p if needed

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_rollbackTo","params":[12000,true],"id":1}'
```

### nodeAdmin_startSnapshotUpload

Starts uploading a database snapshot.

**Parameters**:
1. `location` - `string` - Upload location/URL

**Returns**: `void`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_startSnapshotUpload","params":["gs://bucket/snapshots/"],"id":1}'
```

### nodeAdmin_getSlashPayloads

Gets all monitored slash payloads for the current round.

**Parameters**: None

**Returns**: `SlashPayloadRound[]`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getSlashPayloads","params":[],"id":1}'
```

### nodeAdmin_getSlashOffenses

Gets all offenses for a specific round.

**Parameters**:
1. `round` - `string | "all" | "current"` - Round number or "all"/"current"

**Returns**: `Offense[]`

**Example**:
```bash
curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getSlashOffenses","params":["current"],"id":1}'
```

## Next steps

- [How to Run a Sequencer Node](../setup/sequencer_management) - Set up a node
- [Ethereum RPC Calls Reference](./ethereum_rpc_reference.md) - L1 RPC usage
- [CLI Reference](./cli_reference.md) - Command-line options
- [Aztec Discord](https://discord.gg/aztec) - Developer support
