import { EpochCache } from '@aztec/epoch-cache';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { timesAsync } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import type { Logger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { ManualDateProvider } from '@aztec/foundation/timer';
import { type TypedEventEmitter, unfreeze } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CommitteeAttestation,
  L2Block,
  type L2BlockSink,
  type L2BlockSource,
  type ProposedCheckpointSink,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  L1PublishedData,
  type ProposedCheckpointData,
} from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import {
  InsufficientValidTxsError,
  type MerkleTreeWriteOperations,
  type ResolvedSequencerConfig,
  type TreeInfo,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { InboxBucket, L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockProposal, CheckpointProposal, type CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { ProposerTimetable, SubslotSelection } from '@aztec/stdlib/timetable';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { type FailedTx, GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { CheckpointBuilder, type FullNodeCheckpointsBuilder, type ValidatorClient } from '@aztec/validator-client';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';
import { DutyType } from '@aztec/validator-ha-signer/types';

import { expect, jest } from '@jest/globals';
import EventEmitter from 'events';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';
import type { TransactionReceipt } from 'viem';

import { DefaultSequencerConfig } from '../config.js';
import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import {
  MockCheckpointBuilder,
  MockCheckpointsBuilder,
  createCheckpointAttestation,
  makeBlock,
  makeProposerTimetable,
  makeTx,
  mockInboxBuckets,
  mockPendingTxs,
  mockTxIterator,
  serveAddedBlocksFromSource,
  setupTxsAndBlock,
} from '../test/utils.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import type { CheckpointProposalJobMetricsRecorder } from './checkpoint_proposal_job_metrics.js';
import type { SequencerEvents } from './events.js';
import type { L1BlockReader } from './inbox_bucket_eligibility.js';
import type { SequencerMetrics } from './metrics.js';
import { RequestsTracker } from './requests_tracker.js';

/**
 * L1 view in which every bucket's opening block already has a canonical child, so the job's confirmation tracker
 * admits every bucket the archiver mock returns.
 */
const confirmingL1Client = {
  getBlock: jest.fn(({ blockNumber }: { blockNumber: bigint }) =>
    Promise.resolve({
      hash: Buffer32.fromBigInt(blockNumber).toString(),
      parentHash: Buffer32.fromBigInt(blockNumber - 1n).toString(),
    }),
  ),
} satisfies L1BlockReader;

describe('CheckpointProposalJob', () => {
  let publisher: MockProxy<SequencerPublisher>;
  let epochCache: MockProxy<EpochCache>;
  let validatorClient: MockProxy<ValidatorClient>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let p2p: MockProxy<P2P>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let checkpointsBuilder: MockCheckpointsBuilder;
  let checkpointBuilder: MockCheckpointBuilder;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let blockSink: MockProxy<L2BlockSink & ProposedCheckpointSink>;
  /** Blocks the job pushed to the archiver, which serves them back until a test prunes them. */
  let localBlocks: Map<number, L2Block>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let dateProvider: ManualDateProvider;
  let metrics: MockProxy<SequencerMetrics>;
  let checkpointMetrics: MockProxy<CheckpointProposalJobMetricsRecorder>;
  let job: TestCheckpointProposalJob;

  let timetable: ProposerTimetable;
  let l1Constants: L1RollupConstants;
  let config: ResolvedSequencerConfig;

  let lastBlockNumber: BlockNumber;
  let newBlockNumber: BlockNumber;
  let newSlotNumber: number;
  let checkpointNumber: CheckpointNumber;
  let epoch: EpochNumber;
  let hash: string;

  let globalVariables: GlobalVariables;
  let feeRecipient: AztecAddress;

  const slotDuration = 24;
  const ethereumSlotDuration = 12;
  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const gasFees = GasFees.empty();

  const signer = Secp256k1Signer.random();
  const mockedSig = Signature.random();
  const mockedAttestation = new CommitteeAttestation(signer.address, mockedSig);
  const committee = [signer.address];
  const attestorAddress = EthAddress.random();
  const proposer = EthAddress.random();
  const signatureContext: CoordinationSignatureContext = {
    chainId: chainId.toNumber(),
    rollupAddress: EthAddress.random(),
  };

  const getSignatures = () => [mockedAttestation];

  const getAttestations = (block: any) => {
    const attestation = createCheckpointAttestation(block, mockedSig, committee[0]);
    return [attestation];
  };

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    lastBlockNumber = BlockNumber.ZERO;
    newBlockNumber = BlockNumber(lastBlockNumber + 1);
    newSlotNumber = 1;
    epoch = EpochNumber.ZERO;
    checkpointNumber = CheckpointNumber.fromBlockNumber(newBlockNumber);
    hash = Fr.ZERO.toString();

    globalVariables = new GlobalVariables(
      chainId,
      version,
      newBlockNumber,
      SlotNumber(newSlotNumber),
      /*timestamp=*/ 0n,
      coinbase,
      feeRecipient,
      gasFees,
    );

    const l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));
    l1Constants = {
      l1GenesisTime,
      slotDuration,
      ethereumSlotDuration,
      l1StartBlock: 0n,
      epochDuration: 16,
      proofSubmissionEpochs: 4,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };

    // ManualDateProvider freezes time (it does not track real wall-clock progression), so timing-sensitive
    // assertions on dateProvider.now() are deterministic regardless of how long the test takes to execute.
    dateProvider = new ManualDateProvider();
    // Set time to be at the start of the slot (slot 1 starts at l1GenesisTime + slotDuration - ethereumSlotDuration)
    const slotStartTime = Number(l1GenesisTime) + newSlotNumber * slotDuration - ethereumSlotDuration;
    dateProvider.setTime(slotStartTime * 1000); // Convert to milliseconds

    epochCache = mockDeep<EpochCache>();
    epochCache.getCommittee.mockResolvedValue({
      committee,
      seed: 0n,
      epoch: EpochNumber(1),
      isEscapeHatchOpen: false,
    });
    epochCache.getL1Constants.mockImplementation(() => l1Constants);

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockImplementation(() => attestorAddress);
    publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
    publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
    publisher.enqueueSlashingActions.mockResolvedValue(true);

    // Default rollup contract reads used by pipelined fee-header derivation. Tests that exercise
    // the failure modes override these via jest.spyOn.
    jest.spyOn(publisher.rollupContract, 'getCheckpoint').mockResolvedValue({
      feeHeader: { manaUsed: 0n, excessMana: 0n, ethPerFeeAsset: 1n, congestionCost: 0n, proverCost: 0n },
    } as any);
    jest.spyOn(publisher.rollupContract, 'getManaTarget').mockResolvedValue(10_000n);
    publisher.sendRequestsAt.mockResolvedValue({
      result: { receipt: { status: 'success' } as TransactionReceipt },
      successfulActions: ['propose'],
      failedActions: [],
      sentActions: ['propose'],
      expiredActions: [],
    });

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      slotNumber: globalVariables.slotNumber,
      timestamp: globalVariables.timestamp,
      coinbase: globalVariables.coinbase,
      feeRecipient: globalVariables.feeRecipient,
      gasFees: globalVariables.gasFees,
      chainId: globalVariables.chainId,
      version: globalVariables.version,
    });

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({
        state: P2PClientState.IDLE,
        syncedToL2Block: { number: lastBlockNumber, hash },
      }),
    });
    p2p.broadcastProposal.mockResolvedValue(undefined);
    // Default the tx-availability gate to "enough txs"; tests that exercise the gate override these.
    p2p.hasEligiblePendingTxs.mockResolvedValue(true);
    p2p.getPendingTxCount.mockResolvedValue(0);

    worldState = mockDeep<WorldStateSynchronizer>();
    const mockFork = mock<MerkleTreeWriteOperations>({
      [Symbol.asyncDispose]: jest.fn().mockReturnValue(Promise.resolve()) as () => Promise<void>,
    });
    // The streaming Inbox cursor resolves the parent bucket from the fork's L1-to-L2 tree leaf count; default to
    // an empty tree so checkpoints start at the genesis bucket unless a test seeds buckets.
    mockFork.getTreeInfo.mockResolvedValue({ size: 0n } as TreeInfo);
    worldState.fork.mockResolvedValue(mockFork);

    // Create fake CheckpointsBuilder and CheckpointBuilder
    const checkpointConstants = {
      slotNumber: globalVariables.slotNumber,
      timestamp: globalVariables.timestamp,
      coinbase: globalVariables.coinbase,
      feeRecipient: globalVariables.feeRecipient,
      gasFees: globalVariables.gasFees,
      chainId: globalVariables.chainId,
      version: globalVariables.version,
    };
    checkpointsBuilder = new MockCheckpointsBuilder();
    checkpointBuilder = checkpointsBuilder.createCheckpointBuilder(checkpointConstants, checkpointNumber);

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    // Genesis bucket for the empty-tree cursor above; with no newer synced buckets mocked, block bundle
    // selection consumes nothing by default and the propose bucket hint resolves to the genesis sentinel.
    mockInboxBuckets(l1ToL2MessageSource);

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    // The job sources the parent checkpoint's inboxRollingHash; serve an empty parent header so jobs beyond
    // the genesis checkpoint resolve their chain start.
    l2BlockSource.getCheckpointData.mockImplementation(query =>
      Promise.resolve('number' in query ? ({ header: CheckpointHeader.empty() } as CheckpointData) : undefined),
    );
    // The (always-on) pipelined submission path waits for the archiver to confirm the parent
    // checkpoint on L1 before enqueuing the proposal. For the default job (checkpoint 1, no
    // proposed parent), the parent is genesis (cp 0), so a synced archiver reporting a
    // checkpointed tip of cp 0 lets the wait pass. Tests with a proposed parent override these.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(newSlotNumber));
    l2BlockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });
    l2BlockSource.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber(1), hash: 'proposed-hash' },
      checkpointed: {
        block: { number: BlockNumber.ZERO, hash: 'block-hash' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: 'checkpointed-ckpt-hash' },
      },
      proven: {
        block: { number: BlockNumber.ZERO, hash: 'proven-hash' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: 'proven-ckpt-hash' },
      },
      finalized: {
        block: { number: BlockNumber.ZERO, hash: 'finalized-hash' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: 'finalized-ckpt-hash' },
      },
    });

    blockSink = mock<L2BlockSink & ProposedCheckpointSink>();
    localBlocks = serveAddedBlocksFromSource(l2BlockSource, blockSink);
    blockSink.addProposedCheckpoint.mockResolvedValue(undefined);

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockImplementation(
      async (blockHeader, _checkpointNumber, indexWithinCheckpoint, archiveRoot, txs) => {
        const txHashes = await Promise.all((txs ?? []).map((tx: Tx) => tx.getTxHash()));
        return new BlockProposal(
          blockHeader,
          IndexWithinCheckpoint(indexWithinCheckpoint),
          archiveRoot,
          txHashes,
          mockedSig,
          signatureContext,
        );
      },
    );
    validatorClient.createCheckpointProposal.mockImplementation(
      async (checkpointHeader, archiveRoot, _checkpointNumber, feeAssetPriceModifier, lastBlockInfo) => {
        if (!lastBlockInfo) {
          return new CheckpointProposal(
            checkpointHeader,
            archiveRoot,
            feeAssetPriceModifier,
            mockedSig,
            signatureContext,
          );
        }
        const txHashes = await Promise.all((lastBlockInfo.txs ?? []).map((tx: Tx) => tx.getTxHash()));
        return new CheckpointProposal(
          checkpointHeader,
          archiveRoot,
          feeAssetPriceModifier,
          mockedSig,
          signatureContext,
          {
            blockHeader: lastBlockInfo.blockHeader,
            indexWithinCheckpoint: lastBlockInfo.indexWithinCheckpoint,
            txHashes,
            signature: mockedSig,
            // Note: signedTxs omitted since publishTxsWithProposals is false in tests
          },
        );
      },
    );
    validatorClient.signAttestationsAndSigners.mockImplementation(() => Promise.resolve(getSignatures()[0].signature));
    validatorClient.getCoinbaseForAttestor.mockReturnValue(coinbase);
    validatorClient.getFeeRecipientForAttestor.mockReturnValue(feeRecipient);
    validatorClient.getValidatorAddresses.mockReturnValue([attestorAddress]);

    slasherClient = mock<SlasherClientInterface>();
    slasherClient.getProposerActions.mockResolvedValue([]);

    metrics = mockDeep<SequencerMetrics>();
    checkpointMetrics = mockDeep<CheckpointProposalJobMetricsRecorder>();

    config = {
      ...DefaultSequencerConfig,
      maxTxsPerBlock: 4,
      minTxsPerBlock: 1,
      publishTxsWithProposals: false,
      broadcastInvalidBlockProposal: false,
      fishermanMode: false,
      buildCheckpointIfEmpty: false,
      skipInvalidateBlockAsProposer: false,
      skipCollectingAttestations: false,
      injectFakeAttestation: false,
      shuffleAttestationOrdering: false,
    };

    timetable = makeProposerTimetable({
      l1Constants,
    });

    confirmingL1Client.getBlock.mockClear();
    job = createCheckpointProposalJob();
  });

  // selectNextSubslot returns absolute wall-clock sub-slot deadlines (seconds), which is exactly what
  // waitUntilNextSubslot receives. Tests express deadlines as offsets from the build frame start and assert
  // waitUntilNextSubslot with the resulting absolute timestamp (buildFrameStartSeconds() + offset).
  // The build frame for the target slot opens at target_slot_start - S - E, i.e. anchored at the slot
  // before the target slot.
  const buildFrameStartSeconds = () =>
    Number(l1Constants.l1GenesisTime) + (newSlotNumber - 1) * slotDuration - ethereumSlotDuration;
  const subslot = (offset: number, index: number, isLastBlock: boolean): SubslotSelection => ({
    canStart: true,
    index,
    deadline: buildFrameStartSeconds() + offset,
    isLastBlock,
  });
  const noSubslot = (): SubslotSelection => ({
    canStart: false,
    index: undefined,
    deadline: undefined,
    isLastBlock: false,
  });
  const makeSingleBlockTimetable = () =>
    makeProposerTimetable({
      l1Constants,
      blockDurationMs: 9000,
    });

  describe('single block mode', () => {
    beforeEach(() => {
      // Single block mode: a 9s block duration in a 24s slot derives exactly one block sub-slot.
      timetable = makeSingleBlockTimetable();
      job.setTimetable(timetable);
    });

    it('builds one block with sufficient txs', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 2, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      // Start building at the build-frame opening so the single block sub-slot is still selectable.
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      // recordBuiltBlock must receive the target slot so metrics can gate inter-block time
      // to blocks within the same slot and avoid pollution across the proposer's turn gaps.
      expect(metrics.recordBuiltBlock).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        SlotNumber(newSlotNumber),
      );
      expect(checkpointMetrics.startCheckpointTiming).toHaveBeenCalledWith(expect.any(Number));
      expect(checkpointMetrics.noteCheckpointBlockBuilt).toHaveBeenCalledWith(expect.any(Number), {
        isFirstBlock: true,
        isLastBlock: true,
      });
      expect(checkpointMetrics.noteCheckpointBroadcast).toHaveBeenCalledWith(expect.any(Number));
      expect(checkpointMetrics.recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary).not.toHaveBeenCalled();
    });

    it('records pipelined checkpoint build start offset from the wall-clock slot boundary', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 2, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));
      // We build checkpoint 2 on top of proposed parent at checkpoint 1.
      checkpointNumber = CheckpointNumber(2);

      const targetSlot = SlotNumber(newSlotNumber + 1);
      const pipelinedJob = createCheckpointProposalJob({
        targetSlot,
        proposedCheckpointData: {
          checkpointNumber: CheckpointNumber(1),
          header: CheckpointHeader.empty(),
          archive: new AppendOnlyTreeSnapshot(Fr.ZERO, 1),
          checkpointOutHash: Fr.ZERO,
          startBlock: BlockNumber(1),
          blockCount: 1,
          totalManaUsed: 5000n,
          feeAssetPriceModifier: 100n,
          inboxMsgTotal: 0n,
        },
      });

      // Anchor the (frozen) clock at the build-frame opening for the target slot before executing, since the
      // job reads dateProvider.now() when recording the offset.
      dateProvider.setTime(pipelinedJob.getTimetable().getBuildFrameStart(targetSlot) * 1000);

      const checkpoint = await pipelinedJob.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointMetrics.startCheckpointTiming).toHaveBeenCalledWith(expect.any(Number));
      expect(checkpointMetrics.recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary).toHaveBeenCalledTimes(1);
      // The build frame opens at target_slot_start - S - E, and the build slot boundary measured against is
      // target_slot_start - S, so the offset is exactly -E (one ethereum slot before the boundary).
      const [offsetMs] = checkpointMetrics.recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary.mock.calls[0];
      expect(offsetMs).toBe(-ethereumSlotDuration * 1000);
    });

    it('skips building if not enough txs and not forced', async () => {
      const txs = await Promise.all([makeTx(1, chainId)]);
      mockPendingTxs(p2p, txs);

      job.updateConfig({ minTxsPerBlock: 2 });

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('forces empty block when buildCheckpointIfEmpty is set', async () => {
      mockPendingTxs(p2p, []);

      const emptyBlock = await makeBlock([], globalVariables);
      checkpointBuilder.seedBlocks([emptyBlock], [[]]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(emptyBlock));

      job.updateConfig({ buildCheckpointIfEmpty: true, minTxsPerBlock: 1 });

      // Start building at the build-frame opening so the single block sub-slot is still selectable.
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(checkpointBuilder.buildBlockCalls[0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlockNumber,
          opts: expect.objectContaining({
            maxTransactions: config.maxTxsPerBlock,
          }),
        }),
      );
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('collects attestations after building the single block', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      // Start building at the build-frame opening so the single block sub-slot is still selectable.
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
      await job.executeAndAwait();

      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Number),
        expect.any(Date),
        checkpointNumber,
      );
    });

    it('passes previous checkpoint out hashes when there are earlier checkpoints in the epoch', async () => {
      // Create two previous checkpoints in the same epoch
      const previousCheckpoints = await timesAsync(2, i => Checkpoint.random(CheckpointNumber(i + 1)));
      const previousCheckpointsData: CheckpointData[] = previousCheckpoints.map(c => toCheckpointData(c));

      // Update job to be for checkpoint 3
      checkpointNumber = CheckpointNumber(3);
      job = createCheckpointProposalJob();
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 9000,
        }),
      );

      // Mock l2BlockSource to return the previous checkpoints
      l2BlockSource.getCheckpointsData.mockResolvedValue(previousCheckpointsData);

      // Build block successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.executeAndAwait();

      // Verify startCheckpoint was called with the out hashes from previous checkpoints
      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      const call = checkpointsBuilder.startCheckpointCalls[0];

      expect(call.previousCheckpointOutHashes).toHaveLength(2);
      expect(call.previousCheckpointOutHashes[0]).toEqual(previousCheckpoints[0].getCheckpointOutHash());
      expect(call.previousCheckpointOutHashes[1]).toEqual(previousCheckpoints[1].getCheckpointOutHash());
    });

    it('filters out checkpoints at or after the current checkpoint number', async () => {
      // Create checkpoints: one before, one at, and one after the current checkpoint number
      const previousCheckpoint = await Checkpoint.random(CheckpointNumber(1));
      const currentCheckpoint = await Checkpoint.random(CheckpointNumber(2));
      const futureCheckpoint = await Checkpoint.random(CheckpointNumber(3));

      // Job is for checkpoint 2
      checkpointNumber = CheckpointNumber(2);
      job = createCheckpointProposalJob();
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 9000,
        }),
      );

      // Mock l2BlockSource to return all three checkpoints as data
      l2BlockSource.getCheckpointsData.mockResolvedValue([
        toCheckpointData(previousCheckpoint),
        toCheckpointData(currentCheckpoint),
        toCheckpointData(futureCheckpoint),
      ]);

      // Build block successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.executeAndAwait();

      // Verify only the checkpoint before the current one is included
      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      const call = checkpointsBuilder.startCheckpointCalls[0];

      expect(call.previousCheckpointOutHashes).toHaveLength(1);
      expect(call.previousCheckpointOutHashes[0]).toEqual(previousCheckpoint.getCheckpointOutHash());
    });

    it('uses targetEpoch for previousCheckpointOutHashes when pipelining crosses epoch boundary', async () => {
      // Pipelining scenario: wall-clock is in epoch 0, but target slot is in epoch 1.
      const targetEpoch = EpochNumber(1);
      // Target slot is first slot of epoch 1 (epochDuration = 16); the wall-clock build slot is the
      // last slot of epoch 0 (targetSlot - 1).
      const targetSlot = SlotNumber(l1Constants.epochDuration);

      checkpointNumber = CheckpointNumber(2);
      const previousCheckpoint = await Checkpoint.random(CheckpointNumber(1));

      l2BlockSource.getCheckpointsData.mockResolvedValue([toCheckpointData(previousCheckpoint)]);

      job = createCheckpointProposalJob({ targetSlot, targetEpoch });
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 9000,
        }),
      );

      // Build block successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.execute();

      // Verify getCheckpointsData was called with targetEpoch (1), not the wall-clock epoch (0)
      expect(l2BlockSource.getCheckpointsData).toHaveBeenCalledWith({ epoch: targetEpoch });
    });

    it('splices the parent checkpointOutHash from proposedCheckpointData when pipelining and parent not yet on L1', async () => {
      // Build checkpoint 2, where the parent (checkpoint 1) is in the same epoch but not yet checkpointed on L1.
      checkpointNumber = CheckpointNumber(2);

      // L1 archiver knows nothing yet — checkpoint 1's L1 tx is still in flight.
      l2BlockSource.getCheckpointsData.mockResolvedValue([]);

      const parentCheckpointOutHash = Fr.random();
      const parentHeader = CheckpointHeader.empty();
      parentHeader.slotNumber = SlotNumber(newSlotNumber); // same epoch as targetEpoch (epoch 0)
      const proposedCheckpointData: ProposedCheckpointData = {
        checkpointNumber: CheckpointNumber(1),
        header: parentHeader,
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: parentCheckpointOutHash,
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 5000n,
        feeAssetPriceModifier: 100n,
        inboxMsgTotal: 0n,
      };

      job = createCheckpointProposalJob({
        targetSlot: SlotNumber(newSlotNumber + 1),
        proposedCheckpointData,
      });
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 9000,
        }),
      );

      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.executeAndAwait();

      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      const call = checkpointsBuilder.startCheckpointCalls[0];
      expect(call.previousCheckpointOutHashes).toEqual([parentCheckpointOutHash]);
    });

    it('does not splice the parent outHash when the parent is in a different epoch', async () => {
      // Parent checkpoint sits at the last slot of the previous epoch; we are building the first
      // checkpoint of the new epoch, so the parent's outHash must NOT contribute to our epochOutHash.
      const targetEpoch = EpochNumber(1);
      const targetSlot = SlotNumber(l1Constants.epochDuration);
      // Wall-clock build slot is the last slot of the previous epoch (targetSlot - 1).
      const buildSlot = SlotNumber(l1Constants.epochDuration - 1);

      checkpointNumber = CheckpointNumber(2);

      l2BlockSource.getCheckpointsData.mockResolvedValue([]);

      const parentHeader = CheckpointHeader.empty();
      parentHeader.slotNumber = buildSlot; // last slot of previous epoch
      const proposedCheckpointData: ProposedCheckpointData = {
        checkpointNumber: CheckpointNumber(1),
        header: parentHeader,
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.random(),
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 5000n,
        feeAssetPriceModifier: 100n,
        inboxMsgTotal: 0n,
      };

      job = createCheckpointProposalJob({ targetSlot, targetEpoch, proposedCheckpointData });
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 9000,
        }),
      );

      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.execute();

      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      expect(checkpointsBuilder.startCheckpointCalls[0].previousCheckpointOutHashes).toEqual([]);
    });
  });

  /**
   * Helper to set up multiple blocks for testing.
   * Creates the specified number of blocks with proper global variables and seeds the checkpoint builder.
   * @param numBlocks - Number of blocks to create
   * @param txsPerBlock - Number of transactions per block (or array for different counts per block)
   * @param startBlockNumber - Starting block number (defaults to newBlockNumber)
   * @returns Object containing the created blocks, txs, and the last block for attestations
   */
  async function setupMultipleBlocks(
    numBlocks: number,
    txsPerBlock: number | number[] = 1,
    startBlockNumber: BlockNumber = newBlockNumber,
  ): Promise<{
    blocks: Awaited<ReturnType<typeof makeBlock>>[];
    txs: Awaited<ReturnType<typeof makeTx>>[];
    lastBlock: Awaited<ReturnType<typeof makeBlock>>;
  }> {
    // Create txs - determine total needed
    const txsPerBlockArray = Array.isArray(txsPerBlock) ? txsPerBlock : Array(numBlocks).fill(txsPerBlock);
    const totalTxs = txsPerBlockArray.reduce((sum, count) => sum + count, 0);
    const txs = await Promise.all(Array.from({ length: totalTxs }, (_, i) => makeTx(i + 1, chainId)));

    // Set up p2p mocks
    p2p.getPendingTxCount.mockResolvedValue(txs.length);
    p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(txs.length >= minCount));
    p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

    // Create blocks with incrementing block numbers
    const blocks: Awaited<ReturnType<typeof makeBlock>>[] = [];
    const blockTxs: Awaited<ReturnType<typeof makeTx>>[][] = [];
    let txIndex = 0;

    for (let i = 0; i < numBlocks; i++) {
      const blockNum = BlockNumber(startBlockNumber + i);
      const blockGlobalVariables =
        i === 0
          ? globalVariables
          : new GlobalVariables(
              chainId,
              version,
              blockNum,
              SlotNumber(newSlotNumber),
              0n,
              coinbase,
              feeRecipient,
              gasFees,
            );

      const blockTxCount = txsPerBlockArray[i];
      const blockTxsSlice = txs.slice(txIndex, txIndex + blockTxCount);
      txIndex += blockTxCount;

      const block = await makeBlock(blockTxsSlice, blockGlobalVariables);
      blocks.push(block);
      blockTxs.push(blockTxsSlice);
    }

    // Seed checkpoint builder with all blocks
    checkpointBuilder.seedBlocks(blocks, blockTxs);

    return {
      blocks,
      txs,
      lastBlock: blocks[blocks.length - 1],
    };
  }

  /**
   * Helper to create a TestCheckpointProposalJob instance with current mocks.
   * Uses TestCheckpointProposalJob which has waitUntilNextSubslot as a no-op.
   * Called in beforeEach to create the job, and tests can use job.updateConfig()
   * to modify config after creation.
   */
  function createCheckpointProposalJob(overrides?: {
    targetSlot?: SlotNumber;
    targetEpoch?: EpochNumber;
    proposedCheckpointData?: ProposedCheckpointData;
  }): TestCheckpointProposalJob {
    const setStateFn = jest.fn();
    const eventEmitter = new EventEmitter() as TypedEventEmitter<SequencerEvents>;

    return new TestCheckpointProposalJob(
      overrides?.targetSlot ?? SlotNumber(newSlotNumber),
      overrides?.targetEpoch ?? epoch,
      checkpointNumber,
      lastBlockNumber,
      CheckpointNumber(checkpointNumber - 1),
      proposer,
      publisher,
      attestorAddress,
      undefined, // invalidateBlock
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      l1ToL2MessageSource,
      confirmingL1Client,
      l2BlockSource,
      checkpointsBuilder as unknown as FullNodeCheckpointsBuilder,
      blockSink,
      l1Constants,
      signatureContext,
      config,
      timetable,
      slasherClient,
      epochCache,
      dateProvider,
      metrics,
      checkpointMetrics,
      eventEmitter,
      new RequestsTracker(),
      setStateFn,
      getTelemetryClient().getTracer('test'),
      { actor: 'test' }, // bindings
      overrides?.proposedCheckpointData,
    );
  }

  describe('pipelining parent checkpoint validation', () => {
    const parentCheckpointHeader = CheckpointHeader.empty();
    const parentCheckpointHash = parentCheckpointHeader.hash().toString();

    const proposedParent: ProposedCheckpointData = {
      checkpointNumber: CheckpointNumber(1),
      header: parentCheckpointHeader,
      archive: new AppendOnlyTreeSnapshot(Fr.ZERO, 1),
      checkpointOutHash: Fr.ZERO,
      startBlock: BlockNumber(1),
      blockCount: 1,
      totalManaUsed: 5000n,
      feeAssetPriceModifier: 100n,
      inboxMsgTotal: 0n,
    };

    let mismatchEvents: { slot: SlotNumber; checkpointNumber: CheckpointNumber; reason: string }[];

    /** Creates a pipelined job for checkpoint 2, builds one block, and returns the job ready for executeAndAwait. */
    async function createPipelinedJobWithBlock(
      proposedCheckpointData?: ProposedCheckpointData,
    ): Promise<TestCheckpointProposalJob> {
      checkpointNumber = CheckpointNumber(2);

      const pipelinedJob = createCheckpointProposalJob({
        targetSlot: SlotNumber(newSlotNumber + 1),
        proposedCheckpointData,
      });
      pipelinedJob.setTimetable(makeSingleBlockTimetable());
      dateProvider.setTime(pipelinedJob.getTimetable().getBuildFrameStart(SlotNumber(newSlotNumber + 1)) * 1000);

      // Listen for mismatch events on this job's emitter
      mismatchEvents = [];
      pipelinedJob.eventEmitter.on(
        'pipelined-checkpoint-discarded',
        (evt: { slot: SlotNumber; checkpointNumber: CheckpointNumber; reason: string }) => {
          mismatchEvents.push(evt);
        },
      );

      // Seed a block so the checkpoint builds successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      // Re-create the checkpoint builder for checkpoint 2
      const checkpointConstants = {
        slotNumber: globalVariables.slotNumber,
        timestamp: globalVariables.timestamp,
        coinbase: globalVariables.coinbase,
        feeRecipient: globalVariables.feeRecipient,
        gasFees: globalVariables.gasFees,
        chainId: globalVariables.chainId,
        version: globalVariables.version,
      };
      checkpointBuilder = checkpointsBuilder.createCheckpointBuilder(checkpointConstants, checkpointNumber);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      return pipelinedJob;
    }

    /** Helper to set up l2BlockSource mocks for tips and synced slot. */
    function mockL2BlockSource(opts: {
      syncedSlot?: SlotNumber;
      checkpointedNumber?: CheckpointNumber;
      checkpointedHash?: string;
    }) {
      l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(opts.syncedSlot ?? SlotNumber(newSlotNumber));
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });
      l2BlockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(1), hash: 'proposed-hash' },
        checkpointed: {
          block: { number: BlockNumber(1), hash: 'block-hash' },
          checkpoint: {
            number: opts.checkpointedNumber ?? CheckpointNumber(1),
            hash: opts.checkpointedHash ?? parentCheckpointHash,
          },
        },
        proven: {
          block: { number: BlockNumber.ZERO, hash: 'proven-hash' },
          checkpoint: { number: CheckpointNumber.ZERO, hash: 'proven-ckpt-hash' },
        },
        finalized: {
          block: { number: BlockNumber.ZERO, hash: 'finalized-hash' },
          checkpoint: { number: CheckpointNumber.ZERO, hash: 'finalized-ckpt-hash' },
        },
      });
    }

    it('proposes checkpoint when parent landed with matching hash and valid attestations', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toHaveLength(0);
    });

    it('proposes checkpoint when no proposed parent and none appeared on L1', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(undefined);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(0) });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toHaveLength(0);
    });

    it('pushes the proposed checkpoint to the archiver from local data before broadcasting', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      await pipelinedJob.executeAndAwait();

      // Built from local checkpoint data: startBlock = syncedToBlockNumber + 1, blockCount = blocks built,
      // checkpointNumber from the job — never derived from the (possibly corrupted) broadcast proposal archive.
      expect(blockSink.addProposedCheckpoint).toHaveBeenCalledTimes(1);
      expect(blockSink.addProposedCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointNumber: CheckpointNumber(2),
          startBlock: BlockNumber(lastBlockNumber + 1),
          blockCount: 1,
        }),
      );
      // The proposed checkpoint must be pushed locally before the proposal is gossiped.
      expect(blockSink.addProposedCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
        p2p.broadcastCheckpointProposal.mock.invocationCallOrder[0],
      );
    });

    it('aborts the checkpoint without broadcasting when the proposed checkpoint push fails', async () => {
      blockSink.addProposedCheckpoint.mockRejectedValue(new Error('proposed checkpoint slot expired'));
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      const checkpoint = await pipelinedJob.execute();

      expect(checkpoint).toBeUndefined();
      expect(blockSink.addProposedCheckpoint).toHaveBeenCalledTimes(1);
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
    });

    it('skips proposal with archiver-sync-timeout when archiver does not sync in time', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(0));

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'archiver-sync-timeout' })]);
      expect(metrics.recordPipelineParentCheckpointMismatch).toHaveBeenCalledWith('archiver-sync-timeout');
    }, 120_000);

    it('skips proposal with parent-not-on-l1 when parent checkpoint did not land', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(0) });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'parent-not-on-l1' })]);
      expect(metrics.recordPipelineParentCheckpointMismatch).toHaveBeenCalledWith('parent-not-on-l1');
    });

    it('skips proposal with parent-hash-mismatch when parent landed with different hash', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: 'different-hash' });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'parent-hash-mismatch' })]);
      expect(metrics.recordPipelineParentCheckpointMismatch).toHaveBeenCalledWith('parent-hash-mismatch');
    });

    it('skips proposal and enqueues invalidation with parent-invalid-attestations', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      const invalidValidation: ValidateCheckpointResult = {
        valid: false,
        reason: 'invalid-attestation',
        checkpoint: {
          archive: Fr.random(),
          lastArchive: Fr.random(),
          slotNumber: SlotNumber(1),
          checkpointNumber: CheckpointNumber(1),
          timestamp: 0n,
        },
        committee: [EthAddress.random()],
        epoch: EpochNumber.ZERO,
        seed: 0n,
        attestors: [EthAddress.random()],
        invalidIndex: 0,
        attestations: [CommitteeAttestation.random()],
        verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
      };
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue(invalidValidation);

      const fakeRequest = { fake: true } as unknown as InvalidateCheckpointRequest;
      publisher.simulateInvalidateCheckpoint.mockResolvedValue(fakeRequest);

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.simulateInvalidateCheckpoint).toHaveBeenCalledWith(invalidValidation);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalledWith(fakeRequest, expect.any(Object));
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'parent-invalid-attestations' })]);
      expect(metrics.recordPipelineParentCheckpointMismatch).toHaveBeenCalledWith('parent-invalid-attestations');
    });

    it('skips invalidation when skipInvalidateBlockAsProposer is set', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      pipelinedJob.updateConfig({ skipInvalidateBlockAsProposer: true });
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue({
        valid: false,
        reason: 'invalid-attestation',
        checkpoint: {
          archive: Fr.random(),
          lastArchive: Fr.random(),
          slotNumber: SlotNumber(1),
          checkpointNumber: CheckpointNumber(1),
          timestamp: 0n,
        },
        committee: [EthAddress.random()],
        epoch: EpochNumber.ZERO,
        seed: 0n,
        attestors: [EthAddress.random()],
        invalidIndex: 0,
        attestations: [CommitteeAttestation.random()],
        verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
      });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.simulateInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'parent-invalid-attestations' })]);
    });

    it('enqueues invalidation when attestation collection fails and pending chain has invalid attestations', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      // Attestation collection fails — waitForAttestations will return undefined
      validatorClient.collectAttestations.mockRejectedValue(new AttestationTimeoutError(0, 1, SlotNumber.ZERO));

      const invalidValidation: ValidateCheckpointResult = {
        valid: false,
        reason: 'invalid-attestation',
        checkpoint: {
          archive: Fr.random(),
          lastArchive: Fr.random(),
          slotNumber: SlotNumber(1),
          checkpointNumber: CheckpointNumber(1),
          timestamp: 0n,
        },
        committee: [EthAddress.random()],
        epoch: EpochNumber.ZERO,
        seed: 0n,
        attestors: [EthAddress.random()],
        invalidIndex: 0,
        attestations: [CommitteeAttestation.random()],
        verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
      };
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue(invalidValidation);

      const fakeRequest = { fake: true } as unknown as InvalidateCheckpointRequest;
      publisher.simulateInvalidateCheckpoint.mockResolvedValue(fakeRequest);

      await pipelinedJob.executeAndAwait();

      // No propose action since we didn't collect attestations
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      // But we still enqueue invalidation so the chain is cleaned up for the next proposer
      expect(publisher.simulateInvalidateCheckpoint).toHaveBeenCalledWith(invalidValidation);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalledWith(fakeRequest, expect.any(Object));
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
    });

    it('does not enqueue invalidation when attestation collection fails but pending chain is valid', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });

      validatorClient.collectAttestations.mockRejectedValue(new AttestationTimeoutError(0, 1, SlotNumber.ZERO));

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.simulateInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
    });

    it('skips proposal with unexpected-parent-appeared when a new checkpoint appears without proposed parent', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(undefined);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(2) });

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(mismatchEvents).toEqual([expect.objectContaining({ reason: 'unexpected-parent-appeared' })]);
      expect(metrics.recordPipelineParentCheckpointMismatch).toHaveBeenCalledWith('unexpected-parent-appeared');
    });
  });

  describe('multiple block mode', () => {
    beforeEach(() => {
      // Keep the real L1 publish budget and use the largest block duration that fits a 24s slot
      // under the stricter timing guards.
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 3000,
        }),
      );
    });

    // A block past the first carrying neither txs nor messages is pure padding, so minValidTxsPerBlock: 0 must
    // not reach the builder for it.
    it('floors minValidTxs at 1 past the first block even when configured to 0', async () => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minValidTxsPerBlock: 0 });
      await job.executeAndAwait();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(checkpointBuilder.buildBlockCalls[0].opts.minValidTxs).toBe(0);
      expect(checkpointBuilder.buildBlockCalls[1].opts.minValidTxs).toBe(1);
    });

    // A mid-checkpoint block consuming messages is proven by the no-txs block-root circuit, so the floor must
    // not apply to it or a message-only block could never be built past index 0.
    it('leaves minValidTxs at 0 past the first block when the block consumes messages', async () => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      const makeBucket = (seq: bigint, totalMsgCount: bigint, lastMessageIndex: bigint): InboxBucket => ({
        seq,
        inboxRollingHash: new Fr(Number(seq)),
        totalMsgCount,
        timestamp: 0n,
        msgCount: 2,
        lastMessageIndex,
        l1BlockNumber: seq,
        l1BlockHash: Buffer32.fromBigInt(seq),
      });
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore
        .mockResolvedValueOnce(makeBucket(2n, 2n, 1n))
        .mockResolvedValue(makeBucket(3n, 4n, 3n));
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets
        .mockResolvedValueOnce([new Fr(1), new Fr(2)])
        .mockResolvedValue([new Fr(3), new Fr(4)]);
      mockInboxBuckets(l1ToL2MessageSource, [makeBucket(2n, 2n, 1n), makeBucket(3n, 4n, 3n)]);

      const { lastBlock } = await setupMultipleBlocks(2, [2, 0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minValidTxsPerBlock: 0 });
      await job.executeAndAwait();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(checkpointBuilder.buildBlockCalls[1].opts.l1ToL2Messages).toEqual([new Fr(3), new Fr(4)]);
      expect(checkpointBuilder.buildBlockCalls[1].opts.minValidTxs).toBe(0);
    });

    it('builds multiple blocks with sufficient txs', async () => {
      // Mock timetable to allow 2 blocks
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      // Set up test data for 2 blocks
      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilNextSubslot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilNextSubslot was called between blocks
      // After building the first non-last block, it waits for the next block time
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The deadline passed is the absolute sub-slot start timestamp
      expect(waitSpy.mock.calls[0][0]).toEqual(buildFrameStartSeconds() + 10);
    });

    it('builds a single empty block when no txs are available and no min txs required', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(2, 0, false))
        .mockReturnValueOnce(subslot(4, 1, true))
        .mockReturnValue(noSubslot());

      // Set up test data for an empty block
      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilNextSubslot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      job.updateConfig({ minTxsPerBlock: 0 });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilNextSubslot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The deadline passed is the absolute sub-slot start timestamp
      expect(waitSpy.mock.calls[0][0]).toEqual(buildFrameStartSeconds() + 2);
    });

    it('builds a single block when not enough txs are available but we build empty checkpoints', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(2, 0, false))
        .mockReturnValueOnce(subslot(4, 1, true))
        .mockReturnValue(noSubslot());

      // Set up test data for a block with only 2 txs, note that min txs is 5
      const { lastBlock } = await setupMultipleBlocks(1, [2]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilNextSubslot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: true });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilNextSubslot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The deadline passed is the absolute sub-slot start timestamp
      expect(waitSpy.mock.calls[0][0]).toEqual(buildFrameStartSeconds() + 2);
    });

    it('does not build anything if not enough txs and we do not build empty checkpoints', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(2, 0, false))
        .mockReturnValueOnce(subslot(4, 1, true))
        .mockReturnValue(noSubslot());

      // Not enough txs to build a block
      p2p.getPendingTxCount.mockResolvedValue(2);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(2 >= minCount));

      // Install spy on waitUntilNextSubslot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: false });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(0);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(0);

      // Verify waitUntilNextSubslot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The deadline passed is the absolute sub-slot start timestamp
      expect(waitSpy.mock.calls[0][0]).toEqual(buildFrameStartSeconds() + 2);
    });

    it('does not build when pending txs are not yet age-eligible and the wait deadline has passed', async () => {
      // A single buildable sub-slot is available, so the only thing that can stop the build is the
      // age-eligibility gate. The mempool holds plenty of pending txs, but none are old enough to build.
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, true))
        .mockReturnValue(noSubslot());

      // 10 pending txs (>= minTxsPerBlock) but 0 eligible: the builder's eligible iterator would yield nothing.
      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.hasEligiblePendingTxs.mockResolvedValue(false);

      // Place us past the wait-for-txs deadline (subslot deadline at +10s, minus minBlockDuration 2s = +8s),
      // so waitForMinTxs gives up on its first poll instead of spinning on the polling interval.
      dateProvider.setTime((buildFrameStartSeconds() + 9) * 1000);

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: false });
      const checkpoint = await job.executeAndAwait();

      // The gate must wait for eligibility rather than read the raw pending count: no block is built.
      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('stops building when selectNextSubslot returns false', async () => {
      // Mock timetable to stop after 1 block (simulating time running out)
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValue(noSubslot());

      const txs = await Promise.all([makeTx(1, chainId), makeTx(2, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(10 >= minCount));
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      // Install spy on waitUntilNextSubslot
      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      // Only one block built due to time constraints
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Since isLastBlock was false but canStart became false after first block,
      // waitUntilNextSubslot should have been called once (after first block, before checking canStart again)
      expect(waitSpy).toHaveBeenCalledTimes(1);
    });

    it('calls waitUntilNextSubslot with expected deadline based on block duration', async () => {
      const blockDurationSeconds = 3; // 3000ms / 1000

      // Mock timetable to allow 3 blocks
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(2 + blockDurationSeconds, 0, false))
        .mockReturnValueOnce(subslot(2 + 2 * blockDurationSeconds, 1, false))
        .mockReturnValueOnce(subslot(2 + 3 * blockDurationSeconds, 2, true))
        .mockReturnValue(noSubslot());

      // Set up test data for 3 blocks
      const { lastBlock } = await setupMultipleBlocks(3, 1);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      await job.executeAndAwait();

      // With 3 blocks where the 3rd is the last, waitUntilNextSubslot should be called twice
      // (after block 1 and block 2, but not after block 3 since it's the last)
      expect(waitSpy).toHaveBeenCalledTimes(2);
      expect(waitSpy.mock.calls[0][0]).toEqual(buildFrameStartSeconds() + 5);
      expect(waitSpy.mock.calls[1][0]).toEqual(buildFrameStartSeconds() + 8);
    });

    it('does not call waitUntilNextSubslot when building the last block', async () => {
      // Mock timetable to allow only 1 block (which is the last)
      jest.spyOn(job.getTimetable(), 'selectNextSubslot').mockReturnValue(subslot(30, 0, true));

      const txs = await Promise.all([makeTx(1, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(10 >= minCount));
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const waitSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);

      // waitUntilNextSubslot should NOT be called since the only block is the last block
      expect(waitSpy).not.toHaveBeenCalled();
    });

    it('stops at maxBlocksPerCheckpoint even when the timetable would allow more', async () => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(4, 0, false))
        .mockReturnValueOnce(subslot(8, 1, false))
        .mockReturnValueOnce(subslot(12, 2, true))
        .mockReturnValue(noSubslot());

      const { lastBlock } = await setupMultipleBlocks(3, 1);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ maxBlocksPerCheckpoint: 2 });

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    });
  });

  describe('streaming inbox', () => {
    beforeEach(() => {
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 3000 }));
    });

    it('streams per-block bucket bundles, advances the reference, and skips the bulk message fetch', async () => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      // The archiver returns the newest synced bucket (seq 2) for any lag/cutoff lookup, so the first block
      // consumes through it and the second block (cursor already at seq 2) consumes nothing and reuses the ref.
      const bucket: InboxBucket = {
        seq: 2n,
        inboxRollingHash: new Fr(99),
        totalMsgCount: 5n,
        timestamp: 0n,
        msgCount: 2,
        lastMessageIndex: 4n,
        l1BlockNumber: 2n,
        l1BlockHash: Buffer32.fromBigInt(2n),
      };
      const bundle = Array.from({ length: 5 }, (_, i) => new Fr(i + 1));
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(bucket);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(bundle);
      mockInboxBuckets(l1ToL2MessageSource, [bucket]);
      checkpointBuilder.inboxRollingHash = bucket.inboxRollingHash;

      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();

      // Streaming has no bulk per-checkpoint list; every message reaches the builder through a block.
      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);

      // The first block consumes the selected bundle; the second consumes nothing.
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(checkpointBuilder.buildBlockCalls[0].opts.l1ToL2Messages).toEqual(bundle);
      expect(checkpointBuilder.buildBlockCalls[1].opts.l1ToL2Messages).toEqual([]);

      // Both block proposals carry the selected bucket reference (the second reuses the first's).
      const bucketRefArgs = validatorClient.createBlockProposal.mock.calls.map(call => call[7]);
      expect(bucketRefArgs).toHaveLength(2);
      expect(bucketRefArgs[0]?.inboxRollingHash).toEqual(bucket.inboxRollingHash);
      expect(bucketRefArgs[1]?.inboxRollingHash).toEqual(bucket.inboxRollingHash);
    });

    it('produces a message-only block when a non-empty bundle is selected and no txs are pending', async () => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, true))
        .mockReturnValue(noSubslot());

      const bucket: InboxBucket = {
        seq: 2n,
        inboxRollingHash: new Fr(99),
        totalMsgCount: 5n,
        timestamp: 0n,
        msgCount: 2,
        lastMessageIndex: 4n,
        l1BlockNumber: 2n,
        l1BlockHash: Buffer32.fromBigInt(2n),
      };
      const bundle = Array.from({ length: 5 }, (_, i) => new Fr(i + 1));
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(bucket);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(bundle);
      mockInboxBuckets(l1ToL2MessageSource, [bucket]);
      checkpointBuilder.inboxRollingHash = bucket.inboxRollingHash;

      // Empty tx pool with the min-txs threshold at its default of one and no empty-checkpoint building: the
      // non-empty bundle alone must count as work, producing a zero-tx (message-only) block.
      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minTxsPerBlock: 1, buildCheckpointIfEmpty: false });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(checkpointBuilder.buildBlockCalls[0].opts.l1ToL2Messages).toEqual(bundle);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('carries the consumed bucket hint when the final block fails to build after earlier consumption', async () => {
      // Two sub-slots. The first block consumes the pending bucket (seq 2) as a message-only block. The final
      // sub-slot block has no txs and nothing left to consume (the cursor already sits at seq 2), so it fails to
      // build and is not held for broadcast. The L1 propose bucket hint must still be the bucket the checkpoint
      // header committed to (seq 2), not fall back to genesis bucket 0 — otherwise L1 rejects the proposal with an
      // inbox-rolling-hash mismatch (the hint's bucket rolling hash would not match the header's).
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      const bucket: InboxBucket = {
        seq: 2n,
        inboxRollingHash: new Fr(99),
        totalMsgCount: 5n,
        timestamp: 0n,
        msgCount: 2,
        lastMessageIndex: 4n,
        l1BlockNumber: 2n,
        l1BlockHash: Buffer32.fromBigInt(2n),
      };
      const bundle = Array.from({ length: 5 }, (_, i) => new Fr(i + 1));
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(bucket);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(bundle);
      mockInboxBuckets(l1ToL2MessageSource, [bucket]);
      checkpointBuilder.inboxRollingHash = bucket.inboxRollingHash;

      // Seed a single message-only block; the second sub-slot has no seeded block, no txs, and no new bucket to
      // consume, so it fails the min-work threshold and no block is held for broadcast.
      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minTxsPerBlock: 1, buildCheckpointIfEmpty: false });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      // Only the first (message-only) block built and consumed through bucket 2; the final block did not build.
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // No held last block, yet the bucket hint (4th positional arg) is the consumed bucket seq 2, matching the
      // checkpoint header's rolling hash. Before the fix this fell back to genesis bucket 0n.
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(2n);
    });

    /** Seeds a single pending bucket the checkpoint's only block consumes through. */
    async function setupSingleBucketCheckpoint(bucket: InboxBucket) {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, true))
        .mockReturnValue(noSubslot());

      const bundle = Array.from({ length: Number(bucket.totalMsgCount) }, (_, i) => new Fr(i + 1));
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(bucket);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(bundle);
      mockInboxBuckets(l1ToL2MessageSource, [bucket]);
      checkpointBuilder.inboxRollingHash = bucket.inboxRollingHash;

      const { lastBlock } = await setupMultipleBlocks(1, [2]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));
      return { bundle, lastBlock };
    }

    const pendingBucket = (overrides: Partial<InboxBucket> = {}): InboxBucket => ({
      seq: 2n,
      inboxRollingHash: new Fr(99),
      totalMsgCount: 5n,
      timestamp: 0n,
      msgCount: 5,
      lastMessageIndex: 4n,
      l1BlockNumber: 2n,
      l1BlockHash: Buffer32.fromBigInt(2n),
      ...overrides,
    });

    it('consumes without reading L1 at the default confirmation depth', async () => {
      const { bundle } = await setupSingleBucketCheckpoint(pendingBucket());

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls[0].opts.l1ToL2Messages).toEqual(bundle);
      // Immediate consumption asks L1 nothing about the bucket's opening block.
      expect(confirmingL1Client.getBlock).not.toHaveBeenCalled();
    });

    it('waits for the opening L1 block to gain a descendant when configured to', async () => {
      config = { ...config, inboxL1Confirmations: 1 };
      job = createCheckpointProposalJob();
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 3000 }));
      await setupSingleBucketCheckpoint(pendingBucket());

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      // The bucket is only consumed after its opening block's child is read off L1.
      expect(confirmingL1Client.getBlock.mock.calls.map(([args]) => args.blockNumber)).toContain(3n);
    });

    it('publishes the bucket the rolling hash now sits at when an L1 reorg re-seats it', async () => {
      // The bucket is consumed at sequence 2, then an L1 reorg merges the buckets before it: the messages and
      // therefore the rolling hash the header commits to are unchanged, but they now live in bucket 1.
      const bucket = pendingBucket();
      await setupSingleBucketCheckpoint(bucket);
      mockInboxBuckets(l1ToL2MessageSource, [{ ...bucket, seq: 1n }]);

      const infoLog = jest.spyOn(job.log, 'info');

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      // The L1 propose hint (4th positional arg) is the re-resolved sequence number, not the one built against.
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(1n);
      // The signed block proposal carries only the rolling hash, which the merge leaves alone, so validators on
      // either side of it resolve the same bucket.
      expect(validatorClient.createBlockProposal.mock.calls[0][7]?.inboxRollingHash).toEqual(bucket.inboxRollingHash);
      expect(infoLog).toHaveBeenCalledWith(
        'Inbox bucket reference re-resolved after L1 reorg',
        expect.objectContaining({ builtSeq: 2n, resolvedSeq: 1n }),
      );
    });

    it('re-resolves the hint again for a reorg that lands while attestations are collected', async () => {
      const bucket = pendingBucket();
      const { lastBlock } = await setupSingleBucketCheckpoint(bucket);
      // The merge lands after the proposal is gossiped, so only the pre-submission lookup sees it.
      validatorClient.collectAttestations.mockImplementation(() => {
        mockInboxBuckets(l1ToL2MessageSource, [{ ...bucket, seq: 1n }]);
        return Promise.resolve(getAttestations(lastBlock));
      });

      const infoLog = jest.spyOn(job.log, 'info');

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(p2p.broadcastCheckpointProposal).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(1n);
      expect(infoLog).toHaveBeenCalledWith(
        'Inbox bucket hint re-resolved after L1 reorg',
        expect.objectContaining({ builtSeq: 2n, publishedSeq: 1n }),
      );
    });

    it('does not submit when the rolling hash disappears while attestations are collected', async () => {
      const bucket = pendingBucket();
      const { lastBlock } = await setupSingleBucketCheckpoint(bucket);
      validatorClient.collectAttestations.mockImplementation(() => {
        mockInboxBuckets(l1ToL2MessageSource);
        return Promise.resolve(getAttestations(lastBlock));
      });

      const checkpoint = await job.executeAndAwait();

      // The proposal was already gossiped when the reorg landed, but nothing reaches L1.
      expect(checkpoint).toBeDefined();
      expect(p2p.broadcastCheckpointProposal).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_bucket_reorged');
    });

    it('does not submit when a mandatory bucket appears while attestations are collected', async () => {
      const bucket = pendingBucket();
      const { lastBlock } = await setupSingleBucketCheckpoint(bucket);
      // A bucket opened well before the censorship cutoff syncs only after the checkpoint was built, so the
      // position it committed to no longer clears the consumption floor and L1 `propose` would revert.
      validatorClient.collectAttestations.mockImplementation(() => {
        l1ToL2MessageSource.getInboxBucket.mockResolvedValue(
          pendingBucket({ seq: 3n, totalMsgCount: 7n, inboxRollingHash: new Fr(100) }),
        );
        return Promise.resolve(getAttestations(lastBlock));
      });

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(p2p.broadcastCheckpointProposal).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_consumption_insufficient');
    });

    it('aborts the checkpoint before signing when the consumed bucket vanishes at the per-block refresh', async () => {
      // The block builds against bucket 2, then an L1 reorg reorders the messages before the proposal is signed: no
      // bucket carries the rolling hash the block consumed through any more. The block is known to be built on
      // messages the local store no longer holds, so it must never be signed, pushed to the archiver or gossiped.
      await setupSingleBucketCheckpoint(pendingBucket());
      mockInboxBuckets(l1ToL2MessageSource);

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.createBlockProposal).not.toHaveBeenCalled();
      expect(blockSink.addBlock).not.toHaveBeenCalled();
      expect(p2p.broadcastProposal).not.toHaveBeenCalled();
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_bucket_reorged');
    });

    it('abandons the slot when the rolling hash vanishes after the last block is signed', async () => {
      // The reorg lands between the block proposal being signed and the checkpoint header being sealed, so the
      // per-block refresh could not catch it: the block reached the archiver, but no bucket resolves to the header's
      // rolling hash and nothing is gossiped or published.
      await setupSingleBucketCheckpoint(pendingBucket());
      const signBlockProposal = validatorClient.createBlockProposal.getMockImplementation()!;
      validatorClient.createBlockProposal.mockImplementation((...args) => {
        mockInboxBuckets(l1ToL2MessageSource);
        return signBlockProposal(...args);
      });

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(blockSink.addBlock).toHaveBeenCalledTimes(1);
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_bucket_reorged');
    });

    it('abandons the checkpoint when the mandatory backlog does not fit the remaining blocks', async () => {
      // Four mandatory buckets alternating 256 and 1 messages, and only two sub-slots to clear them. Buckets are
      // indivisible, so each block can advance by at most one bucket here, leaving bucket 3 mandatory and
      // unconsumed at the end of the checkpoint. Every honest validator would refuse to attest and L1 `propose`
      // would revert, so the checkpoint must never be assembled or gossiped.
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(18, 1, true))
        .mockReturnValue(noSubslot());

      const totals = [256n, 257n, 513n, 514n];
      const buckets = totals.map((totalMsgCount, i) => ({
        seq: BigInt(i + 1),
        inboxRollingHash: new Fr(i + 1),
        totalMsgCount,
        // Well before the censorship cutoff, so every bucket is mandatory.
        timestamp: 0n,
        msgCount: Number(totalMsgCount - (i === 0 ? 0n : totals[i - 1])),
        lastMessageIndex: totalMsgCount - 1n,
        l1BlockNumber: BigInt(i + 1),
        l1BlockHash: Buffer32.fromBigInt(BigInt(i + 1)),
      }));
      l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(buckets[3]);
      l1ToL2MessageSource.getInboxBucket.mockImplementation(seq => Promise.resolve(buckets[Number(seq) - 1]));
      mockInboxBuckets(l1ToL2MessageSource, buckets);
      l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockImplementation((from, to) =>
        Promise.resolve(
          Array.from({ length: Number(totals[Number(to) - 1] - (from === 0n ? 0n : totals[Number(from) - 1])) }, () =>
            Fr.random(),
          ),
        ),
      );

      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      // The final block is never built, so it is never held for broadcast, and no checkpoint reaches the network
      // or L1.
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_consumption_insufficient');
    });
  });

  describe('publishing a checkpoint whose blocks the archiver dropped', () => {
    // Attestation collection takes seconds, and the archiver can prune the proposed chain in that window: a slot
    // that closed without a checkpoint, or a checkpoint seen on L1 that conflicts with the local blocks. Publishing
    // then puts a checkpoint on L1 that this node's own archiver cannot serve.
    beforeEach(() => {
      job.setTimetable(makeSingleBlockTimetable());
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
    });

    const setupOneBlockCheckpoint = async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 2, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      return block;
    };

    it('does not submit when the archiver no longer holds the checkpoint blocks', async () => {
      const block = await setupOneBlockCheckpoint();
      validatorClient.collectAttestations.mockImplementation(() => {
        localBlocks.clear();
        return Promise.resolve(getAttestations(block));
      });

      const checkpoint = await job.executeAndAwait();

      // The proposal was already gossiped when the prune landed, but nothing reaches L1.
      expect(checkpoint).toBeDefined();
      expect(p2p.broadcastCheckpointProposal).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('checkpoint_blocks_pruned');
    });

    it('submits when the node was configured never to push its blocks to the archiver', async () => {
      config = { ...config, skipPushProposedBlocksToArchiver: true };
      job = createCheckpointProposalJob();
      job.setTimetable(makeSingleBlockTimetable());
      const block = await setupOneBlockCheckpoint();
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.executeAndAwait();

      // The blocks were never pushed, so the archiver not holding them says nothing about a prune.
      expect(checkpoint).toBeDefined();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(metrics.recordCheckpointProposalFailed).not.toHaveBeenCalledWith('checkpoint_blocks_pruned');
    });

    it('does not submit when the archiver rebuilt the block number with a different block', async () => {
      const block = await setupOneBlockCheckpoint();
      const replacement = L2Block.fromBuffer(block.toBuffer());
      unfreeze(replacement.header).spongeBlobHash = Fr.random();
      await replacement.header.recomputeHash();
      validatorClient.collectAttestations.mockImplementation(() => {
        // The prune took the block and the chain was rebuilt to the same height with a different one, so the block
        // number alone would say the checkpoint is still local.
        localBlocks.set(block.number, replacement);
        return Promise.resolve(getAttestations(block));
      });

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('checkpoint_blocks_pruned');
    });
  });

  describe('build single block', () => {
    it('does not build a block if not enough valid txs are collected', async () => {
      // We have enough txs, but not enough valid ones
      job.updateConfig({ minTxsPerBlock: 3, minValidTxsPerBlock: 2 });
      const txs = await timesAsync(3, i => makeTx(i + 1, chainId));
      mockPendingTxs(p2p, txs);

      const checkpointBuilder = mock<CheckpointBuilder>();
      const failedTxs: FailedTx[] = txs.slice(1).map(tx => ({ tx, error: new Error('Invalid tx') }));
      checkpointBuilder.buildBlock.mockRejectedValue(new InsufficientValidTxsError(1, 2, failedTxs));

      const result = await job.buildSingleBlock(checkpointBuilder, {
        blockNumber: newBlockNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        buildDeadline: undefined,
        blockTimestamp: 0n,
        txHashesAlreadyIncluded: new Set<string>(),
      });

      expect(result).toEqual({ failure: 'insufficient-valid-txs' });
      expect(p2p.handleFailedExecution).toHaveBeenCalledWith(failedTxs.map(ftx => ftx.tx.txHash));
    });

    it('does not build a block if checkpoint builder fails with invalid txs', async () => {
      job.updateConfig({ minTxsPerBlock: 3 });
      const txs = await timesAsync(3, i => makeTx(i + 1, chainId));
      mockPendingTxs(p2p, txs);

      const checkpointBuilder = mock<CheckpointBuilder>();
      const failedTxs: FailedTx[] = txs.slice(1).map(tx => ({ tx, error: new Error('Invalid tx') }));
      checkpointBuilder.buildBlock.mockRejectedValue(new InsufficientValidTxsError(0, 3, failedTxs));

      const result = await job.buildSingleBlock(checkpointBuilder, {
        blockNumber: newBlockNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        buildDeadline: undefined,
        blockTimestamp: 0n,
        txHashesAlreadyIncluded: new Set<string>(),
      });

      expect(result).toEqual({ failure: 'insufficient-valid-txs' });
      expect(p2p.handleFailedExecution).toHaveBeenCalledWith(failedTxs.map(ftx => ftx.tx.txHash));
    });
  });

  describe('timing edge cases', () => {
    beforeEach(() => {
      // Single-block timetable started at the build-frame opening, so the real timetable selects exactly
      // one block. Tests that mock selectNextSubslot below override this.
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 9000 }));
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
    });

    it('handles insufficient time remaining in slot', async () => {
      // Mock selectNextSubslot to return false (not enough time)
      jest.spyOn(job.getTimetable(), 'selectNextSubslot').mockReturnValue(noSubslot());

      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(txs.length >= minCount));
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      const checkpoint = await job.executeAndAwait();

      // Should return undefined when no time available
      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
    });

    it('forces checkpoint build when buildCheckpointIfEmpty is true and time allows', async () => {
      // Mock minimal txs (less than minTxsPerBlock)
      p2p.getPendingTxCount.mockResolvedValue(1);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(1 >= minCount));
      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      const block = await makeBlock(txs, globalVariables);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
    });

    it('respects buildDeadline when checking time availability', async () => {
      // Mock selectNextSubslot to indicate we're at the deadline
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(1, 0, true)) // Very tight deadline
        .mockReturnValue(noSubslot());

      const txs = await Promise.all([makeTx(1, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(txs.length >= minCount));
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.executeAndAwait();

      // Should still complete if first block succeeds
      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Single-block timetable started at the build-frame opening, so the real timetable selects exactly one block.
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 9000 }));
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
    });

    it('handles block build failure gracefully', async () => {
      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.hasEligiblePendingTxs.mockImplementation(minCount => Promise.resolve(txs.length >= minCount));
      p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      // Set up MockCheckpointBuilder to throw on build
      checkpointBuilder.errorOnBuild = new Error('Block build failed');

      // The job catches the error internally and returns undefined
      const checkpoint = await job.executeAndAwait();
      expect(checkpoint).toBeUndefined();
    });

    it('handles attestation collection timeout', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      // Mock collectAttestations to fail with timeout
      validatorClient.collectAttestations.mockRejectedValue(new AttestationTimeoutError(0, 3, SlotNumber.ZERO));

      // Checkpoint is returned after broadcast — attestation failure happens in the background
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
    });

    it('interrupts a pending L1 submission waiting for archiver sync', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));
      l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);

      const checkpoint = await job.execute();
      expect(checkpoint).toBeDefined();

      const pendingSubmission = job.awaitPendingSubmission().then(() => 'stopped' as const);
      job.interrupt();

      let timeout: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          pendingSubmission,
          new Promise<'timed-out'>(resolve => {
            timeout = setTimeout(() => resolve('timed-out'), 1000);
          }),
        ]);
        expect(result).toBe('stopped');
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    });

    it('interrupts a pending L1 submission sleeping in the publisher', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      // Simulate sendRequestsAt sleeping until the target slot: the promise only resolves once
      // the publisher itself is interrupted.
      const sendDeferred = promiseWithResolvers<undefined>();
      publisher.sendRequestsAt.mockReturnValue(sendDeferred.promise);
      publisher.interrupt.mockImplementation(() => sendDeferred.resolve(undefined));

      const checkpoint = await job.execute();
      expect(checkpoint).toBeDefined();

      const pendingSubmission = job.awaitPendingSubmission().then(() => 'stopped' as const);
      job.interrupt();

      let timeout: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          pendingSubmission,
          new Promise<'timed-out'>(resolve => {
            timeout = setTimeout(() => resolve('timed-out'), 1000);
          }),
        ]);
        expect(result).toBe('stopped');
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    });

    it('aborts checkpoint when syncing proposed block to archiver fails', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      // Mock blockSink.addBlock to reject, simulating a consistency error
      blockSink.addBlock.mockRejectedValue(new Error('Consistency error: block does not match world state'));

      const checkpoint = await job.execute();

      // The checkpoint should be aborted since the archiver sync failure now propagates
      expect(checkpoint).toBeUndefined();
      expect(blockSink.addBlock).toHaveBeenCalledWith(block);
      // Should not attempt to collect attestations since the error aborts the loop
      expect(validatorClient.collectAttestations).not.toHaveBeenCalled();
    });

    it('does not push proposed block to archiver in fisherman mode', async () => {
      job.updateConfig({ fishermanMode: true, buildCheckpointIfEmpty: true, minTxsPerBlock: 0 });

      const emptyBlock = await makeBlock([], globalVariables);
      checkpointBuilder.seedBlocks([emptyBlock], [[]]);

      // In fisherman mode execute() always returns undefined (handled internally via handleCheckpointEndAsFisherman)
      await job.execute();

      // Fisherman still builds the block
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      // But must NOT push to the archiver — that was the bug causing reorgs on mainnet
      expect(blockSink.addBlock).not.toHaveBeenCalled();
      expect(blockSink.addProposedCheckpoint).not.toHaveBeenCalled();
    });

    it('handles empty committee gracefully', async () => {
      // Mock empty committee
      epochCache.getCommittee.mockResolvedValue({
        committee: [],
        seed: 0n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: false,
      });

      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      const checkpoint = await job.executeAndAwait();

      // Should complete even with empty committee
      expect(checkpoint).toBeDefined();
    });
  });

  describe('attestation collection', () => {
    beforeEach(() => {
      // Single-block timetable started at the build-frame opening, so the real timetable selects exactly one block.
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 9000 }));
      dateProvider.setTime(buildFrameStartSeconds() * 1000);
    });

    it('collects attestations in normal flow', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      const attestations = getAttestations(block);
      validatorClient.collectAttestations.mockResolvedValue(attestations);

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
    });

    it('handles attestation collection throwing TimeoutError', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockRejectedValue(new TimeoutError('Attestation collection timed out'));

      await job.executeAndAwait();

      // Should handle timeout gracefully (in background pipeline)
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
    });
  });

  describe('high-availability error handling during block building', () => {
    it('should stop checkpoint building when block proposal throws DutyAlreadySignedError on first block', async () => {
      // Set up test data for 3 blocks (to verify it stops even with multiple blocks configured)
      const { lastBlock } = await setupMultipleBlocks(3, 1);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Create job first
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 3000,
        }),
      );

      // Mock timetable to allow multiple blocks
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(4, 0, false))
        .mockReturnValueOnce(subslot(8, 1, false))
        .mockReturnValueOnce(subslot(12, 2, false))
        .mockReturnValue(noSubslot());

      // Mock to throw on first block proposal
      validatorClient.createBlockProposal.mockImplementation(() => {
        throw new DutyAlreadySignedError(SlotNumber(1), DutyType.BLOCK_PROPOSAL, 0, 'node-2');
      });

      const result = await job.executeAndAwait();

      // Should return undefined and stop building
      expect(result).toBeUndefined();
      // Should have attempted only 1 block proposal (first one threw)
      expect(validatorClient.createBlockProposal).toHaveBeenCalledTimes(1);
      // Should not have attempted checkpoint proposal
      expect(validatorClient.createCheckpointProposal).not.toHaveBeenCalled();
      // Should not publish anything
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('should stop checkpoint building when block proposal throws SlashingProtectionError on first block', async () => {
      // Set up test data for 3 blocks (to verify it stops even with multiple blocks configured)
      const { lastBlock } = await setupMultipleBlocks(3, 1);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Create job first
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          blockDurationMs: 3000,
        }),
      );

      // Mock timetable to allow multiple blocks
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(4, 0, false))
        .mockReturnValueOnce(subslot(8, 1, false))
        .mockReturnValueOnce(subslot(12, 2, false))
        .mockReturnValue(noSubslot());

      // Mock to throw on first block proposal
      validatorClient.createBlockProposal.mockImplementation(() => {
        throw new SlashingProtectionError(SlotNumber(1), DutyType.BLOCK_PROPOSAL, 0, 'hash1', 'hash2', 'node-1');
      });

      const result = await job.executeAndAwait();

      // Should return undefined and stop building
      expect(result).toBeUndefined();
      // Should have attempted only 1 block proposal (first one threw)
      expect(validatorClient.createBlockProposal).toHaveBeenCalledTimes(1);
      // Should not have attempted checkpoint proposal
      expect(validatorClient.createCheckpointProposal).not.toHaveBeenCalled();
      // Should not publish anything
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });
  });
});

