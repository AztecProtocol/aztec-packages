import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeReadOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { mockTx } from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxEffect, type TxValidator } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxMetaData } from './tx_metadata.js';
import { AztecKVTxPoolV2 } from './tx_pool_v2.js';
import { TxPoolV2Impl } from './tx_pool_v2_impl.js';

const alwaysValidValidator: TxValidator<TxMetaData> = {
  validateTx: () => Promise.resolve({ result: 'valid' }),
};

jest.setTimeout(300_000);

// Reproduction for A-1656: gossip tx validation on mainnet stalls for 10-40s whenever the pool
// finalizes an epoch's worth of mined txs. Finalization runs as a single serial-queue item, so a
// concurrent canAddPendingTx / addPendingTxs (issued by gossip validation) waits for the whole
// bulk operation to complete. This test measures that wait and bounds it.
describe('TxPoolV2 finalization stall', () => {
  const logger = createLogger('p2p:tx_pool_v2:finalization_stall_test');

  // Matches the tx counts seen finalized per epoch tick on mainnet (~100-200).
  const MINED_TX_COUNT = 128;
  // Upper bound for how long a gossip-validation pool operation may wait behind maintenance work.
  const MAX_STALL_MS = 1_000;

  const feePayers = [
    AztecAddress.fromBigIntUnsafe(1n),
    AztecAddress.fromBigIntUnsafe(2n),
    AztecAddress.fromBigIntUnsafe(3n),
  ];

  let mockL2BlockSource: MockProxy<L2BlockSource>;
  let mockWorldState: MockProxy<WorldStateSynchronizer>;
  let db: MockProxy<MerkleTreeReadOperations>;
  let minedTxs: Tx[];
  let incomingTx: Tx;

  const makeHeader = (n: number) =>
    BlockHeader.empty({
      globalVariables: GlobalVariables.empty({
        blockNumber: BlockNumber(n),
        slotNumber: SlotNumber(n),
      }),
    });

  const makeBlock = (txs: Tx[], header: BlockHeader): L2Block => {
    const txEffects = txs.map(tx => {
      const nullifiers = tx.data.getNonEmptyNullifiers();
      return new TxEffect(RevertCode.OK, tx.getTxHash(), Fr.ZERO, [], nullifiers, [], [], [], [], []);
    });
    const body = new Body(txEffects);
    const archive = new AppendOnlyTreeSnapshot(Fr.random(), header.globalVariables.blockNumber + 1);
    return new L2Block(
      archive,
      header,
      body,
      CheckpointNumber(Number(header.globalVariables.blockNumber)),
      IndexWithinCheckpoint(0),
    );
  };

  // Large public calldata mimics the complex public-heavy txs seen on mainnet when the stalls occurred.
  const createTxBatch = (count: number, startSeed = 1): Promise<Tx[]> =>
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        mockTx((startSeed + i) * 100, {
          publicCalldataSize: 1000,
          maxPriorityFeesPerGas: new GasFees(((startSeed + i) % 100) + 1, ((startSeed + i) % 100) + 1),
          feePayer: feePayers[(startSeed + i) % feePayers.length],
        }),
      ),
    );

  const createPool = async (archivedTxLimit: number) => {
    const store = await openTmpStore('p2p-finalization-stall');
    const archiveStore = await openTmpStore('archive-finalization-stall');
    const pool = new AztecKVTxPoolV2(
      store,
      archiveStore,
      {
        l2BlockSource: mockL2BlockSource,
        worldStateSynchronizer: mockWorldState,
        createTxValidator: () => Promise.resolve(alwaysValidValidator),
        checkAllowedSetupCalls: () => Promise.resolve(true),
        blockMinFeesProvider: { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
      },
      undefined,
      { archivedTxLimit },
    );
    await pool.start();
    const cleanup = async () => {
      await pool.stop();
      await store.delete();
      await archiveStore.delete();
    };
    return { pool, cleanup };
  };

  beforeAll(async () => {
    minedTxs = await createTxBatch(MINED_TX_COUNT);
    [incomingTx] = await createTxBatch(1, (MINED_TX_COUNT + 1) * 100);
    logger.info(`Created ${MINED_TX_COUNT} mined txs of ${minedTxs[0].toBuffer().length} bytes each`);
  });

  beforeEach(() => {
    mockL2BlockSource = mock<L2BlockSource>();
    mockL2BlockSource.getTxEffect.mockResolvedValue(undefined);

    mockWorldState = mock<WorldStateSynchronizer>();
    db = mock<MerkleTreeReadOperations>();
    mockWorldState.getCommitted.mockReturnValue(db);
    mockWorldState.getSnapshot.mockReturnValue(db);
    db.getPreviousValueIndex.mockImplementation((_tree, slot) =>
      Promise.resolve({ index: slot, alreadyPresent: true }),
    );
    db.getLeafPreimage.mockImplementation((tree, index) =>
      Promise.resolve(
        tree === MerkleTreeId.PUBLIC_DATA_TREE
          ? new PublicDataTreeLeafPreimage(
              new PublicDataTreeLeaf(new Fr(index), new Fr(BigInt('1000000000000000000000000'))),
              Fr.ONE,
              1n,
            )
          : undefined,
      ),
    );
    db.findLeafIndices.mockImplementation((_tree, leaves) =>
      Promise.resolve((leaves as Fr[]).map((_, i) => BigInt(i + 1))),
    );
  });

  // Fills the pool with mined txs, kicks off finalization, and issues the pool calls that gossip
  // validation depends on once finalization is executing on the serial queue. handleFinalizedBlock
  // defers its first queue item to a later microtask, so without gating on an archive chunk having
  // started the gossip ops would enter the queue ahead of finalization and measure nothing.
  // Returns how long each waited, the finalize time, and which of the two finished first.
  const measureStallDuringFinalization = async (archivedTxLimit: number) => {
    const { pool, cleanup } = await createPool(archivedTxLimit);
    // Resolved when the first archive chunk starts executing, i.e. finalization holds the queue.
    // archiveFinalizedTxs runs per chunk even when archiving is disabled.
    const archiveChunkStarted = promiseWithResolvers<void>();
    const originalArchiveFinalizedTxs = TxPoolV2Impl.prototype.archiveFinalizedTxs;
    const archiveSpy = jest.spyOn(TxPoolV2Impl.prototype, 'archiveFinalizedTxs').mockImplementation(function (
      this: TxPoolV2Impl,
      txHashes: string[],
    ) {
      archiveChunkStarted.resolve();
      return originalArchiveFinalizedTxs.call(this, txHashes);
    });
    try {
      await pool.addPendingTxs(minedTxs);
      await pool.handleMinedBlock(makeBlock(minedTxs, makeHeader(1)));

      const finalizeTimer = new Timer();
      const finalizeDone = pool.handleFinalizedBlock(makeHeader(1)).then(() => 'finalization' as const);

      await archiveChunkStarted.promise;

      const precheckTimer = new Timer();
      const precheckPromise = pool.canAddPendingTx(incomingTx).then(() => precheckTimer.ms());

      const addTimer = new Timer();
      const addPromise = pool.addPendingTxs([incomingTx], { source: 'gossip' }).then(() => addTimer.ms());

      const gossipDone = Promise.all([precheckPromise, addPromise]).then(() => 'gossip ops' as const);
      const finishedFirst = await Promise.race([gossipDone, finalizeDone]);

      const [precheckMs, addMs] = await Promise.all([precheckPromise, addPromise]);
      await finalizeDone;
      const finalizeMs = finalizeTimer.ms();

      logger.info(
        `Finalized ${MINED_TX_COUNT} txs in ${Math.round(finalizeMs)}ms with archivedTxLimit=${archivedTxLimit} ` +
          `(canAddPendingTx waited ${Math.round(precheckMs)}ms, addPendingTxs waited ${Math.round(addMs)}ms, ` +
          `${finishedFirst} finished first)`,
        { finalizeMs, precheckMs, addMs, archivedTxLimit, finishedFirst },
      );
      return { finalizeMs, precheckMs, addMs, finishedFirst };
    } finally {
      archiveSpy.mockRestore();
      await cleanup();
    }
  };

  it('does not stall gossip pool operations while finalizing mined txs with archiving disabled', async () => {
    const { precheckMs, addMs, finishedFirst } = await measureStallDuringFinalization(0);
    expect(finishedFirst).toEqual('gossip ops');
    expect(precheckMs).toBeLessThan(MAX_STALL_MS);
    expect(addMs).toBeLessThan(MAX_STALL_MS);
  });

  it('does not stall gossip pool operations while finalizing mined txs with archiving enabled', async () => {
    const { precheckMs, addMs, finishedFirst } = await measureStallDuringFinalization(10_000);
    expect(finishedFirst).toEqual('gossip ops');
    expect(precheckMs).toBeLessThan(MAX_STALL_MS);
    expect(addMs).toBeLessThan(MAX_STALL_MS);
  });
});
