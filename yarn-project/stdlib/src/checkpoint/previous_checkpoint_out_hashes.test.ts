import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import { mock } from 'jest-mock-extended';

import type { L2BlockSource } from '../block/l2_block_source.js';
import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import type { CheckpointData, ProposedCheckpointData } from './checkpoint_data.js';
import { getPreviousCheckpointOutHashes } from './previous_checkpoint_out_hashes.js';
import { L1PublishedData } from './published_checkpoint.js';

const l1Constants: Pick<L1RollupConstants, 'epochDuration'> = { epochDuration: 16 };

function checkpointData(number: number, outHash: Fr): CheckpointData {
  return {
    checkpointNumber: CheckpointNumber(number),
    header: CheckpointHeader.empty(),
    archive: AppendOnlyTreeSnapshot.empty(),
    checkpointOutHash: outHash,
    startBlock: BlockNumber(1),
    blockCount: 1,
    feeAssetPriceModifier: 0n,
    attestations: [],
    l1: L1PublishedData.random(),
  };
}

function proposedParent(number: number, slot: number, outHash: Fr): ProposedCheckpointData {
  return {
    checkpointNumber: CheckpointNumber(number),
    header: CheckpointHeader.empty({ slotNumber: SlotNumber(slot) }),
    archive: AppendOnlyTreeSnapshot.empty(),
    checkpointOutHash: outHash,
    startBlock: BlockNumber(1),
    blockCount: 1,
    totalManaUsed: 0n,
    feeAssetPriceModifier: 0n,
  };
}

describe('getPreviousCheckpointOutHashes', () => {
  let blockSource: ReturnType<typeof mock<Pick<L2BlockSource, 'getCheckpointsData' | 'getProposedCheckpointData'>>>;

  beforeEach(() => {
    blockSource = mock<Pick<L2BlockSource, 'getCheckpointsData' | 'getProposedCheckpointData'>>();
    blockSource.getProposedCheckpointData.mockResolvedValue(undefined);
  });

  describe('without pipelining (e.g. AutomineSequencer)', () => {
    it('returns the confirmed out hashes in order without consulting the proposed checkpoint', async () => {
      const [hashA, hashB] = [Fr.random(), Fr.random()];
      // Returned out of order and including a checkpoint at/after `checkpointNumber` to confirm sorting + filtering.
      blockSource.getCheckpointsData.mockResolvedValue([
        checkpointData(2, hashB),
        checkpointData(3, Fr.random()),
        checkpointData(1, hashA),
      ]);

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(0),
        checkpointNumber: CheckpointNumber(3),
        l1Constants,
        pipeliningEnabled: false,
      });

      expect(result).toEqual([hashA, hashB]);
      expect(blockSource.getProposedCheckpointData).not.toHaveBeenCalled();
    });

    it('does not splice a locally-proposed parent even when the confirmed parent is missing on L1', async () => {
      // The proposer's parent (cp 1) has not landed on L1 yet, so the confirmed set is empty. Without
      // pipelining we must NOT graft the proposed parent's out hash — this is the automine guarantee.
      blockSource.getCheckpointsData.mockResolvedValue([]);
      blockSource.getProposedCheckpointData.mockResolvedValue(proposedParent(1, 0, Fr.random()));

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(0),
        checkpointNumber: CheckpointNumber(2),
        l1Constants,
        pipeliningEnabled: false,
      });

      expect(result).toEqual([]);
      expect(blockSource.getProposedCheckpointData).not.toHaveBeenCalled();
    });
  });

  describe('with pipelining', () => {
    it('returns only the confirmed out hashes for the first checkpoint of an epoch', async () => {
      blockSource.getCheckpointsData.mockResolvedValue([]);

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(2),
        checkpointNumber: CheckpointNumber(0),
        l1Constants,
        pipeliningEnabled: true,
      });

      expect(result).toEqual([]);
      expect(blockSource.getProposedCheckpointData).not.toHaveBeenCalled();
    });

    it('does not splice when the confirmed parent is already present on L1', async () => {
      const parentHash = Fr.random();
      blockSource.getCheckpointsData.mockResolvedValue([checkpointData(4, parentHash)]);

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(2),
        checkpointNumber: CheckpointNumber(5),
        l1Constants,
        pipeliningEnabled: true,
      });

      expect(result).toEqual([parentHash]);
      expect(blockSource.getProposedCheckpointData).not.toHaveBeenCalled();
    });

    it('splices the locally-proposed parent out hash when it has not landed on L1 yet', async () => {
      const proposedHash = Fr.random();
      // Confirmed set is missing the immediate parent (cp 4); the proposed parent sits in the same epoch.
      blockSource.getCheckpointsData.mockResolvedValue([]);
      blockSource.getProposedCheckpointData.mockResolvedValue(
        proposedParent(4, 2 * l1Constants.epochDuration + 1, proposedHash),
      );

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(2),
        checkpointNumber: CheckpointNumber(5),
        l1Constants,
        pipeliningEnabled: true,
      });

      expect(result).toEqual([proposedHash]);
      expect(blockSource.getProposedCheckpointData).toHaveBeenCalledWith({ number: CheckpointNumber(4) });
    });

    it('does not splice a proposed parent that belongs to a different epoch', async () => {
      // Proposed parent (cp 4) sits in epoch 1, but we are building the first checkpoint of epoch 2.
      blockSource.getCheckpointsData.mockResolvedValue([]);
      blockSource.getProposedCheckpointData.mockResolvedValue(
        proposedParent(4, l1Constants.epochDuration - 1, Fr.random()),
      );

      const result = await getPreviousCheckpointOutHashes({
        blockSource,
        epoch: EpochNumber(2),
        checkpointNumber: CheckpointNumber(5),
        l1Constants,
        pipeliningEnabled: true,
      });

      expect(result).toEqual([]);
    });
  });
});
