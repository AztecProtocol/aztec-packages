import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import type { EpochCache } from '@aztec/epoch-cache';
import { MAX_FEE_ASSET_PRICE_MODIFIER_BPS } from '@aztec/ethereum/contracts';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type FieldsOf, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import type { BlockData, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { type Checkpoint, CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { ITxProvider, ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { GlobalVariables } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { CheckpointBuilder, FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import type { ValidatorMetrics } from './metrics.js';
import { ProposalHandler } from './proposal_handler.js';

/** Creates a checkpoint proposal core with the given overrides. */
async function makeProposal(overrides: Parameters<typeof makeCheckpointProposal>[0] = {}) {
  return (
    await makeCheckpointProposal({
      checkpointHeader: makeCheckpointHeader(0, { slotNumber: SlotNumber(1) }),
      ...overrides,
    })
  ).toCore();
}

describe('ProposalHandler checkpoint validation', () => {
  let handler: ProposalHandler;
  let blockSource: MockProxy<L2BlockSource & L2BlockSink>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
  let dateProvider: TestDateProvider;
  let metrics: MockProxy<ValidatorMetrics>;
  let config: ValidatorClientFullConfig;
  let consensusTimetable: ConsensusTimetable;

  const proposalInfo = {};

  beforeEach(() => {
    blockSource = mock<L2BlockSource & L2BlockSink>();
    blockSource.getCheckpointsData.mockResolvedValue([]);
    blockSource.getBlocksForSlot.mockResolvedValue([]);
    blockSource.syncImmediate.mockResolvedValue(undefined);

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);

    checkpointsBuilder = mock<FullNodeCheckpointsBuilder>();
    checkpointsBuilder.getConfig.mockReturnValue({
      l1GenesisTime: 1n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
      rollupManaLimit: 200_000_000,
    });

    epochCache = mock<EpochCache>();
    epochCache.getL1Constants.mockReturnValue({
      l1GenesisTime: 0n,
      slotDuration: 24,
      ethereumSlotDuration: 4,
      epochDuration: 8,
    } as L1RollupConstants);

    dateProvider = new TestDateProvider();
    metrics = mock<ValidatorMetrics>();

    config = {
      l1ChainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId,
      rollupAddress: TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress,
    } as ValidatorClientFullConfig;

    consensusTimetable = new ConsensusTimetable({ l1Constants: epochCache.getL1Constants() });

    handler = new ProposalHandler(
      checkpointsBuilder,
      mock<WorldStateSynchronizer>(),
      blockSource,
      l1ToL2MessageSource,
      mock<ITxProvider>(),
      mock<BlockProposalValidator>(),
      epochCache,
      consensusTimetable,
      config,
      mock<BlobClientInterface>(),
      new CheckpointReexecutionTracker(),
      metrics,
      dateProvider,
    );
  });

  describe('handleCheckpointProposal', () => {
    it('rejects proposals with invalid signature', async () => {
      const proposal = await makeProposal();
      jest.spyOn(proposal, 'getSender').mockReturnValue(undefined);

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'invalid_signature' });
    });

    it('rejects proposals with invalid feeAssetPriceModifier (too negative)', async () => {
      const proposal = await makeProposal({ feeAssetPriceModifier: -MAX_FEE_ASSET_PRICE_MODIFIER_BPS - 1n });

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'invalid_fee_asset_price_modifier' });
    });

    it('rejects proposals with invalid feeAssetPriceModifier (too positive)', async () => {
      const proposal = await makeProposal({ feeAssetPriceModifier: MAX_FEE_ASSET_PRICE_MODIFIER_BPS + 1n });

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'invalid_fee_asset_price_modifier' });
    });

    it('returns last_block_not_found when block is not found before timeout', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'last_block_not_found' });
    });

    it('returns no_blocks_for_slot when no blocks exist for the slot', async () => {
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      blockSource.getBlocksForSlot.mockResolvedValue([]);

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'no_blocks_for_slot' });
    });

    it('returns last_block_archive_mismatch when last block archive does not match', async () => {
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      const blocks = [
        { archive: new AppendOnlyTreeSnapshot(Fr.random(), 1), number: 1 },
        { archive: new AppendOnlyTreeSnapshot(Fr.random(), 2), number: 2 },
      ] as unknown as L2Block[];
      blockSource.getBlocksForSlot.mockResolvedValue(blocks);

      const proposal = await makeProposal({ archiveRoot: Fr.random() });

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'last_block_archive_mismatch' });
    });

    it('returns too_many_blocks_in_checkpoint when blocks exceed maxBlocksPerCheckpoint', async () => {
      config = { ...config, maxBlocksPerCheckpoint: 2 };
      handler = new ProposalHandler(
        checkpointsBuilder,
        mock<WorldStateSynchronizer>(),
        blockSource,
        l1ToL2MessageSource,
        mock<ITxProvider>(),
        mock<BlockProposalValidator>(),
        epochCache,
        consensusTimetable,
        config,
        mock<BlobClientInterface>(),
        new CheckpointReexecutionTracker(),
        metrics,
        dateProvider,
      );

      const archiveRoot = Fr.random();
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      const blocks = [
        { archive: new AppendOnlyTreeSnapshot(Fr.random(), 1), number: 1 },
        { archive: new AppendOnlyTreeSnapshot(Fr.random(), 2), number: 2 },
        { archive: new AppendOnlyTreeSnapshot(archiveRoot, 3), number: 3 },
      ] as unknown as L2Block[];
      blockSource.getBlocksForSlot.mockResolvedValue(blocks);

      const proposal = await makeProposal({ archiveRoot });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'too_many_blocks_in_checkpoint' });
    });

    it('caches validation result and returns it on second call', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);
      const proposal = await makeProposal();

      const result1 = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result1.isValid).toBe(false);

      // Reset mocks to verify they're NOT called again
      blockSource.getBlockData.mockClear();
      blockSource.syncImmediate.mockClear();

      const result2 = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result2).toEqual(result1);
      expect(blockSource.syncImmediate).not.toHaveBeenCalled();
    });

    it('does not use cache for a different proposal', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);

      await handler.handleCheckpointProposal(await makeProposal({ archiveRoot: Fr.random() }), proposalInfo);
      blockSource.syncImmediate.mockClear();

      await handler.handleCheckpointProposal(await makeProposal({ archiveRoot: Fr.random() }), proposalInfo);
      expect(blockSource.syncImmediate).toHaveBeenCalled();
    });

    // Regression for A-1013: cache used to key by (archive, slot) which let two proposals at the
    // same slot+archive but with a different feeAssetPriceModifier share the same cache entry.
    it('does not cache across proposals that share archive and slot but differ in feeAssetPriceModifier', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);
      const sharedHeader = makeCheckpointHeader(0, { slotNumber: SlotNumber(1) });
      const sharedArchive = Fr.random();

      const proposalA = await makeProposal({
        checkpointHeader: sharedHeader,
        archiveRoot: sharedArchive,
        feeAssetPriceModifier: 50n,
      });
      await handler.handleCheckpointProposal(proposalA, proposalInfo);
      blockSource.syncImmediate.mockClear();

      const proposalB = await makeProposal({
        checkpointHeader: sharedHeader,
        archiveRoot: sharedArchive,
        feeAssetPriceModifier: -50n,
      });
      await handler.handleCheckpointProposal(proposalB, proposalInfo);
      expect(blockSource.syncImmediate).toHaveBeenCalled();
    });

    it('returns block_fetch_error when getBlockData throws', async () => {
      blockSource.getBlockData.mockRejectedValue(new Error('db connection failed'));

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'block_fetch_error' });
    });

    // Regression: a timeout of 0 means "never time out" in retryUntil. When the validation deadline is
    // already in the past, computing the timeout with Math.floor((deadline - now)/1000) yields 0 (or a
    // negative number), so the block-sync wait would loop forever past the consensus deadline. The
    // handler must instead fail fast without entering the retry loop after a single attempt.
    it('fails fast (does not hang) when the validation deadline is already in the past', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);

      // attestation_deadline(slot=1) = 1*24 + 24 - 8 = 40s. Hold wall-clock past it.
      dateProvider.setTime(41_000);

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'last_block_not_found' });
      // One immediate fetch attempt, then no retry loop (which would poll repeatedly past the deadline).
      expect(blockSource.syncImmediate).toHaveBeenCalledTimes(1);
    });

    // Even past the deadline, an already-synced block must still be accepted (the immediate fetch
    // succeeds before the fail-fast applies), rather than being abandoned for being late.
    it('returns an already-synced block even when the deadline is in the past', async () => {
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      blockSource.getBlocksForSlot.mockResolvedValue([]);
      dateProvider.setTime(41_000);

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      // Got past the block-sync wait (would be last_block_not_found if it failed fast unconditionally).
      expect(result).toEqual({ isValid: false, reason: 'no_blocks_for_slot' });
    });

    // With <1s remaining the old Math.floor(...) timeout collapsed to 0 ("never time out"). The fix uses
    // a strictly-positive fractional timeout, so the wait still terminates instead of hanging.
    it('terminates with a fractional sub-second timeout when <1s remains before the deadline', async () => {
      blockSource.getBlockData.mockResolvedValue(undefined);

      // 39.7s: ~0.3s before the 40s deadline. Old code: floor(0.3) = 0 → never times out.
      dateProvider.setTime(39_700);

      const result = await handler.handleCheckpointProposal(await makeProposal(), proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'last_block_not_found' });
    });
  });

  describe('checkpoint proposal pipelining timing', () => {
    it('records receive-to-pipelined-state duration when proposed checkpoint is set from a foreign proposal', async () => {
      const proposal = await makeProposal();
      const p2p = mock<P2P>();
      let checkpointHandler: ((proposal: any, sender: any) => Promise<unknown>) | undefined;
      p2p.registerAllNodesCheckpointProposalHandler.mockImplementation(handler => {
        checkpointHandler = handler;
      });

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getL1Constants'>>();
      archiver.addProposedCheckpoint.mockResolvedValue(undefined);

      const blockData = {
        checkpointNumber: CheckpointNumber(3),
        header: { getBlockNumber: () => 9 },
        indexWithinCheckpoint: 2,
      } as BlockData;
      blockSource.getBlockData.mockResolvedValue(blockData);

      jest
        .spyOn(handler, 'handleCheckpointProposal')
        .mockResolvedValue({ isValid: true, checkpointNumber: CheckpointNumber(3) });

      handler.register(p2p, true, archiver);
      await checkpointHandler!(proposal, {} as any);

      expect(archiver.addProposedCheckpoint).toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalToPipelinedStateDuration).toHaveBeenCalledWith(expect.any(Number));
    });

    // The checkpoint-validation block-sync deadline is the L1 publish deadline (12s/one Ethereum
    // slot before the last L1 block of the target slot), which is later than the target-slot start
    // used for block re-execution. With slotDuration=24, ethereumSlotDuration=4 and proposal slot=1:
    //   target_start                = timestamp(1)                      = 24s
    //   old deadline (slot start)    = getReexecutionDeadline(1)         = 24s
    //   new deadline (publish)       = getLastL1SlotTimestampForL2Slot(1) - E = 24 + 20 - 4 = 40s
    // Holding wall-clock time at 30s (after the old deadline, before the new one) lets us tell the
    // two apart: under the new deadline the handler still has budget to wait for the block to sync,
    // so it gets past the sync wait; under the old deadline it would immediately time out.
    it('uses the L1 publish deadline (not the target-slot start) for the block-sync wait', async () => {
      const proposal = await makeProposal({ checkpointHeader: makeCheckpointHeader(0, { slotNumber: SlotNumber(1) }) });

      // 30s into the epoch: past the old target-slot-start deadline (24s), before the publish one (40s).
      dateProvider.setTime(30_000);

      // Block is unavailable for the first couple of polls, then syncs in. Under the new (later)
      // deadline the retry budget covers this; under the old deadline the wait would time out first.
      blockSource.getBlockData
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({ checkpointNumber: CheckpointNumber(1) } as BlockData);
      // No blocks for the slot, so validation stops right after the sync wait with a distinct reason.
      blockSource.getBlocksForSlot.mockResolvedValue([]);

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);

      // Got past the block-sync wait (would be `last_block_not_found` under the old deadline).
      expect(result).toEqual({ isValid: false, reason: 'no_blocks_for_slot', checkpointNumber: CheckpointNumber(1) });
    });
  });

  describe('own checkpoint proposal handling', () => {
    it('skips validation and does not touch the archiver for own proposals', async () => {
      // The proposer's own proposed checkpoint is now set locally by the sequencer job, not via the
      // p2p loopback, so the all-nodes handler must not re-validate or re-add it.
      const signer = Secp256k1Signer.random();
      const proposal = await makeProposal({ signer });

      const p2p = mock<P2P>();
      let checkpointHandler: ((proposal: any, sender: any) => Promise<unknown>) | undefined;
      p2p.registerAllNodesCheckpointProposalHandler.mockImplementation(handler => {
        checkpointHandler = handler;
      });

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint'>>();
      const handleSpy = jest.spyOn(handler, 'handleCheckpointProposal');

      handler.register(p2p, true, archiver, () => [signer.address.toString()]);
      await checkpointHandler!(proposal, {} as any);

      expect(handleSpy).not.toHaveBeenCalled();
      expect(archiver.addProposedCheckpoint).not.toHaveBeenCalled();
      expect(blockSource.getBlockData).not.toHaveBeenCalled();
    });
  });

  describe('deep validation (openCheckpoint + completeCheckpoint)', () => {
    const archiveRoot = Fr.random();
    const checkpointOutHash = Fr.random();
    let mockCheckpointBuilder: MockProxy<CheckpointBuilder>;
    let mockDispose: jest.Mock;

    /** Sets up mocks so the handler passes all early checks and reaches the checkpoint rebuild path. */
    function setupDeepValidationMocks(computedCheckpoint: Partial<Checkpoint>) {
      // Block with matching archive so the early archive check passes
      const block = {
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        number: 1,
        checkpointNumber: CheckpointNumber(1),
        header: { globalVariables: GlobalVariables.empty({ slotNumber: SlotNumber(1) }) },
      } as unknown as L2Block;

      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      blockSource.getBlocksForSlot.mockResolvedValue([block]);

      mockDispose = jest.fn();
      checkpointsBuilder.getFork.mockResolvedValue({ [Symbol.asyncDispose]: mockDispose } as any);

      mockCheckpointBuilder = mock<CheckpointBuilder>();
      mockCheckpointBuilder.completeCheckpoint.mockResolvedValue({
        header: CheckpointHeader.empty(),
        archive: new AppendOnlyTreeSnapshot(Fr.ZERO, 0),
        getCheckpointOutHash: () => checkpointOutHash,
        blocks: [],
        number: CheckpointNumber(1),
        slot: SlotNumber(1),
        ...computedCheckpoint,
      } as unknown as Checkpoint);
      checkpointsBuilder.openCheckpoint.mockResolvedValue(mockCheckpointBuilder);
    }

    /** Creates a CheckpointHeader.empty at slot 1 with the given overrides. */
    function makeHeader(overrides: Partial<FieldsOf<CheckpointHeader>> = {}) {
      return CheckpointHeader.empty({ slotNumber: SlotNumber(1), ...overrides });
    }

    /** Creates a header with a matching epoch out hash (passes the out_hash check). */
    function makeMatchingHeader(overrides: Partial<FieldsOf<CheckpointHeader>> = {}) {
      const epochOutHash = accumulateCheckpointOutHashes([checkpointOutHash]);
      return makeHeader({ epochOutHash, ...overrides });
    }

    it('returns checkpoint_header_mismatch when headers differ', async () => {
      const proposalHeader = makeHeader();
      const computedHeader = makeHeader({ totalManaUsed: new Fr(999) });

      setupDeepValidationMocks({ header: computedHeader });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: proposalHeader });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({
        isValid: false,
        reason: 'checkpoint_header_mismatch',
        checkpointNumber: CheckpointNumber(1),
      });
      expect(mockDispose).toHaveBeenCalled();
    });

    it('returns archive_mismatch when computed archive differs from proposal', async () => {
      const header = makeHeader();

      setupDeepValidationMocks({
        header,
        archive: new AppendOnlyTreeSnapshot(Fr.random(), 1),
      });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: header });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'archive_mismatch', checkpointNumber: CheckpointNumber(1) });
    });

    it('returns out_hash_mismatch when epoch out hash differs', async () => {
      const header = makeHeader({ epochOutHash: Fr.random() });

      setupDeepValidationMocks({
        header,
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
      });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: header });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: false, reason: 'out_hash_mismatch', checkpointNumber: CheckpointNumber(1) });
    });

    it('returns checkpoint_validation_failed when validateCheckpoint throws', async () => {
      const header = makeMatchingHeader();

      setupDeepValidationMocks({
        header,
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        // Empty blocks array triggers validateCheckpointStructure failure ("Checkpoint has no blocks")
        blocks: [],
      });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: header });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({
        isValid: false,
        reason: 'checkpoint_validation_failed',
        checkpointNumber: CheckpointNumber(1),
      });
    });

    it('returns isValid true when everything matches', async () => {
      const lastArchiveRoot = Fr.random();
      const header = makeMatchingHeader({ lastArchiveRoot });

      // Block global variables must match the checkpoint header fields
      const blockHeader = makeBlockHeader(1, {
        slotNumber: SlotNumber(1),
        coinbase: header.coinbase,
        feeRecipient: header.feeRecipient,
        gasFees: header.gasFees,
        timestamp: header.timestamp,
      });
      unfreeze(blockHeader).lastArchive = new AppendOnlyTreeSnapshot(lastArchiveRoot, 0);

      const minimalBlock = {
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        number: 1,
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: 0,
        slot: SlotNumber(1),
        header: blockHeader,
        body: { txEffects: [] },
        computeDAGasUsed: () => 0,
        toBlobFields: () => [],
      } as unknown as L2Block;

      setupDeepValidationMocks({
        header,
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        blocks: [minimalBlock],
        number: CheckpointNumber(1),
        slot: SlotNumber(1),
        toBlobFields: () => [],
      });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: header });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({ isValid: true, checkpointNumber: CheckpointNumber(1) });
      expect(mockDispose).toHaveBeenCalled();
    });

    it('disposes fork even when validation fails', async () => {
      setupDeepValidationMocks({ header: CheckpointHeader.empty() });

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: makeHeader() });
      await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(mockDispose).toHaveBeenCalled();
    });
  });
});
