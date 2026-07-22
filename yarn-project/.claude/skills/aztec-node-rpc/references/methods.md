# Aztec node RPC methods

Method names on the wire are `<namespace>_<method>` (e.g. `aztec_getBlock`). Sourced from the
Zod API schemas in `yarn-project/stdlib/src/interfaces/`. Read those files for exact
parameter and return types.

## `aztec_*` — main API (port 8080, no auth)

`AztecNodeApiSchema` (`interfaces/client/aztec-node.ts`). Legacy alias: `node_*`.

**Chain / blocks / checkpoints**
- `getBlockNumber`, `getCheckpointNumber`, `getChainTips`
- `getBlock`, `getBlocks`, `getBlockData`
- `getCheckpoint`, `getCheckpoints`, `getCheckpointsData`
- `getSyncedL2SlotNumber`, `getSyncedL2EpochNumber`, `getSyncedL1Timestamp`
- `getWorldStateSyncStatus`, `isReady`

**Node / protocol info**
- `getNodeInfo`, `getNodeVersion`, `getVersion`, `getChainId`
- `getL1Constants`, `getL1ContractAddresses`, `getProtocolContractAddresses`

**Transactions**
- `sendTx`
- `getTxReceipt`, `getTxEffect`, `getTxByHash`, `getTxsByHash`
- `getPendingTxs`, `getPendingTxCount`
- `isValidTx`, `simulatePublicCalls`

**State / contracts / logs**
- `getPublicStorageAt`, `getContract`, `getContractClass`
- `getPrivateLogsByTags`, `getPublicLogsByTags`
- `getL2ToL1Messages`, `getL1ToL2MessageCheckpoint`
- `findLeavesIndexes`
- membership witnesses: `getNullifierMembershipWitness`, `getLowNullifierMembershipWitness`,
  `getPublicDataWitness`, `getBlockHashMembershipWitness`, `getNoteHashMembershipWitness`,
  `getL1ToL2MessageMembershipWitness`, `getL2ToL1MembershipWitness`

**Fees / validators**
- `getCurrentMinFees`, `getPredictedMinFees`, `getMaxPriorityFees`
- `getValidatorsStats`, `getValidatorStats`

## `p2p_*` — p2p API (port 8080, no auth)

`P2PApiSchema` (`interfaces/server/p2p.ts`).
- `getPeers`, `getEncodedEnr`
- `getPendingTxs`, `getPendingTxCount`
- `getCheckpointAttestationsForSlot`

## `aztecAdmin_*` — admin API (port 8880, API key required)

`AztecNodeAdminApiSchema` (`interfaces/client/aztec-node-admin.ts`). Legacy alias: `nodeAdmin_*`.
- `getConfig`, `setConfig`
- `pauseSync`, `resumeSync`, `pauseSequencer`, `resumeSequencer`
- `rollbackTo`, `startSnapshotUpload`
- `getSlashOffenses`, `reloadKeystore`

## `aztecDebug_*` — debug API (port 8080, only when node started with debug)

`AztecNodeDebugApiSchema` (`interfaces/client/aztec-node-debug.ts`). Legacy alias: `nodeDebug_*`.
- `mineBlock`, `prove`
- `warpL2TimeAtLeastTo`, `warpL2TimeAtLeastBy`
- `registerContractFunctionSignatures`

## `prover_*` — prover-node API (port 8880, API key required; prover nodes only)

`ProverNodeApiSchema` (`interfaces/server/prover-node.ts`).
- `getJobs`, `startProof`
