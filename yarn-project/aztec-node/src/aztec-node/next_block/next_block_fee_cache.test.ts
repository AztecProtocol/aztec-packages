import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L1SyncPoint, L2BlockSource, L2Frontier } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { CheckpointGlobalVariables, GlobalVariableBuilder } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { DEFAULT_REFRESH_INTERVAL_MS, MAX_AGE_INTERVALS, NextBlockFeeCache } from './next_block_fee_cache.js';
import { type BoundaryFeeKey, computeBoundaryFeeKey, getClockSlot, planNextBlock } from './next_block_planner.js';
import {
  type L2FrontierArgs,
  makeFeeHeader,
  makeFrontier,
  makeInvalidStatus,
  makeProposedCheckpointData,
} from './test_helpers.js';

const CHAIN_ID = new Fr(12345);
const ROLLUP_VERSION = new Fr(1);
const MAX_AGE_MS = MAX_AGE_INTERVALS * DEFAULT_REFRESH_INTERVAL_MS;

describe('NextBlockFeeCache', () => {
  let blockSource: MockProxy<L2BlockSource>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let rollupContract: MockProxy<RollupContract>;
  let epochCache: MockProxy<EpochCacheInterface>;
  let dateProvider: ManualDateProvider;
  let cache: NextBlockFeeCache;

  /** Distinct fee per pricing call, so a re-price is visible in the value a reader gets back. */
  let priceCount: number;

  const syncPoint = (seed: number): L1SyncPoint => ({
    blockNumber: BigInt(seed),
    blockHash: Buffer32.fromField(new Fr(seed)),
  });

  const boundaryArgs = (args: Partial<L2FrontierArgs> = {}): L2FrontierArgs => ({
    proposed: BlockNumber(5),
    checkpointedBlock: BlockNumber(5),
    checkpointed: CheckpointNumber(1),
    checkpointedTipSlot: SlotNumber(5),
    l1SyncPoint: syncPoint(1),
    ...args,
  });

  const setFrontier = (args: Partial<L2FrontierArgs> = {}): L2Frontier => {
    const frontier = makeFrontier(boundaryArgs(args));
    blockSource.getL2Frontier.mockResolvedValue(frontier);
    return frontier;
  };

  const keyOf = (frontier: L2Frontier): BoundaryFeeKey =>
    computeBoundaryFeeKey(planNextBlock(frontier, getClockSlot(epochCache)), frontier.pendingChainValidationStatus)!;

  const globalsFor = (slotNumber: SlotNumber, feePerL2Gas: number): CheckpointGlobalVariables => ({
    chainId: CHAIN_ID,
    version: ROLLUP_VERSION,
    slotNumber,
    timestamp: BigInt(slotNumber) * 72n,
    coinbase: EthAddress.ZERO,
    feeRecipient: AztecAddress.ZERO,
    gasFees: new GasFees(0, feePerL2Gas),
  });

  beforeEach(() => {
    priceCount = 0;
    blockSource = mock<L2BlockSource>();
    globalVariableBuilder = mock<GlobalVariableBuilder>();
    rollupContract = mock<RollupContract>();
    epochCache = mock<EpochCacheInterface>();
    dateProvider = new ManualDateProvider();

    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
      epoch: EpochNumber.ZERO,
      slot: SlotNumber(19),
      ts: 0n,
      nowSeconds: 0n,
    });
    globalVariableBuilder.buildCheckpointGlobalVariables.mockImplementation((_c, _f, slotNumber) =>
      Promise.resolve(globalsFor(slotNumber, ++priceCount)),
    );

    cache = new NextBlockFeeCache({
      blockSource,
      globalVariableBuilder,
      rollupContract,
      epochCache,
      signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: EthAddress.random() },
      dateProvider,
    });
  });

  afterEach(async () => {
    await cache.stop();
    jest.restoreAllMocks();
  });

  it('prices the boundary the frontier describes, pinned to its L1 block', async () => {
    const frontier = setFrontier({ l1SyncPoint: syncPoint(42) });

    const globals = await cache.getBoundaryGlobals(keyOf(frontier), frontier);

    expect(globals?.gasFees).toEqual(new GasFees(0, 1));
    const [coinbase, feeRecipient, slot, , options] =
      globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
    expect(coinbase).toEqual(EthAddress.ZERO);
    expect(feeRecipient).toEqual(AztecAddress.ZERO);
    // Clock slot 19 + the pipelining offset.
    expect(slot).toEqual(SlotNumber(20));
    expect(options).toEqual({ blockNumber: 42n });
  });

  it('skips the re-price when neither the key nor the L1 sync point moved', async () => {
    const frontier = setFrontier();
    await cache.refresh();

    await cache.refresh();

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
    expect((await cache.getBoundaryGlobals(keyOf(frontier), frontier))?.gasFees).toEqual(new GasFees(0, 1));
  });

  it('re-prices when the key moves and keeps serving the boundary it just left', async () => {
    const before = setFrontier();
    await cache.refresh();

    const after = setFrontier({ checkpointedTipSlot: SlotNumber(30) });
    await cache.refresh();

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(2);
    expect((await cache.getBoundaryGlobals(keyOf(after), after))?.gasFees).toEqual(new GasFees(0, 2));
    // A request that planned from the previous frontier is still served from memory, no further pricing.
    expect((await cache.getBoundaryGlobals(keyOf(before), before))?.gasFees).toEqual(new GasFees(0, 1));
    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(2);
  });

  it('re-prices in the background when the L1 sync point moves under the same key', async () => {
    const frontier = setFrontier({ l1SyncPoint: syncPoint(1) });
    await cache.refresh();
    const moved = setFrontier({ l1SyncPoint: syncPoint(2) });

    // The key did not move, so a reader in between never misses: it is served the old price.
    expect((await cache.getBoundaryGlobals(keyOf(frontier), frontier))?.gasFees).toEqual(new GasFees(0, 1));

    await cache.refresh();

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(2);
    expect((await cache.getBoundaryGlobals(keyOf(moved), moved))?.gasFees).toEqual(new GasFees(0, 2));
  });

  it('shares one in-flight refresh between concurrent readers and the loop', async () => {
    const frontier = setFrontier();
    const gate = promiseWithResolvers<CheckpointGlobalVariables>();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockReturnValueOnce(gate.promise);

    const first = cache.getBoundaryGlobals(keyOf(frontier), frontier);
    const second = cache.getBoundaryGlobals(keyOf(frontier), frontier);
    const loopPass = cache.refresh();
    gate.resolve(globalsFor(SlotNumber(20), 7));

    const [firstGlobals, secondGlobals] = await Promise.all([first, second, loopPass]);

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
    expect(firstGlobals?.gasFees).toEqual(new GasFees(0, 7));
    expect(secondGlobals?.gasFees).toEqual(new GasFees(0, 7));
  });

  it('serves a record under the staleness cutoff to a capped reader while the refresh keeps failing', async () => {
    const frontier = setFrontier();
    await cache.refresh();
    // The L1 sync point moved, so the next pass tries to re-price rather than confirming the record in place.
    const moved = setFrontier({ l1SyncPoint: syncPoint(2) });
    globalVariableBuilder.buildCheckpointGlobalVariables.mockRejectedValue(new Error('L1 is down'));
    dateProvider.setTime(dateProvider.now() + MAX_AGE_MS - 1);

    const globals = await cache.getBoundaryGlobals(keyOf(frontier), moved, { maxWaitMs: 50 });

    expect(globals?.gasFees).toEqual(new GasFees(0, 1));
  });

  it('gives a capped reader nothing once the record is past the staleness cutoff', async () => {
    const frontier = setFrontier();
    await cache.refresh();
    const moved = setFrontier({ l1SyncPoint: syncPoint(2) });
    globalVariableBuilder.buildCheckpointGlobalVariables.mockRejectedValue(new Error('L1 is down'));
    dateProvider.setTime(dateProvider.now() + MAX_AGE_MS);

    await expect(cache.getBoundaryGlobals(keyOf(frontier), moved, { maxWaitMs: 50 })).resolves.toBeUndefined();
  });

  it('re-stamps a record a pass confirms unchanged, so a healthy loop never lets it go stale', async () => {
    const frontier = setFrontier();
    await cache.refresh();
    dateProvider.setTime(dateProvider.now() + MAX_AGE_MS);

    await cache.refresh();

    expect((await cache.getBoundaryGlobals(keyOf(frontier), frontier))?.gasFees).toEqual(new GasFees(0, 1));
    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
  });

  it('gives up on a capped wait rather than hanging on a stalled L1 call', async () => {
    const frontier = setFrontier();
    const stalled = promiseWithResolvers<CheckpointGlobalVariables>();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockReturnValue(stalled.promise);

    await expect(cache.getBoundaryGlobals(keyOf(frontier), frontier, { maxWaitMs: 20 })).resolves.toBeUndefined();

    stalled.resolve(globalsFor(SlotNumber(20), 1));
  });

  it('surfaces the L1 failure to an uncapped reader', async () => {
    const frontier = setFrontier();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockRejectedValue(new Error('L1 is down'));

    await expect(cache.getBoundaryGlobals(keyOf(frontier), frontier)).rejects.toThrow('L1 is down');
  });

  it('starts idempotently and primes the cache', async () => {
    const frontier = setFrontier();

    await cache.start();
    await cache.start();

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
    expect((await cache.getBoundaryGlobals(keyOf(frontier), frontier))?.gasFees).toEqual(new GasFees(0, 1));
  });

  it('starts even when the priming pass fails', async () => {
    setFrontier();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockRejectedValue(new Error('L1 is down'));

    await expect(cache.start()).resolves.toBeUndefined();
  });

  describe('overrides plan', () => {
    const overridesPlanOf = () => globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0][3];

    it('pins both tips to the checkpointed tip when the chain is idle', async () => {
      await cache.refresh(makeFrontier(boundaryArgs()));

      expect(overridesPlanOf()?.chainTipsOverride).toEqual({
        pending: CheckpointNumber(1),
        proven: CheckpointNumber(1),
      });
    });

    it('carries the proposed parent state when pipelining on a proposed checkpoint', async () => {
      const parentSlot = SlotNumber(30);
      const parentArchiveRoot = Fr.fromString('0xabcabc');
      const proposedCheckpoint = makeProposedCheckpointData({
        checkpointNumber: CheckpointNumber(3),
        lastBlock: BlockNumber(5),
        slotNumber: parentSlot,
        archiveRoot: parentArchiveRoot,
      });
      const grandparentFeeHeader = makeFeeHeader();
      rollupContract.getCheckpoint.mockResolvedValue({ feeHeader: grandparentFeeHeader } as never);
      rollupContract.getManaTarget.mockResolvedValue(1000n);
      const childFeeHeader = makeFeeHeader();
      jest.spyOn(RollupContract, 'computeChildFeeHeader').mockReturnValue(childFeeHeader);

      await cache.refresh(makeFrontier(boundaryArgs({ checkpointed: CheckpointNumber(2), proposedCheckpoint })));

      const [, , slot] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slot).toEqual(SlotNumber(31));
      expect(overridesPlanOf()?.pendingCheckpointState?.archive).toEqual(parentArchiveRoot);
      expect(overridesPlanOf()?.pendingCheckpointState?.slotNumber).toEqual(parentSlot);
      expect(overridesPlanOf()?.pendingCheckpointState?.feeHeader).toEqual(childFeeHeader);
      expect(RollupContract.computeChildFeeHeader).toHaveBeenCalledWith(
        grandparentFeeHeader,
        proposedCheckpoint.totalManaUsed,
        proposedCheckpoint.feeAssetPriceModifier,
        1000n,
      );
    });

    it('pins tips to firstInvalid - 1 when the pending chain is invalid', async () => {
      await cache.refresh(
        makeFrontier(
          boundaryArgs({
            checkpointed: CheckpointNumber(5),
            pendingChainValidationStatus: makeInvalidStatus(CheckpointNumber(4)),
          }),
        ),
      );

      expect(overridesPlanOf()?.chainTipsOverride).toEqual({
        pending: CheckpointNumber(3),
        proven: CheckpointNumber(3),
      });
    });

    describe('without a rollup contract, the TXE shape', () => {
      beforeEach(() => {
        cache = new NextBlockFeeCache({
          blockSource,
          globalVariableBuilder,
          epochCache,
          signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: EthAddress.random() },
          dateProvider,
        });
      });

      it('degrades to a pinned-tips plan when pipelining', async () => {
        const proposedCheckpoint = makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(3),
          lastBlock: BlockNumber(5),
          slotNumber: SlotNumber(30),
        });

        await cache.refresh(makeFrontier(boundaryArgs({ checkpointed: CheckpointNumber(2), proposedCheckpoint })));

        expect(overridesPlanOf()?.chainTipsOverride).toEqual({
          pending: CheckpointNumber(2),
          proven: CheckpointNumber(2),
        });
        expect(overridesPlanOf()?.pendingCheckpointState).toBeUndefined();
      });

      it('prices an idle chain', async () => {
        await cache.refresh(makeFrontier(boundaryArgs()));

        expect(overridesPlanOf()?.chainTipsOverride).toEqual({
          pending: CheckpointNumber(1),
          proven: CheckpointNumber(1),
        });
      });
    });
  });

  it('has nothing to price mid-checkpoint', async () => {
    blockSource.getL2Frontier.mockResolvedValue(
      makeFrontier({
        proposed: BlockNumber(9),
        checkpointedBlock: BlockNumber(3),
        checkpointed: CheckpointNumber(1),
        latestBlockGlobals: { slotNumber: SlotNumber(42) },
      }),
    );

    await cache.refresh();

    expect(globalVariableBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
    expect(rollupContract.getCheckpoint).not.toHaveBeenCalled();
  });
});
