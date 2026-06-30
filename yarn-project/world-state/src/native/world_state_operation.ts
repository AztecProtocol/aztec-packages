/**
 * Names of the world-state operations, used as labels for instrumentation and
 * logging. (Read/write ordering is enforced server-side by the wsdb scheduler,
 * so there is no longer a client-side operation queue.)
 */
export type WorldStateOperationName =
  | 'getTreeInfo'
  | 'getStateReference'
  | 'getInitialStateReference'
  | 'getLeafValue'
  | 'getLeafPreimage'
  | 'getSiblingPath'
  | 'getBlockNumbersForLeafIndices'
  | 'findLeafIndices'
  | 'findLowLeaf'
  | 'findSiblingPaths'
  | 'appendLeaves'
  | 'batchInsert'
  | 'sequentialInsert'
  | 'updateArchive'
  | 'syncBlock'
  | 'createFork'
  | 'deleteFork'
  | 'finalizeBlocks'
  | 'unwindBlocks'
  | 'removeHistoricalBlocks'
  | 'getStatus'
  | 'createCheckpoint'
  | 'commitCheckpoint'
  | 'revertCheckpoint'
  | 'commitAllCheckpoints'
  | 'revertAllCheckpoints'
  | 'copyStores';
