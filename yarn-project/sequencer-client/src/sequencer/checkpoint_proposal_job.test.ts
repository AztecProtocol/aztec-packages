import { EpochCache } from '@aztec/epoch-cache';
import type { InboxContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
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
import { InboxMessagePrefixRef, type L1ToL2MessageSource } from '@aztec/stdlib/messaging';
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
  type MockStreamingInbox,
  createCheckpointAttestation,
  makeBlock,
  makeProposerTimetable,
  makeTx,
  mockPendingTxs,
  mockStreamingInbox,
  mockTxIterator,
  setupTxsAndBlock,
} from '../test/utils.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import type { CheckpointProposalJobMetricsRecorder } from './checkpoint_proposal_job_metrics.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import { RequestsTracker } from './requests_tracker.js';

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
  let inbox: MockProxy<InboxContract>;
  let streamingInbox: MockStreamingInbox;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let blockSink: MockProxy<L2BlockSink & ProposedCheckpointSink>;
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
    // Start at the target slot's build frame opening (target_slot_start - S - E), which is when a proposer actually
    // begins its turn. Anchoring at the target slot start instead would put every job past the deadlines the
    // timetable derives from the build frame, including the proposal send deadline.
    const buildFrameStart = Number(l1GenesisTime) + (newSlotNumber - 1) * slotDuration - ethereumSlotDuration;
    dateProvider.setTime(buildFrameStart * 1000); // Convert to milliseconds

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
    inbox = mock<InboxContract>();
    // Empty Inbox for the empty-tree cursor above: with no leaves the job consumes nothing by default.
    streamingInbox = mockStreamingInbox(l1ToL2MessageSource, inbox);
    // The integrated header and Inbox preflight resolves the checkpoint's final position to a live bucket; the job
    // publishes with the sequence it returns.
    publisher.validateCheckpointHeaderAndInbox.mockResolvedValue(0n);

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    // The publication guard checks the checkpoint's last block is still held locally under the hash it was built
    // with; serve the blocks the mock builder built.
    l2BlockSource.getBlockData.mockImplementation(async query => {
      const built =
        'number' in query ? checkpointBuilder.getBuiltBlocks().find(b => b.number === query.number) : undefined;
      return built && ({ blockHash: await built.hash() } as BlockData);
    });
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
    blockSink.addBlock.mockResolvedValue(undefined);
    blockSink.addProposedCheckpoint.mockResolvedValue(undefined);

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockImplementation(
      async (blockHeader, _checkpointNumber, indexWithinCheckpoint, archiveRoot, txs, _proposer, inboxPrefixRef) => {
        const txHashes = await Promise.all((txs ?? []).map((tx: Tx) => tx.getTxHash()));
        return new BlockProposal(
          blockHeader,
          IndexWithinCheckpoint(indexWithinCheckpoint),
          archiveRoot,
          txHashes,
          mockedSig,
          signatureContext,
          inboxPrefixRef,
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
            inboxPrefixRef: lastBlockInfo.inboxPrefixRef,
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
  // Freezes the clock past every tx-waiting deadline but still inside the proposal send budget. ManualDateProvider
  // does not advance, so a job that genuinely waits for txs would hang; tests whose subject is the give-up path
  // rather than the waiting itself start here instead.
  const setTimePastTxWaits = () =>
    dateProvider.setTime((job.getTimetable().getCheckpointProposalSendDeadline(SlotNumber(newSlotNumber)) - 1) * 1000);
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

      setTimePastTxWaits();
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
      inbox,
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

    // The build pins the proven tip on the standing assumption that the epoch proof lands by the target slot; the
    // actual `propose` validates that assumption. The publication preflight, simulated at the target slot's time
    // against the current L1 state, must carry the same pin while the proof is still outstanding, or a due prune
    // collapses the landed parent to the proven tip in simulation and the boundary checkpoint is abandoned.
    it('keeps the proven-tip pin in the publication preflight while a prune is still due at the target slot', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });
      l2BlockSource.isPruneDueAtSlot.mockResolvedValue(true);

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.validateCheckpointHeaderAndInbox).toHaveBeenCalledTimes(2);
      const publicationPlan = publisher.validateCheckpointHeaderAndInbox.mock.calls[1][2];
      expect(publicationPlan?.chainTipsOverride).toEqual({ proven: CheckpointNumber(1) });
      // The unlanded-parent overrides are gone: the parent is on L1 now, and its real cell is what the send sees.
      expect(publicationPlan?.pendingCheckpointState).toBeUndefined();
    });

    it('drops every build-time override from the publication preflight once no prune is due', async () => {
      const pipelinedJob = await createPipelinedJobWithBlock(proposedParent);
      mockL2BlockSource({ checkpointedNumber: CheckpointNumber(1), checkpointedHash: parentCheckpointHash });
      l2BlockSource.isPruneDueAtSlot.mockResolvedValue(false);

      await pipelinedJob.executeAndAwait();

      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.validateCheckpointHeaderAndInbox.mock.calls[1][2]).toBeUndefined();
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

      // Two messages observed before the first block, two more arriving between the blocks.
      streamingInbox.set([new Fr(1), new Fr(2)]);
      jest.spyOn(job, 'waitUntilNextSubslot').mockImplementation(() => {
        streamingInbox.append([new Fr(3), new Fr(4)], { closeBucket: true });
        return Promise.resolve();
      });

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
      setTimePastTxWaits();
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
      setTimePastTxWaits();
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

    // The tx-polling interval, which must match TXS_POLLING_MS in checkpoint_proposal_job.ts.
    const TXS_POLLING_MS = 500;

    // Sets the clock inside the tx-waiting deadline, so only the send budget can stop the wait, and pins the send
    // deadline `remainingMs` away from it. Returns a spy that counts waits and advances the clock like a real one.
    const armTxPollWithSendBudget = (remainingMs: number) => {
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, true))
        .mockReturnValue(noSubslot());
      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.hasEligiblePendingTxs.mockResolvedValue(false);

      // The wait-for-txs deadline is the subslot deadline (+10s) less minBlockDuration (2s), so +1s is well inside it.
      const nowMs = (buildFrameStartSeconds() + 1) * 1000;
      dateProvider.setTime(nowMs);
      jest.spyOn(job.getTimetable(), 'getCheckpointProposalSendDeadline').mockReturnValue((nowMs + remainingMs) / 1000);

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: false });
      return jest.spyOn(job, 'waitForTxsPollingInterval').mockImplementation(() => {
        dateProvider.setTime(dateProvider.now() + TXS_POLLING_MS);
        return Promise.resolve();
      });
    };

    it('does not start a tx poll the proposal send budget cannot cover', async () => {
      const pollSpy = armTxPollWithSendBudget(TXS_POLLING_MS - 1);

      await job.executeAndAwait();

      // A poll here would end past the send deadline, so it buys nothing and costs the rest of the budget.
      expect(pollSpy).not.toHaveBeenCalled();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
    });

    it('still waits for txs when a full poll fits inside the proposal send budget', async () => {
      const pollSpy = armTxPollWithSendBudget(TXS_POLLING_MS + 1);

      await job.executeAndAwait();

      expect(pollSpy).toHaveBeenCalled();
    });

    it('does not wait out another sub-slot once the proposal send budget is spent', async () => {
      // Two buildable sub-slots, so a failed first block would normally wait for the second and retry.
      jest
        .spyOn(job.getTimetable(), 'selectNextSubslot')
        .mockReturnValueOnce(subslot(10, 0, false))
        .mockReturnValueOnce(subslot(20, 1, true))
        .mockReturnValue(noSubslot());
      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.hasEligiblePendingTxs.mockResolvedValue(false);

      const nowMs = (buildFrameStartSeconds() + 1) * 1000;
      dateProvider.setTime(nowMs);
      jest
        .spyOn(job.getTimetable(), 'getCheckpointProposalSendDeadline')
        .mockReturnValue((nowMs + TXS_POLLING_MS - 1) / 1000);
      const subslotSpy = jest.spyOn(job, 'waitUntilNextSubslot');

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: false });
      await job.executeAndAwait();

      expect(subslotSpy).not.toHaveBeenCalled();
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
    const leaves = (count: number, from = 1) => Array.from({ length: count }, (_, i) => new Fr(from + i));
    /** Mocks `count` sub-slots, the last one flagged as the checkpoint's final block. */
    const mockSubslots = (count: number) => {
      const spy = jest.spyOn(job.getTimetable(), 'selectNextSubslot');
      for (let i = 0; i < count; i++) {
        spy.mockReturnValueOnce(subslot(10 + 8 * i, i, i === count - 1));
      }
      spy.mockReturnValue(noSubslot());
      jest.spyOn(job.getTimetable(), 'getMaxBlocksPerCheckpoint').mockReturnValue(count);
    };
    /** Mocks `startable` sub-slots out of `maxBlocks`, so the loop runs out of time before the final one. */
    const mockSubslotsRunningOut = (startable: number, maxBlocks: number) => {
      const spy = jest.spyOn(job.getTimetable(), 'selectNextSubslot');
      for (let i = 0; i < startable; i++) {
        spy.mockReturnValueOnce(subslot(10 + 8 * i, i, false));
      }
      spy.mockReturnValue(noSubslot());
      jest.spyOn(job.getTimetable(), 'getMaxBlocksPerCheckpoint').mockReturnValue(maxBlocks);
      job.updateConfig({ maxBlocksPerCheckpoint: maxBlocks });
    };
    /** Runs `fn` after the `afterBlock`-th block has been built, from the wait for the next sub-slot. */
    const betweenBlocks = (afterBlock: number, fn: () => void) => {
      let waits = 0;
      jest.spyOn(job, 'waitUntilNextSubslot').mockImplementation(() => {
        if (++waits === afterBlock) {
          fn();
        }
        return Promise.resolve();
      });
    };
    const bundleLengths = () => checkpointBuilder.buildBlockCalls.map(call => call.opts.l1ToL2Messages?.length);
    const signedPrefixes = () =>
      validatorClient.createBlockProposal.mock.calls.map(call => call[6].inboxRollingHash.toString());
    const prefixAt = (count: number) => streamingInbox.positionAt(BigInt(count)).rollingHash.toString();
    const preflightTotals = () =>
      publisher.validateCheckpointHeaderAndInbox.mock.calls.map(call => call[1].expectedTotal);

    beforeEach(() => {
      job.setTimetable(makeProposerTimetable({ l1Constants, blockDurationMs: 3000 }));
    });

    it('consumes every observed message with no L1 query and completes at the tip on the final block', async () => {
      mockSubslots(2);
      streamingInbox.set(leaves(5));
      publisher.validateCheckpointHeaderAndInbox.mockResolvedValue(7n);

      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      // Streaming has no bulk per-checkpoint list; every message reaches the builder through a block.
      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      // The first block greedily consumes all five messages; the final block finds nothing more and completes at
      // the tip, where the only Inbox query of the checkpoint resolves the live bucket end.
      expect(bundleLengths()).toEqual([5, 0]);
      expect(signedPrefixes()).toEqual([prefixAt(5), prefixAt(5)]);
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledTimes(1);
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledWith(5n);
      // Pre-gossip and pre-publication preflights both check the final total; the send uses the hint of the latter.
      expect(preflightTotals()).toEqual([5n, 5n]);
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(7n);
    });

    it('produces a message-only block when messages are observed and no txs are pending', async () => {
      mockSubslots(1);
      streamingInbox.set(leaves(5));

      // Empty tx pool with the min-txs threshold at its default of one and no empty-checkpoint building: the
      // observed messages alone must count as work, producing a zero-tx (message-only) block.
      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minTxsPerBlock: 1, buildCheckpointIfEmpty: false });
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([5]);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('publishes with the preflight bucket hint when the final block fails to build after earlier consumption', async () => {
      // Two sub-slots. The first block consumes the observed messages as a message-only block. The final sub-slot
      // block has no txs and nothing left to consume, so it fails to build and is not held for broadcast. The hint
      // published with the checkpoint must still be the one resolved for the header's final position.
      mockSubslots(2);
      streamingInbox.set(leaves(5));
      publisher.validateCheckpointHeaderAndInbox.mockResolvedValue(2n);

      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      job.updateConfig({ minTxsPerBlock: 1, buildCheckpointIfEmpty: false });
      setTimePastTxWaits();
      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      expect(preflightTotals()).toEqual([5n, 5n]);
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(2n);
    });

    it('consumes a full block toward the endpoint instead of stopping at the threshold', async () => {
      // The archiver lags at 700 for three blocks (greedy ends 256, 512, 700) and then catches up to 1300, with live
      // ends 956, 1000, 1256 and 1300. Block 4's greedy end (956) passes the threshold, so it resolves the endpoint
      // within the checkpoint cap (1000) and consumes a full block toward it, ending inside the bucket that ends at
      // 1000. Block 5 is final and finishes on 1000.
      mockSubslots(5);
      job.updateConfig({ maxBlocksPerCheckpoint: 5 });
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);
      betweenBlocks(3, () => {
        streamingInbox.append(leaves(256, 701), { closeBucket: true });
        streamingInbox.append(leaves(44, 957), { closeBucket: true });
        streamingInbox.append(leaves(256, 1001), { closeBucket: true });
        streamingInbox.append(leaves(44, 1257), { closeBucket: true });
      });

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188, 256, 44]);
      expect(signedPrefixes().slice(-2)).toEqual([prefixAt(956), prefixAt(1000)]);
      // Block 4 asks for the whole checkpoint cap; block 5, being final, only for what it can carry.
      expect(inbox.getBucketAtOrBeforeTotal.mock.calls.map(call => call[0])).toEqual([1024n, 1024n]);
      expect(preflightTotals()).toEqual([1000n, 1000n]);
    });

    it('takes the safe local step when the resolved endpoint is behind the cursor on a non-final block', async () => {
      // The bucket the cursor sits in ends at 1000, which the archiver has not synced, so nothing above 700 resolves
      // within the bound. The block still advances to the threshold rather than consuming nothing.
      mockSubslots(5);
      job.updateConfig({ maxBlocksPerCheckpoint: 5 });
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);
      betweenBlocks(3, () => {
        streamingInbox.append(leaves(200, 701), { closeBucket: false });
        streamingInbox.setBucketEnds([256n, 512n, 1000n]);
      });
      const blocksBuiltAtInboxQuery: number[] = [];
      const resolveBucket = inbox.getBucketAtOrBeforeTotal.getMockImplementation()!;
      inbox.getBucketAtOrBeforeTotal.mockImplementation(upperBound => {
        blocksBuiltAtInboxQuery.push(checkpointBuilder.buildBlockCalls.length);
        return resolveBucket(upperBound);
      });

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      await job.executeAndAwait();

      expect(bundleLengths().slice(0, 4)).toEqual([256, 256, 188, 68]);
      // The fourth block did consult L1; its endpoint was simply not usable, so it took the safe local step.
      expect(blocksBuiltAtInboxQuery[0]).toEqual(3);
      expect(signedPrefixes()[3]).toEqual(prefixAt(768));
    });

    it('splits a bucket on a block that consulted L1, then finishes the checkpoint on the next one', async () => {
      // Live ends 750, 1006 and 1024 above the cursor. A block bounded by its own reach would pick 750 and strand
      // the bucket ending at 1024; the checkpoint-wide bound lets block 4 take a full block into the 1006 bucket and
      // block 5 finish at 1024.
      mockSubslots(5);
      job.updateConfig({ maxBlocksPerCheckpoint: 5 });
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);
      betweenBlocks(3, () => {
        streamingInbox.append(leaves(50, 701), { closeBucket: true });
        streamingInbox.append(leaves(256, 751), { closeBucket: true });
        streamingInbox.append(leaves(18, 1007), { closeBucket: true });
      });

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188, 256, 68]);
      // Block 4 ends mid-bucket at 956 and signs the hash there, not the resolved endpoint's at 1024.
      expect(signedPrefixes().slice(-2)).toEqual([prefixAt(956), prefixAt(1024)]);
      expect(preflightTotals()).toEqual([1024n, 1024n]);
    });

    it('does not consult L1 while a large backlog is consumed in steps below the threshold', async () => {
      // Everything is observed from the first block, but blocks 1..3 end at 256, 512 and 768, none of them above the
      // threshold, so only the final block resolves an endpoint.
      mockSubslots(4);
      job.updateConfig({ maxBlocksPerCheckpoint: 4 });
      streamingInbox.set(leaves(1124), [100n, 356n, 612n, 868n, 1124n]);
      const blocksBuiltAtInboxQuery: number[] = [];
      const resolveBucket = inbox.getBucketAtOrBeforeTotal.getMockImplementation()!;
      inbox.getBucketAtOrBeforeTotal.mockImplementation(upperBound => {
        blocksBuiltAtInboxQuery.push(checkpointBuilder.buildBlockCalls.length);
        return resolveBucket(upperBound);
      });

      const { lastBlock } = await setupMultipleBlocks(4, [1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      await job.executeAndAwait();

      expect(bundleLengths()).toEqual([256, 256, 256, 100]);
      expect(blocksBuiltAtInboxQuery).toEqual([3]);
    });

    it('stops at the last endpoint within the cap rather than signing the greedy 1024', async () => {
      // Live ends 100/356/612/868/1124 with the whole backlog observed: 1124 is past the cap, so the checkpoint ends
      // at 868 and the sub-slots after it consume nothing.
      mockSubslots(5);
      job.updateConfig({ maxBlocksPerCheckpoint: 5 });
      streamingInbox.set(leaves(1124), [100n, 356n, 612n, 868n, 1124n]);

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 256, 100, 0]);
      expect(signedPrefixes().slice(-2)).toEqual([prefixAt(868), prefixAt(868)]);
      expect(preflightTotals()).toEqual([868n, 868n]);
    });

    it('ends the final block on the endpoint even when the safe local step reaches further', async () => {
      // The archiver holds 500 messages but only 300 of them are in closed buckets. The final block's safe local
      // step would take all 500, which is not a live bucket end and cannot be published; it must take 300.
      mockSubslots(2);
      job.updateConfig({ maxBlocksPerCheckpoint: 2 });
      streamingInbox.set(leaves(500), [300n]);

      const { lastBlock } = await setupMultipleBlocks(2, [1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 44]);
      expect(signedPrefixes().at(-1)).toEqual(prefixAt(300));
      expect(preflightTotals()).toEqual([300n, 300n]);
    });

    it('selects 800 rather than signing 956 after partial blocks reached 700 for live ends 444/700/800/1056', async () => {
      // The archiver lags at 700 for three blocks (greedy ends 256, 512, 700) and then catches up to 1056. The
      // final block's lookup is bounded by what it alone can carry, so it takes 800, not 1056.
      mockSubslots(4);
      job.updateConfig({ maxBlocksPerCheckpoint: 4 });
      streamingInbox.set(leaves(700), [444n, 700n]);
      betweenBlocks(3, () => {
        streamingInbox.append(leaves(100, 701), { closeBucket: true });
        streamingInbox.append(leaves(256, 801), { closeBucket: true });
      });

      const { lastBlock } = await setupMultipleBlocks(4, [1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188, 100]);
      expect(signedPrefixes().at(-1)).toEqual(prefixAt(800));
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledTimes(1);
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledWith(956n);
    });

    it('clears a full backlog by the fourth block and consumes nothing in the sub-slots after it', async () => {
      // Live ends 256/512/768/1000 with 1300 observed. Block 4's greedy end (1024) passes the threshold, so it
      // resolves 1000 and lands on it; the checkpoint is publishable from there on.
      mockSubslots(8);
      job.updateConfig({ maxBlocksPerCheckpoint: 8 });
      streamingInbox.set(leaves(1300), [256n, 512n, 768n, 1000n]);

      const { lastBlock } = await setupMultipleBlocks(8, [1, 1, 1, 1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 256, 232, 0, 0, 0, 0]);
      expect(signedPrefixes().slice(-5)).toEqual(Array(5).fill(prefixAt(1000)));
      // Past the threshold every later block resolves again; none of them can advance beyond 1000.
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledTimes(5);
      expect(preflightTotals()).toEqual([1000n, 1000n]);
    });

    it('publishes the full backlog even when the blocks after the crossing block are lost', async () => {
      mockSubslots(8);
      job.updateConfig({ maxBlocksPerCheckpoint: 8 });
      streamingInbox.set(leaves(1300), [256n, 512n, 768n, 1000n]);
      betweenBlocks(4, () => (checkpointBuilder.errorOnBuild = new Error('builder unavailable')));

      const { lastBlock } = await setupMultipleBlocks(8, [1, 1, 1, 1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(preflightTotals()).toEqual([1000n, 1000n]);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('treats the block that reaches the checkpoint block cap as the final block', async () => {
      // Eight sub-slots on the timetable but only four blocks allowed: the fourth has to land on a live bucket end.
      mockSubslots(8);
      job.updateConfig({ maxBlocksPerCheckpoint: 4 });
      streamingInbox.set(leaves(900), [256n, 512n, 868n]);

      const { lastBlock } = await setupMultipleBlocks(4, [1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 256, 100]);
      expect(preflightTotals()).toEqual([868n, 868n]);
    });

    it('builds a forced tx-less block to end the checkpoint when the timetable runs out', async () => {
      // Three sub-slots are configured but only two can start: the second block's completion overruns, so the
      // cursor is left at 512 with no block having landed on a live bucket end.
      mockSubslotsRunningOut(2, 3);
      // Before the ideal last-block build time, so the forced block gets that deadline rather than the hard stop.
      dateProvider.setTime((job.getTimetable().getLastBlockBuildTime(SlotNumber(newSlotNumber)) - 1) * 1000);
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);

      const { lastBlock } = await setupMultipleBlocks(3, [1, 1, 0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188]);
      expect(signedPrefixes().at(-1)).toEqual(prefixAt(700));
      expect(preflightTotals()).toEqual([700n, 700n]);
      // The forced block is bounded by the proposer's last-block build time, never by the attestation deadline.
      const forcedDeadline = checkpointBuilder.buildBlockCalls[2].opts.deadline;
      expect(forcedDeadline).toEqual(
        new Date(job.getTimetable().getLastBlockBuildTime(SlotNumber(newSlotNumber)) * 1000),
      );
      expect(forcedDeadline!.getTime()).toBeLessThan(
        job.getTimetable().getAttestationDeadline(SlotNumber(newSlotNumber)) * 1000,
      );
    });

    it('builds the forced block after a block that consulted L1 and ended inside a bucket', async () => {
      // Block 4 crosses the threshold and stops at 956, inside the bucket that ends at 1006; having consulted L1 is
      // not the same as having ended on an endpoint, so the tail still has to be built.
      mockSubslotsRunningOut(4, 5);
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);
      betweenBlocks(3, () => {
        streamingInbox.append(leaves(50, 701), { closeBucket: true });
        streamingInbox.append(leaves(256, 751), { closeBucket: true });
        streamingInbox.append(leaves(18, 1007), { closeBucket: true });
      });

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188, 256, 68]);
      expect(signedPrefixes().at(-1)).toEqual(prefixAt(1024));
      expect(preflightTotals()).toEqual([1024n, 1024n]);
    });

    it('builds the forced block after an ordinary block that consumed nothing', async () => {
      // Block 3 builds on txs alone with nothing new to consume, so the cursor is still at the unaligned 512 when
      // the schedule runs out. The endpoint that closes at 700 only becomes visible afterwards.
      mockSubslotsRunningOut(3, 4);
      streamingInbox.set(leaves(512), [256n, 512n]);
      betweenBlocks(3, () => streamingInbox.append(leaves(188, 513), { closeBucket: true }));

      const { lastBlock } = await setupMultipleBlocks(4, [1, 1, 1, 0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 0, 188]);
      expect(signedPrefixes().at(-1)).toEqual(prefixAt(700));
      expect(preflightTotals()).toEqual([700n, 700n]);
    });

    it('builds no forced block when the cursor already sits on a live endpoint', async () => {
      mockSubslotsRunningOut(3, 4);
      streamingInbox.set(leaves(700), [256n, 512n, 700n]);

      const { lastBlock } = await setupMultipleBlocks(3, [1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 188]);
      // The tail check still resolves once; it just finds nothing to build.
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledTimes(1);
      expect(preflightTotals()).toEqual([700n, 700n]);
    });

    it('abandons the checkpoint when the forced block finds no live endpoint above the cursor', async () => {
      // Only one closed bucket, at 256; the blocks consumed past it and nothing above the cursor is live.
      mockSubslotsRunningOut(2, 3);
      streamingInbox.set(leaves(700), [256n]);

      const { lastBlock } = await setupMultipleBlocks(2, [1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_completion_unresolved');
    });

    it('abandons the checkpoint when the final block cannot complete at a live endpoint', async () => {
      // 900 messages in one open bucket: greedy blocks reach 256 and 512, and the final block's reachable bound
      // (768) has no live bucket end at or above the cursor, so no checkpoint ending here can be published.
      mockSubslots(3);
      job.updateConfig({ maxBlocksPerCheckpoint: 3 });
      streamingInbox.set(leaves(900), []);

      const { lastBlock } = await setupMultipleBlocks(3, [1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_completion_unresolved');
    });

    it('retries completion on a later block when no live endpoint is reachable yet', async () => {
      // Completion is entered on the fourth block, but L1 has closed no bucket at or below the bound yet; the block
      // consumes nothing and the final block resolves the endpoint once it appears.
      mockSubslots(5);
      job.updateConfig({ maxBlocksPerCheckpoint: 5 });
      streamingInbox.set(leaves(1000), []);
      betweenBlocks(4, () => streamingInbox.setBucketEnds([1000n]));

      const { lastBlock } = await setupMultipleBlocks(5, [1, 1, 1, 1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(bundleLengths()).toEqual([256, 256, 256, 0, 232]);
      expect(inbox.getBucketAtOrBeforeTotal).toHaveBeenCalledTimes(2);
    });

    it('abandons the checkpoint when the local message prefix changes under already signed blocks', async () => {
      mockSubslots(2);
      streamingInbox.set(leaves(5));
      // A content-changing L1 reorg replaces the messages the first block consumed before the second block builds.
      betweenBlocks(1, () => streamingInbox.set(leaves(5, 1000)));

      const { lastBlock } = await setupMultipleBlocks(2, [1, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('inbox_prefix_reorged');
    });

    it('abandons the slot when the pre-gossip preflight rejects the checkpoint', async () => {
      mockSubslots(1);
      streamingInbox.set(leaves(5));
      publisher.validateCheckpointHeaderAndInbox.mockRejectedValue(new Error('Rollup__InboxTotalNotAtBucketBoundary'));

      const { lastBlock } = await setupMultipleBlocks(1, [1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeUndefined();
      expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('header_validation_failed');
    });

    it('re-runs the preflight before publishing and takes its bucket hint', async () => {
      mockSubslots(1);
      streamingInbox.set(leaves(5));
      publisher.validateCheckpointHeaderAndInbox.mockResolvedValueOnce(3n).mockResolvedValueOnce(4n);

      const { lastBlock } = await setupMultipleBlocks(1, [1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      await job.executeAndAwait();

      expect(publisher.validateCheckpointHeaderAndInbox).toHaveBeenCalledTimes(2);
      // The pre-gossip call carries the build-time simulation plan; the pre-publication call carries no synthetic
      // overrides, so L1's real parent and prune state decide.
      expect(publisher.validateCheckpointHeaderAndInbox.mock.calls[1][2]).toBeUndefined();
      expect(publisher.enqueueProposeCheckpoint.mock.calls[0][3]).toBe(4n);
    });

    it('abandons publication when the pre-publication preflight rejects the checkpoint', async () => {
      mockSubslots(1);
      streamingInbox.set(leaves(5));
      publisher.validateCheckpointHeaderAndInbox
        .mockResolvedValueOnce(3n)
        .mockRejectedValueOnce(new Error('Rollup__UnexpectedParentCheckpoint'));

      const { lastBlock } = await setupMultipleBlocks(1, [1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const publishFailed = jest.fn();
      job.eventEmitter.on('checkpoint-publish-failed', publishFailed);

      const checkpoint = await job.executeAndAwait();

      // The checkpoint was built and gossiped, but never sent.
      expect(checkpoint).toBeDefined();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('publication_preflight_failed');
      expect(publishFailed).toHaveBeenCalledWith({ slot: SlotNumber(newSlotNumber) });
    });

    it('abandons publication when the archiver no longer holds the checkpoint blocks', async () => {
      mockSubslots(1);
      streamingInbox.set(leaves(5));
      // The archiver pruned the built block (or holds a different one at that number) by the time the slot arrives.
      l2BlockSource.getBlockData.mockResolvedValue(undefined);

      const { lastBlock } = await setupMultipleBlocks(1, [1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const checkpoint = await job.executeAndAwait();

      expect(checkpoint).toBeDefined();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('checkpoint_blocks_pruned');
    });

    // The preflights are L1 simulations awaited inside the duty; a slow provider must not carry the job past the
    // point at which its signature or its send could still land.
    describe('preflight deadlines', () => {
      const attestationDeadlineMs = () => job.getTimetable().getAttestationDeadline(SlotNumber(newSlotNumber)) * 1000;
      const sendDeadlineMs = () =>
        job.getTimetable().getCheckpointProposalSendDeadline(SlotNumber(newSlotNumber)) * 1000;
      const l1PublishDeadlineMs = () =>
        (Number(l1Constants.l1GenesisTime) + newSlotNumber * slotDuration + slotDuration - ethereumSlotDuration) * 1000;

      it('does not sign the checkpoint when the pre-gossip preflight resolves after the send deadline', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        // A verdict that lands after peers stop accepting proposals but well before the attestation cutoff: the
        // two are a whole ethereum slot plus a block duration apart, and only the earlier one bounds the send.
        publisher.validateCheckpointHeaderAndInbox.mockImplementation(() => {
          dateProvider.setTime(sendDeadlineMs() + 1_000);
          return Promise.resolve(0n);
        });
        await setupMultipleBlocks(1, [1]);

        expect(sendDeadlineMs()).toBeLessThan(attestationDeadlineMs());
        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeUndefined();
        expect(validatorClient.createCheckpointProposal).not.toHaveBeenCalled();
        expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('header_validation_timeout');
      });

      it('abandons a pre-gossip preflight that does not answer within the remaining send window', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        publisher.validateCheckpointHeaderAndInbox.mockImplementation(() => new Promise<bigint>(() => {}));
        await setupMultipleBlocks(1, [1]);
        // Once the block is built there are 200ms left to gossip a proposal peers would still accept.
        const completeCheckpoint = checkpointBuilder.completeCheckpoint.bind(checkpointBuilder);
        jest.spyOn(checkpointBuilder, 'completeCheckpoint').mockImplementation(() => {
          dateProvider.setTime(sendDeadlineMs() - 200);
          return completeCheckpoint();
        });

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeUndefined();
        expect(validatorClient.createCheckpointProposal).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('header_validation_timeout');
      });

      it('does not gossip when a slow signer returns after the send deadline', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        const createProposal = validatorClient.createCheckpointProposal.getMockImplementation()!;
        validatorClient.createCheckpointProposal.mockImplementation(((...args: unknown[]) => {
          dateProvider.setTime(sendDeadlineMs() + 1_000);
          return (createProposal as (...a: unknown[]) => unknown)(...args);
        }) as any);
        await setupMultipleBlocks(1, [1]);

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeUndefined();
        // The signature was produced and its duty record stands; only the send is abandoned.
        expect(validatorClient.createCheckpointProposal).toHaveBeenCalledTimes(1);
        expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('proposal_send_timeout');
      });

      it('does not gossip when the queued archiver insertion returns after the send deadline', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        blockSink.addProposedCheckpoint.mockImplementation(() => {
          dateProvider.setTime(sendDeadlineMs() + 1_000);
          return Promise.resolve();
        });
        await setupMultipleBlocks(1, [1]);

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeUndefined();
        expect(validatorClient.createCheckpointProposal).toHaveBeenCalledTimes(1);
        expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('proposal_send_timeout');
      });

      it('broadcasts once when preflight, signing and insertion all fit inside the send budget', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        const { lastBlock } = await setupMultipleBlocks(1, [1]);
        validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeDefined();
        expect(p2p.broadcastCheckpointProposal).toHaveBeenCalledTimes(1);
        expect(metrics.recordCheckpointProposalFailed).not.toHaveBeenCalledWith('proposal_send_timeout');
      });

      it('does not sign the checkpoint when the job is interrupted while the pre-gossip preflight runs', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        publisher.validateCheckpointHeaderAndInbox.mockImplementation(() => {
          job.interrupt();
          return Promise.resolve(0n);
        });
        await setupMultipleBlocks(1, [1]);

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeUndefined();
        expect(validatorClient.createCheckpointProposal).not.toHaveBeenCalled();
        expect(p2p.broadcastCheckpointProposal).not.toHaveBeenCalled();
      });

      it('does not enqueue the checkpoint when the pre-publication preflight resolves after the L1 publish deadline', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        publisher.validateCheckpointHeaderAndInbox.mockResolvedValueOnce(0n).mockImplementationOnce(() => {
          dateProvider.setTime(l1PublishDeadlineMs() + 1_000);
          return Promise.resolve(0n);
        });
        const { lastBlock } = await setupMultipleBlocks(1, [1]);
        validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeDefined();
        expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('publication_preflight_timeout');
      });

      it('abandons a pre-publication preflight that does not answer before the L1 publish deadline', async () => {
        mockSubslots(1);
        streamingInbox.set(leaves(2));
        publisher.validateCheckpointHeaderAndInbox
          .mockResolvedValueOnce(0n)
          .mockImplementationOnce(() => new Promise<bigint>(() => {}));
        const { lastBlock } = await setupMultipleBlocks(1, [1]);
        // Attestations arrive with 200ms left before the last L1 block of the target slot.
        validatorClient.collectAttestations.mockImplementation(() => {
          dateProvider.setTime(l1PublishDeadlineMs() - 200);
          return Promise.resolve(getAttestations(lastBlock));
        });

        const checkpoint = await job.executeAndAwait();

        expect(checkpoint).toBeDefined();
        expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
        expect(metrics.recordCheckpointProposalFailed).toHaveBeenCalledWith('publication_preflight_timeout');
      });
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
      expect(blockSink.addBlock).toHaveBeenCalledWith(block, expect.any(InboxMessagePrefixRef));
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

  /** Override to be a no-op for testing - allows tests to run without timing delays */
  public override waitUntilNextSubslot(nextSubslotStart: number): Promise<void> {
    this.log.warn(`Skipping waitUntilNextSubslot(${nextSubslotStart}) in test`);
    return Promise.resolve();
  }

  /** Awaits the sequencer's shared tracker so tests observe the backgrounded L1 submission completing. */
  public async awaitPendingSubmission(): Promise<void> {
    await this.pendingRequests.awaitRequests();
  }

  /** Widened so tests whose subject is whether the job waits at all can observe or stub the wait. */
  public override waitForTxsPollingInterval(): Promise<void> {
    return super.waitForTxsPollingInterval();
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
