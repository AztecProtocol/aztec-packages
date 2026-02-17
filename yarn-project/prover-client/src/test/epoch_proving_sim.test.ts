import { PROOF_DELAY_MS, WITGEN_DELAY_MS } from '@aztec/bb-prover/test';
import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '@aztec/constants';
import { insertIntoSortedArray } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

/**
 * Priority order for proof types - matches the real broker's PROOF_TYPES_IN_PRIORITY_ORDER
 * Lower index = higher priority (gets picked first)
 */
const PROOF_TYPES_IN_PRIORITY_ORDER: ProvingRequestType[] = [
  ProvingRequestType.ROOT_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP,
  ProvingRequestType.BLOCK_MERGE_ROLLUP,
  ProvingRequestType.CHECKPOINT_ROOT_ROLLUP,
  ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP,
  ProvingRequestType.CHECKPOINT_MERGE_ROLLUP,
  ProvingRequestType.CHECKPOINT_PADDING_ROLLUP,
  ProvingRequestType.TX_MERGE_ROLLUP,
  ProvingRequestType.PUBLIC_TX_BASE_ROLLUP,
  ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
  ProvingRequestType.PUBLIC_VM,
  ProvingRequestType.PUBLIC_CHONK_VERIFIER,
  ProvingRequestType.PARITY_ROOT,
  ProvingRequestType.PARITY_BASE, // Lowest priority
];

// Job represents a proving task with its hierarchical context
type Job = {
  checkpoint: number;
  block: number;
  type: ProvingRequestType;
  // For merge tree tracking (level 0 = root, higher = leaves)
  level?: number;
  index?: number;
  // Custom duration override (used for PUBLIC_VM variance)
  durationMs?: number;
};

type Queues = Record<ProvingRequestType, Array<Job>>;

// Worker represents an active proving job
type Worker = {
  job: Job;
  start: number;
  end: number;
};

// New type definitions for flexible test configuration
// Each public tx group: [count, avmDuration in ms]
type PublicTxGroup = [count: number, avmDurationMs: number];
// Block: [privateTxs, [publicCount, avmDuration], [publicCount, avmDuration], ...]
type Block = [privateTxs: number, ...publicGroups: PublicTxGroup[]];
// Checkpoint is an array of blocks
type Checkpoint = Block[];

type TestConfig = {
  name: string;
  workers: number;
  checkpoints: Checkpoint[];
};

// State tracking for dependency resolution
type SimState = {
  // Parity tracking (per checkpoint, first block only)
  baseParityComplete: Map<number, number>;
  rootParityComplete: Map<number, boolean>;

  // Public tx dependency tracking (aggregate per block)
  // Key format: "checkpoint-block"
  vmComplete: Map<string, number>;
  chonkComplete: Map<string, number>;
  publicBaseEnqueued: Map<string, number>;

  // TX merge tree tracking per block
  // Key format: "checkpoint-block-level"
  txTreeNodes: Map<string, Map<number, boolean>>; // levelKey -> index -> completed
  txTreeComplete: Map<string, boolean>; // block's tx tree root complete
  txTreeLeafCount: Map<string, number>; // total leaves (txs) per block
  txTreeNextLeafIndex: Map<string, number>; // next leaf index to assign per block

  // Block merge tree tracking per checkpoint
  // Key format: "checkpoint-level"
  blockTreeNodes: Map<string, Map<number, boolean>>;
  blockRootComplete: Map<number, boolean>;

  // Checkpoint merge tree tracking
  checkpointTreeNodes: Map<number, Map<number, boolean>>; // level -> index -> completed
  checkpointRootComplete: Map<number, boolean>;

  // Epoch level
  rootRollupComplete: boolean;

  // Block configuration for determining proof types
  blockConfigs: Map<string, Block>;
  blocksPerCheckpoint: Map<number, number>;
  isFirstBlock: Map<string, boolean>;
  totalCheckpoints: number;
};

function blockKey(checkpoint: number, block: number): string {
  return `${checkpoint}-${block}`;
}

function treeKey(checkpoint: number, block: number, level: number): string {
  return `${checkpoint}-${block}-${level}`;
}

