import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L1SyncPoint, L2BlockSource, L2Frontier } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { CheckpointGlobalVariables } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { NextBlockFeeCache } from './next_block_fee_cache.js';
import { NextBlockPredictor, QUOTE_MAX_WAIT_MS } from './next_block_predictor.js';
import { type L2FrontierArgs, makeFrontier, makeProposedCheckpointData } from './test_helpers.js';

const CHAIN_ID = new Fr(12345);
const ROLLUP_VERSION = new Fr(1);
const BOUNDARY_FEES = new GasFees(0, 4242);

describe('NextBlockPredictor', () => {
  let blockSource: MockProxy<L2BlockSource>;
  let feeCache: MockProxy<NextBlockFeeCache>;
  let epochCache: MockProxy<EpochCacheInterface>;
  let predictor: NextBlockPredictor;

  const l1SyncPoint: L1SyncPoint = { blockNumber: 99n, blockHash: Buffer32.fromField(new Fr(9)) };

  const boundaryGlobals = (slotNumber: SlotNumber): CheckpointGlobalVariables => ({
    chainId: CHAIN_ID,
    version: ROLLUP_VERSION,
    slotNumber,
    timestamp: BigInt(slotNumber) * 72n,
    coinbase: EthAddress.ZERO,
    feeRecipient: AztecAddress.ZERO,
    gasFees: BOUNDARY_FEES,
  });

  const setFrontier = (args: L2FrontierArgs): L2Frontier => {
    const frontier = makeFrontier(args);
    blockSource.getL2Frontier.mockResolvedValue(frontier);
    return frontier;
  };

  /** The proposed tip coincides with the checkpoint frontier: the next block opens a fresh checkpoint. */
  const setBoundaryFrontier = (args: Partial<L2FrontierArgs> = {}) =>
    setFrontier({
      proposed: BlockNumber(5),
      checkpointedBlock: BlockNumber(5),
      checkpointed: CheckpointNumber(1),
      checkpointedTipSlot: SlotNumber(5),
      l1SyncPoint,
      ...args,
    });

  /** A proposed checkpoint (#2) ends at block 5 while the proposed tip (9) is ahead: mid-checkpoint. */
  const setMidCheckpointFrontier = (args: Partial<L2FrontierArgs> = {}) =>
    setFrontier({
      proposed: BlockNumber(9),
      checkpointedBlock: BlockNumber(3),
      checkpointed: CheckpointNumber(1),
      latestBlockGlobals: { slotNumber: SlotNumber(42), gasFees: new GasFees(0, 777) },
      proposedCheckpoint: makeProposedCheckpointData({
        checkpointNumber: CheckpointNumber(2),
        lastBlock: BlockNumber(5),
      }),
      l1SyncPoint,
      ...args,
    });

  beforeEach(() => {
    blockSource = mock<L2BlockSource>();
    feeCache = mock<NextBlockFeeCache>();
    epochCache = mock<EpochCacheInterface>();

    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(19),
      ts: 0n,
      nowSeconds: 0n,
    });
    feeCache.getBoundaryGlobals.mockImplementation(key => Promise.resolve(boundaryGlobals(key.targetSlot)));

    predictor = new NextBlockPredictor({ blockSource, feeCache, epochCache });
  });

  describe('predict', () => {
    it('copies the in-progress checkpoint globals and bumps only the block number', async () => {
      setMidCheckpointFrontier();

      const { plan, globals } = await predictor.predict();

      expect(plan.newCheckpoint).toBeUndefined();
      expect(globals.blockNumber).toEqual(BlockNumber(10));
      expect(globals.slotNumber).toEqual(SlotNumber(42));
      expect(globals.gasFees).toEqual(new GasFees(0, 777));
      expect(feeCache.getBoundaryGlobals).not.toHaveBeenCalled();
    });

    it('rejects a snapshot missing the proposed tip header', async () => {
      setMidCheckpointFrontier({ omitLatestBlockHeader: true });

      await expect(predictor.predict()).rejects.toThrow(/carries no header/);
      expect(feeCache.getBoundaryGlobals).not.toHaveBeenCalled();
    });

    it('prices a checkpoint-opening block at the cached boundary fee, with zero payout addresses', async () => {
      setBoundaryFrontier();

      const { plan, globals } = await predictor.predict();

      // Clock slot 19 plus the pipelining offset.
      expect(plan.newCheckpoint?.targetSlot).toEqual(SlotNumber(20));
      expect(plan.newCheckpoint?.targetCheckpoint).toEqual(CheckpointNumber(2));
      expect(globals.blockNumber).toEqual(BlockNumber(6));
      expect(globals.slotNumber).toEqual(SlotNumber(20));
      expect(globals.timestamp).toEqual(BigInt(20) * 72n);
      expect(globals.gasFees).toEqual(BOUNDARY_FEES);
      expect(globals.coinbase).toEqual(EthAddress.ZERO);
      expect(globals.feeRecipient).toEqual(AztecAddress.ZERO);
    });

    it('waits without a cap for the boundary fee', async () => {
      const frontier = setBoundaryFrontier();

      await predictor.predict();

      const [, passedFrontier, opts] = feeCache.getBoundaryGlobals.mock.calls[0];
      expect(passedFrontier).toBe(frontier);
      expect(opts).toBeUndefined();
    });

    it('fails when the boundary fee cannot be produced', async () => {
      setBoundaryFrontier();
      feeCache.getBoundaryGlobals.mockResolvedValue(undefined);

      await expect(predictor.predict()).rejects.toThrow(/no boundary fee available/);
    });
  });

  describe('quoteMinFees', () => {
    it('quotes the fee the in-progress checkpoint froze, without touching the cache', async () => {
      setMidCheckpointFrontier();

      await expect(predictor.quoteMinFees()).resolves.toEqual({ fees: new GasFees(0, 777), l1SyncPoint });
      expect(feeCache.getBoundaryGlobals).not.toHaveBeenCalled();
    });

    it('quotes the boundary fee with a bounded wait', async () => {
      setBoundaryFrontier();

      await expect(predictor.quoteMinFees()).resolves.toEqual({ fees: BOUNDARY_FEES, l1SyncPoint });
      const [, , opts] = feeCache.getBoundaryGlobals.mock.calls[0];
      expect(opts).toEqual({ maxWaitMs: QUOTE_MAX_WAIT_MS });
    });

    it('quotes nothing when the cache has nothing usable', async () => {
      setBoundaryFrontier();
      feeCache.getBoundaryGlobals.mockResolvedValue(undefined);

      await expect(predictor.quoteMinFees()).resolves.toBeUndefined();
    });

    it('quotes nothing rather than throwing when the snapshot has no header mid-checkpoint', async () => {
      setMidCheckpointFrontier({ omitLatestBlockHeader: true });

      await expect(predictor.quoteMinFees()).resolves.toBeUndefined();
    });
  });
});
