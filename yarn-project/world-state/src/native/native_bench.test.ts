import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { L2Block } from '@aztec/stdlib/block';
import { type IndexedTreeId, MerkleTreeId, type MerkleTreeReadOperations } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path, { join } from 'path';

import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import { mockBlock } from '../test/utils.js';
import { DataRetrievalType, InsertionType, NativeBenchMetics } from './bench_metrics.js';
import { NativeWorldStateService } from './native_world_state.js';

jest.setTimeout(300_000);

describe('Native World State: benchmarks', () => {
  const logger = createLogger('native-world-state-bench');
  let dataDir: string;
  let rollupAddress: EthAddress;
  const defaultDBMapSize = 128 * 1024 * 1024;
  const wsTreeMapSizes: WorldStateTreeMapSizes = {
    archiveTreeMapSizeKb: defaultDBMapSize,
    nullifierTreeMapSizeKb: defaultDBMapSize,
    noteHashTreeMapSizeKb: defaultDBMapSize,
    messageTreeMapSizeKb: defaultDBMapSize,
    publicDataTreeMapSizeKb: defaultDBMapSize,
  };
  const metrics = new NativeBenchMetics();
  let worldState!: NativeWorldStateService;

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      await writeFile(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    } else {
      logger.info(`\n`); // sometimes jest tests obscure the last line(s)
      logger.info(metrics.toPrettyString());
      logger.info(`\n`);
    }
  });

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'world-state-test'));
    rollupAddress = EthAddress.random();
    worldState = await NativeWorldStateService.new(rollupAddress, dataDir, wsTreeMapSizes);
  });

  afterEach(async () => {
    await worldState.close();
    await rm(dataDir, { recursive: true, maxRetries: 3 });
  });

  const runBlockSyncTest = async (
    numBlocks: number,
    txsPerBlock: number,
    effectsPerTx: number,
    worldState: NativeWorldStateService,
  ) => {
    const blocks = [];
    const fork = await worldState.fork();
    for (let i = 0; i < numBlocks; i++) {
      const { block, messages } = await mockBlock(i + 1, txsPerBlock, fork, effectsPerTx);
      blocks.push({ block, messages });
    }

    const startTime = performance.now();

    for (const { block, messages } of blocks) {
      await worldState.handleL2BlockAndMessages(block, messages);
    }

    const endTime = performance.now();
    const avgTime = (endTime - startTime) / numBlocks;
    return avgTime;
  };

  const runInsertionTest = async (
    numBlocks: number,
    treeId: MerkleTreeId,
    numLeaves: number,
    insertionType: InsertionType,
    worldState: NativeWorldStateService,
  ) => {
    const leaves: (Buffer | Fr)[][] = [];
    for (let i = 0; i < numBlocks; i++) {
      const l2Block = await L2Block.random(1, 1, 1, 1, undefined, undefined, numLeaves);
      if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
        leaves.push(
          l2Block.body.txEffects[0].publicDataWrites.filter(x => !x.isEmpty()).map(write => write.toBuffer()),
        );
      } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
        const nullifiersPadded = padArrayEnd(l2Block.body.txEffects[0].nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(
          nullifier => nullifier.toBuffer(),
        );
        leaves.push(nullifiersPadded);
      } else {
        const noteHashesPadded = padArrayEnd(l2Block.body.txEffects[0].noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX);
        leaves.push(noteHashesPadded);
      }
    }
    const fork = await worldState.fork();
    const startTime = performance.now();

    if (treeId === MerkleTreeId.NOTE_HASH_TREE) {
      for (const leafSet of leaves) {
        await fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leafSet as Fr[]);
      }
    } else if (insertionType === InsertionType.BATCH) {
      for (const leafSet of leaves) {
        await fork.batchInsert(treeId as IndexedTreeId, leafSet as Buffer[], 0);
      }
    } else {
      for (const leafSet of leaves) {
        await fork.sequentialInsert(treeId as IndexedTreeId, leafSet as Buffer[]);
      }
    }
    const endTime = performance.now();
    const avgTime = (endTime - startTime) / numBlocks;
    return avgTime;
  };

  const runDataRetrievalByIndex = async (
    numRetrievals: number,
    treeId: MerkleTreeId,
    worldState: NativeWorldStateService,
    op: (treeId: MerkleTreeId, index: bigint, fork: MerkleTreeReadOperations) => Promise<any>,
  ) => {
    const fork = await worldState.fork();
    const treeInfo = await fork.getTreeInfo(treeId);
    const indices = Array.from({ length: numRetrievals }, () =>
      Math.floor(Math.random() * Number(treeInfo.size - 1n)),
    ).map(m => BigInt(m));

    const startTime = performance.now();

    for (const index of indices) {
      await op(treeId, index, fork);
    }

    const endTime = performance.now();
    const avgTime = (endTime - startTime) / numRetrievals;
    return avgTime;
  };

  const runDataRetrievalByValue = async (
    numRetrievals: number,
    treeId: MerkleTreeId,
    worldState: NativeWorldStateService,
    values: (Buffer | Fr)[],
    op: (treeId: MerkleTreeId, value: Buffer | Fr, fork: MerkleTreeReadOperations) => Promise<any>,
  ) => {
    const fork = await worldState.fork();
    const treeInfo = await fork.getTreeInfo(treeId);
    const indices = Array.from({ length: numRetrievals }, () =>
      Math.floor(Math.random() * Number(treeInfo.size - 1n)),
    ).map(m => BigInt(m));

    const startTime = performance.now();

    for (const index of indices) {
      const value = values[Number(index)];
      await op(treeId, value, fork);
    }

    const endTime = performance.now();
    const avgTime = (endTime - startTime) / numRetrievals;
    return avgTime;
  };

  it.each([
    [36, 1, 2],
    [36, 8, 2],
    [36, 64, 2],
    [360, 8, 1],
  ])('Syncs a %s tx block where txs have %s leaves', async (numTxs: number, numLeaves: number, numBlocks: number) => {
    // We insert a block so we don't obtain any 'first block' advantage
    await runBlockSyncTest(1, 4, 1, worldState);

    // Now run the test
    const duration = await runBlockSyncTest(numBlocks, numTxs, numLeaves, worldState);
    metrics.addBlockSyncMetric(numTxs, numLeaves, duration);
  });

  it.each([
    [MerkleTreeId.PUBLIC_DATA_TREE, InsertionType.SEQUENTIAL, 1],
    [MerkleTreeId.PUBLIC_DATA_TREE, InsertionType.SEQUENTIAL, 8],
    [MerkleTreeId.PUBLIC_DATA_TREE, InsertionType.SEQUENTIAL, 64],
    [MerkleTreeId.NULLIFIER_TREE, InsertionType.BATCH, 1],
    [MerkleTreeId.NULLIFIER_TREE, InsertionType.BATCH, 8],
    [MerkleTreeId.NULLIFIER_TREE, InsertionType.BATCH, 64],
    [MerkleTreeId.NOTE_HASH_TREE, InsertionType.BATCH, 1],
    [MerkleTreeId.NOTE_HASH_TREE, InsertionType.BATCH, 8],
    [MerkleTreeId.NOTE_HASH_TREE, InsertionType.BATCH, 64],
  ])(
    `Inserts into tree type %s using insertion type %s with %s leaves`,
    async (treeId: MerkleTreeId, insertionType: InsertionType, numLeaves: number) => {
      // We insert a block so we don't obtain any 'first block' advantage
      await runBlockSyncTest(1, 4, 1, worldState);

      const duration = await runInsertionTest(16, treeId, numLeaves, insertionType, worldState);
      metrics.addInsertionMetric(treeId, insertionType, numLeaves, duration);
    },
  );

  it('Retrieves sibling paths', async () => {
    await runBlockSyncTest(1, 32, 64, worldState);

    const duration = await runDataRetrievalByIndex(
      1024,
      MerkleTreeId.PUBLIC_DATA_TREE,
      worldState,
      (treeId, index, fork) => fork.getSiblingPath(treeId, index),
    );
    metrics.addDataRetrievalMetric(DataRetrievalType.SIBLING_PATH, duration * 1000);
  });

  it('Retrieves leaf pre-images', async () => {
    await runBlockSyncTest(1, 32, 64, worldState);

    const duration = await runDataRetrievalByIndex(
      1024,
      MerkleTreeId.PUBLIC_DATA_TREE,
      worldState,
      (treeId, index, fork) => fork.getLeafPreimage(treeId as IndexedTreeId, index),
    );
    metrics.addDataRetrievalMetric(DataRetrievalType.LEAF_PREIMAGE, duration * 1000);
  });

  it('Retrieves leaf values', async () => {
    await runBlockSyncTest(1, 32, 64, worldState);

    const duration = await runDataRetrievalByIndex(
      1024,
      MerkleTreeId.PUBLIC_DATA_TREE,
      worldState,
      (treeId, index, fork) => fork.getLeafValue(treeId as IndexedTreeId, index),
    );
    metrics.addDataRetrievalMetric(DataRetrievalType.LEAF_VALUE, duration * 1000);
  });

  it('Retrieves leaf indices', async () => {
    const fork = await worldState.fork();
    const treeInfo = await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
    const startSize = Number(treeInfo.size);
    const { block, messages } = await mockBlock(1, 32, fork, 64);
    await worldState.handleL2BlockAndMessages(block, messages);
    await fork.close();

    const values = block.body.txEffects.flatMap(txEffect => txEffect.nullifiers.map(nullifier => nullifier.toBuffer()));
    const initialValues = Array.from({ length: startSize }, (_, i) => new Fr(i).toBuffer());

    const duration = await runDataRetrievalByValue(
      1024,
      MerkleTreeId.NULLIFIER_TREE,
      worldState,
      initialValues.concat(values),
      (treeId, value, fork) => fork.findLeafIndices(treeId as IndexedTreeId, [value as Buffer]),
    );
    metrics.addDataRetrievalMetric(DataRetrievalType.LEAF_INDICES, duration * 1000);
  });

  it('Retrieves low leaves', async () => {
    const fork = await worldState.fork();
    const { block, messages } = await mockBlock(1, 32, fork, 64);
    await worldState.handleL2BlockAndMessages(block, messages);

    const treeInfo = await fork.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
    const startSize = Number(treeInfo.size);
    const randomValues = Array.from({ length: startSize }, () => Fr.random());
    await fork.close();

    const duration = await runDataRetrievalByValue(
      1024,
      MerkleTreeId.NULLIFIER_TREE,
      worldState,
      randomValues,
      (treeId, value, fork) => fork.getPreviousValueIndex(treeId as IndexedTreeId, (value as Fr).toBigInt()),
    );
    metrics.addDataRetrievalMetric(DataRetrievalType.LOW_LEAF, duration * 1000);
  });
});