function checkpointTreeKey(checkpoint: number, level: number): string {
  return `${checkpoint}-${level}`;
}

// ============================================================================
// Unbalanced Tree Functions - Ported from foundation/src/trees/unbalanced_merkle_tree.ts
// ============================================================================

// Get the depth of the maximum balanced tree that can be created with the given number of leaves.
function getMaxBalancedSubtreeDepth(numLeaves: number): number {
  if (numLeaves <= 0) {
    return 0;
  }
  return Math.floor(Math.log2(numLeaves));
}

// Get the maximum depth of an unbalanced tree that can be created with the given number of leaves.
function getMaxUnbalancedTreeDepth(numLeaves: number): number {
  if (numLeaves <= 0) {
    return 0;
  }
  return Math.ceil(Math.log2(numLeaves));
}

function findPosition(
  rootLevel: number,
  leafLevel: number,
  numLeaves: number,
  indexOffset: number,
  targetIndex: number,
): { level: number; indexAtLevel: number } {
  if (numLeaves <= 1) {
    // Single leaf.
    return { level: rootLevel, indexAtLevel: indexOffset };
  }

  // The largest balanced tree that can be created with the given number of leaves.
  const maxBalancedTreeDepth = getMaxBalancedSubtreeDepth(numLeaves);
  const numBalancedLeaves = 2 ** maxBalancedTreeDepth;
  const numRemainingLeaves = numLeaves - numBalancedLeaves;

  if (targetIndex < numBalancedLeaves) {
    // Target is in the balanced tree.
    // - If numRemainingLeaves is 0: this balanced tree is grown from the current root.
    // - If numRemainingLeaves is not 0: the remaining leaves will form another tree, which will become the right child of the root.
    //   And the balanced tree will be the left child of the root.
    //   There will be an extra level between the root of the balanced tree and the current root.
    const extraLevel = numRemainingLeaves ? 1 : 0;
    return { level: rootLevel + maxBalancedTreeDepth + extraLevel, indexAtLevel: indexOffset + targetIndex };
  } else {
    // Target is in the right branch.
    const rightBranchMaxLevel = getMaxUnbalancedTreeDepth(numRemainingLeaves);
    const shiftedUp = leafLevel - rootLevel - rightBranchMaxLevel - 1;
    const nextLeafLevel = leafLevel - shiftedUp;
    const newIndexOffset = (indexOffset + numBalancedLeaves) >> shiftedUp;
    const shiftedTargetIndex = targetIndex - numBalancedLeaves;
    return findPosition(rootLevel + 1, nextLeafLevel, numRemainingLeaves, newIndexOffset, shiftedTargetIndex);
  }
}

// Find the level and index for a leaf in an unbalanced tree.
// This is the key function that places leaves at different levels based on the tree structure.
function findLeafLevelAndIndex(numLeaves: number, leafIndex: number): { level: number; indexAtLevel: number } {
  if (numLeaves <= 0) {
    return { level: 0, indexAtLevel: 0 };
  }
  const maxLevel = getMaxUnbalancedTreeDepth(numLeaves);
  return findPosition(0, maxLevel, numLeaves, 0, leafIndex);
}

// ============================================================================
// Basic Tree Helper Functions
// ============================================================================

// Get parent index from child index
function getParentIndex(index: number): number {
  return Math.floor(index / 2);
}

// Get sibling index
function getSiblingIndex(index: number): number {
  return index % 2 === 0 ? index + 1 : index - 1;
}

function getJobDuration(job: Job): number {
  if (job.durationMs !== undefined) {
    return job.durationMs;
  }
  return WITGEN_DELAY_MS[job.type] + PROOF_DELAY_MS[job.type];
}

function getBlockRootType(isFirst: boolean, txCount: number): ProvingRequestType {
  if (txCount === 0) {
    if (!isFirst) {
      throw new Error('Non-first empty blocks should have been rejected during initialization');
    }
    return ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP;
  }
  if (txCount === 1) {
    return isFirst
      ? ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP
      : ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP;
  }
  return isFirst ? ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP : ProvingRequestType.BLOCK_ROOT_ROLLUP;
}

