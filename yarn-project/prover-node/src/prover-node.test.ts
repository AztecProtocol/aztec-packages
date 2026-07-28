import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { AvmSimulator } from '@aztec/simulator/server';
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
  let avmSimulator: ReturnType<typeof mock<AvmSimulator>>;
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
    avmSimulator = mock<AvmSimulator>();
    sessionManager = mock<SessionManager>();
    publishingService = mock<ProofPublishingService>();

    prover.getProverId.mockReturnValue(EthAddress.ZERO);
    l2BlockSource.getGenesisBlockHash.mockReturnValue('0x00' as any);
    l2BlockSource.getL1Constants.mockResolvedValue(l1Constants);
    l2BlockSource.getL2Tips.mockResolvedValue({} as L2Tips);
    // Registering a checkpoint reads the consumed messages as a compact leaf-count range; these tests
    // exercise dispatch and pruning, not message content, so an empty range suffices.
    l1ToL2MessageSource.getL1ToL2MessagesBetweenLeafCounts.mockResolvedValue([]);
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
      avmSimulator,
      {},
    );
    // Inject the session manager and publishing service without going through start() —
    // start() wires the publisher + block stream + ticker, none of which these unit tests
    // exercise.
    proverNode.setSessionManager(sessionManager);
    proverNode.setPublishingService(publishingService);
    mined.clear();
  });

  // ---------------- event dispatch ----------------

  /** Builds an L2TipId (block + checkpoint id) for block/checkpoint number `n`. */
  const makeTipId = (n: number) => ({
    block: { number: BlockNumber(n), hash: `0x0${n}` },
    checkpoint: { number: CheckpointNumber(n), hash: `0x0${n}` },
  });

  it('dispatches chain-checkpointed: catches up and registers the checkpoint', async () => {
    setupNotFullyProven();
    const event = mineCheckpoint(makeCheckpoint(1, 1, 1));

    await proverNode.handleBlockStreamEvent(event);

    expect(proverNode.getCheckpointStore().listAll().length).toBe(1);
    expect(sessionManager.onCheckpointAdded).toHaveBeenCalledWith(EpochNumber(1));
  });

  it('caps the catch-up fetch at two epochs when resyncing far behind the checkpointed tip', async () => {
    // epochDuration=1 ⇒ two epochs' worth of checkpoints is 2. Cursor sits at checkpoint 0 while the
    // checkpointed tip has jumped to 100 (e.g. the prover node was offline for a long time). We must not
    // fetch all 100 checkpoints: epochs that far back are past their proof-submission window and cannot be
    // proven anyway, so the catch-up should fetch only the most recent two epochs' worth (checkpoints 99 and
    // 100) and skip the rest, leaving the cursor advanced past them so they are never retried.
    setupNotFullyProven();
    const fetchSpy = l2BlockSource.getCheckpointsData;
    mineCheckpoint(makeCheckpoint(99, 99, 99));
    const event = mineCheckpoint(makeCheckpoint(100, 100, 100));
    proverNode.setLastProcessedCheckpoint(CheckpointNumber.ZERO);

    await proverNode.handleBlockStreamEvent(event);

    // Only the most recent two epochs' worth were fetched and registered; the cursor lands at the tip.
    const fetchRanges = fetchSpy.mock.calls.map(([q]) => q as any).filter(q => 'from' in q);
    expect(fetchRanges).toEqual([{ from: CheckpointNumber(99), limit: 2 }]);
    expect(
      proverNode
        .getCheckpointStore()
        .listAll()
        .map(p => p.id),
    ).toHaveLength(2);
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(100));
  });

  it('dispatches chain-pruned through cancelAndRemoveAboveBlock and notifies the session manager only when affected', async () => {
    // No registered checkpoints — nothing to prune.
    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(0), hash: '0x00' },
      checkpointed: makeTipId(0),
      proven: makeTipId(0),
    });
    expect(sessionManager.onPrune).not.toHaveBeenCalled();

    // Register a checkpoint (cp 2 at block 2), then prune to block 1. The checkpoint's only block (2) is above the
    // prune target, so it is cancelled and removed and its epoch (2) is reported.
    setupNotFullyProven();
    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(2, 2, 2)));
    // The prune target (block 1) resolves to checkpoint 1, clamping the cursor to checkpoint 0.
    l2BlockSource.getBlockData.mockResolvedValue({ checkpointNumber: CheckpointNumber(1) } as any);

    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(1), hash: '0x01' },
      checkpointed: makeTipId(1),
      proven: makeTipId(1),
    });
    expect(sessionManager.onPrune).toHaveBeenCalledWith([EpochNumber(2)]);
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(0));
  });

  it('marks an orphaned checkpoint and reprocesses its same-number rebuild despite an inflated checkpointed tip', async () => {
    // Regression for keying the prune off event.checkpointed (the source's CURRENT checkpointed tip) rather than
    // event.block (the prune target). Register checkpoint 3 (block 3, epoch 3). A reorg drops block 3, but by the time
    // the prune is observed the source has already re-checkpointed a replacement at the SAME number 3, so the event's
    // checkpointed tip still reports number 3 — above the real prune target. Keying off that inflated number would
    // (a) leave the orphaned prover canonical and (b) clamp the cursor to 3, permanently skipping the rebuilt
    // checkpoint. Keying off the prune-target block (2) marks the orphan and clamps the cursor below 3 so the rebuild
    // reprocesses.
    setupNotFullyProven();
    const original = makeCheckpoint(3, 3, 3, Fr.random());
    await proverNode.handleBlockStreamEvent(mineCheckpoint(original));
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(3));
    const originalProver = proverNode.getCheckpointStore().listAll()[0];

    // The prune target is block 2 (in checkpoint 2), but the event's checkpointed tip is inflated to the rebuilt 3.
    // getBlockData also feeds collectRegisterData when the rebuild re-registers, so it carries a header too.
    l2BlockSource.getBlockData.mockResolvedValue({
      checkpointNumber: CheckpointNumber(2),
      header: { lastArchive: { root: Fr.ZERO }, state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } } },
    } as any);
    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(2), hash: '0x02' },
      checkpointed: makeTipId(3),
      proven: makeTipId(2),
    });

    // The orphaned prover for checkpoint 3 is cancelled and removed from the store, and the cursor was clamped below 3.
    expect(originalProver.isCancelled()).toBe(true);
    expect(proverNode.getCheckpointStore().getByCheckpoint(original)).toBeUndefined();
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(1));

    // The rebuilt checkpoint 3 (distinct archive root) is now served by the source. A fresh chain-checkpointed(3)
    // re-registers it because the cursor sits below 3.
    sessionManager.onCheckpointAdded.mockClear();
    const rebuilt = makeCheckpoint(3, 3, 3, Fr.random());
    await proverNode.handleBlockStreamEvent(mineCheckpoint(rebuilt));
    expect(sessionManager.onCheckpointAdded).toHaveBeenCalledWith(EpochNumber(3));
    expect(proverNode.getCheckpointStore().getByCheckpoint(rebuilt)).toBeDefined();
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(3));
  });

  it('throws on a prune whose target block data is missing, leaving provers and cursor untouched for retry', async () => {
    // The cursor floor is resolved before any prover is removed, so a missing-data prune throws without side effects
    // and the next pass retries the whole handler (the tips cursor only advances on success).
    setupNotFullyProven();
    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(3, 3, 3)));
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(3));
    const registeredProver = proverNode.getCheckpointStore().listAll()[0];

    l2BlockSource.getBlockData.mockResolvedValue(undefined);
    await expect(
      proverNode.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(2), hash: '0x02' },
        checkpointed: makeTipId(3),
        proven: makeTipId(2),
      }),
    ).rejects.toThrow(/No block data found for prune target/);

    expect(registeredProver.isCancelled()).toBe(false);
    expect(proverNode.getCheckpointStore().listAll()).toContain(registeredProver);
    expect(sessionManager.onPrune).not.toHaveBeenCalled();
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(3));
  });

  it('dispatches chain-proven to publishingService.onChainProven', async () => {
    await proverNode.handleBlockStreamEvent({
      type: 'chain-proven',
      block: { number: BlockNumber(7), hash: '0x07' },
      checkpoint: { number: CheckpointNumber(7), hash: '0x07' },
    });
    expect(publishingService.onChainProven).toHaveBeenCalledWith(BlockNumber(7));
  });

  it('the expiry sweep releases the chonk cache and reaps the store for elapsed epochs', async () => {
    // The sweep is driven solely by the periodic ticker (callCheckEpochExpiry mimics one tick).
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

    await proverNode.callCheckEpochExpiry();

    expect(cache.get(txHash)).toBeUndefined();
    // Three expired epochs ⇒ reapExpired called once per epoch.
    expect(reapSpy.mock.calls.map(([e]) => Number(e))).toEqual([0, 1, 2]);
  });

  it('checkExpiry advances the high-water mark — does not re-reap already-expired epochs', async () => {
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.callCheckEpochExpiry();
    expect(reapSpy.mock.calls.length).toBe(3);
    reapSpy.mockClear();

    // Same latest slot ⇒ nothing new should expire on a subsequent sweep.
    await proverNode.callCheckEpochExpiry();
    expect(reapSpy).not.toHaveBeenCalled();
  });

  it('checkExpiry no-ops when archiver has no synced slot yet', async () => {
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.callCheckEpochExpiry();
    expect(reapSpy).not.toHaveBeenCalled();
  });

  // ---------------- expiry only reaps; the failure upload is not on this path ----------------

  it('expireEpoch reaps the store but never uploads a post-mortem', async () => {
    // The post-mortem upload fires from the session-failure path (onSessionFailed)
    setupNotFullyProven();
    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(3, 3, 3)));
    expect(proverNode.getCheckpointStore().listAll().length).toBe(1);

    const uploadSpy = jest.spyOn(proverNode, 'tryUploadEpochFailure');
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');
    l2BlockSource.getBlocks.mockResolvedValue([]);

    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(5));
    await proverNode.callCheckEpochExpiry();

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(reapSpy.mock.calls.map(([e]) => Number(e))).toEqual([0, 1, 2, 3]);
  });

  it('propagates a checkpoint registration failure and leaves the tips store unadvanced (A-1041)', async () => {
    setupNotFullyProven();
    // Registration fails: worldState.syncImmediate (inside collectRegisterData) rejects. The
    // failure propagates rather than being swallowed, so the checkpoint is never registered and
    // the tips stay put for the L2BlockStream to retry.
    worldState.syncImmediate.mockRejectedValue(new Error('boom'));

    const event = mineCheckpoint(makeCheckpoint(1, 1, 1));

    await expect(proverNode.handleBlockStreamEvent(event)).rejects.toThrow('boom');

    // Tips left unadvanced; nothing was registered, the session manager wasn't notified, and the catch-up
    // cursor stays behind so the next pass retries this checkpoint.
    expect(await proverNode.getTipsStore().getL2BlockHash(1)).toBeUndefined();
    expect(proverNode.getCheckpointStore().listAll()).toHaveLength(0);
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber.ZERO);
  });

  it('leaves the tips store unadvanced when a handler propagates an error', async () => {
    // The prune handler throws when it cannot resolve the prune target's block data. That failure
    // propagates before the tips-store update, so the error surfaces to the L2BlockStream and the
    // tips stay put for a retry on the next poll.
    l2BlockSource.getBlockData.mockResolvedValue(undefined);

    const event: L2BlockStreamEvent = {
      type: 'chain-pruned',
      block: { number: BlockNumber(1), hash: '0x01' },
      checkpointed: makeTipId(1),
      proven: makeTipId(1),
    };

    await expect(proverNode.handleBlockStreamEvent(event)).rejects.toThrow(/cannot clamp checkpoint cursor/);

    // Tips left unadvanced so the L2BlockStream re-emits this event on its next poll.
    expect(await proverNode.getTipsStore().getL2BlockHash(1)).toBeUndefined();
  });

  // ---------------- handleCheckpointEvent gating ----------------

  it('skips registration when the epoch is already fully proven on L1', async () => {
    // Proven block sits at the last block of epoch 1 (epochDuration=1, slot=1). Block 2 must be
    // absent so isProvenBlockLastOfItsEpoch falls through to isEpochComplete and reports the
    // proven tip as the epoch's last block.
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(1));
    l2BlockSource.getBlockData.mockImplementation((query: any) =>
      Promise.resolve(Number(query.number) === 1 ? ({ header: { getSlot: () => SlotNumber(1) } } as any) : undefined),
    );
    l2BlockSource.isEpochComplete.mockResolvedValue(true);

    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(1, 1, 1)));

    expect(proverNode.getCheckpointStore().listAll().length).toBe(0);
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
    // The whole-epoch skip still advances the cursor so we don't re-evaluate it next pass.
    expect(proverNode.getLastProcessedCheckpoint()).toEqual(CheckpointNumber(1));
  });

  it('content-addresses the prover by the checkpoint archive root', async () => {
    setupNotFullyProven();
    const archiveRoot = Fr.random();

    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(1, 1, 2, archiveRoot)));

    const prover = proverNode.getCheckpointStore().listAll()[0];
    expect(prover.id).toContain(archiveRoot.toString());
  });

  it('uploads a checkpoint post-mortem when a registered checkpoint prover fails', async () => {
    // The store is wired so a checkpoint prover that fails (here its eager tx-gather rejects, as the
    // txProvider is unconfigured) routes through to tryUploadCheckpointFailure with that prover.
    setupNotFullyProven();
    const uploadSpy = jest.spyOn(proverNode, 'tryUploadCheckpointFailure').mockResolvedValue(undefined);

    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(3, 3, 3)));
    const prover = proverNode.getCheckpointStore().listAll()[0];
    // Wait for the eager pipeline to settle (it fails at gather), then the onFailed hook has fired.
    await prover.whenDone();

    expect(prover.isFailed()).toBe(true);
    expect(uploadSpy).toHaveBeenCalledWith(prover);
  });

  describe('isCheckpointCanonical', () => {
    it('is true when the archiver holds a block at the checkpoint tip with a matching archive root', async () => {
      const archiveRoot = Fr.random();
      const checkpoint = makeCheckpoint(3, 3, 3, archiveRoot);
      l2BlockSource.getBlock.mockResolvedValue({ archive: { root: archiveRoot } } as unknown as L2Block);

      await expect(proverNode.callIsCheckpointCanonical(checkpoint)).resolves.toBe(true);
    });

    it('is false when the checkpoint tip block was pruned out (archiver returns nothing)', async () => {
      const checkpoint = makeCheckpoint(3, 3, 3);
      l2BlockSource.getBlock.mockResolvedValue(undefined);

      await expect(proverNode.callIsCheckpointCanonical(checkpoint)).resolves.toBe(false);
    });

    it('is false when the tip block was replaced by a reorg (archive root differs)', async () => {
      const checkpoint = makeCheckpoint(3, 3, 3, Fr.random());
      l2BlockSource.getBlock.mockResolvedValue({ archive: { root: Fr.random() } } as unknown as L2Block);

      await expect(proverNode.callIsCheckpointCanonical(checkpoint)).resolves.toBe(false);
    });
  });

  it('tryUploadCheckpointFailure skips the upload for a checkpoint pruned out of the canonical chain', async () => {
    // A prune-induced fork fault reaches onFailed just like a genuine sub-tree failure, but the pruned
    // checkpoint no longer exists on-chain — the expensive full snapshot must not be produced for it.
    (proverNode as any).config.proverNodeFailedEpochStore = 'file:///tmp/does-not-matter';
    const checkpoint = makeCheckpoint(3, 3, 3);
    l2BlockSource.getBlock.mockResolvedValue(undefined);
    const failedProver = { id: 'prover-3', checkpoint } as unknown as Parameters<
      typeof proverNode.tryUploadCheckpointFailure
    >[0];

    await expect(proverNode.tryUploadCheckpointFailure(failedProver)).resolves.toBeUndefined();
    expect(l2BlockSource.getBlock).toHaveBeenCalledWith({ number: checkpoint.blocks.at(-1)!.number });
    // World-state snapshotting is the first thing the real upload path touches; it must never be reached.
    expect(worldState.getSnapshot).not.toHaveBeenCalled();
  });

  // ---------------- forwarders ----------------

  it('startProof forwards to the session manager and returns the job id', async () => {
    sessionManager.startProof.mockResolvedValue('job-5');
    await expect(proverNode.startProof(EpochNumber(5))).resolves.toBe('job-5');
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

  // ---------------- handleBlockStreamEvent: chain-proposed is a no-op ----------------

  it("'chain-proposed' invokes no event handler but records the tip", async () => {
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.handleBlockStreamEvent({
      type: 'chain-proposed',
      block: { number: BlockNumber(1), hash: '0x01' },
    });

    // No checkpoint, prune, or proven handler should have fired, and expiry is not on the event path.
    expect(sessionManager.onCheckpointAdded).not.toHaveBeenCalled();
    expect(sessionManager.onPrune).not.toHaveBeenCalled();
    expect(publishingService.onChainProven).not.toHaveBeenCalled();
    expect(reapSpy).not.toHaveBeenCalled();
    // The tips store recorded the proposed tip (it is the walk-back history in tips-only mode).
    expect(await proverNode.getTipsStore().getL2BlockHash(1)).toEqual('0x01');
  });

  // ---------------- checkEpochExpiry: latestEpoch < offset is a no-op ----------------

  it('checkEpochExpiry no-ops when latestEpoch is below the submission-window offset', async () => {
    // proofSubmissionEpochs=1 ⇒ offset=2. latestSlot=1 ⇒ latestEpoch=1 < 2.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(1));
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.callCheckEpochExpiry();

    expect(reapSpy).not.toHaveBeenCalled();
    // High-water mark stays untouched.
    expect(proverNode.getLastExpiredEpoch()).toBeUndefined();
  });

  // ---------------- expireEpoch swallows getBlocks errors ----------------

  it('expireEpoch still reaps the store when the chonk-release block fetch throws', async () => {
    // Three epochs would expire (latestSlot=4 ⇒ epochs 0..2). getBlocks throws for every call,
    // but reapExpired must still be invoked for each epoch and the high-water mark must still advance.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(4));
    l2BlockSource.getBlocks.mockRejectedValue(new Error('archiver unavailable'));
    const reapSpy = jest.spyOn(proverNode.getCheckpointStore(), 'reapExpired');

    await proverNode.callCheckEpochExpiry();

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
    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(1, 6, 6)));
    await proverNode.handleBlockStreamEvent(mineCheckpoint(makeCheckpoint(2, 7, 7)));
    expect(proverNode.getCheckpointStore().listAll().length).toBe(2);

    // Pruning to block 0 (genesis) marks both as pruned — onPrune must receive [EpochNumber(3)], not [3, 3].
    sessionManager.onPrune.mockClear();
    await proverNode.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(0), hash: '0x00' },
      checkpointed: makeTipId(0),
      proven: makeTipId(0),
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

  // ---------------- resolveLastFullyProvenEpoch branches ----------------

  describe('resolveLastFullyProvenEpoch', () => {
    it('returns no fully-proven epoch when nothing is proven', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(undefined);
      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
        lastFullyProvenEpoch: undefined,
      });
    });

    it('returns no fully-proven epoch when the proven block has no archiver header', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockResolvedValue(undefined);
      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
        lastFullyProvenEpoch: undefined,
      });
    });

    it('returns provenEpoch when the proven block is the last of its epoch', async () => {
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
      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
        lastFullyProvenEpoch: EpochNumber(5),
      });
    });

    it('returns provenEpoch via the isEpochComplete fallback when there is no next-block header', async () => {
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(5));
      l2BlockSource.getBlockData.mockImplementation((q: any) => {
        if (q.number === 5) {
          return Promise.resolve({ header: { getSlot: () => SlotNumber(5) } } as any);
        }
        return Promise.resolve(undefined);
      });
      l2BlockSource.isEpochComplete.mockResolvedValue(true);
      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
        lastFullyProvenEpoch: EpochNumber(5),
      });
    });

    it('returns provenEpoch-1 when proven is mid-epoch', async () => {
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

      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
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

      await expect(proverNode.callResolveLastFullyProvenEpoch()).resolves.toEqual({
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
    // and supplies a lastArchive.root plus an L1-to-L2 leaf count for collectRegisterData.
    l2BlockSource.getBlockData.mockResolvedValue({
      header: { lastArchive: { root: Fr.ZERO }, state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } } },
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
      header: { lastArchive: { root: Fr.ZERO }, state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } } },
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
      header: { slotNumber: SlotNumber(slot), inboxRollingHash: Fr.ZERO },
      archive: { root: archiveRoot },
      blocks: [
        {
          number: blockNumber,
          header: {
            hash: () => Promise.resolve('0x01'),
            state: { l1ToL2MessageTree: { nextAvailableLeafIndex: 0 } },
          },
        },
      ],
      hash: () => new Fr(checkpointNumber),
    } as unknown as Checkpoint;
  }

  function makePublishedCheckpoint(checkpoint: Checkpoint): PublishedCheckpoint {
    return { checkpoint, attestations: [] } as unknown as PublishedCheckpoint;
  }

  /** Registry of mined checkpoints. */
  const mined = new Map<number, Checkpoint>();

  /**
   * Registers `checkpoint` with the block source mocks: its light metadata is returned by `getCheckpointsData`
   * range queries, and its full payload by `getCheckpoint({ number })`. Returns the thin `chain-checkpointed`
   * tip event that points at it — the block stream now delivers only the tip, and the prover-node fetches
   * everything between its cursor and the tip itself.
   */
  function mineCheckpoint(checkpoint: Checkpoint): L2BlockStreamEvent {
    mined.set(Number(checkpoint.number), checkpoint);
    l2BlockSource.getCheckpoint.mockImplementation((query: any) => {
      if (!('number' in query)) {
        return Promise.resolve(undefined);
      }
      const number = Number(query.number);
      const found = mined.get(number);
      // Ancestors below the mined window exist on chain but are irrelevant to the scenario; serve a synthetic
      // parent so inbox rolling-hash sourcing for the earliest mined checkpoint resolves.
      const belowWindow = number > 0 && number < Math.min(...mined.keys());
      return Promise.resolve(
        makeMaybePublished(found ?? (belowWindow ? makeCheckpoint(number, number, number) : undefined)),
      );
    });
    l2BlockSource.getCheckpointsData.mockImplementation((query: any) => {
      if (!('from' in query)) {
        return Promise.resolve([]);
      }
      const data = [];
      for (let n = Number(query.from); n < Number(query.from) + query.limit; n++) {
        const cp = mined.get(n);
        if (cp) {
          data.push({ checkpointNumber: cp.number, header: cp.header } as any);
        }
      }
      return Promise.resolve(data);
    });
    return {
      type: 'chain-checkpointed',
      block: { number: BlockNumber(checkpoint.blocks[0].number), hash: '0x01' },
      checkpoint: { number: checkpoint.number, hash: checkpoint.hash().toString() },
    };
  }

  function makeMaybePublished(checkpoint: Checkpoint | undefined): PublishedCheckpoint | undefined {
    return checkpoint ? makePublishedCheckpoint(checkpoint) : undefined;
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

  public callResolveLastFullyProvenEpoch() {
    return this.resolveLastFullyProvenEpoch();
  }

  /** Drives the expiry sweep directly, as the periodic ticker does in production. */
  public callCheckEpochExpiry() {
    return (this as any).checkEpochExpiry();
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

  public callIsCheckpointCanonical(checkpoint: Checkpoint) {
    return this.isCheckpointCanonical(checkpoint);
  }

  public getLastExpiredEpoch(): EpochNumber | undefined {
    return this.lastExpiredEpoch;
  }

  public getLastProcessedCheckpoint(): CheckpointNumber {
    return this.lastProcessedCheckpoint;
  }

  public setLastProcessedCheckpoint(checkpoint: CheckpointNumber): void {
    this.lastProcessedCheckpoint = checkpoint;
  }
}
