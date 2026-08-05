import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { INITIAL_L2_BLOCK_NUM, MAX_BLOCKS_PER_CHECKPOINT } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { MAX_FEE_ASSET_PRICE_MODIFIER_BPS } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type FieldsOf, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import { BlockHash } from '@aztec/stdlib/block';
import type { BlockData, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { type Checkpoint, CheckpointReexecutionTracker, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { ITxProvider, ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { InboxBucket, L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { InboxBucketRef, accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { GlobalVariables, TX_ERROR_INVALID_PROOF, TxHash } from '@aztec/stdlib/tx';
import { InvalidBlockProposalTxsError } from '@aztec/stdlib/validators';

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

    consensusTimetable = new ConsensusTimetable({ l1Constants: epochCache.getL1Constants(), blockDuration: 3 });

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

    it('returns too_many_blocks_in_checkpoint when blocks exceed the protocol cap without an operator limit', async () => {
      // The checkpoint root circuit caps the blocks a checkpoint may contain; an over-cap checkpoint is unprovable,
      // and L1 cannot reject it at propose time, so the validator must not attest to it.
      expect(config.maxBlocksPerCheckpoint).toBeUndefined();

      const archiveRoot = Fr.random();
      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      const overCap = MAX_BLOCKS_PER_CHECKPOINT + 1;
      const blocks = Array.from({ length: overCap }, (_, i) => ({
        archive: new AppendOnlyTreeSnapshot(i === overCap - 1 ? archiveRoot : Fr.random(), i + 1),
        number: i + 1,
      })) as unknown as L2Block[];
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

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData' | 'getL1Constants'>>();
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
    /** Registers the handler with the given own-validator addresses and returns the captured callback. */
    function registerWithOwnAddresses(
      addresses: string[],
      archiver: MockProxy<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>>,
    ) {
      const p2p = mock<P2P>();
      let checkpointHandler: ((proposal: any, sender: any) => Promise<unknown>) | undefined;
      p2p.registerAllNodesCheckpointProposalHandler.mockImplementation(h => {
        checkpointHandler = h;
      });
      handler.register(p2p, true, archiver, () => addresses);
      return checkpointHandler!;
    }

    it('takes the idempotent fast path when a matching proposed checkpoint already exists', async () => {
      // True local proposer: its sequencer job already pushed a proposed checkpoint with this exact
      // archive. The all-nodes handler must not re-validate or re-add it.
      const signer = Secp256k1Signer.random();
      const proposal = await makeProposal({ signer });

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>>();
      archiver.getProposedCheckpointData.mockResolvedValue({
        archive: new AppendOnlyTreeSnapshot(proposal.archive, 1),
      } as ProposedCheckpointData);
      const handleSpy = jest.spyOn(handler, 'handleCheckpointProposal');

      const checkpointHandler = registerWithOwnAddresses([signer.address.toString()], archiver);
      await checkpointHandler(proposal, {} as any);

      expect(handleSpy).not.toHaveBeenCalled();
      expect(archiver.addProposedCheckpoint).not.toHaveBeenCalled();
    });

    it('validates and hydrates when no proposed checkpoint exists yet (HA peer)', async () => {
      // HA peer that shares the proposer's keys but never built the checkpoint: it has nothing stored, so
      // it falls through to the normal validate-then-persist path to hydrate the proposed-checkpoint
      // metadata it needs to build the next slot.
      const signer = Secp256k1Signer.random();
      const checkpointHeader = makeCheckpointHeader(0, { slotNumber: SlotNumber(1), totalManaUsed: new Fr(4242) });
      const proposal = await makeProposal({ signer, checkpointHeader, feeAssetPriceModifier: 7n });

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>>();
      archiver.getProposedCheckpointData.mockResolvedValue(undefined);
      archiver.addProposedCheckpoint.mockResolvedValue(undefined);

      const blockData = {
        checkpointNumber: CheckpointNumber(3),
        header: { getBlockNumber: () => 9 },
        indexWithinCheckpoint: 2,
      } as BlockData;
      blockSource.getBlockData.mockResolvedValue(blockData);

      const handleSpy = jest
        .spyOn(handler, 'handleCheckpointProposal')
        .mockResolvedValue({ isValid: true, checkpointNumber: CheckpointNumber(3) });

      const checkpointHandler = registerWithOwnAddresses([signer.address.toString()], archiver);
      await checkpointHandler(proposal, {} as any);

      // Own-but-missing falls through to full checkpoint validation, then persists the derived metadata:
      // checkpoint number, start block (blockNumber - index), block count (index + 1), total mana from the
      // proposal header, and fee modifier from the proposal.
      expect(handleSpy).toHaveBeenCalled();
      expect(archiver.addProposedCheckpoint).toHaveBeenCalledWith({
        header: proposal.checkpointHeader,
        checkpointNumber: CheckpointNumber(3),
        startBlock: BlockNumber(7),
        blockCount: 3,
        totalManaUsed: 4242n,
        feeAssetPriceModifier: 7n,
      });
    });

    it('validates (no special-casing) when an existing proposed checkpoint has a different archive', async () => {
      // Own proposal whose stored proposed checkpoint has a different archive root: there is no conflict
      // special-case, so it falls through to the normal validate path like any other proposal.
      const signer = Secp256k1Signer.random();
      const proposal = await makeProposal({ signer });

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>>();
      archiver.getProposedCheckpointData.mockResolvedValue({
        archive: new AppendOnlyTreeSnapshot(Fr.random(), 1),
      } as ProposedCheckpointData);
      archiver.addProposedCheckpoint.mockResolvedValue(undefined);

      const blockData = {
        checkpointNumber: CheckpointNumber(3),
        header: { getBlockNumber: () => 9 },
        indexWithinCheckpoint: 2,
      } as BlockData;
      blockSource.getBlockData.mockResolvedValue(blockData);

      const handleSpy = jest
        .spyOn(handler, 'handleCheckpointProposal')
        .mockResolvedValue({ isValid: true, checkpointNumber: CheckpointNumber(3) });

      const checkpointHandler = registerWithOwnAddresses([signer.address.toString()], archiver);
      await checkpointHandler(proposal, {} as any);

      expect(handleSpy).toHaveBeenCalled();
    });

    it('still validates and sets the proposed checkpoint for foreign proposals', async () => {
      // A proposal signed by a key this node does not own follows the normal validate-then-persist path.
      const proposal = await makeProposal();

      const archiver = mock<Pick<Archiver, 'addProposedCheckpoint' | 'getProposedCheckpointData'>>();
      archiver.addProposedCheckpoint.mockResolvedValue(undefined);

      const blockData = {
        checkpointNumber: CheckpointNumber(3),
        header: { getBlockNumber: () => 9 },
        indexWithinCheckpoint: 2,
      } as BlockData;
      blockSource.getBlockData.mockResolvedValue(blockData);

      const handleSpy = jest
        .spyOn(handler, 'handleCheckpointProposal')
        .mockResolvedValue({ isValid: true, checkpointNumber: CheckpointNumber(3) });

      // Own-validator addresses that do NOT match the proposal signer, so the proposal is foreign.
      const checkpointHandler = registerWithOwnAddresses([Secp256k1Signer.random().address.toString()], archiver);
      await checkpointHandler(proposal, {} as any);

      expect(handleSpy).toHaveBeenCalled();
      expect(archiver.getProposedCheckpointData).not.toHaveBeenCalled();
      expect(archiver.addProposedCheckpoint).toHaveBeenCalled();
    });
  });

  describe('deep validation (openCheckpoint + completeCheckpoint)', () => {
    const archiveRoot = Fr.random();
    const checkpointOutHash = Fr.random();
    let mockCheckpointBuilder: MockProxy<CheckpointBuilder>;
    let mockDispose: jest.Mock;

    /**
     * Sets up mocks so the handler passes all early checks and reaches the checkpoint rebuild path.
     * `forkArchiveRoot` is the archive root the forked world state reports; it must match the proposal
     * header's lastArchiveRoot (default Fr.ZERO, as CheckpointHeader.empty) to pass the fork archive check.
     */
    function setupDeepValidationMocks(computedCheckpoint: Partial<Checkpoint>, forkArchiveRoot: Fr = Fr.ZERO) {
      // Block with matching archive so the early archive check passes
      const block = {
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        number: 1,
        checkpointNumber: CheckpointNumber(1),
        header: {
          globalVariables: GlobalVariables.empty({ slotNumber: SlotNumber(1) }),
          state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } },
        },
      } as unknown as L2Block;

      blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
      blockSource.getBlocksForSlot.mockResolvedValue([block]);

      mockDispose = jest.fn();
      checkpointsBuilder.getFork.mockResolvedValue({
        [Symbol.asyncDispose]: mockDispose,
        getTreeInfo: () => Promise.resolve({ root: forkArchiveRoot.toBuffer() }),
      } as any);

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

      setupDeepValidationMocks(
        {
          header,
          archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
          blocks: [minimalBlock],
          number: CheckpointNumber(1),
          slot: SlotNumber(1),
          toBlobFields: () => [],
        },
        lastArchiveRoot,
      );

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

    // Parent of the single block (number 1) used across the deep-validation setup.
    const parentBlockNumber = BlockNumber(0);

    // getFork syncs world state to the parent block before forking (see FullNodeCheckpointsBuilder tests).
    // This asserts the caller forks at the parent block number (one before the checkpoint's first block),
    // passing the parent's block hash (looked up from the block source) for reorg detection.
    it('forks at the parent block number, passing its block hash', async () => {
      const parentBlockHash = BlockHash.random();
      setupDeepValidationMocks({ header: makeHeader({ totalManaUsed: new Fr(999) }) });
      blockSource.getBlockData.mockResolvedValue({
        header: makeBlockHeader(),
        blockHash: parentBlockHash,
      } as BlockData);

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: makeHeader() });
      await handler.handleCheckpointProposal(proposal, proposalInfo);

      expect(checkpointsBuilder.getFork).toHaveBeenCalledWith(parentBlockNumber, parentBlockHash);
    });

    // If world state forked from a different chain than the proposal was built on (e.g. a reorg), the fork's
    // archive root will not match the checkpoint's expected starting archive. Fail fast before rebuilding.
    it('returns initial_archive_mismatch when the fork archive does not match the last archive', async () => {
      // Fork reports a different archive root than the proposal header's lastArchiveRoot (Fr.ZERO).
      setupDeepValidationMocks({ header: makeHeader() }, Fr.random());

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: makeHeader() });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);

      expect(result).toEqual({
        isValid: false,
        reason: 'initial_archive_mismatch',
        checkpointNumber: CheckpointNumber(1),
      });
      expect(mockDispose).toHaveBeenCalled();
    });

    // Regression: on a live node the archiver held block N (so getBlocksForSlot succeeds) while world state
    // still trailed at N-1, so forking the parent threw "Unable to initialize from future block" and the raw
    // tree error escaped as an uncaught gossipsub error. Validation must map any fork failure to a clean
    // result instead of letting it escape.
    it('returns world_state_not_synced when forking the parent block fails', async () => {
      setupDeepValidationMocks({ header: makeHeader() });
      checkpointsBuilder.getFork.mockRejectedValue(
        new Error('Unable to initialize from future block: 1 unfinalizedBlockHeight: 0. Tree name: NullifierTree'),
      );

      const proposal = await makeProposal({ archiveRoot, checkpointHeader: makeHeader() });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);

      expect(result).toEqual({
        isValid: false,
        reason: 'world_state_not_synced',
        checkpointNumber: CheckpointNumber(1),
      });
    });
  });

  /** The archiver's genesis sentinel bucket: the "consumed nothing" position every chain starts from. */
  const genesisBucket: InboxBucket = {
    seq: 0n,
    inboxRollingHash: Fr.ZERO,
    totalMsgCount: 0n,
    timestamp: 0n,
    msgCount: 0,
    lastMessageIndex: 0n,
  };

  /**
   * Builds a proposal whose parent resolves to genesis (so blockNumber = INITIAL_L2_BLOCK_NUM) and a
   * handler wired to accept it up to the block-number guard.
   */
  async function setupGenesisProposal(proposalArchive: Fr, txHashes?: TxHash[]) {
    const proposal = await makeBlockProposal({
      blockHeader: makeBlockHeader(1, { slotNumber: SlotNumber(1) }),
      archiveRoot: proposalArchive,
      // A consume-nothing reference to the genesis bucket, so the streaming metadata checks pass and the
      // guard under test is what decides the outcome.
      bucketRef: new InboxBucketRef(genesisBucket.seq, genesisBucket.timestamp, genesisBucket.inboxRollingHash),
      ...(txHashes ? { txHashes } : {}),
    });

    // Parent archive == genesis archive → genesis path → blockNumber = INITIAL_L2_BLOCK_NUM.
    blockSource.getGenesisValues.mockResolvedValue({
      genesisArchiveRoot: proposal.blockHeader.lastArchive.root,
    } as any);
    l1ToL2MessageSource.getInboxBucket.mockResolvedValue(genesisBucket);
    l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue(genesisBucket);

    const blockProposalValidator = mock<BlockProposalValidator>();
    blockProposalValidator.validate.mockResolvedValue({ result: 'accept' } as any);

    const txProvider = mock<ITxProvider>();
    txProvider.getTxsForBlockProposal.mockResolvedValue({ txs: [], missingTxs: [] } as any);

    const blockHandler = new ProposalHandler(
      checkpointsBuilder,
      mock<WorldStateSynchronizer>(),
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      blockProposalValidator,
      epochCache,
      consensusTimetable,
      config,
      mock<BlobClientInterface>(),
      new CheckpointReexecutionTracker(),
      metrics,
      dateProvider,
    );
    return { proposal, blockHandler, txProvider };
  }

  describe('handleBlockProposal duplicate txs', () => {
    it('rejects a proposal that lists the same tx hash twice, without attempting collection', async () => {
      const txHash = TxHash.random();
      const { proposal, blockHandler, txProvider } = await setupGenesisProposal(Fr.random(), [
        txHash,
        TxHash.random(),
        txHash,
      ]);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);

      expect(result).toEqual({ isValid: false, reason: 'duplicate_txs' });
      // Collection reconciles a deduplicated hash set against the full list, so it must not be reached.
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
    });

    it('accepts a proposal whose tx hashes are all distinct', async () => {
      const { proposal, blockHandler } = await setupGenesisProposal(Fr.random(), [TxHash.random(), TxHash.random()]);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);

      expect(result).toEqual({ isValid: true, blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });
    });
  });

  describe('handleBlockProposal tx collection', () => {
    it('classifies txs that fail integrity validation as an invalid proposal', async () => {
      const { proposal, blockHandler, txProvider } = await setupGenesisProposal(Fr.random());
      txProvider.getTxsForBlockProposal.mockRejectedValue(
        new InvalidBlockProposalTxsError([{ txHash: proposal.txHashes[0], reasons: [TX_ERROR_INVALID_PROOF] }]),
      );

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'invalid_embedded_txs',
      });
    });

    // The error is thrown in p2p and caught here, so recognizing it must not depend on `instanceof`
    // resolving to the same class object.
    it('classifies the error by name when it comes from another package instance', async () => {
      const { proposal, blockHandler, txProvider } = await setupGenesisProposal(Fr.random());
      const error = new Error('Validator Error: Invalid txs in block proposal');
      error.name = 'InvalidBlockProposalTxsError';
      Object.assign(error, { invalidTxs: [{ txHash: proposal.txHashes[0], reasons: [TX_ERROR_INVALID_PROOF] }] });
      txProvider.getTxsForBlockProposal.mockRejectedValue(error);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'invalid_embedded_txs',
      });
    });

    // Only proposer misbehavior gets a typed (and slashable) failure reason; a local collection failure
    // must keep propagating so it is not mistaken for an invalid proposal.
    it('propagates other tx collection errors', async () => {
      const { proposal, blockHandler, txProvider } = await setupGenesisProposal(Fr.random());
      txProvider.getTxsForBlockProposal.mockRejectedValue(new Error('Tx pool unavailable'));

      await expect(blockHandler.handleBlockProposal(proposal, {} as any, false)).rejects.toThrow('Tx pool unavailable');
    });
  });

  // Regression for A-1218: during a reorg the archiver can still hold a stale block at the proposal's
  // number (a different archive, about to be pruned) while the proposal carries the rebuilt replacement.
  // The block-number guard used to key on number only and permanently drop the rebuilt proposal, so the
  // node never re-acquired the block and missed the later checkpoint attestation. The guard must reject
  // only genuine duplicates (same archive) and otherwise wait for the local prune.
  describe('handleBlockProposal block-number guard (reorg-aware)', () => {
    /** Block-data stub at the target number with the given archive root. */
    const blockAt = (archiveRoot: Fr) => ({ archive: new AppendOnlyTreeSnapshot(archiveRoot, 1) }) as BlockData;

    it('rejects a genuine duplicate (existing block has the same archive)', async () => {
      const archive = Fr.random();
      const { proposal, blockHandler } = await setupGenesisProposal(archive);
      blockSource.getBlockData.mockResolvedValue(blockAt(archive));

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'block_number_already_exists',
      });
    });

    it('processes a rebuilt proposal once the stale fork at this number is pruned', async () => {
      const { proposal, blockHandler } = await setupGenesisProposal(Fr.random());
      // Past the minimum bucket age but well before the slot-1 attestation deadline (40s), so the prune wait has
      // budget to retry.
      dateProvider.setTime(5_000);
      // Stale block (different archive) on the first read, then pruned (undefined) on the retry.
      blockSource.getBlockData.mockResolvedValueOnce(blockAt(Fr.random())).mockResolvedValue(undefined);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({ isValid: true, blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });
      expect(blockSource.syncImmediate).toHaveBeenCalled();
    });

    it('falls back to block_number_already_exists when the stale fork is not pruned before the deadline', async () => {
      const { proposal, blockHandler } = await setupGenesisProposal(Fr.random());
      // A different block keeps occupying this number and never gets pruned.
      blockSource.getBlockData.mockResolvedValue(blockAt(Fr.random()));
      // attestation_deadline(slot=1) = 40s; hold wall-clock past it so the wait fails fast.
      dateProvider.setTime(41_000);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'block_number_already_exists',
      });
    });
  });

  // Streaming Inbox: a block proposal's L1-to-L2 bundle is derived from its bucket reference and gated by the four
  // acceptance checks, replacing the legacy per-checkpoint inHash comparison.
  describe('handleBlockProposal streaming inbox checks', () => {
    const bucket = (overrides: Partial<InboxBucket> = {}): InboxBucket => ({
      seq: 1n,
      inboxRollingHash: new Fr(0xabc),
      totalMsgCount: 2n,
      timestamp: 100n,
      msgCount: 2,
      lastMessageIndex: 1n,
      ...overrides,
    });

    /** Genesis-parent streaming block proposal at slot 1, with the handler wired to reach the streaming checks. */
    async function setupStreamingProposal(bucketRef: InboxBucketRef | undefined) {
      const proposal = await makeBlockProposal({
        blockHeader: makeBlockHeader(1, { slotNumber: SlotNumber(1) }),
        archiveRoot: Fr.random(),
        txHashes: [],
        bucketRef,
      });
      blockSource.getGenesisValues.mockResolvedValue({
        genesisArchiveRoot: proposal.blockHeader.lastArchive.root,
      } as any);
      blockSource.getBlockData.mockResolvedValue(undefined);

      const blockProposalValidator = mock<BlockProposalValidator>();
      blockProposalValidator.validate.mockResolvedValue({ result: 'accept' } as any);
      const txProvider = mock<ITxProvider>();
      txProvider.getTxsForBlockProposal.mockResolvedValue({ txs: [], missingTxs: [] } as any);

      // Well past the minimum bucket age (one 12s Ethereum slot) for a bucket opened at t=100.
      dateProvider.setTime(1_000_000);

      const blockHandler = new ProposalHandler(
        checkpointsBuilder,
        mock<WorldStateSynchronizer>(),
        blockSource,
        l1ToL2MessageSource,
        txProvider,
        blockProposalValidator,
        epochCache,
        consensusTimetable,
        config,
        mock<BlobClientInterface>(),
        new CheckpointReexecutionTracker(),
        metrics,
        dateProvider,
      );
      return { proposal, blockHandler, txProvider };
    }

    // The metadata checks are point lookups against the local Inbox view, so they run before tx collection: a
    // proposer signing a bogus bucket reference must not be able to make validators spend their window fetching
    // txs over P2P for a proposal a map lookup rejects.
    it('rejects without collecting txs when the referenced bucket is unknown', async () => {
      const ref = new InboxBucketRef(1n, 100n, new Fr(0xabc));
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(ref);
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue(undefined);
      const reexecuteSpy = jest.spyOn(blockHandler, 'reexecuteTransactions');

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'bucket_unknown',
      });
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
      expect(reexecuteSpy).not.toHaveBeenCalled();
    });

    it('rejects without collecting txs when the resolved bucket hash disagrees with the reference', async () => {
      const ref = new InboxBucketRef(1n, 100n, new Fr(0xdead));
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(ref);
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue(bucket({ inboxRollingHash: new Fr(0xabc) }));
      const reexecuteSpy = jest.spyOn(blockHandler, 'reexecuteTransactions');

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'bucket_hash_mismatch',
      });
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
      expect(reexecuteSpy).not.toHaveBeenCalled();
    });

    it('rejects without collecting txs when the proposal carries no bucket reference', async () => {
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(undefined);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual({
        isValid: false,
        blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM),
        reason: 'bucket_unknown',
      });
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
    });

    it('re-executes with the bundle derived from the buckets when the checks pass', async () => {
      const ref = new InboxBucketRef(1n, 100n, new Fr(0xabc));
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(ref);
      const derivedBundle = [new Fr(1000), new Fr(1001)];
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue(bucket());
      l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue(
        bucket({ seq: 0n, totalMsgCount: 0n, msgCount: 0 }),
      );
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(derivedBundle);
      const reexecuteSpy = jest
        .spyOn(blockHandler, 'reexecuteTransactions')
        .mockResolvedValue({ block: undefined } as any);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result.isValid).toBe(true);
      // A valid reference still triggers tx collection, which also feeds this node's ability to serve txs to peers.
      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledTimes(1);
      // The block re-executes with the derived per-block bundle (streaming is the only path).
      expect(reexecuteSpy).toHaveBeenCalledWith(
        proposal,
        BlockNumber(INITIAL_L2_BLOCK_NUM),
        CheckpointNumber.INITIAL,
        [],
        derivedBundle,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // Streaming Inbox: the checkpoint handler enforces the last-block minimum-consumption (censorship) rule before
  // attesting.
  describe('checkpoint proposal last-block censorship', () => {
    /** Two-block checkpoint at slot 10 whose last block consumed through leaf count `lastBlockTotal`. */
    function setupCensorshipMocks(lastBlockTotal: number) {
      const archiveRoot = Fr.random();
      const blockWithLeafCount = (leafCount: number, archive: Fr, number: number) =>
        ({
          archive: new AppendOnlyTreeSnapshot(archive, number),
          number,
          checkpointNumber: CheckpointNumber(1),
          header: {
            globalVariables: GlobalVariables.empty({ slotNumber: SlotNumber(10) }),
            state: { l1ToL2MessageTree: { nextAvailableLeafIndex: leafCount } },
          },
        }) as unknown as L2Block;

      blockSource.getBlockData.mockResolvedValue({
        header: makeBlockHeader(),
        checkpointNumber: CheckpointNumber(1),
      } as any);
      blockSource.getBlocksForSlot.mockResolvedValue([
        blockWithLeafCount(0, Fr.random(), 1),
        blockWithLeafCount(lastBlockTotal, archiveRoot, 2),
      ]);
      return { archiveRoot };
    }

    async function makeSlot10Proposal(archiveRoot: Fr) {
      return (
        await makeCheckpointProposal({
          checkpointHeader: makeCheckpointHeader(0, { slotNumber: SlotNumber(10) }),
          archiveRoot,
        })
      ).toCore();
    }

    it('refuses to attest when a mandatory bucket (at or before the cutoff) is left unconsumed', async () => {
      handler.updateConfig(config);
      const { archiveRoot } = setupCensorshipMocks(2);
      // cutoff(slot=10) is the build frame start: with l1GenesisTime=0, slotDuration=24 and
      // ethereumSlotDuration=4 that is (10-1)*24 - 4 = 212.
      l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue({
        seq: 1n,
        totalMsgCount: 2n,
      } as InboxBucket);
      // The next (first unconsumed) bucket opened at t=100 <= cutoff 212 is mandatory and was left unconsumed.
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue({
        seq: 2n,
        totalMsgCount: 5n,
        timestamp: 100n,
      } as InboxBucket);

      const result = await handler.handleCheckpointProposal(await makeSlot10Proposal(archiveRoot), proposalInfo);

      expect(result).toEqual({
        isValid: false,
        reason: 'inbox_consumption_insufficient',
        checkpointNumber: CheckpointNumber(1),
      });
    });

    it('does not reject on censorship when the first unconsumed bucket is past the cutoff', async () => {
      handler.updateConfig(config);
      const { archiveRoot } = setupCensorshipMocks(2);
      l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue({
        seq: 1n,
        totalMsgCount: 2n,
      } as InboxBucket);
      // Next bucket opened at t=213 > cutoff 212: not mandatory, so the censorship check passes and validation
      // proceeds past it to the checkpoint rebuild (which mismatches here, an unrelated reason).
      l1ToL2MessageSource.getInboxBucket.mockResolvedValue({
        seq: 2n,
        totalMsgCount: 5n,
        timestamp: 213n,
      } as InboxBucket);
      const proposal = await makeSlot10Proposal(archiveRoot);
      // The fork's archive root is checked against the proposal's before the rebuild; report a match so
      // validation gets past it to the rebuild, which is the rejection this test asserts on.
      checkpointsBuilder.getFork.mockResolvedValue({
        [Symbol.asyncDispose]: jest.fn(),
        getTreeInfo: () => Promise.resolve({ root: proposal.checkpointHeader.lastArchiveRoot.toBuffer() }),
      } as any);
      const mockBuilder = mock<CheckpointBuilder>();
      mockBuilder.completeCheckpoint.mockResolvedValue({
        header: CheckpointHeader.empty(),
        archive: new AppendOnlyTreeSnapshot(Fr.ZERO, 0),
        getCheckpointOutHash: () => Fr.random(),
        blocks: [],
        number: CheckpointNumber(1),
      } as unknown as Checkpoint);
      checkpointsBuilder.openCheckpoint.mockResolvedValue(mockBuilder);

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);

      // The censorship rule passed; the checkpoint is rejected later by the rebuild, not the consumption check.
      expect(result).toEqual({
        isValid: false,
        reason: 'checkpoint_header_mismatch',
        checkpointNumber: CheckpointNumber(1),
      });
    });
  });
});
