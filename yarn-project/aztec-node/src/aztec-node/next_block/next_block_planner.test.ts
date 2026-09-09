import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import {
  type BoundaryFeeKey,
  boundaryFeeKeyEquals,
  computeBoundaryFeeKey,
  planNextBlock,
} from './next_block_planner.js';
import {
  type L2FrontierArgs,
  blockHashOf,
  makeFrontier,
  makeInvalidStatus,
  makeProposedCheckpointData,
} from './test_helpers.js';

describe('next block planner', () => {
  /** The latest proposed block (5) coincides with the proposed-checkpoint frontier: the next block opens one. */
  const boundaryArgs = (args: Partial<L2FrontierArgs> = {}): L2FrontierArgs => ({
    proposed: BlockNumber(5),
    checkpointedBlock: BlockNumber(5),
    checkpointed: CheckpointNumber(1),
    checkpointedTipSlot: SlotNumber(5),
    ...args,
  });

  /** A proposed checkpoint (#2) ends at block 5 while the proposed tip (9) is ahead: mid-checkpoint. */
  const midCheckpointArgs = (args: Partial<L2FrontierArgs> = {}): L2FrontierArgs => ({
    proposed: BlockNumber(9),
    checkpointedBlock: BlockNumber(3),
    checkpointed: CheckpointNumber(1),
    checkpointedTipSlot: SlotNumber(5),
    latestBlockGlobals: { slotNumber: SlotNumber(42) },
    proposedCheckpoint: makeProposedCheckpointData({
      checkpointNumber: CheckpointNumber(2),
      lastBlock: BlockNumber(5),
    }),
    ...args,
  });

  const plan = (args: L2FrontierArgs, clockSlot: SlotNumber) => planNextBlock(makeFrontier(args), clockSlot);

  const keyFor = (args: L2FrontierArgs, clockSlot: SlotNumber): BoundaryFeeKey => {
    const frontier = makeFrontier(args);
    const key = computeBoundaryFeeKey(planNextBlock(frontier, clockSlot), frontier.pendingChainValidationStatus);
    expect(key).toBeDefined();
    return key!;
  };

  describe('continuing vs opening a checkpoint', () => {
    it('continues the in-progress checkpoint when the proposed tip is ahead of its last block', () => {
      const result = plan(midCheckpointArgs(), SlotNumber(100));

      expect(result.newCheckpoint).toBeUndefined();
      expect(result.latestBlockNumber).toEqual(BlockNumber(9));
      expect(result.latestBlockHash).toEqual(blockHashOf(BlockNumber(9)).toString());
    });

    it('opens a new checkpoint when the proposed tip coincides with the checkpoint frontier', () => {
      const result = plan(boundaryArgs(), SlotNumber(20));

      expect(result.latestBlockNumber).toEqual(BlockNumber(5));
      expect(result.newCheckpoint).toEqual({
        targetSlot: SlotNumber(20),
        targetCheckpoint: CheckpointNumber(2),
        proposedCheckpointData: undefined,
        checkpointedCheckpointNumber: CheckpointNumber(1),
      });
    });

    it('targets the checkpoint after the proposed parent when pipelining', () => {
      const result = plan(
        boundaryArgs({
          checkpointed: CheckpointNumber(2),
          proposedCheckpoint: makeProposedCheckpointData({
            checkpointNumber: CheckpointNumber(3),
            lastBlock: BlockNumber(5),
            slotNumber: SlotNumber(30),
          }),
        }),
        SlotNumber(5),
      );

      expect(result.newCheckpoint?.targetCheckpoint).toEqual(CheckpointNumber(4));
      expect(result.newCheckpoint?.checkpointedCheckpointNumber).toEqual(CheckpointNumber(2));
    });
  });

  describe('target slot', () => {
    it('takes the clock slot when it is ahead of every floor', () => {
      expect(
        plan(boundaryArgs({ checkpointedTipSlot: SlotNumber(14) }), SlotNumber(21)).newCheckpoint?.targetSlot,
      ).toEqual(SlotNumber(21));
    });

    it('takes the proposed parent slot plus one when the parent is ahead of the clock', () => {
      const args = boundaryArgs({
        checkpointed: CheckpointNumber(2),
        proposedCheckpoint: makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(3),
          lastBlock: BlockNumber(5),
          slotNumber: SlotNumber(30),
        }),
      });

      expect(plan(args, SlotNumber(5)).newCheckpoint?.targetSlot).toEqual(SlotNumber(31));
    });

    it('floors the target slot at the checkpointed tip slot plus one when the clock lags the chain', () => {
      const args = boundaryArgs({ checkpointedTipSlot: SlotNumber(14) });

      expect(plan(args, SlotNumber(13)).newCheckpoint?.targetSlot).toEqual(SlotNumber(15));
    });

    it('skips the floor at genesis, where no checkpoint has landed yet', () => {
      const args: L2FrontierArgs = {
        proposed: BlockNumber.ZERO,
        checkpointedBlock: BlockNumber.ZERO,
        checkpointed: CheckpointNumber(0),
      };

      expect(plan(args, SlotNumber(4)).newCheckpoint?.targetSlot).toEqual(SlotNumber(4));
    });
  });

  describe('boundary fee key', () => {
    it('is undefined mid-checkpoint, where the fee is frozen in the header', () => {
      const frontier = makeFrontier(midCheckpointArgs());

      expect(
        computeBoundaryFeeKey(planNextBlock(frontier, SlotNumber(100)), frontier.pendingChainValidationStatus),
      ).toBeUndefined();
    });

    it('is stable when nothing moves', () => {
      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(boundaryArgs(), SlotNumber(20)))).toBe(
        true,
      );
    });

    it('moves when the target slot moves', () => {
      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(boundaryArgs(), SlotNumber(21)))).toBe(
        false,
      );
    });

    it('moves when the checkpointed checkpoint moves', () => {
      const moved = boundaryArgs({ checkpointed: CheckpointNumber(2) });

      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(moved, SlotNumber(20)))).toBe(false);
    });

    it('moves when the latest block hash moves', () => {
      const moved = boundaryArgs({ proposed: BlockNumber(6), checkpointedBlock: BlockNumber(6) });

      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(moved, SlotNumber(20)))).toBe(false);
    });

    it('moves when the pending chain validity flips', () => {
      const invalid = boundaryArgs({ pendingChainValidationStatus: makeInvalidStatus(CheckpointNumber(4)) });

      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(invalid, SlotNumber(20)))).toBe(false);
    });

    it('moves when the first invalid checkpoint moves', () => {
      const first = boundaryArgs({ pendingChainValidationStatus: makeInvalidStatus(CheckpointNumber(4)) });
      const second = boundaryArgs({ pendingChainValidationStatus: makeInvalidStatus(CheckpointNumber(5)) });

      expect(boundaryFeeKeyEquals(keyFor(first, SlotNumber(20)), keyFor(second, SlotNumber(20)))).toBe(false);
    });

    it('moves when a proposed parent replaces the checkpointed one', () => {
      const pipelined = boundaryArgs({
        proposedCheckpoint: makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(2),
          lastBlock: BlockNumber(5),
        }),
      });

      expect(boundaryFeeKeyEquals(keyFor(boundaryArgs(), SlotNumber(20)), keyFor(pipelined, SlotNumber(20)))).toBe(
        false,
      );
    });

    describe.each([
      ['archive root', { archiveRoot: Fr.fromString('0xdead') }],
      ['checkpoint out hash', { checkpointOutHash: Fr.fromString('0xbeef') }],
      ['total mana used', { totalManaUsed: 999n }],
      ['fee asset price modifier', { feeAssetPriceModifier: 11n }],
      ['header slot', { slotNumber: SlotNumber(31) }],
    ])('proposed parent %s', (_name, change) => {
      it('moves the key', () => {
        const base = {
          checkpointNumber: CheckpointNumber(3),
          lastBlock: BlockNumber(5),
          slotNumber: SlotNumber(30),
        };
        // The target slot is pinned above both parents' slots so only the parent field under test differs.
        const clockSlot = SlotNumber(100);
        const before = boundaryArgs({ proposedCheckpoint: makeProposedCheckpointData(base) });
        const after = boundaryArgs({ proposedCheckpoint: makeProposedCheckpointData({ ...base, ...change }) });

        expect(boundaryFeeKeyEquals(keyFor(before, clockSlot), keyFor(after, clockSlot))).toBe(false);
      });
    });
  });
});
