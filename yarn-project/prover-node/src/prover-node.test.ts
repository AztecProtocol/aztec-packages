import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { EpochProverFactory } from '@aztec/prover-client';
import { L2Block, type L2BlockSource, type L2BlockStreamEvent, type L2Tips } from '@aztec/stdlib/block';
import type { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { EpochProverManager, ITxProvider, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { L1Metrics } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { ProofPublishingService } from './proof-publishing-service.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import { ProverNode } from './prover-node.js';
import type { ProverPublisherFactory } from './prover-publisher-factory.js';
import { SessionManager } from './session-manager.js';

describe('ProverNode', () => {
  let proverNode: TestProverNode;

  let prover: ReturnType<typeof mock<EpochProverManager & EpochProverFactory>>;
  let publisherFactory: ReturnType<typeof mock<ProverPublisherFactory>>;
  let publisher: ReturnType<typeof mock<ProverNodePublisher>>;
  let l2BlockSource: ReturnType<typeof mock<L2BlockSource>>;
  let l1ToL2MessageSource: ReturnType<typeof mock<L1ToL2MessageSource>>;
  let contractDataSource: ReturnType<typeof mock<ContractDataSource>>;
  let worldState: ReturnType<typeof mock<WorldStateSynchronizer>>;
  let txProvider: ReturnType<typeof mock<ITxProvider>>;
  let rollupContract: ReturnType<typeof mock<RollupContract>>;
  let l1Metrics: ReturnType<typeof mock<L1Metrics>>;
  let sessionManager: ReturnType<typeof mock<SessionManager>>;
  let publishingService: ReturnType<typeof mock<ProofPublishingService>>;

  // epochDuration=1 ⇒ slot N lives in epoch N. proofSubmissionEpochs=1 ⇒ deadline for
  // epoch E is the start of epoch E+2, so epoch E expires once latestEpoch >= E+2.
  const l1Constants = { ...EmptyL1RollupConstants, epochDuration: 1, proofSubmissionEpochs: 1 };

  beforeEach(() => {
    prover = mock<EpochProverManager & EpochProverFactory>();
    publisherFactory = mock<ProverPublisherFactory>();
    publisher = mock<ProverNodePublisher>();
    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    worldState = mock<WorldStateSynchronizer>();
    txProvider = mock<ITxProvider>();
    rollupContract = mock<RollupContract>();
    l1Metrics = mock<L1Metrics>();
    sessionManager = mock<SessionManager>();
    publishingService = mock<ProofPublishingService>();

    prover.getProverId.mockReturnValue(EthAddress.ZERO);
    l2BlockSource.getGenesisBlockHash.mockReturnValue('0x00' as any);
    l2BlockSource.getL1Constants.mockResolvedValue(l1Constants);
    l2BlockSource.getL2Tips.mockResolvedValue({} as L2Tips);
    publisherFactory.create.mockResolvedValue(publisher);

    proverNode = new TestProverNode(
      prover,
      publisherFactory,
      l2BlockSource,
      l1ToL2MessageSource,
      contractDataSource,
      worldState,
      { getTxProvider: () => txProvider },
      rollupContract,
      l1Metrics,
      {},
    );
    // Inject the session manager and publishing service without going through start() —
    // start() wires the publisher + block stream + ticker, none of which these unit tests
    // exercise.
    proverNode.setSessionManager(sessionManager);
    proverNode.setPublishingService(publishingService);
  });

  // ---------------- event dispatch ----------------

  it('dispatches chain-checkpointed to handleCheckpointEvent', async () => {
    setupNotFullyProven();
    const checkpoint = makeCheckpoint(1, 1, 1);
    const event: L2BlockStreamEvent = {
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(checkpoint),
      block: { number: BlockNumber(1), hash: '0x01' },
    };

    await proverNode.handleBlockStreamEvent(event);

    expect(proverNode.getCheckpointStore().listAll().length).toBe(1);
    expect(sessionManager.onCheckpointAdded).toHaveBeenCalledWith(EpochNumber(1));
  });

  it('dispatches chain-pruned through markPrunedAfter and notifies the session manager only when affected', async () => {
    // No registered checkpoints — nothing to prune.
    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      checkpoint: { number: CheckpointNumber(0), hash: '0x00' },
      block: { number: BlockNumber(0), hash: '0x00' },
    });
    expect(sessionManager.onPrune).not.toHaveBeenCalled();

    // Register a checkpoint, then prune.
    setupNotFullyProven();
    await proverNode.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(2, 2, 2)),
      block: { number: BlockNumber(2), hash: '0x02' },
    });

    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      checkpoint: { number: CheckpointNumber(1), hash: '0x01' },
      block: { number: BlockNumber(1), hash: '0x01' },
    });
    expect(sessionManager.onPrune).toHaveBeenCalledWith([EpochNumber(2)]);
  });

  it('dispatches chain-proven to publishingService.onChainProven', async () => {
    await proverNode.handleBlockStreamEvent({
      type: 'chain-proven',
      block: { number: BlockNumber(7), hash: '0x07' },
    });
    expect(publishingService.onChainProven).toHaveBeenCalledWith(BlockNumber(7));
  });

  it('expires elapsed epochs on every block-stream event: releases chonk cache, reaps store', async () => {
    // Latest synced L2 slot = 4 ⇒ latestEpoch = 4 ⇒ epochs 0..2 are past their submission
    // window (deadline = E+2 with proofSubmissionEpochs=1).
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));

    const expiredBlock = await L2Block.random(BlockNumber(1), { txsPerBlock: 1 });
    l2BlockSource.getCheckpointsData.mockResolvedValue([{ startBlock: BlockNumber(1), blockCount: 1 } as any]);
    l2BlockSource.getBlocks.mockResolvedValue([expiredBlock]);

    const txHash = expiredBlock.body.txEffects[0].txHash.toString();
    const cache = proverNode.getChonkCache();
    void cache.getOrCompute(txHash, () => Promise.resolve({} as any));
    expect(cache.get(txHash)).toBeDefined();

    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    // Any block-stream event is enough to trigger the expiry sweep.
    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });

    expect(cache.get(txHash)).toBeUndefined();
    // Three expired epochs ⇒ reapExpired called once per epoch.
    expect(reapSpy.mock.calls.map(([e]) => Number(e))).toEqual([0, 1, 2]);
  });

  it('checkExpiry advances the high-water mark — does not re-reap already-expired epochs', async () => {
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });
    expect(reapSpy.mock.calls.length).toBe(3);
    reapSpy.mockClear();

    // Same latest slot ⇒ nothing new should expire.
    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });
    expect(reapSpy).not.toHaveBeenCalled();
  });

  it('checkExpiry no-ops when archiver has no synced slot yet', async () => {
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });
    expect(reapSpy).not.toHaveBeenCalled();
  });

  it('updates the tips store in finally even when the inner handler throws', async () => {
    setupNotFullyProven();
    // Make the checkpoint handler throw by having worldState.syncImmediate reject.
    worldState.syncImmediate.mockRejectedValue(new Error('boom'));

    const event: L2BlockStreamEvent = {
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(1, 1, 1)),
      block: { number: BlockNumber(1), hash: '0x01' },
    };

    // The handler swallows the inner error (logs warn), so this shouldn't throw.
    await proverNode.handleBlockStreamEvent(event);

    // Confirm the tipsStore observed the event despite the inner failure.
    expect(await proverNode.getTipsStore().getL2BlockHash(1)).toBe('0x01');
    // Inner failure is swallowed: the store stays empty and the session manager is NOT
    // notified — otherwise downstream would see a notification for content that was never
    // actually registered.
    expect(proverNode.getCheckpointStore().listAll()).toHaveLength(0);
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
  });

  // ---------------- handleCheckpointEvent gating ----------------

  it('skips registration when the epoch is already fully proven on L1', async () => {
    // Proven block sits at the last block of epoch 1 (epochDuration=1, slot=1).
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(1));
    l2BlockSource.getBlockData.mockResolvedValue({
      header: { getSlot: () => SlotNumber(1) },
    } as any);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);

    await proverNode.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(1, 1, 1)),
      block: { number: BlockNumber(1), hash: '0x01' },
    });

    expect(proverNode.getCheckpointStore().listAll().length).toBe(0);
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
  });

  it('content-addresses the prover by the checkpoint archive root', async () => {
    setupNotFullyProven();
    const archiveRoot = Fr.random();

    await proverNode.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(1, 1, 2, archiveRoot)),
      block: { number: BlockNumber(2), hash: '0x02' },
    });

    const prover = proverNode.getCheckpointStore().listAll()[0];
    expect(prover.id).toContain(archiveRoot.toString());
  });

  // ---------------- forwarders ----------------

  it('startProof forwards to the session manager', async () => {
    sessionManager.startProof.mockResolvedValue(undefined);
    await proverNode.startProof(EpochNumber(5));
    expect(sessionManager.startProof).toHaveBeenCalledWith(EpochNumber(5));
  });

  it('getJobs forwards to the session manager', async () => {
    sessionManager.getJobs.mockReturnValue([
      { uuid: 'a', status: 'awaiting-checkpoints', epochNumber: EpochNumber(3) },
    ]);
    const jobs = await proverNode.getJobs();
    expect(jobs).toEqual([{ uuid: 'a', status: 'awaiting-checkpoints', epochNumber: EpochNumber(3) }]);
  });

  it('startProof throws when the session manager has not been constructed yet', async () => {
    proverNode.clearSessionManager();
    await expect(proverNode.startProof(EpochNumber(5))).rejects.toThrow(/not started/);
  });

  it('getJobs returns an empty array when the session manager has not been constructed', async () => {
    proverNode.clearSessionManager();
    await expect(proverNode.getJobs()).resolves.toEqual([]);
  });

  // ---------------- handleBlockStreamEvent: blocks-added is a no-op + still triggers expiry ----------------

  it("'blocks-added' invokes no event handler but still runs the expiry sweep", async () => {
    // latestSlot=4 ⇒ epochs 0..2 expire.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    // Use a real (random) L2Block so the tips-store handler doesn't choke on an empty array.
    const block = await L2Block.random(BlockNumber(1));
    await proverNode.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    // No checkpoint, prune, or proven handler should have fired.
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
    expect(sessionManager.onPrune).not.toHaveBeenCalled();
    expect(publishingService.onChainProven).not.toHaveBeenCalled();
    // But the expiry sweep ran.
    expect(reapSpy.mock.calls.map(([e]) => Number(e))).toEqual([0, 1, 2]);
  });

  // ---------------- checkEpochExpiry: latestEpoch < offset is a no-op ----------------

  it('checkEpochExpiry no-ops when latestEpoch is below the submission-window offset', async () => {
    // proofSubmissionEpochs=1 ⇒ offset=2. latestSlot=1 ⇒ latestEpoch=1 < 2.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(1));
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });

    expect(reapSpy).not.toHaveBeenCalled();
    // High-water mark stays untouched.
    expect(proverNode.getLastExpiredEpoch()).toBeUndefined();
  });

  // ---------------- expireEpoch swallows getCheckpointsData errors ----------------

  it('expireEpoch still reaps the store when getCheckpointsData throws', async () => {
    // Three epochs would expire (latestSlot=4 ⇒ epochs 0..2). getCheckpointsData throws for
    // every call, but reapExpired must still be invoked for each epoch and the high-water
    // mark must still advance.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));
    l2BlockSource.getCheckpointsData.mockRejectedValue(new Error('archiver unavailable'));
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.handleBlockStreamEvent({
      type: 'chain-finalized',
      block: { number: BlockNumber(1), hash: '0x01' },
    });

    expect(reapSpy.mock.calls.map(([e]) => Number(e))).toEqual([0, 1, 2]);
    expect(proverNode.getLastExpiredEpoch()).toEqual(EpochNumber(2));
  });

  // ---------------- handlePruneEvent dedupes affected epochs ----------------

  it('handlePruneEvent dedupes affected epochs when multiple provers share one epoch', async () => {
    // Suite default is epochDuration=1 (one slot per epoch ⇒ at most one prover per epoch).
    // To exercise dedup we need an epoch that holds multiple slots — override l1Constants
    // for this test to epochDuration=2 so slots 6 and 7 both live in epoch 3.
    const l1ConstantsTwo = { ...EmptyL1RollupConstants, epochDuration: 2, proofSubmissionEpochs: 1 };
    l2BlockSource.getL1Constants.mockResolvedValue(l1ConstantsTwo);
    setupRegistrationSuccess();

    // Register two checkpoints at slots 6 and 7 (both in epoch 3).
    await proverNode.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(1, 6, 6)),
      block: { number: BlockNumber(6), hash: '0x06' },
    });
    await proverNode.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      checkpoint: makePublishedCheckpoint(makeCheckpoint(2, 7, 7)),
      block: { number: BlockNumber(7), hash: '0x07' },
    });
    expect(proverNode.getCheckpointStore().listAll().length).toBe(2);

    // Pruning above checkpoint 0 marks both as pruned — onPrune must receive [EpochNumber(3)],
    // not [3, 3].
    sessionManager.onPrune.mockClear();
    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      checkpoint: { number: CheckpointNumber(0), hash: '0x00' },
      block: { number: BlockNumber(0), hash: '0x00' },
    });
    expect(sessionManager.onPrune).toHaveBeenCalledTimes(1);
    expect(sessionManager.onPrune).toHaveBeenCalledWith([EpochNumber(3)]);
  });

  // ---------------- isEpochFullyProven branches ----------------

  describe('isEpochFullyProven', () => {
    it('returns false when no block is proven yet', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(undefined);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(3), l1Constants)).resolves.toBe(false);
    });

    it('returns false when the proven block has no header in the archiver', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockResolvedValue(undefined);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(3), l1Constants)).resolves.toBe(false);
    });

    it("returns true for any epoch strictly below the proven tip's epoch", async () => {
      // Proven block at slot 5 ⇒ provenEpoch = 5 (epochDuration=1).
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockResolvedValue({ header: { getSlot: () => SlotNumber(5) } } as any);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(3), l1Constants)).resolves.toBe(true);
    });

    it("returns false for any epoch strictly above the proven tip's epoch", async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockResolvedValue({ header: { getSlot: () => SlotNumber(5) } } as any);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(7), l1Constants)).resolves.toBe(false);
    });

    it('returns true on the equality case when the proven block is the last of its epoch (next block is in a later epoch)', async () => {
      // provenEpoch=2, next block in epoch 3 ⇒ last of epoch.
      const l1ConstantsTwo = { ...EmptyL1RollupConstants, epochDuration: 2 };
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any); // epoch 2
        }
        if (q.number === 6) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(6) } } as any); // epoch 3
        }
        return Promise.resolve(undefined);
      });
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(2), l1ConstantsTwo)).resolves.toBe(true);
    });

    it('returns false on the equality case when the proven block is mid-epoch (next block is in the same epoch)', async () => {
      const l1ConstantsTwo = { ...EmptyL1RollupConstants, epochDuration: 2 };
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(4) } } as any); // epoch 2
        }
        if (q.number === 6) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any); // also epoch 2
        }
        return Promise.resolve(undefined);
      });
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(2), l1ConstantsTwo)).resolves.toBe(false);
    });

    it('falls back to isEpochComplete when there is no next-block header', async () => {
      // No next-block header ⇒ isProvenBlockLastOfItsEpoch defers to isEpochComplete.
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any);
        }
        return Promise.resolve(undefined); // no next block yet
      });
      l2BlockSource.isEpochComplete.mockResolvedValueOnce(true);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(5), l1Constants)).resolves.toBe(true);

      l2BlockSource.isEpochComplete.mockResolvedValueOnce(false);
      await expect(proverNode.callIsEpochFullyProven(EpochNumber(5), l1Constants)).resolves.toBe(false);
    });
  });

  // ---------------- computeStartupState branches ----------------

  describe('computeStartupState', () => {
    it('returns starting block 1 and no fully-proven epoch when nothing is proven', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(undefined);
      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(1),
        lastFullyProvenEpoch: undefined,
      });
    });

    it('returns provenBlock+1 and no fully-proven epoch when the proven block has no archiver header', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockResolvedValue(undefined);
      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(6),
        lastFullyProvenEpoch: undefined,
      });
    });

    it('returns provenBlock+1 and provenEpoch when the proven block is the last of its epoch', async () => {
      // epochDuration=1: slot 5 ⇒ epoch 5; next slot 6 ⇒ epoch 6 > 5 ⇒ last of epoch.
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any);
        }
        if (q.number === 6) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(6) } } as any);
        }
        return Promise.resolve(undefined);
      });
      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(6),
        lastFullyProvenEpoch: EpochNumber(5),
      });
    });

    it('returns provenBlock+1 and provenEpoch via the isEpochComplete fallback when there is no next-block header', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any);
        }
        return Promise.resolve(undefined);
      });
      l2BlockSource.isEpochComplete.mockResolvedValue(true);
      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(6),
        lastFullyProvenEpoch: EpochNumber(5),
      });
    });

    it("returns the partially-proven epoch's first block and provenEpoch-1 when proven is mid-epoch", async () => {
      // epochDuration=2: slot 5 ⇒ epoch 2; next slot 5 ⇒ same epoch ⇒ mid-epoch.
      const l1ConstantsTwo = { ...EmptyL1RollupConstants, epochDuration: 2, proofSubmissionEpochs: 1 };
      l2BlockSource.getL1Constants.mockResolvedValue(l1ConstantsTwo);
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(4) } } as any); // epoch 2
        }
        if (q.number === 6) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any); // epoch 2
        }
        return Promise.resolve(undefined);
      });
      l2BlockSource.getCheckpointsData.mockResolvedValue([{ startBlock: BlockNumber(3) } as any]);

      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(3),
        lastFullyProvenEpoch: EpochNumber(1),
      });
    });

    it('returns lastFullyProvenEpoch=undefined when proven is mid-epoch within epoch 0', async () => {
      // The provenEpoch=0 edge case: there is no "previous" epoch to claim as fully proven.
      const l1ConstantsTwo = { ...EmptyL1RollupConstants, epochDuration: 2, proofSubmissionEpochs: 1 };
      l2BlockSource.getL1Constants.mockResolvedValue(l1ConstantsTwo);
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(1));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 1) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(0) } } as any); // epoch 0
        }
        if (q.number === 2) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(1) } } as any); // still epoch 0
        }
        return Promise.resolve(undefined);
      });
      l2BlockSource.getCheckpointsData.mockResolvedValue([{ startBlock: BlockNumber(1) } as any]);

      await expect(proverNode.callComputeStartupState()).resolves.toEqual({
        startingBlock: BlockNumber(1),
        lastFullyProvenEpoch: undefined,
      });
    });
  });

  // ---------------- helpers ----------------

  /** Bypass `isEpochFullyProven` so checkpoint events register normally. */
  function setupNotFullyProven() {
    l2BlockSource.getBlockNumber.mockResolvedValue(undefined);
    setupRegistrationSuccess();
    // getBlockData returns a header that lets isEpochFullyProven bail out as "not proven"
    // and supplies a lastArchive.root for collectRegisterData.
    l2BlockSource.getBlockData.mockResolvedValue({
      header: { lastArchive: { root: Fr.ZERO } },
    } as any);
  }

  /**
   * Sets up everything `collectRegisterData` needs (world-state sync, L1→L2 message source,
   * archive sibling-path snapshot). Tests that want to override `getBlockNumber` /
   * `getBlockData` to drive `isEpochFullyProven` should call this and then set the
   * proven-tip mocks themselves.
   */
  function setupRegistrationSuccess() {
    worldState.syncImmediate.mockResolvedValue(undefined as any);
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    l2BlockSource.getBlockData.mockResolvedValue({
      header: { lastArchive: { root: Fr.ZERO } },
    } as any);
    worldState.getSnapshot.mockReturnValue({
      getTreeInfo: () => Promise.resolve({ size: 1n }),
      getSiblingPath: () => Promise.resolve({ toFields: () => [] }),
    } as any);
  }

  function makeCheckpoint(
    checkpointNumber: number,
    slot: number,
    blockNumber: number,
    archiveRoot: Fr = Fr.random(),
  ): Checkpoint {
    return {
      number: CheckpointNumber(checkpointNumber),
      header: { slotNumber: SlotNumber(slot) },
      archive: { root: archiveRoot },
      blocks: [{ number: blockNumber, header: { hash: () => Promise.resolve('0x01') } }],
    } as unknown as Checkpoint;
  }

  function makePublishedCheckpoint(checkpoint: Checkpoint): PublishedCheckpoint {
    return { checkpoint, attestations: [] } as unknown as PublishedCheckpoint;
  }
});

/** ProverNode subclass that exposes hooks for injecting a mocked SessionManager + reads. */
class TestProverNode extends ProverNode {
  public setSessionManager(sm: SessionManager): void {
    this.sessionManager = sm;
  }

  public clearSessionManager(): void {
    this.sessionManager = undefined;
  }

  public setPublishingService(svc: ProofPublishingService): void {
    this.publishingService = svc;
  }

  public getTipsStore() {
    // tipsStore is private; reach in for the A-1041 assertion.

    return (this as any).tipsStore;
  }

  // ---------------- direct access for unit tests ----------------

  public callComputeStartupState() {
    return this.computeStartupState();
  }

  public callIsEpochFullyProven(epoch: EpochNumber, l1Constants: { epochDuration: number }) {
    return this.isEpochFullyProven(epoch, l1Constants as any);
  }

  public callIsProvenBlockLastOfItsEpoch(
    provenBlock: BlockNumber,
    provenEpoch: EpochNumber,
    l1Constants: { epochDuration: number },
  ) {
    return this.isProvenBlockLastOfItsEpoch(provenBlock, provenEpoch, l1Constants as any);
  }

  public getLastExpiredEpoch(): EpochNumber | undefined {
    return this.lastExpiredEpoch;
  }
}