function getCheckpointRootType(blockCount: number): ProvingRequestType {
  return blockCount === 1
    ? ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP
    : ProvingRequestType.CHECKPOINT_ROOT_ROLLUP;
}

function createJob(
  checkpoint: number,
  block: number,
  type: ProvingRequestType,
  level?: number,
  index?: number,
  durationMs?: number,
): Job {
  return { checkpoint, block, type, level, index, durationMs };
}

// Helper to calculate total txs from a block
function getBlockTxCount(block: Block): { privateTxs: number; publicTxs: number; totalTxs: number } {
  const privateTxs = block[0];
  const publicGroups = block.slice(1) as PublicTxGroup[];
  const publicTxs = publicGroups.reduce((sum, [count]) => sum + count, 0);
  return { privateTxs, publicTxs, totalTxs: privateTxs + publicTxs };
}

function initializeState(checkpoints: Checkpoint[]): SimState {
  const state: SimState = {
    baseParityComplete: new Map(),
    rootParityComplete: new Map(),
    vmComplete: new Map(),
    chonkComplete: new Map(),
    publicBaseEnqueued: new Map(),
    txTreeNodes: new Map(),
    txTreeComplete: new Map(),
    txTreeLeafCount: new Map(),
    txTreeNextLeafIndex: new Map(),
    blockTreeNodes: new Map(),
    blockRootComplete: new Map(),
    checkpointTreeNodes: new Map(),
    checkpointRootComplete: new Map(),
    rootRollupComplete: false,
    blockConfigs: new Map(),
    blocksPerCheckpoint: new Map(),
    isFirstBlock: new Map(),
    totalCheckpoints: checkpoints.length,
  };

  // Initialize per-checkpoint and per-block state
  for (let cp = 1; cp <= checkpoints.length; cp++) {
    const blocks = checkpoints[cp - 1];
    state.blocksPerCheckpoint.set(cp, blocks.length);
    state.baseParityComplete.set(cp, 0);
    state.rootParityComplete.set(cp, false);
    state.blockRootComplete.set(cp, false);
    state.checkpointRootComplete.set(cp, false);

    for (let b = 1; b <= blocks.length; b++) {
      const key = blockKey(cp, b);
      const block = blocks[b - 1];
      const { totalTxs } = getBlockTxCount(block);

      // Empty blocks are only allowed as the first block in a checkpoint (matches orchestrator constraint)
      if (totalTxs === 0 && b !== 1) {
        throw new Error(`Cannot create a block with 0 txs, unless it's the first block. Checkpoint ${cp}, Block ${b}`);
      }

      state.blockConfigs.set(key, block);
      state.isFirstBlock.set(key, b === 1);
      state.vmComplete.set(key, 0);
      state.chonkComplete.set(key, 0);
      state.publicBaseEnqueued.set(key, 0);
      state.txTreeLeafCount.set(key, totalTxs);
      state.txTreeNextLeafIndex.set(key, 0);
      state.txTreeComplete.set(key, totalTxs === 0); // Empty blocks are immediately complete
    }
  }

  return state;
}

function fillQueue(queues: Queues, checkpoints: Checkpoint[]): void {
  for (let cp = 1; cp <= checkpoints.length; cp++) {
    const blocks = checkpoints[cp - 1];

    // assume every checkpoint includes cross-chain messages
    queues[ProvingRequestType.PARITY_BASE].push(
      ...times(NUM_BASE_PARITY_PER_ROOT_PARITY, () => createJob(cp, 1, ProvingRequestType.PARITY_BASE)),
    );

    for (let b = 1; b <= blocks.length; b++) {
      const block = blocks[b - 1];
      const privateTxs = block[0];
      const publicGroups = block.slice(1) as PublicTxGroup[];

      // Add private tx base rollups
      if (privateTxs > 0) {
        queues[ProvingRequestType.PRIVATE_TX_BASE_ROLLUP].push(
          ...times(privateTxs, () => createJob(cp, b, ProvingRequestType.PRIVATE_TX_BASE_ROLLUP)),
        );
      }

      // Add public tx jobs (VM + Chonk for each group)
      for (const [count, avmDuration] of publicGroups) {
        queues[ProvingRequestType.PUBLIC_VM].push(
          ...times(count, () => createJob(cp, b, ProvingRequestType.PUBLIC_VM, undefined, undefined, avmDuration)),
        );
        queues[ProvingRequestType.PUBLIC_CHONK_VERIFIER].push(
          ...times(count, () => createJob(cp, b, ProvingRequestType.PUBLIC_CHONK_VERIFIER)),
        );
      }
    }
  }
}

