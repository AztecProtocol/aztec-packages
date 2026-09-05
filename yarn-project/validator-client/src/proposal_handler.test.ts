import type { Archiver } from '@aztec/archiver';
import type { BlobClientInterface } from '@aztec/blob-client/client';
import { INITIAL_L2_BLOCK_NUM, MAX_BLOCKS_PER_CHECKPOINT } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { MAX_FEE_ASSET_PRICE_MODIFIER_BPS } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type FieldsOf, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import { BlockHash } from '@aztec/stdlib/block';
import type { BlockData, L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import {
  type Checkpoint,
  type CheckpointData,
  CheckpointReexecutionTracker,
  type ProposedCheckpointData,
} from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { ITxProvider, ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { InboxMessagePosition, L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { InboxMessagePrefixRef, accumulateCheckpointOutHashes } from '@aztec/stdlib/messaging';
import { ValidatedBlockProposal, ValidatedCheckpointProposalCore } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
  makeBlockHeader as makeRandomBlockHeader,
} from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { GlobalVariables, TX_ERROR_INVALID_PROOF, TxHash } from '@aztec/stdlib/tx';
import { InvalidBlockProposalTxsError, ReExStateMismatchError } from '@aztec/stdlib/validators';

import { describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { CheckpointBuilder, FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import type { ValidatorMetrics } from './metrics.js';
import {
  type CheckpointProposalValidationResult,
  ProposalHandler,
  SLASHABLE_CHECKPOINT_PROPOSAL_VALIDATION_RESULT,
} from './proposal_handler.js';

/** A block header consuming no Inbox messages (leaf count zero), so the streaming checks see an empty bundle. */
function makeBlockHeader(...args: Parameters<typeof makeRandomBlockHeader>) {
  const header = makeRandomBlockHeader(...args);
  header.state.l1ToL2MessageTree.nextAvailableLeafIndex = 0;
  return header;
}

/** The position after `totalMessageCount` messages, with the given rolling hash. */
const position = (totalMessageCount: bigint, rollingHash: Fr): InboxMessagePosition => ({
  totalMessageCount,
  rollingHash,
});

/** Mocks a local Inbox view holding no messages: only position zero resolves, and only the empty range reads. */
function mockEmptyInboxView(source: MockProxy<L1ToL2MessageSource>) {
  source.getMessagePosition.mockImplementation(count =>
    Promise.resolve(count === 0n ? position(0n, Fr.ZERO) : undefined),
  );
  source.getL1ToL2MessageRange.mockImplementation((start, end) =>
    start === 0n && end === 0n
      ? Promise.resolve({ messages: [], start: position(0n, Fr.ZERO), end: position(0n, Fr.ZERO) })
      : Promise.reject(new Error(`Inbox message range [${start}, ${end}) is not fully synced`)),
  );
}

/**
 * The blocks of slot 1 for checkpoint 1, one per archive root, numbered from 1 and each chaining onto the previous
 * one's archive, consuming no Inbox messages.
 */
function makeSlotBlocks(archiveRoots: Fr[]): L2Block[] {
  return archiveRoots.map(
    (root, i) =>
      ({
        archive: new AppendOnlyTreeSnapshot(root, i + 1),
        number: BlockNumber(i + 1),
        checkpointNumber: CheckpointNumber(1),
        header: makeBlockHeader(0, {
          lastArchive: new AppendOnlyTreeSnapshot(i === 0 ? Fr.ZERO : archiveRoots[i - 1], i),
          slotNumber: SlotNumber(1),
          blockNumber: BlockNumber(i + 1),
        }),
      }) as unknown as L2Block,
  );
}

/** Creates a checkpoint proposal core with the given overrides. */
async function makeProposal(overrides: Parameters<typeof makeCheckpointProposal>[0] = {}) {
  return ValidatedCheckpointProposalCore(
    (
      await makeCheckpointProposal({
        checkpointHeader: makeCheckpointHeader(0, { slotNumber: SlotNumber(1) }),
        ...overrides,
      })
    ).toCore(),
  );
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
  let reexecutionTracker: CheckpointReexecutionTracker;

  const proposalInfo = {};

  beforeEach(() => {
    blockSource = mock<L2BlockSource & L2BlockSink>();
    blockSource.getCheckpointsData.mockResolvedValue([]);
    blockSource.getBlocksForSlot.mockResolvedValue([]);
    blockSource.syncImmediate.mockResolvedValue(undefined);

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    mockEmptyInboxView(l1ToL2MessageSource);

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
    reexecutionTracker = new CheckpointReexecutionTracker();

    handler = new ProposalHandler(
      checkpointsBuilder,
      mock<WorldStateSynchronizer>(),
      blockSource,
      l1ToL2MessageSource,
      mock<ITxProvider>(),
      epochCache,
      consensusTimetable,
      config,
      mock<BlobClientInterface>(),
      reexecutionTracker,
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

    // Local pruning between the archiver reads of a checkpoint validation is a local-view outcome: the proposer's
    // blocks may well be canonical, this node just no longer holds them. Neither shape may reach slashing, peer
    // penalties or the invalid-slot marker.
    describe('blocks pruned locally during validation', () => {
      const expectNonPunitive = (result: CheckpointProposalValidationResult) => {
        expect(result).toEqual({ isValid: false, reason: 'last_block_not_found' });
        if (result.isValid) {
          throw new Error('unreachable');
        }
        expect(SLASHABLE_CHECKPOINT_PROPOSAL_VALIDATION_RESULT[result.reason]).toBe(false);
        expect(reexecutionTracker.getOutcomeForSlot(SlotNumber(1))).toEqual('unvalidated');
        expect(handler.hasInvalidProposals(SlotNumber(1))).toBe(false);
      };

      it('refuses without punishing when every block of the slot is gone after the last block was found', async () => {
        // The by-archive lookup still serves the checkpoint's last block, but the slot read right after it comes back
        // empty: a full prune landed between the two.
        blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
        blockSource.getBlocksForSlot.mockResolvedValue([]);

        expectNonPunitive(await handler.handleCheckpointProposal(await makeProposal(), proposalInfo));
      });

      it('refuses without punishing when the slot read no longer ends at the signed archive', async () => {
        // A partial prune took the checkpoint's last block and left the earlier ones of the slot in place.
        blockSource.getBlockData.mockResolvedValue({ header: makeBlockHeader() } as BlockData);
        blockSource.getBlocksForSlot.mockResolvedValue(makeSlotBlocks([Fr.random(), Fr.random()]));

        expectNonPunitive(
          await handler.handleCheckpointProposal(await makeProposal({ archiveRoot: Fr.random() }), proposalInfo),
        );
      });

      it('refuses without punishing when the slot read is not a contiguous chain', async () => {
        // A prune and a rebuild interleaved with the slot read: the blocks do not chain onto each other.
        const archiveRoot = Fr.random();
        const blocks = makeSlotBlocks([Fr.random(), archiveRoot]);
        blocks[1] = { ...blocks[1], header: makeBlockHeader(1, { slotNumber: SlotNumber(1) }) } as L2Block;
        blockSource.getBlocksForSlot.mockResolvedValue(blocks);

        expectNonPunitive(await handler.handleCheckpointProposal(await makeProposal({ archiveRoot }), proposalInfo));
      });
    });

    it('returns last_block_archive_mismatch when signed blocks of the slot follow the checkpoint last block', async () => {
      // The checkpoint's last block is local, and so is a later block of the same slot from the same proposer: the
      // proposal leaves a signed block of its own slot out, which no local race explains.
      const archiveRoot = Fr.random();
      blockSource.getBlocksForSlot.mockResolvedValue(makeSlotBlocks([archiveRoot, Fr.random()]));

      const result = await handler.handleCheckpointProposal(await makeProposal({ archiveRoot }), proposalInfo);
      expect(result).toEqual({
        isValid: false,
        reason: 'last_block_archive_mismatch',
        checkpointNumber: CheckpointNumber(1),
      });
      expect(SLASHABLE_CHECKPOINT_PROPOSAL_VALIDATION_RESULT.last_block_archive_mismatch).toBe(true);
    });

    it('returns too_many_blocks_in_checkpoint when blocks exceed maxBlocksPerCheckpoint', async () => {
      config = { ...config, maxBlocksPerCheckpoint: 2 };
      handler = new ProposalHandler(
        checkpointsBuilder,
        mock<WorldStateSynchronizer>(),
        blockSource,
        l1ToL2MessageSource,
        mock<ITxProvider>(),
        epochCache,
        consensusTimetable,
        config,
        mock<BlobClientInterface>(),
        new CheckpointReexecutionTracker(),
        metrics,
        dateProvider,
      );

      const archiveRoot = Fr.random();
      blockSource.getBlocksForSlot.mockResolvedValue(makeSlotBlocks([Fr.random(), Fr.random(), archiveRoot]));

      const proposal = await makeProposal({ archiveRoot });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({
        isValid: false,
        reason: 'too_many_blocks_in_checkpoint',
        checkpointNumber: CheckpointNumber(1),
      });
    });

    it('returns too_many_blocks_in_checkpoint when blocks exceed the protocol cap without an operator limit', async () => {
      // The checkpoint root circuit caps the blocks a checkpoint may contain; an over-cap checkpoint is unprovable,
      // and L1 cannot reject it at propose time, so the validator must not attest to it.
      expect(config.maxBlocksPerCheckpoint).toBeUndefined();

      const archiveRoot = Fr.random();
      const overCap = MAX_BLOCKS_PER_CHECKPOINT + 1;
      blockSource.getBlocksForSlot.mockResolvedValue(
        makeSlotBlocks(Array.from({ length: overCap }, (_, i) => (i === overCap - 1 ? archiveRoot : Fr.random()))),
      );

      const proposal = await makeProposal({ archiveRoot });
      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);
      expect(result).toEqual({
        isValid: false,
        reason: 'too_many_blocks_in_checkpoint',
        checkpointNumber: CheckpointNumber(1),
      });
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

    it('returns block_fetch_error when reading the slot blocks throws', async () => {
      blockSource.getBlocksForSlot.mockRejectedValue(new Error('db connection failed'));

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
      const archiveRoot = Fr.random();
      blockSource.getBlocksForSlot.mockResolvedValue(makeSlotBlocks([archiveRoot]));
      blockSource.getCheckpointData.mockResolvedValue({ checkpointNumber: CheckpointNumber(1) } as CheckpointData);
      dateProvider.setTime(41_000);

      const result = await handler.handleCheckpointProposal(await makeProposal({ archiveRoot }), proposalInfo);
      // Got past the block-sync wait (would be last_block_not_found if it failed fast unconditionally).
      expect(result).toEqual({
        isValid: false,
        reason: 'checkpoint_already_published',
        checkpointNumber: CheckpointNumber(1),
      });
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

      // The slot's blocks are unavailable for the first couple of polls, then sync in. Under the new (later)
      // deadline the retry budget covers this; under the old deadline the wait would time out first.
      blockSource.getBlocksForSlot
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue(makeSlotBlocks([proposal.archive]));
      // The checkpoint is already published, so validation stops right after the sync wait with a distinct reason.
      blockSource.getCheckpointData.mockResolvedValue({ checkpointNumber: CheckpointNumber(1) } as CheckpointData);

      const result = await handler.handleCheckpointProposal(proposal, proposalInfo);

      // Got past the block-sync wait (would be `last_block_not_found` under the old deadline).
      expect(result).toEqual({
        isValid: false,
        reason: 'checkpoint_already_published',
        checkpointNumber: CheckpointNumber(1),
      });
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

    /** A checkpoint whose first block is `firstBlockNumber`, with the parent block reporting `parentLeafCount`. */
    function setupCheckpointWithConsumption(opts: {
      firstBlockNumber: number;
      parentLeafCount: number | undefined;
      lastLeafCount: number;
    }) {
      const { firstBlockNumber, parentLeafCount, lastLeafCount } = opts;
      const block = {
        archive: new AppendOnlyTreeSnapshot(archiveRoot, 1),
        number: firstBlockNumber,
        checkpointNumber: CheckpointNumber(1),
        header: {
          globalVariables: GlobalVariables.empty({ slotNumber: SlotNumber(1) }),
          state: { l1ToL2MessageTree: { nextAvailableLeafIndex: lastLeafCount } },
        },
      } as unknown as L2Block;
      blockSource.getBlocksForSlot.mockResolvedValue([block]);
      blockSource.getBlockData.mockImplementation(query =>
        Promise.resolve(
          'number' in query && query.number === firstBlockNumber - 1
            ? parentLeafCount === undefined
              ? undefined
              : ({
                  header: { state: { l1ToL2MessageTree: { nextAvailableLeafIndex: parentLeafCount } } },
                } as unknown as BlockData)
            : ({ header: makeBlockHeader() } as BlockData),
        ),
      );
      return block;
    }

    /** Mocks the consumed range read to return `messages` ending at the given rolling hash. */
    function mockConsumedRange(start: bigint, end: bigint, messages: Fr[], endRollingHash: Fr) {
      l1ToL2MessageSource.getL1ToL2MessageRange.mockImplementation((from, to) =>
        from === start && to === end
          ? Promise.resolve({ messages, start: position(start, Fr.random()), end: position(end, endRollingHash) })
          : Promise.reject(new Error(`Unexpected Inbox message range [${from}, ${to})`)),
      );
    }

    // The consumed bundle is derived from the committed counts alone and authenticated by the header's rolling hash;
    // no position is resolved as an L1 bucket. Whether the final position is a live bucket end is the proposer's and
    // L1's publication rule.
    it('reads the consumed bundle by count and authenticates it against the header rolling hash', async () => {
      const inboxRollingHash = Fr.random();
      const header = makeHeader({ inboxRollingHash });
      const consumedMessages = [new Fr(1000), new Fr(1001), new Fr(1002), new Fr(1003)];
      setupDeepValidationMocks({ header });
      const block = setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: 3, lastLeafCount: 7 });
      mockConsumedRange(3n, 7n, consumedMessages, inboxRollingHash);

      await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(l1ToL2MessageSource.getL1ToL2MessageRange).toHaveBeenCalledWith(3n, 7n);
      expect(checkpointsBuilder.openCheckpoint).toHaveBeenCalledWith(
        CheckpointNumber(1),
        expect.anything(),
        expect.anything(),
        consumedMessages,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [block],
        expect.anything(),
      );
    });

    it('derives an empty bundle when the checkpoint consumed nothing, still checking the header hash', async () => {
      const inboxRollingHash = Fr.random();
      const header = makeHeader({ inboxRollingHash });
      setupDeepValidationMocks({ header });
      const block = setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: 3, lastLeafCount: 3 });
      mockConsumedRange(3n, 3n, [], inboxRollingHash);

      await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(checkpointsBuilder.openCheckpoint).toHaveBeenCalledWith(
        CheckpointNumber(1),
        expect.anything(),
        expect.anything(),
        [],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [block],
        expect.anything(),
      );
    });

    // A missing parent is a local chain-availability failure. Deriving an empty bundle instead would make the
    // rolling-hash recomputation fail and classify the proposer's valid checkpoint as a slashable header mismatch.
    it('reports a fetch error instead of deriving an empty bundle when the parent block is unavailable', async () => {
      const header = makeHeader();
      setupDeepValidationMocks({ header });
      setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: undefined, lastLeafCount: 7 });

      const result = await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(result).toEqual({ isValid: false, reason: 'block_fetch_error', checkpointNumber: CheckpointNumber(1) });
      expect(l1ToL2MessageSource.getL1ToL2MessageRange).not.toHaveBeenCalled();
      expect(checkpointsBuilder.openCheckpoint).not.toHaveBeenCalled();
    });

    // Both local-view outcomes are nonpunitive: the attestation deadline for slot 1 has long passed on the real
    // clock the handler reads, so the bounded sync retry gives up immediately and the reason is reported as is.
    it('refuses to attest, without punishing, when the consumed range is unavailable locally', async () => {
      const header = makeHeader();
      setupDeepValidationMocks({ header });
      setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: 3, lastLeafCount: 7 });
      l1ToL2MessageSource.getL1ToL2MessageRange.mockRejectedValue(
        new Error('Inbox message range [3, 7) is not fully synced'),
      );

      const result = await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(result).toEqual({
        isValid: false,
        reason: 'inbox_prefix_unavailable',
        checkpointNumber: CheckpointNumber(1),
      });
      expect(checkpointsBuilder.openCheckpoint).not.toHaveBeenCalled();
    });

    it('refuses to attest, without punishing, when the local prefix disagrees with the header rolling hash', async () => {
      const header = makeHeader({ inboxRollingHash: Fr.random() });
      setupDeepValidationMocks({ header });
      setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: 3, lastLeafCount: 7 });
      mockConsumedRange(3n, 7n, [new Fr(1), new Fr(2), new Fr(3), new Fr(4)], Fr.random());

      const result = await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(result).toEqual({
        isValid: false,
        reason: 'inbox_prefix_mismatch',
        checkpointNumber: CheckpointNumber(1),
      });
      expect(checkpointsBuilder.openCheckpoint).not.toHaveBeenCalled();
    });

    it('attests once a forced sync brings the consumed prefix into agreement with the header', async () => {
      const inboxRollingHash = Fr.random();
      const header = makeHeader({ inboxRollingHash });
      setupDeepValidationMocks({ header });
      setupCheckpointWithConsumption({ firstBlockNumber: 5, parentLeafCount: 3, lastLeafCount: 7 });
      // Slot 1's attestation deadline is 1*24 + 24 - 8 = 40s; leave two seconds of budget for the retry.
      dateProvider.setTime(38_000);
      const consumedMessages = [new Fr(1000), new Fr(1001), new Fr(1002), new Fr(1003)];
      mockConsumedRange(3n, 7n, consumedMessages, Fr.random());
      blockSource.syncImmediate.mockImplementation(() => {
        mockConsumedRange(3n, 7n, consumedMessages, inboxRollingHash);
        return Promise.resolve();
      });

      await handler.handleCheckpointProposal(
        await makeProposal({ archiveRoot, checkpointHeader: header }),
        proposalInfo,
      );

      expect(blockSource.syncImmediate).toHaveBeenCalled();
      expect(checkpointsBuilder.openCheckpoint).toHaveBeenCalledWith(
        CheckpointNumber(1),
        expect.anything(),
        expect.anything(),
        consumedMessages,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

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

  /**
   * Builds a proposal whose parent resolves to genesis (so blockNumber = INITIAL_L2_BLOCK_NUM) and a
   * handler wired to accept it up to the block-number guard.
   */
  async function setupGenesisProposal(proposalArchive: Fr, txHashes?: TxHash[]) {
    const proposal = ValidatedBlockProposal(
      await makeBlockProposal({
        blockHeader: makeBlockHeader(1, { slotNumber: SlotNumber(1) }),
        archiveRoot: proposalArchive,
        // A consume-nothing reference to the empty prefix, so the streaming metadata checks pass and the
        // guard under test is what decides the outcome.
        inboxPrefixRef: InboxMessagePrefixRef.empty(),
        ...(txHashes ? { txHashes } : {}),
      }),
    );

    // Parent archive == genesis archive → genesis path → blockNumber = INITIAL_L2_BLOCK_NUM.
    blockSource.getGenesisValues.mockResolvedValue({
      genesisArchiveRoot: proposal.blockHeader.lastArchive.root,
    } as any);

    const txProvider = mock<ITxProvider>();
    txProvider.getTxsForBlockProposal.mockResolvedValue({ txs: [], missingTxs: [] } as any);

    const blockHandler = new ProposalHandler(
      checkpointsBuilder,
      mock<WorldStateSynchronizer>(),
      blockSource,
      l1ToL2MessageSource,
      txProvider,
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
      // Well before the slot-1 attestation deadline (40s), so the prune wait has budget to retry.
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

  describe('handleBlockProposal arrival window', () => {
    // Whether a proposal arrived in time is decided once, at p2p ingress. Re-deciding it here would make
    // the verdict depend on how long this node took to get around to processing the proposal, turning
    // local latency into a slashable invalid-proposal verdict against an honest proposer.
    it('processes a proposal whose receive window closed while it waited to be processed', async () => {
      const signer = Secp256k1Signer.random();
      const proposal = ValidatedBlockProposal(
        await makeBlockProposal({
          blockHeader: makeBlockHeader(1, { slotNumber: SlotNumber(1) }),
          archiveRoot: Fr.random(),
          inboxPrefixRef: InboxMessagePrefixRef.empty(),
          signer,
        }),
      );

      // Parent archive == genesis archive → genesis path → blockNumber = INITIAL_L2_BLOCK_NUM.
      blockSource.getGenesisValues.mockResolvedValue({
        genesisArchiveRoot: proposal.blockHeader.lastArchive.root,
      } as any);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      // Slot 1's proposal receive window is [-4s, 17s]; 30s is well past its close.
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(0),
        slot: SlotNumber(1),
        ts: 30n,
        nowMs: 30_000n,
      });

      const txProvider = mock<ITxProvider>();
      txProvider.getTxsForBlockProposal.mockResolvedValue({ txs: [], missingTxs: [] } as any);

      const blockHandler = new ProposalHandler(
        checkpointsBuilder,
        mock<WorldStateSynchronizer>(),
        blockSource,
        l1ToL2MessageSource,
        txProvider,
        epochCache,
        consensusTimetable,
        config,
        mock<BlobClientInterface>(),
        new CheckpointReexecutionTracker(),
        metrics,
        dateProvider,
      );

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, false);
      expect(result).toEqual({ isValid: true, blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });
    });
  });

  // Streaming Inbox: a block proposal's L1-to-L2 bundle is read by count from the local message log and authenticated
  // by the signed prefix hash at the block header's leaf count.
  describe('handleBlockProposal streaming inbox checks', () => {
    const consumedLeaves = [new Fr(1000), new Fr(1001)];
    const prefixHash = new Fr(0xabc);
    const signedRef = new InboxMessagePrefixRef(prefixHash);

    /** Mocks a local view holding two messages whose prefix hashes to `hashAtTwo` (or nothing past genesis). */
    function mockLocalView(hashAtTwo: Fr | undefined) {
      l1ToL2MessageSource.getMessagePosition.mockImplementation(count =>
        Promise.resolve(
          count === 0n ? position(0n, Fr.ZERO) : count === 2n && hashAtTwo ? position(2n, hashAtTwo) : undefined,
        ),
      );
      l1ToL2MessageSource.getL1ToL2MessageRange.mockImplementation((start, end) =>
        hashAtTwo && start === 0n && end === 2n
          ? Promise.resolve({ messages: consumedLeaves, start: position(0n, Fr.ZERO), end: position(2n, hashAtTwo) })
          : Promise.reject(new Error(`Inbox message range [${start}, ${end}) is not fully synced`)),
      );
    }

    /** Genesis-parent block proposal at slot 1 consuming two messages, with the handler wired to reach the checks. */
    async function setupStreamingProposal(
      inboxPrefixRef: InboxMessagePrefixRef | undefined,
      options: { nowMs?: number } = {},
    ) {
      const blockHeader = makeBlockHeader(1, { slotNumber: SlotNumber(1) });
      blockHeader.state.l1ToL2MessageTree.nextAvailableLeafIndex = 2;
      const proposal = ValidatedBlockProposal(
        await makeBlockProposal({ blockHeader, archiveRoot: Fr.random(), txHashes: [], inboxPrefixRef }),
      );
      blockSource.getGenesisValues.mockResolvedValue({
        genesisArchiveRoot: proposal.blockHeader.lastArchive.root,
      } as any);
      blockSource.getBlockData.mockResolvedValue(undefined);

      const txProvider = mock<ITxProvider>();
      txProvider.getTxsForBlockProposal.mockResolvedValue({ txs: [], missingTxs: [] } as any);

      dateProvider.setTime(options.nowMs ?? 1_000_000);

      const blockHandler = new ProposalHandler(
        checkpointsBuilder,
        mock<WorldStateSynchronizer>(),
        blockSource,
        l1ToL2MessageSource,
        txProvider,
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

    const rejection = (reason: string) => ({ isValid: false, blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM), reason });

    // The metadata checks are point lookups against the local Inbox view, so they run before tx collection: a
    // proposer signing a bogus prefix reference must not be able to make validators spend their window fetching
    // txs over P2P for a proposal a map lookup rejects.
    it('rejects without collecting txs when the local view has not synced the signed count', async () => {
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(signedRef);
      mockLocalView(undefined);
      const reexecuteSpy = jest.spyOn(blockHandler, 'reexecuteTransactions');

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual(rejection('inbox_prefix_unavailable'));
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
      expect(reexecuteSpy).not.toHaveBeenCalled();
    });

    it('rejects without collecting txs when the local prefix hash disagrees with the reference', async () => {
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(signedRef);
      mockLocalView(new Fr(0xdead));
      const reexecuteSpy = jest.spyOn(blockHandler, 'reexecuteTransactions');

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual(rejection('inbox_prefix_mismatch'));
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
      expect(reexecuteSpy).not.toHaveBeenCalled();
    });

    it('rejects without collecting txs when the proposal carries no prefix reference', async () => {
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(undefined);
      mockLocalView(prefixHash);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result).toEqual(rejection('inbox_prefix_unavailable'));
      expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
    });

    it('re-executes with the bundle read by count when the checks pass, and inserts it with the signed reference', async () => {
      const { proposal, blockHandler, txProvider } = await setupStreamingProposal(signedRef);
      mockLocalView(prefixHash);
      const builtBlock = { number: BlockNumber(INITIAL_L2_BLOCK_NUM) } as unknown as L2Block;
      const reexecuteSpy = jest
        .spyOn(blockHandler, 'reexecuteTransactions')
        .mockResolvedValue({ block: builtBlock } as any);

      const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

      expect(result.isValid).toBe(true);
      // A valid reference still triggers tx collection, which also feeds this node's ability to serve txs to peers.
      expect(txProvider.getTxsForBlockProposal).toHaveBeenCalledTimes(1);
      // The block re-executes with the bundle read from the local log by count.
      expect(reexecuteSpy).toHaveBeenCalledWith(
        proposal,
        BlockNumber(INITIAL_L2_BLOCK_NUM),
        CheckpointNumber.INITIAL,
        [],
        consumedLeaves,
        expect.anything(),
        expect.anything(),
      );
      // The archiver insert carries the signed reference the checks validated against.
      expect(blockSource.addBlock).toHaveBeenCalledWith(builtBlock, signedRef);
    });

    // A prefix this node cannot confirm is (usually) local archiver lag or the stale side of a reorg, not a
    // divergence: the handler forces a sync and re-checks until the attestation deadline instead of dropping the
    // attestation on the spot, and never attributes the outcome to the proposer.
    describe('prefix sync wait', () => {
      // attestation_deadline(slot=1) = 1*24 + 24 - 8 = 40s. Waits run on a real timer against the remaining
      // budget read off the fake clock, so holding it 2s short of the deadline keeps the tests short.
      const DEADLINE_MS = 40_000;
      const WAIT_BUDGET_MS = 2_000;
      const BEFORE_DEADLINE_MS = DEADLINE_MS - WAIT_BUDGET_MS;
      const PAST_DEADLINE_MS = DEADLINE_MS + 1_000;
      const WAIT_INTERVAL_MS = 500;

      it('attests once the signed prefix shows up on a later archiver sync', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: BEFORE_DEADLINE_MS });
        mockLocalView(undefined);
        blockSource.syncImmediate.mockImplementation(() => {
          mockLocalView(prefixHash);
          return Promise.resolve();
        });
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockResolvedValue({ block: undefined } as any);

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result.isValid).toBe(true);
        expect(result.blockNumber).toEqual(BlockNumber(INITIAL_L2_BLOCK_NUM));
      });

      it('rejects as unavailable when the prefix never syncs, no earlier than the deadline', async () => {
        const { proposal, blockHandler, txProvider } = await setupStreamingProposal(signedRef, {
          nowMs: BEFORE_DEADLINE_MS,
        });
        mockLocalView(undefined);

        const startMs = Date.now();
        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);
        const elapsedMs = Date.now() - startMs;

        expect(result).toEqual(rejection('inbox_prefix_unavailable'));
        // The wait runs out the remaining budget and gives up within one retry interval of the deadline.
        expect(elapsedMs).toBeGreaterThanOrEqual(WAIT_BUDGET_MS - 100);
        expect(elapsedMs).toBeLessThan(WAIT_BUDGET_MS + 2 * WAIT_INTERVAL_MS);
        // Waiting never buys the proposer any network work: the rejection still happens before tx collection.
        expect(txProvider.getTxsForBlockProposal).not.toHaveBeenCalled();
      });

      it('rejects immediately without syncing when the attestation deadline has already passed', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: PAST_DEADLINE_MS });
        mockLocalView(undefined);

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toEqual(rejection('inbox_prefix_unavailable'));
        // With no budget left there is nothing to wait for, so the archiver is not poked at all.
        expect(blockSource.syncImmediate).not.toHaveBeenCalled();
      });

      it('rejects immediately without syncing when the proposal carries no prefix reference', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(undefined, { nowMs: BEFORE_DEADLINE_MS });
        mockLocalView(prefixHash);

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toEqual(rejection('inbox_prefix_unavailable'));
        expect(blockSource.syncImmediate).not.toHaveBeenCalled();
      });

      // This node may be the stale side of an L1 reorg holding a present-but-noncanonical hash at the signed count,
      // so a mismatch is retried exactly like a missing prefix and stays nonpunitive when it persists.
      it('rejects a mismatch that survives the deadline as a mismatch, after retrying', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: BEFORE_DEADLINE_MS });
        mockLocalView(new Fr(0xdead));

        const startMs = Date.now();
        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);
        const elapsedMs = Date.now() - startMs;

        expect(result).toEqual(rejection('inbox_prefix_mismatch'));
        expect(blockSource.syncImmediate).toHaveBeenCalled();
        expect(elapsedMs).toBeGreaterThanOrEqual(WAIT_BUDGET_MS - 100);
      });

      it('attests when the forced sync replaces our stale prefix with the proposed one', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: BEFORE_DEADLINE_MS });
        mockLocalView(new Fr(0xbad));
        blockSource.syncImmediate.mockImplementation(() => {
          mockLocalView(prefixHash);
          return Promise.resolve();
        });
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockResolvedValue({ block: undefined } as any);

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result.isValid).toBe(true);
        expect(result.blockNumber).toEqual(BlockNumber(INITIAL_L2_BLOCK_NUM));
      });
    });

    // A content-changing message replacement can land between the metadata check and later steps. Neither the bundle
    // read nor the insert may turn it into a proposer offense.
    describe('reorg between the checks', () => {
      it('classifies a replacement between the metadata check and the bundle read as a mismatch', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: 50_000 });
        mockLocalView(prefixHash);
        // The metadata check sees the signed prefix; the bundle read then sees a replaced log.
        l1ToL2MessageSource.getMessagePosition.mockResolvedValueOnce(position(2n, prefixHash));
        l1ToL2MessageSource.getMessagePosition.mockResolvedValue(position(2n, new Fr(0xdead)));
        l1ToL2MessageSource.getL1ToL2MessageRange.mockResolvedValue({
          messages: [new Fr(1), new Fr(2)],
          start: position(0n, Fr.ZERO),
          end: position(2n, new Fr(0xdead)),
        });
        const reexecuteSpy = jest.spyOn(blockHandler, 'reexecuteTransactions');

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toEqual(rejection('inbox_prefix_mismatch'));
        expect(reexecuteSpy).not.toHaveBeenCalled();
      });

      it('classifies a re-execution mismatch as a local disagreement when the local prefix moved', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: 50_000 });
        mockLocalView(prefixHash);
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockImplementation(() => {
          // The reorg lands during re-execution: the local prefix at the signed count no longer matches.
          mockLocalView(new Fr(0xdead));
          throw new ReExStateMismatchError(Fr.random(), Fr.random());
        });

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toMatchObject({ isValid: false, reason: 'inbox_prefix_mismatch' });
      });

      it('keeps a re-execution mismatch with authenticated inputs as a proposer offense', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: 50_000 });
        mockLocalView(prefixHash);
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockImplementation(() => {
          throw new ReExStateMismatchError(Fr.random(), Fr.random());
        });

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toMatchObject({ isValid: false, reason: 'state_mismatch' });
      });

      it('classifies an insert-time prefix rejection from the archiver as a local disagreement', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: 50_000 });
        mockLocalView(prefixHash);
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockResolvedValue({ block: {} } as any);
        blockSource.addBlock.mockRejectedValue(
          Object.assign(new Error('prefix mismatch at insert'), { name: 'InboxPrefixMismatchError' }),
        );

        const result = await blockHandler.handleBlockProposal(proposal, {} as any, true);

        expect(result).toMatchObject({ isValid: false, reason: 'inbox_prefix_mismatch' });
      });

      it('propagates insert failures that are not prefix rejections', async () => {
        const { proposal, blockHandler } = await setupStreamingProposal(signedRef, { nowMs: 50_000 });
        mockLocalView(prefixHash);
        jest.spyOn(blockHandler, 'reexecuteTransactions').mockResolvedValue({ block: {} } as any);
        blockSource.addBlock.mockRejectedValue(new Error('disk on fire'));

        await expect(blockHandler.handleBlockProposal(proposal, {} as any, true)).rejects.toThrow('disk on fire');
      });
    });
  });
});