class TestCheckpointProposalJob extends CheckpointProposalJob {
  declare public eventEmitter: EventEmitter;
  declare public log: Logger;

  /** Override to be a no-op for testing - allows tests to run without timing delays */
  public override waitUntilNextSubslot(nextSubslotStart: number): Promise<void> {
    this.log.warn(`Skipping waitUntilNextSubslot(${nextSubslotStart}) in test`);
    return Promise.resolve();
  }

  /** Awaits the sequencer's shared tracker so tests observe the backgrounded L1 submission completing. */
  public async awaitPendingSubmission(): Promise<void> {
    await this.pendingRequests.awaitRequests();
  }

  /** Wraps execute + awaitPendingSubmission so tests see the full pipeline complete. */
  public async executeAndAwait(): Promise<Checkpoint | undefined> {
    const result = await this.execute();
    await this.awaitPendingSubmission();
    return result;
  }

  /** Update config for testing - allows tests to modify config after job creation */
  public updateConfig(partialConfig: Partial<ResolvedSequencerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /** Set timetable for testing - allows tests to modify timetable after job creation */
  public setTimetable(newTimetable: ProposerTimetable): void {
    this.timetable = newTimetable;
  }

  /** Get timetable for testing - allows tests to spy on methods */
  public getTimetable(): ProposerTimetable {
    return this.timetable;
  }

  /** Expose internal buildSingleBlock method */
  public override buildSingleBlock(
    checkpointBuilder: CheckpointBuilder,
    opts: {
      forceCreate?: boolean;
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: IndexWithinCheckpoint;
      buildDeadline: Date | undefined;
      txHashesAlreadyIncluded: Set<string>;
    },
  ): Promise<
    { block: L2Block; usedTxs: Tx[] } | { failure: 'insufficient-txs' | 'insufficient-valid-txs' } | { error: Error }
  > {
    return super.buildSingleBlock(checkpointBuilder, opts);
  }
}

/** Creates a CheckpointData from a Checkpoint for testing. */
function toCheckpointData(checkpoint: Checkpoint): CheckpointData {
  return {
    checkpointNumber: checkpoint.number,
    header: checkpoint.header,
    archive: checkpoint.archive,
    checkpointOutHash: checkpoint.getCheckpointOutHash(),
    startBlock: BlockNumber(checkpoint.blocks[0]?.number ?? 1),
    blockCount: checkpoint.blocks.length,
    feeAssetPriceModifier: checkpoint.feeAssetPriceModifier,
    attestations: [],
    l1: L1PublishedData.random(),
  };
}