function enqueueDependentJobs(job: Job, state: SimState, queues: Queues, checkpointCount: number): void {
  const { checkpoint, block, type } = job;
  const key = blockKey(checkpoint, block);

  switch (type) {
    case ProvingRequestType.PARITY_BASE: {
      const count = (state.baseParityComplete.get(checkpoint) ?? 0) + 1;
      state.baseParityComplete.set(checkpoint, count);

      if (count === NUM_BASE_PARITY_PER_ROOT_PARITY) {
        queues[ProvingRequestType.PARITY_ROOT].push(createJob(checkpoint, 1, ProvingRequestType.PARITY_ROOT));
      }
      break;
    }

    case ProvingRequestType.PARITY_ROOT: {
      state.rootParityComplete.set(checkpoint, true);
      tryEnqueueBlockRoot(checkpoint, 1, state, queues);
      break;
    }

    case ProvingRequestType.PUBLIC_VM: {
      const vmCount = (state.vmComplete.get(key) ?? 0) + 1;
      state.vmComplete.set(key, vmCount);
      tryEnqueuePublicBase(checkpoint, block, state, queues);
      break;
    }

    case ProvingRequestType.PUBLIC_CHONK_VERIFIER: {
      const chonkCount = (state.chonkComplete.get(key) ?? 0) + 1;
      state.chonkComplete.set(key, chonkCount);
      tryEnqueuePublicBase(checkpoint, block, state, queues);
      break;
    }

    case ProvingRequestType.PUBLIC_TX_BASE_ROLLUP:
    case ProvingRequestType.PRIVATE_TX_BASE_ROLLUP: {
      handleBaseRollupComplete(checkpoint, block, state, queues);
      break;
    }

    case ProvingRequestType.TX_MERGE_ROLLUP: {
      handleTxMergeComplete(checkpoint, block, job.level!, job.index!, state, queues);
      break;
    }

    case ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP:
    case ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP:
    case ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP:
    case ProvingRequestType.BLOCK_ROOT_ROLLUP:
    case ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP: {
      handleBlockRootComplete(checkpoint, block, state, queues);
      break;
    }

    case ProvingRequestType.BLOCK_MERGE_ROLLUP: {
      handleBlockMergeComplete(checkpoint, job.level!, job.index!, state, queues);
      break;
    }

    case ProvingRequestType.CHECKPOINT_ROOT_ROLLUP:
    case ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP: {
      handleCheckpointRootComplete(checkpoint, state, queues, checkpointCount);
      break;
    }

    case ProvingRequestType.CHECKPOINT_MERGE_ROLLUP: {
      handleCheckpointMergeComplete(job.level!, job.index!, state, queues);
      break;
    }

    case ProvingRequestType.CHECKPOINT_PADDING_ROLLUP: {
      // Padding complete, can now do root rollup
      queues[ProvingRequestType.ROOT_ROLLUP].push(createJob(1, 1, ProvingRequestType.ROOT_ROLLUP));
      break;
    }

    case ProvingRequestType.ROOT_ROLLUP: {
      state.rootRollupComplete = true;
      break;
    }
  }
}

function tryEnqueuePublicBase(checkpoint: number, block: number, state: SimState, queue: Queues): void {
  const key = blockKey(checkpoint, block);
  const vmCount = state.vmComplete.get(key) ?? 0;
  const chonkCount = state.chonkComplete.get(key) ?? 0;
  const alreadyEnqueued = state.publicBaseEnqueued.get(key) ?? 0;

  const canEnqueue = Math.min(vmCount, chonkCount) - alreadyEnqueued;
  if (canEnqueue > 0) {
    queue[ProvingRequestType.PUBLIC_TX_BASE_ROLLUP].push(
      ...times(canEnqueue, () => createJob(checkpoint, block, ProvingRequestType.PUBLIC_TX_BASE_ROLLUP)),
    );
    state.publicBaseEnqueued.set(key, alreadyEnqueued + canEnqueue);
  }
}

function handleBaseRollupComplete(checkpoint: number, blk: number, state: SimState, queues: Queues): void {
  const key = blockKey(checkpoint, blk);
  const blockConfig = state.blockConfigs.get(key)!;
  const { totalTxs } = getBlockTxCount(blockConfig);

  // Get the next leaf index and use findLeafLevelAndIndex to determine its position
  const leafIndex = state.txTreeNextLeafIndex.get(key)!;
  state.txTreeNextLeafIndex.set(key, leafIndex + 1);

  // Use the unbalanced tree algorithm to find where this leaf goes
  const { level, indexAtLevel } = findLeafLevelAndIndex(totalTxs, leafIndex);

  // Get or create the level tracking
  const levelKey = treeKey(checkpoint, blk, level);
  if (!state.txTreeNodes.has(levelKey)) {
    state.txTreeNodes.set(levelKey, new Map());
  }
  state.txTreeNodes.get(levelKey)!.set(indexAtLevel, true);

  // Special case: single tx block goes straight to block root
  if (totalTxs === 1) {
    state.txTreeComplete.set(key, true);
    tryEnqueueBlockRoot(checkpoint, blk, state, queues);
    return;
  }

  // Check if sibling exists to create merge
  tryEnqueueTxMerge(checkpoint, blk, level, indexAtLevel, state, queues);
}

function tryEnqueueTxMerge(
  checkpoint: number,
  block: number,
  level: number,
  index: number,
  state: SimState,
  queues: Queues,
): void {
  const key = blockKey(checkpoint, block);

  // At root level, we're done
  if (level === 0) {
    state.txTreeComplete.set(key, true);
    tryEnqueueBlockRoot(checkpoint, block, state, queues);
    return;
  }

  const levelKey = treeKey(checkpoint, block, level);
  const nodes = state.txTreeNodes.get(levelKey) ?? new Map();

  const siblingIndex = getSiblingIndex(index);

  // Check if sibling exists
  if (nodes.has(siblingIndex)) {
    // Both children ready, enqueue merge at parent level
    const parentLevel = level - 1;
    const parentIndex = getParentIndex(index);
    queues[ProvingRequestType.TX_MERGE_ROLLUP].push(
      createJob(checkpoint, block, ProvingRequestType.TX_MERGE_ROLLUP, parentLevel, parentIndex),
    );
  }
}

function handleTxMergeComplete(
  checkpoint: number,
  blk: number,
  level: number,
  index: number,
  state: SimState,
  queues: Queues,
): void {
  const levelKey = treeKey(checkpoint, blk, level);

  // Mark this node as complete
  if (!state.txTreeNodes.has(levelKey)) {
    state.txTreeNodes.set(levelKey, new Map());
  }
  state.txTreeNodes.get(levelKey)!.set(index, true);

  // Check for next merge or completion
  tryEnqueueTxMerge(checkpoint, blk, level, index, state, queues);
}

function tryEnqueueBlockRoot(checkpoint: number, blk: number, state: SimState, queue: Queues): void {
  const key = blockKey(checkpoint, blk);
  const blockConfig = state.blockConfigs.get(key)!;
  const { totalTxs } = getBlockTxCount(blockConfig);
  const isFirst = state.isFirstBlock.get(key)!;

  // Need tx tree complete
  if (!state.txTreeComplete.get(key)) {
    return;
  }

  // First block also needs root parity
  if (isFirst && !state.rootParityComplete.get(checkpoint)) {
    return;
  }

  const blockRootType = getBlockRootType(isFirst, totalTxs);
  queue[blockRootType].push(createJob(checkpoint, blk, blockRootType));
}

function handleBlockRootComplete(checkpoint: number, block: number, state: SimState, queues: Queues): void {
  const numBlocks = state.blocksPerCheckpoint.get(checkpoint)!;
  const leafIndex = block - 1; // 0-indexed

  // Use the unbalanced tree algorithm to find where this block goes
  const { level, indexAtLevel } = findLeafLevelAndIndex(numBlocks, leafIndex);

  // Track at computed level
  const levelKey = checkpointTreeKey(checkpoint, level);
  if (!state.blockTreeNodes.has(levelKey)) {
    state.blockTreeNodes.set(levelKey, new Map());
  }
  state.blockTreeNodes.get(levelKey)!.set(indexAtLevel, true);

  // Single block goes straight to checkpoint root
  if (numBlocks === 1) {
    state.blockRootComplete.set(checkpoint, true);
    tryEnqueueCheckpointRoot(checkpoint, state, queues);
    return;
  }

  // Check for block merge
  tryEnqueueBlockMerge(checkpoint, level, indexAtLevel, state, queues);
}

function tryEnqueueBlockMerge(checkpoint: number, level: number, index: number, state: SimState, queue: Queues): void {
  // At root level, we're done with block tree
  if (level === 0) {
    state.blockRootComplete.set(checkpoint, true);
    tryEnqueueCheckpointRoot(checkpoint, state, queue);
    return;
  }

  const levelKey = checkpointTreeKey(checkpoint, level);
  const nodes = state.blockTreeNodes.get(levelKey) ?? new Map();

  const siblingIndex = getSiblingIndex(index);

  if (nodes.has(siblingIndex)) {
    const parentLevel = level - 1;
    const parentIndex = getParentIndex(index);
    queue[ProvingRequestType.BLOCK_MERGE_ROLLUP].push(
      createJob(checkpoint, 0, ProvingRequestType.BLOCK_MERGE_ROLLUP, parentLevel, parentIndex),
    );
  }
}

function handleBlockMergeComplete(
  checkpoint: number,
  level: number,
  index: number,
  state: SimState,
  queues: Queues,
): void {
  const levelKey = checkpointTreeKey(checkpoint, level);
  if (!state.blockTreeNodes.has(levelKey)) {
    state.blockTreeNodes.set(levelKey, new Map());
  }
  state.blockTreeNodes.get(levelKey)!.set(index, true);

  tryEnqueueBlockMerge(checkpoint, level, index, state, queues);
}

function tryEnqueueCheckpointRoot(checkpoint: number, state: SimState, queues: Queues): void {
  if (!state.blockRootComplete.get(checkpoint)) {
    return;
  }

  const numBlocks = state.blocksPerCheckpoint.get(checkpoint)!;
  const checkpointRootType = getCheckpointRootType(numBlocks);
  queues[checkpointRootType].push(createJob(checkpoint, 0, checkpointRootType));
}

function handleCheckpointRootComplete(
  checkpoint: number,
  state: SimState,
  queues: Queues,
  checkpointCount: number,
): void {
  state.checkpointRootComplete.set(checkpoint, true);

  const leafIndex = checkpoint - 1; // 0-indexed

  // Use the unbalanced tree algorithm to find where this checkpoint goes
  const { level, indexAtLevel } = findLeafLevelAndIndex(checkpointCount, leafIndex);

  // Initialize checkpoint tree level tracking
  if (!state.checkpointTreeNodes.has(level)) {
    state.checkpointTreeNodes.set(level, new Map());
  }
  state.checkpointTreeNodes.get(level)!.set(indexAtLevel, true);

  // Single checkpoint needs padding before root rollup
  if (checkpointCount === 1) {
    queues[ProvingRequestType.CHECKPOINT_PADDING_ROLLUP].push(
      createJob(1, 0, ProvingRequestType.CHECKPOINT_PADDING_ROLLUP),
    );
    return;
  }

  tryEnqueueCheckpointMerge(level, indexAtLevel, state, queues);
}

function tryEnqueueCheckpointMerge(level: number, index: number, state: SimState, queues: Queues): void {
  // At root level, enqueue root rollup
  if (level === 0) {
    queues[ProvingRequestType.ROOT_ROLLUP].push(createJob(1, 0, ProvingRequestType.ROOT_ROLLUP));
    return;
  }

  const nodes = state.checkpointTreeNodes.get(level) ?? new Map();
  const siblingIndex = getSiblingIndex(index);

  if (nodes.has(siblingIndex)) {
    const parentLevel = level - 1;
    const parentIndex = getParentIndex(index);
    queues[ProvingRequestType.CHECKPOINT_MERGE_ROLLUP].push(
      createJob(0, 0, ProvingRequestType.CHECKPOINT_MERGE_ROLLUP, parentLevel, parentIndex),
    );
  }
}

function handleCheckpointMergeComplete(level: number, index: number, state: SimState, queues: Queues): void {
  if (!state.checkpointTreeNodes.has(level)) {
    state.checkpointTreeNodes.set(level, new Map());
  }
  state.checkpointTreeNodes.get(level)!.set(index, true);

  tryEnqueueCheckpointMerge(level, index, state, queues);
}

function assignWork(queues: Queues, workers: Worker[], start: number, availableWorkers: number): void {
  while (workers.length < availableWorkers) {
    let assigned = false;

    // try to find a job in one of the queues. If all queues are empty we exit the other loop early
    for (const proofType of PROOF_TYPES_IN_PRIORITY_ORDER) {
      const job = queues[proofType].shift();
      if (!job) {
        continue;
      }
      const duration = getJobDuration(job);
      const end = start + duration;
      assigned = true;
      insertIntoSortedArray(workers, { job, start, end }, cmpWorkerByEnd);

      break;
    }

    if (!assigned) {
      break;
    }
  }
}

function cmpWorkerByEnd(a: Worker, b: Worker): -1 | 0 | 1 {
  return a.end < b.end ? -1 : a.end === b.end ? 0 : 1;
}

type WorkerActivityPoint = {
  time: number;
  activeWorkers: number;
  jobsRemaining: number;
  cumulativeWorkerMs: number;
};

type SimulationResult = {
  config: {
    name: string;
    workerCount: number;
    checkpointCount: number;
    totalTxs: number;
  };
  results: {
    totalTimeMs: number;
    totalJobs: number;
    workerUtilization: number;
    jobBreakdown: Record<string, number>;
    workerActivity: WorkerActivityPoint[];
  };
};

function runSimulationWithConfig(config: TestConfig): SimulationResult {
  const { name, workers: workerCount, checkpoints } = config;
  const state = initializeState(checkpoints);
  const queues: Queues = times(Object.values(ProvingRequestType).length, () => []) as any;
  const workerPool: Worker[] = [];
  const completed: Job[] = [];

  fillQueue(queues, checkpoints);

  let time = 0;
  let totalWorkerTime = 0;
  let cumulativeWorkerMs = 0;
  const workerActivity: WorkerActivityPoint[] = [];

  // Initial assignment
  assignWork(queues, workerPool, time, workerCount);

  // Record initial worker activity
  workerActivity.push({
    time,
    activeWorkers: workerPool.length,
    jobsRemaining: 0,
    cumulativeWorkerMs: 0,
  });

  while (workerPool.length > 0) {
    // Find next completion time
    const nextTime = workerPool[0].end;

    // Calculate worker utilization for this time slice
    const timeSlice = nextTime - time;
    totalWorkerTime += workerPool.length * timeSlice;
    cumulativeWorkerMs += workerPool.length * timeSlice;
    time = nextTime;

    // Collect all workers that complete at this time
    const justCompleted: Worker[] = [];
    while (workerPool.length > 0 && workerPool[0].end === time) {
      justCompleted.push(workerPool.shift()!);
    }

    // Process completions and enqueue dependent jobs
    for (const worker of justCompleted) {
      completed.push(worker.job);
      enqueueDependentJobs(worker.job, state, queues, checkpoints.length);
    }

    // Assign available workers to new jobs
    assignWork(queues, workerPool, time, workerCount);

    // Record worker activity at this time step
    workerActivity.push({
      time,
      activeWorkers: workerPool.length,
      jobsRemaining: 0,
      cumulativeWorkerMs,
    });
  }

  // Calculate job breakdown
  const jobBreakdown: Record<string, number> = {};
  for (const job of completed) {
    const typeName = ProvingRequestType[job.type];
    jobBreakdown[typeName] = (jobBreakdown[typeName] ?? 0) + 1;
  }

  // Worker utilization = actual worker time / (total time * worker count)
  const maxWorkerTime = time * workerCount;
  const workerUtilization = maxWorkerTime > 0 ? totalWorkerTime / maxWorkerTime : 0;

  // Calculate total txs
  let totalTxs = 0;
  for (const checkpoint of checkpoints) {
    for (const blk of checkpoint) {
      const { totalTxs: blockTxs } = getBlockTxCount(blk);
      totalTxs += blockTxs;
    }
  }

  return {
    config: {
      name,
      workerCount,
      checkpointCount: checkpoints.length,
      totalTxs,
    },
    results: {
      totalTimeMs: time,
      totalJobs: completed.length,
      workerUtilization,
      jobBreakdown,
      workerActivity,
    },
  };
}

// Helper to create N empty checkpoints (1 block each, 0 txs)
function emptyCheckpoints(n: number): Checkpoint[] {
  return times(n, () => [[0]]);
}

function cheapPublicTxs(epochSize: number, ...txsCounts: number[]): Checkpoint[] {
  const checkpoints: Checkpoint[] = txsCounts.map(count => [[0, [count, 15_000]]]); // chonk-verify takes approx 16s so AVM takign less than 16s will not matter
  if (epochSize > checkpoints.length) {
    checkpoints.push(...times(epochSize - checkpoints.length, (): Checkpoint => [[0]]));
  }

  return checkpoints;
}

function expensivePublicTxs(epochSize: number, ...txsCounts: number[]): Checkpoint[] {
  const checkpoints: Checkpoint[] = txsCounts.map(count => [[0, [count, 150_000]]]); // 2.5 minutes
  if (epochSize > checkpoints.length) {
    checkpoints.push(...times(epochSize - checkpoints.length, (): Checkpoint => [[0]]));
  }

  return checkpoints;
}

const testConfigs: TestConfig[] = [
  {
    name: 'ignition (with checkpoints + messages)',
    workers: 4,
    checkpoints: emptyCheckpoints(32),
  },
  {
    name: 'next-net (with messages)',
    workers: 4,
    checkpoints: cheapPublicTxs(32, 1, 1, 1, 1, 1),
  },

  // falls below performance target
  //{
  //  name: 'alpha 1tps public txs, 100 workers, with messages',
  //  workers: 100,
  //  checkpoints: cheapPublicTxs(30, ...times(30, () => 72)),
  //  messages: true,
  //},

  {
    name: 'alpha 1tps public txs, 250 workers, with messages',
    workers: 250,
    checkpoints: cheapPublicTxs(32, ...times(32, () => 72)),
  },

  // falls below performance target
  //{
  //  name: 'alpha 1tps expensive public txs, 250 workers, with messages',
  //  workers: 250,
  //  checkpoints: expensivePublicTxs(32, ...times(32, () => 72)),
  //},

  {
    name: 'alpha 1tps public txs, 500 workers, with messages',
    workers: 500,
    checkpoints: cheapPublicTxs(32, ...times(32, () => 72)),
  },

  {
    name: 'alpha 1tps expensive public txs, 500 workers, with messages',
    workers: 500,
    checkpoints: expensivePublicTxs(32, ...times(32, () => 72)),
  },

  {
    name: 'alpha 1tps public txs 1000 workers, with messages',
    workers: 1000,
    checkpoints: cheapPublicTxs(32, ...times(32, () => 72)),
  },

  {
    name: 'alpha 1tps expensive public txs 1000 workers, with messages',
    workers: 1000,
    checkpoints: expensivePublicTxs(32, ...times(32, () => 72)),
  },
];

describe('epoch proving simulation', () => {
  const allResults: SimulationResult[] = [];

  it.each(testConfigs)('$name', config => {
    const result = runSimulationWithConfig(config);
    allResults.push(result);

    //console.log(`=== ${config.name} ===`);
    //console.log(`Total Time: ${(result.results.totalTimeMs / 1000 / 60).toFixed(2)} minutes`);
    //console.log(`Total Jobs: ${result.results.totalJobs}`);

    expect(result.results.jobBreakdown['ROOT_ROLLUP']).toBe(1);
    expect(result.results.totalTimeMs).toBeLessThan(30 * 72 * 1000); // targeting root rollup in less than 30 slots
  });
});
