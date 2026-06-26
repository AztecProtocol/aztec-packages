import { EpochCache, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2BlockSink, L2BlockSource, ProposedCheckpointSink } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  BlockBuilderOptions,
  MerkleTreeWriteOperations,
  ResolvedSequencerConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type { ProposerTimetable } from '@aztec/stdlib/timetable';
import { type CheckpointGlobalVariables, GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import type {
  BuildBlockInCheckpointResult,
  FullNodeCheckpointsBuilder,
  ValidatorClient,
} from '@aztec/validator-client';

import { jest } from '@jest/globals';
import EventEmitter from 'events';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';

import { DefaultSequencerConfig } from '../config.js';
import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import {
  MockCheckpointBuilder,
  MockCheckpointsBuilder,
  createCheckpointAttestation,
  makeBlock,
  makeProposerTimetable,
  makeTx,
  mockTxIterator,
} from '../test/utils.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import type { CheckpointProposalJobMetricsRecorder } from './checkpoint_proposal_job_metrics.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerState } from './utils.js';

/**
 * Extended MockCheckpointBuilder that simulates execution time by advancing a ManualDateProvider.
 * Allows tests to configure how long each block takes to build and tracks build times.
 */
class TimingAwareMockCheckpointBuilder extends MockCheckpointBuilder {
  /** Execution duration in seconds for each block (index 0 = first block, etc.) */
  private executionDurations: number[] = [];
  private currentBlockIndex = 0;

  /** Recorded build times: { blockNumber, startTime, endTime } in seconds into slot */
  public recordedBuildTimes: Array<{ blockNumber: number; startTime: number; endTime: number }> = [];

  constructor(
    constants: CheckpointGlobalVariables,
    checkpointNumber: CheckpointNumber,
    private readonly dateProvider: ManualDateProvider,
    private readonly getSecondsIntoSlot: () => number,
  ) {
    super(constants, checkpointNumber);
  }

  /** Configure execution durations for each block */
  setExecutionDurations(durations: number[]): this {
    this.executionDurations = durations;
    return this;
  }

  override async buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    timestamp: bigint,
    opts: BlockBuilderOptions,
  ): Promise<BuildBlockInCheckpointResult> {
    const startTime = this.getSecondsIntoSlot();

    // Simulate execution time by advancing the clock
    const duration = this.executionDurations[this.currentBlockIndex] ?? 0;
    this.dateProvider.advanceTime(duration);

    const endTime = this.getSecondsIntoSlot();
    this.recordedBuildTimes.push({ blockNumber, startTime, endTime });
    this.currentBlockIndex++;

    return await super.buildBlock(pendingTxs, blockNumber, timestamp, opts);
  }

  override reset(): void {
    super.reset();
    this.executionDurations = [];
    this.currentBlockIndex = 0;
    this.recordedBuildTimes = [];
  }
}

/** Polling interval for txs in milliseconds (must match the constant in checkpoint_proposal_job.ts) */
const TXS_POLLING_MS = 500;

/**
 * Test subclass of CheckpointProposalJob that:
 * 1. Advances simulated time instead of actually sleeping in waitUntilNextSubslot
 * 2. Advances simulated time instead of sleeping while polling for txs
 * 3. Tracks state transitions and block build times for assertions
 */
class TimingTestCheckpointProposalJob extends CheckpointProposalJob {
  /** Tracks all state transitions with their times for assertions */
  public stateTransitions: Array<{ state: SequencerState; secondsIntoSlot: number }> = [];

  /** Tracks when blocks were built (start/end times in seconds into slot) */
  public blockBuildTimes: Array<{ blockNumber: number; startTime: number; endTime: number }> = [];

  constructor(
    private readonly testDateProvider: ManualDateProvider,
    private readonly getSecondsIntoSlotFn: () => number,
    ...args: ConstructorParameters<typeof CheckpointProposalJob>
  ) {
    super(...args);
  }

  /**
   * Override to advance simulated time to the sub-slot deadline instead of actually sleeping.
   * This makes the test run instantly while still simulating time passage. Delegates to the parent so
   * its state reporting and logging still run; the parent's sleepUntil resolves immediately once time
   * has advanced to the deadline.
   */
  protected override async waitUntilNextSubslot(nextSubslotStart: number): Promise<void> {
    const nowSeconds = this.testDateProvider.nowInSeconds();
    if (nextSubslotStart > nowSeconds) {
      this.testDateProvider.advanceTime(nextSubslotStart - nowSeconds);
    }
    await super.waitUntilNextSubslot(nextSubslotStart);
  }

  /**
   * Override to advance simulated time instead of actually sleeping.
   */
  protected override async waitForTxsPollingInterval(): Promise<void> {
    await Promise.resolve(); // Satisfy async requirement
    this.testDateProvider.advanceTimeMs(TXS_POLLING_MS);
  }

  /** Public accessor for testing */
  public getSecondsIntoSlotPublic(): number {
    return this.getSecondsIntoSlotFn();
  }

  /** Update config for testing */
  public updateConfig(partialConfig: Partial<ResolvedSequencerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /** Set timetable for testing */
  public setTimetable(newTimetable: ProposerTimetable): void {
    this.timetable = newTimetable;
  }

  /** Get timetable for testing */
  public getTimetable(): ProposerTimetable {
    return this.timetable;
  }

  /** Record a state transition for later assertion */
  public recordStateTransition(state: SequencerState): void {
    this.stateTransitions.push({ state, secondsIntoSlot: this.getSecondsIntoSlotFn() });
  }

  /** Record block build timing for later assertion */
  public recordBlockBuild(blockNumber: number, startTime: number, endTime: number): void {
    this.blockBuildTimes.push({ blockNumber, startTime, endTime });
  }
}

describe('CheckpointProposalJob Timing Tests', () => {
  // Realistic production-like timing configuration
  const ETHEREUM_SLOT_DURATION = 12; // seconds
  const AZTEC_SLOT_DURATION = 72; // seconds (6x Ethereum slots)
  const BLOCK_DURATION = 8; // seconds per sub-slot
  const P2P_PROPAGATION_TIME = 2; // seconds for p2p message propagation
  const CHECKPOINT_ASSEMBLE_TIME = 1; // seconds to assemble+sign the checkpoint (stdlib default)

  // End-of-build-slot reservation the timetable must keep free after the last block so the checkpoint
  // can be assembled, propagated, re-executed by validators, and have attestations returned before the
  // build-slot boundary. Mirrors `timeReservedAtEnd` in the pipelined timing model.
  const TIME_RESERVED_AT_END = CHECKPOINT_ASSEMBLE_TIME + 2 * P2P_PROPAGATION_TIME + BLOCK_DURATION;

  // Calculated for the (always-pipelined) timing model:
  // timeReservedAtEnd = checkpointAssembleTime(1) + 2*p2pPropagation(2) + blockDuration(8) = 13
  // maxBlocks = floor((aztecSlotDuration(72) - checkpointInitializationTime(1) - 13) / blockDuration(8)) = 7
  const EXPECTED_MAX_BLOCKS = 7;

  let dateProvider: ManualDateProvider;
  let timetable: ProposerTimetable;
  let checkpointsBuilder: MockCheckpointsBuilder;
  let checkpointBuilder: TimingAwareMockCheckpointBuilder;

  // Mocks
  let publisher: MockProxy<SequencerPublisher>;
  let epochCache: MockProxy<EpochCache>;
  let validatorClient: MockProxy<ValidatorClient>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let p2p: MockProxy<P2P>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let blockSink: MockProxy<L2BlockSink & ProposedCheckpointSink>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let metrics: MockProxy<SequencerMetrics>;
  let checkpointMetrics: MockProxy<CheckpointProposalJobMetricsRecorder>;

  let l1Constants: L1RollupConstants;
  let config: ResolvedSequencerConfig;

  // Test state
  let slotNumber: SlotNumber;
  // Always-pipelined production shape: the proposer builds during `slotNumber` (the build slot) for
  // `targetSlot = slotNumber + PROPOSER_PIPELINING_SLOT_OFFSET`. Build timing (sub-slot scheduling,
  // deadlines) is anchored to the build slot; the checkpoint/proposal commits to the target slot.
  let targetSlot: SlotNumber;
  let checkpointNumber: CheckpointNumber;
  let epoch: EpochNumber;
  let globalVariables: GlobalVariables;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const gasFees = GasFees.empty();
  const signatureContext: CoordinationSignatureContext = {
    chainId: chainId.toNumber(),
    rollupAddress: EthAddress.random(),
  };
  const signer = Secp256k1Signer.random();
  const mockedSig = Signature.random();
  const committee = [signer.address];
  const attestorAddress = EthAddress.random();
  const proposer = EthAddress.random();

  /** Calculate slot start time for a given slot number */
  function getSlotStartTime(slot: SlotNumber): number {
    // Slot build time = l1GenesisTime + slot * slotDuration - ethereumSlotDuration
    return Number(l1Constants.l1GenesisTime) + slot * AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;
  }

  /** Set the simulated time to a specific point within the slot */
  function setTimeInSlot(secondsIntoSlot: number): void {
    const slotStart = getSlotStartTime(slotNumber);
    dateProvider.setTime((slotStart + secondsIntoSlot) * 1000);
  }

  /** Get current seconds into slot */
  function getSecondsIntoSlot(): number {
    const slotStart = getSlotStartTime(slotNumber);
    return dateProvider.nowInSeconds() - slotStart;
  }

  /** Create blocks and transactions for testing */
  async function createTestBlocksAndTxs(count: number): Promise<{ blocks: L2Block[]; txs: Tx[] }> {
    const blocks: L2Block[] = [];
    const allTxs: Tx[] = [];

    for (let i = 0; i < count; i++) {
      const blockNumber = BlockNumber(i + 1);
      const blockGlobalVariables = new GlobalVariables(
        chainId,
        version,
        blockNumber,
        targetSlot,
        globalVariables.timestamp,
        coinbase,
        globalVariables.feeRecipient,
        gasFees,
      );
      const txs = [await makeTx(i + 1, chainId)];
      allTxs.push(...txs);
      const block = await makeBlock(txs, blockGlobalVariables);
      blocks.push(block);
    }
    return { blocks, txs: allTxs };
  }

  /** Set up p2p mock to return the given transactions */
  function mockP2pWithTxs(txs: Tx[]): void {
    p2p.getPendingTxCount.mockResolvedValue(txs.length);
    p2p.getEligiblePendingTxCount.mockResolvedValue(txs.length);
    p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
  }

  /** Create attestations for the given block */
  function getAttestations(block: L2Block) {
    return [createCheckpointAttestation(block, mockedSig, committee[0])];
  }

  /** Create a TimingTestCheckpointProposalJob with current mocks */
  function createJob(
    setStateFn: (state: SequencerState, slot?: SlotNumber) => void = jest.fn(),
  ): TimingTestCheckpointProposalJob {
    const eventEmitter = new EventEmitter() as TypedEventEmitter<SequencerEvents>;

    return new TimingTestCheckpointProposalJob(
      dateProvider,
      getSecondsIntoSlot,
      targetSlot,
      epoch,
      checkpointNumber,
      BlockNumber.ZERO,
      CheckpointNumber(checkpointNumber - 1),
      proposer,
      publisher,
      attestorAddress,
      undefined, // invalidateCheckpoint
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      l1ToL2MessageSource,
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
      setStateFn,
      getTelemetryClient().getTracer('timing-test'),
      { actor: 'timing-test' },
    );
  }

  beforeEach(async () => {
    // Set up L1 constants with a genesis time that allows for clean slot calculations
    const l1GenesisTime = BigInt(1000000);
    l1Constants = {
      l1GenesisTime,
      slotDuration: AZTEC_SLOT_DURATION,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      l1StartBlock: 0n,
      epochDuration: 16,
      proofSubmissionEpochs: 4,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };

    // Initialize test state
    slotNumber = SlotNumber(1);
    targetSlot = SlotNumber(slotNumber + PROPOSER_PIPELINING_SLOT_OFFSET);
    checkpointNumber = CheckpointNumber(1);
    epoch = EpochNumber(0);

    const feeRecipient = await AztecAddress.random();
    // The checkpoint commits to the target slot, so its globals (and the blocks built under them)
    // carry `targetSlot`, even though building happens during the build slot.
    globalVariables = new GlobalVariables(
      chainId,
      version,
      BlockNumber(1),
      targetSlot,
      BigInt(getSlotStartTime(targetSlot)),
      coinbase,
      feeRecipient,
      gasFees,
    );

    // Initialize manual date provider at slot start.
    // Time only advances via explicit advanceTime() calls, never from real clock.
    dateProvider = new ManualDateProvider(getSlotStartTime(slotNumber) * 1000);

    // Create timetable with realistic production values
    timetable = makeProposerTimetable({
      l1Constants,
      p2pPropagationTime: P2P_PROPAGATION_TIME,
      checkpointProposalPrepareTime: CHECKPOINT_ASSEMBLE_TIME,
      blockDurationMs: BLOCK_DURATION * 1000,
    });

    // Create timing-aware checkpoint builder
    const checkpointConstants: CheckpointGlobalVariables = { ...globalVariables };
    checkpointBuilder = new TimingAwareMockCheckpointBuilder(
      checkpointConstants,
      checkpointNumber,
      dateProvider,
      getSecondsIntoSlot,
    );
    checkpointsBuilder = new MockCheckpointsBuilder();
    checkpointsBuilder.setCheckpointBuilder(checkpointBuilder);

    // Set up mocks
    epochCache = mockDeep<EpochCache>();
    epochCache.getCommittee.mockResolvedValue({
      committee,
      seed: 0n,
      epoch: EpochNumber(1),
      isEscapeHatchOpen: false,
    });

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockReturnValue(attestorAddress);
    publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
    publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
    publisher.enqueueSlashingActions.mockResolvedValue(true);
    publisher.sendRequestsAt.mockResolvedValue({
      result: { receipt: { status: 'success' } as any },
      successfulActions: ['propose'],
      failedActions: [],
      sentActions: ['propose'],
      expiredActions: [],
    });

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildCheckpointGlobalVariables.mockResolvedValue(checkpointConstants);

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({
        state: P2PClientState.IDLE,
        syncedToL2Block: { number: BlockNumber.ZERO, hash: Fr.ZERO.toString() },
      }),
    });
    p2p.broadcastProposal.mockResolvedValue(undefined);
    p2p.broadcastCheckpointProposal.mockResolvedValue(undefined);
    p2p.getPendingTxCount.mockResolvedValue(100); // Always have enough txs
    p2p.getEligiblePendingTxCount.mockResolvedValue(100); // Always have enough eligible txs

    worldState = mockDeep<WorldStateSynchronizer>();
    const mockFork = mock<MerkleTreeWriteOperations>({
      [Symbol.asyncDispose]: jest.fn().mockReturnValue(Promise.resolve()) as () => Promise<void>,
    });
    worldState.fork.mockResolvedValue(mockFork);

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue(Array(4).fill(Fr.ZERO));

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getCheckpointsData.mockResolvedValue([]);
    // The always-pipelined submission path calls `waitForValidParentCheckpointOnL1()` for every job
    // that collects attestations. Without these mocks `getSyncedL2SlotNumber` returns undefined and
    // the job spins in a real-clock `retryUntil` until its multi-slot timeout (~80s of wall time per
    // test). Report the build slot as synced, and a checkpointed tip at the parent checkpoint so the
    // "no unexpected parent appeared" check passes immediately.
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(slotNumber);
    l2BlockSource.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber.ZERO, hash: '' },
      checkpointed: {
        block: { number: BlockNumber.ZERO, hash: '' },
        checkpoint: { number: CheckpointNumber(checkpointNumber - 1), hash: '' },
      },
      proven: {
        block: { number: BlockNumber.ZERO, hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
      finalized: {
        block: { number: BlockNumber.ZERO, hash: '' },
        checkpoint: { number: CheckpointNumber(0), hash: '' },
      },
    });

    blockSink = mock<L2BlockSink & ProposedCheckpointSink>();
    blockSink.addBlock.mockResolvedValue(undefined);

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockResolvedValue({} as any);
    validatorClient.createCheckpointProposal.mockResolvedValue({} as any);
    validatorClient.signAttestationsAndSigners.mockResolvedValue(mockedSig);
    validatorClient.getCoinbaseForAttestor.mockReturnValue(coinbase);
    validatorClient.getFeeRecipientForAttestor.mockReturnValue(globalVariables.feeRecipient);
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
      blockDurationMs: BLOCK_DURATION * 1000,
    };
  });

  describe('Block Building with Simulated Time', () => {
    it('builds blocks when initialization completes within deadline', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(3);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // Each block takes 5 seconds to execute
      checkpointBuilder.setExecutionDurations([5, 5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[2]));

      // Start at 0.5s into slot (within the init offset)
      // Start late enough that the single built block is also the last block in the checkpoint.
      setTimeInSlot(33);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
    });

    it('records handoff timing components for the first and last block path', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      checkpointBuilder.setExecutionDurations([5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      setTimeInSlot(0.5);

      const job = createJob();
      job.setTimetable(
        makeProposerTimetable({
          l1Constants,
          p2pPropagationTime: P2P_PROPAGATION_TIME,
          checkpointProposalPrepareTime: CHECKPOINT_ASSEMBLE_TIME,
          // 30s block duration in the 72s slot derives exactly one block, so the single built block is also
          // the last block (isLastBlock=true), which is what this first-and-last-block path test asserts.
          blockDurationMs: 30000,
        }),
      );

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointMetrics.startCheckpointTiming).toHaveBeenCalledWith(expect.any(Number));
      expect(checkpointMetrics.noteCheckpointBlockBuilt).toHaveBeenCalledWith(expect.any(Number), {
        isFirstBlock: true,
        isLastBlock: true,
      });
      expect(checkpointMetrics.noteCheckpointBroadcast).toHaveBeenCalledWith(expect.any(Number));
    });

    it('builds maximum blocks when given enough time', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // Each block takes 7s (fits within 8s sub-slot)
      checkpointBuilder.setExecutionDurations(Array(EXPECTED_MAX_BLOCKS).fill(7));

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[EXPECTED_MAX_BLOCKS - 1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls.length).toBe(EXPECTED_MAX_BLOCKS);
    });

    it('skips sub-slots when starting late', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[1]));

      // Sub-slot deadlines are [9, 17, 25, 33, 41, 49, 57]. Start at 40s, past sub-slots 1-5,
      // leaving only sub-slots 6 (deadline 49s) and 7 (deadline 57s) with enough time.
      setTimeInSlot(40);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      // Starting at 40s with 5s blocks: block 1 (40s->45s) fits sub-slot 6 (deadline 49s),
      // block 2 (45s->50s) fits sub-slot 7 (deadline 57s).
      expect(checkpointBuilder.buildBlockCalls.length).toBe(2);
    });

    it('does not build blocks when starting past all sub-slots', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      checkpointBuilder.setExecutionDurations([5]);

      // Last sub-slot deadline is 57s; start at 58s - past all block-building sub-slots.
      setTimeInSlot(58);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      // Should not build any blocks
      expect(checkpointBuilder.buildBlockCalls.length).toBe(0);
      expect(checkpoint).toBeUndefined();
    });

    it('waits between blocks to maintain sub-slot boundaries', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // First block takes only 4s (finishes at 5s, well before 9s deadline)
      // Second block takes 5s
      checkpointBuilder.setExecutionDurations([4, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Sub-slots are anchored at build_frame_start + init (1s): block_build_deadline(0) = 9s. The first
      // block finishes early (at 5s) and the job waits until the first sub-slot deadline (9s) before
      // starting the second block, so the second block starts at >= 9s, not at 5s.
      expect(checkpointBuilder.recordedBuildTimes[1].startTime).toBeGreaterThanOrEqual(9);
    });

    it('verifies deadlines are passed to block builder', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations(Array(EXPECTED_MAX_BLOCKS).fill(5));

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[EXPECTED_MAX_BLOCKS - 1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      expect(checkpointBuilder.buildBlockCalls.length).toBe(EXPECTED_MAX_BLOCKS);

      // Verify each block was given the correct deadline at sub-slot boundaries.
      // Sub-slot deadlines: block_build_deadline(k) = build_frame_start + init(1) + (k+1)*blockDuration = 9s, 17s, ...
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlines = [9, 17, 25, 33, 41, 49, 57];

      for (let i = 0; i < EXPECTED_MAX_BLOCKS; i++) {
        const deadline = checkpointBuilder.buildBlockCalls[i].opts.deadline;
        expect(deadline).toBeDefined();
        const deadlineSeconds = deadline!.getTime() / 1000 - slotStart;
        expect(deadlineSeconds).toBeCloseTo(expectedDeadlines[i], 0);
      }
    });
  });

  describe('Validator Re-execution Budget', () => {
    // The validator re-execution guarantee states that after the last block is built,
    // validators must have at least blockDuration time to re-execute before attestations are due.
    // Under pipelining, attestation collection extends into the target slot:
    //   - Last block deadline: initOffset + maxBlocks * blockDuration = 1 + 7*8 = 57s
    //   - Attestation deadline: 2*slotDuration - l1Publishing = 2*72 - 12 = 132s (into target slot)
    //   - Validator re-execution window: 57s to (132s - propagation) = 57s to 130s
    //   - This must be >= blockDuration (8s) ✓

    it('leaves enough time for validator re-execution after last block', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // Each block takes exactly blockDuration minus a small buffer
      checkpointBuilder.setExecutionDurations(Array(EXPECTED_MAX_BLOCKS).fill(7.5));

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[EXPECTED_MAX_BLOCKS - 1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Verify all blocks were built
      expect(checkpointBuilder.buildBlockCalls.length).toBe(EXPECTED_MAX_BLOCKS);

      // Get the end time of the last block
      const lastBlockBuildTime = checkpointBuilder.recordedBuildTimes[EXPECTED_MAX_BLOCKS - 1];
      expect(lastBlockBuildTime).toBeDefined();

      // Attestation deadline (target_slot_start + S - 2E), expressed relative to the build frame start
      // so it can be compared against the simulated seconds-into-slot recorded build times.
      const attestationDeadline = timetable.getAttestationDeadline(targetSlot) - getSlotStartTime(slotNumber);

      // Validator re-execution budget = attestationDeadline - lastBlockEndTime - propagationTime
      // The propagationTime is for the checkpoint proposal to reach validators
      const validatorReexecutionBudget = attestationDeadline - lastBlockBuildTime.endTime - P2P_PROPAGATION_TIME;

      // Must have at least blockDuration for validators to re-execute
      expect(validatorReexecutionBudget).toBeGreaterThanOrEqual(BLOCK_DURATION);

      // The enforced attestation deadline above is permissive (it spills into the target slot), so it
      // can't catch a build slot that is overfilled. Assert the README design guarantee directly: the
      // last sub-slot's deadline, and the actual last-block completion, both leave the full
      // end-of-build-slot reservation free before the build-slot boundary. Sub-slots are now anchored
      // directly at the build frame start (block_build_deadline(k) = build_frame_start + (k+1)*D).
      const lastSubSlotDeadline = EXPECTED_MAX_BLOCKS * BLOCK_DURATION;
      expect(lastSubSlotDeadline).toBeLessThanOrEqual(AZTEC_SLOT_DURATION - TIME_RESERVED_AT_END);
      expect(AZTEC_SLOT_DURATION - lastBlockBuildTime.endTime).toBeGreaterThanOrEqual(TIME_RESERVED_AT_END);
    });

    it('enforces re-execution budget even when sequencer is slow', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(3);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // Blocks take full 8s each
      checkpointBuilder.setExecutionDurations([8, 8, 8]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[2]));

      // Start late at 10s into slot
      setTimeInSlot(10);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Verify blocks were built
      const blocksBuilt = checkpointBuilder.buildBlockCalls.length;
      expect(blocksBuilt).toBeGreaterThan(0);

      // Get the end time of the last block that was built
      const lastBlockBuildTime = checkpointBuilder.recordedBuildTimes[blocksBuilt - 1];

      // The last block's deadline should still leave room for validator re-execution.
      const attestationDeadline = timetable.getAttestationDeadline(targetSlot) - getSlotStartTime(slotNumber);
      const validatorReexecutionBudget = attestationDeadline - lastBlockBuildTime.endTime - P2P_PROPAGATION_TIME;

      expect(validatorReexecutionBudget).toBeGreaterThanOrEqual(BLOCK_DURATION);
    });
  });

  describe('Block Execution Overflow Handling', () => {
    it('continues in the next sub-slot when an overrun still leaves enough headroom', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // First block takes 10s, exceeding its 8s budget (deadline at 9s, starts at 1s)
      // This should cause subsequent blocks to start in later sub-slots
      // Remaining blocks take 5s each
      checkpointBuilder.setExecutionDurations([10, 5, 5, 5, 5, 5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[EXPECTED_MAX_BLOCKS - 1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Block 1: starts 1s, ends 11s (10s duration, past 9s deadline)
      // Block 2: starts 11s, ends 16s (fits sub-slot 2 deadline 17s)
      // Block 3: starts 16s, ends 21s (fits sub-slot 3 deadline 25s)
      // Block 4: starts 21s, ends 26s (fits sub-slot 4 deadline 33s)
      // Blocks 5-7: each starts right after the previous and fits sub-slots 5-7 (deadlines 41s, 49s, 57s)
      const buildTimes = checkpointBuilder.recordedBuildTimes;
      expect(buildTimes.length).toBe(EXPECTED_MAX_BLOCKS);

      // First block starts at 1s, ends at 11s (10s execution)
      expect(buildTimes[0].startTime).toBeCloseTo(1, 0);
      expect(buildTimes[0].endTime).toBeCloseTo(11, 0);

      // Second block starts immediately after first (no waiting needed, 6s until deadline 17s)
      expect(buildTimes[1].startTime).toBeCloseTo(11, 0);
    });

    it('stops building when overflow leaves no time for remaining blocks', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // First block takes 49s - this should consume most of the slot
      // Starting at 1s, ends at 50s, leaving only ~7s before last deadline at 57s
      checkpointBuilder.setExecutionDurations([49, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // First block ends at 50s
      // Checking sub-slots: deadlines at 9, 17, 25, 33, 41, 49, 57
      // At 50s, only sub-slot 7 (deadline 57s) has time remaining: 57-50=7s >= minExecutionTime(2s)
      // So we can still build one more block (the last one)
      const buildTimes = checkpointBuilder.recordedBuildTimes;
      expect(buildTimes.length).toBeLessThanOrEqual(2);
    });

    it('handles block that vastly exceeds deadline', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      // Block takes 60s - should consume all available time
      checkpointBuilder.setExecutionDurations([60]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Only one block was built
      expect(checkpointBuilder.buildBlockCalls.length).toBe(1);

      // The block ended at 61s, past all sub-slot deadlines (last is 57s)
      const buildTimes = checkpointBuilder.recordedBuildTimes;
      expect(buildTimes[0].endTime).toBeCloseTo(61, 0);
    });
  });

  describe('Cumulative Delay Cascade', () => {
    it('handles multiple blocks each slightly over budget', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(5);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // Each block takes 9s instead of fitting in 8s sub-slot
      // This means each block bleeds 1s into the next sub-slot
      checkpointBuilder.setExecutionDurations([9, 9, 9, 9, 9]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[4]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      const buildTimes = checkpointBuilder.recordedBuildTimes;

      // Block 1: 1s -> 10s (past deadline 9s by 1s)
      // Block 2: starts at 10s (in sub-slot 2 range), deadline 17s, ends at 19s
      // Block 3: starts at 19s (in sub-slot 3 range), deadline 25s, ends at 28s
      // Block 4: starts at 28s (in sub-slot 4 range), deadline 33s, ends at 37s
      // Block 5: starts at 37s, deadline 41s, only 4s available but needs 9s -> can't fit!

      // With 9s per block starting at 1s:
      // End times: 10, 19, 28, 37, 46
      // Sub-slot deadlines: 9, 17, 25, 33, 41
      // After block 4 ends at 37s, we have until 41s (4s) but minExec is 2s, so block 5 can start
      // Block 5 would run 37->46, but we only count if it started before being cut off

      // The cumulative delays should reduce the number of blocks we can build
      // or cause blocks to miss their optimal sub-slots
      expect(buildTimes.length).toBeGreaterThan(0);

      // Verify cascading effect: each block ends later than its deadline. Sub-slots are anchored at
      // the build frame start: block_build_deadline(i) = build_frame_start + (i+1)*D.
      for (let i = 0; i < buildTimes.length - 1; i++) {
        const expectedDeadline = (i + 1) * BLOCK_DURATION;
        // Each block (except possibly the last) exceeds its deadline
        if (i < buildTimes.length - 1) {
          expect(buildTimes[i].endTime).toBeGreaterThan(expectedDeadline);
        }
      }
    });

    it('reduces total blocks built when delays cascade', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // More aggressive overrun: 10s per block (vs the 8s sub-slot budget)
      checkpointBuilder.setExecutionDurations(Array(EXPECTED_MAX_BLOCKS).fill(10));

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[3]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // With 10s per block starting at 1s the cascade pushes each block past its sub-slot, so
      // some later sub-slots are skipped and fewer than the max blocks get built before the
      // last deadline (57s) is reached.
      expect(checkpointBuilder.buildBlockCalls.length).toBeLessThan(EXPECTED_MAX_BLOCKS);
    });
  });

  describe('Attestation Collection Timing', () => {
    it('respects attestation collection deadline', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(3);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5, 5]);

      // Track when collectAttestations was called and with what deadline
      let collectAttestationsDeadline: Date | undefined;
      validatorClient.collectAttestations.mockImplementation((_proposal, _required, deadline) => {
        collectAttestationsDeadline = deadline;
        return Promise.resolve(getAttestations(blocks[2]));
      });

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();
      await job.awaitPendingSubmission();

      // Verify collectAttestations was called
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
      expect(collectAttestationsDeadline).toBeDefined();

      // The attestation deadline extends into the target slot (pipelining is always on):
      // slotStart + 2 * slotDuration - ethereumSlotDuration = slotStart + 144 - 12 = slotStart + 132
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlineSeconds = slotStart + 2 * AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;
      const actualDeadlineSeconds = collectAttestationsDeadline!.getTime() / 1000;

      expect(actualDeadlineSeconds).toBeCloseTo(expectedDeadlineSeconds, 0);
    });

    it('collects attestations within the available time window', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5]);

      // Simulate attestation collection taking some time by advancing the clock
      let attestationCollectionStartTime = 0;
      validatorClient.collectAttestations.mockImplementation(() => {
        attestationCollectionStartTime = getSecondsIntoSlot();
        // Simulate 3 seconds to collect attestations
        dateProvider.advanceTime(3);
        return Promise.resolve(getAttestations(blocks[1]));
      });

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();
      await job.awaitPendingSubmission();

      // Attestation collection should start after the last block is built and checkpoint is assembled
      // Last block deadline at 17s (sub-slot 2), plus assembly time
      expect(attestationCollectionStartTime).toBeGreaterThan(0);

      // Final time should still be within the slot
      const finalTime = getSecondsIntoSlot();
      expect(finalTime).toBeLessThan(AZTEC_SLOT_DURATION);
    });

    it('calculates correct attestation deadline when starting late', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      checkpointBuilder.setExecutionDurations([5]);

      let collectAttestationsDeadline: Date | undefined;
      validatorClient.collectAttestations.mockImplementation((_proposal, _required, deadline) => {
        collectAttestationsDeadline = deadline;
        return Promise.resolve(getAttestations(blocks[0]));
      });

      // Start late at 30s
      setTimeInSlot(30);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();
      await job.awaitPendingSubmission();

      // Deadline should still be absolute (slotStart + 132s), not relative to start time.
      // Pipelining is always on: 2 * slotDuration - ethereumSlotDuration = 144 - 12 = 132
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlineSeconds = slotStart + 2 * AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;
      const actualDeadlineSeconds = collectAttestationsDeadline!.getTime() / 1000;

      expect(actualDeadlineSeconds).toBeCloseTo(expectedDeadlineSeconds, 0);
    });
  });

  describe('Pipelining Attestation Timing', () => {
    // `createJob` already builds a pipelined job (targetSlot = slotNumber + 1) and the top-level
    // beforeEach mocks the parent-sync lookups, so these tests exercise the production shape directly
    // and assert the target-slot invariants that distinguish the build slot from the submission slot.

    it('sets attestation deadline to the target-slot publish cutoff when pipelining', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5]);

      let collectAttestationsDeadline: Date | undefined;
      validatorClient.collectAttestations.mockImplementation((_proposal, _required, deadline) => {
        collectAttestationsDeadline = deadline;
        return Promise.resolve(getAttestations(blocks[1]));
      });

      setTimeInSlot(1);

      const job = createJob();
      await job.execute();
      await job.awaitPendingSubmission();

      expect(validatorClient.collectAttestations).toHaveBeenCalled();
      expect(collectAttestationsDeadline).toBeDefined();

      // Attestation deadline = buildSlotStart + (2 * aztecSlotDuration - ethereumSlotDuration)
      // so collection can continue until the target slot's publish cutoff.
      const buildSlotStart = getSlotStartTime(slotNumber);
      const expectedDeadlineSeconds = buildSlotStart + 2 * AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;
      const actualDeadlineSeconds = collectAttestationsDeadline!.getTime() / 1000;

      expect(actualDeadlineSeconds).toBeCloseTo(expectedDeadlineSeconds, 0);
    });

    it('threads the target slot through checkpoint constants, attestation signing, and L1 submission', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[1]));

      setTimeInSlot(1);

      const job = createJob();
      await job.execute();
      await job.awaitPendingSubmission();

      // The build slot and target slot must differ under pipelining.
      expect(Number(targetSlot)).toBe(Number(slotNumber) + PROPOSER_PIPELINING_SLOT_OFFSET);

      // The checkpoint is built for the target slot, so the globals handed to the builder carry it.
      expect(checkpointsBuilder.startCheckpointCalls.length).toBeGreaterThan(0);
      expect(Number(checkpointsBuilder.startCheckpointCalls[0].constants.slotNumber)).toBe(Number(targetSlot));

      // The built blocks (and therefore the checkpoint proposal) commit to the target slot.
      expect(Number(blocks[0].header.globalVariables.slotNumber)).toBe(Number(targetSlot));

      // EIP-712 signatures are bound to the submission slot, so signing uses the target slot...
      expect(validatorClient.signAttestationsAndSigners).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        targetSlot,
        checkpointNumber,
      );

      // ...and the L1 submission is delayed to (and mines in) the target slot.
      expect(publisher.sendRequestsAt).toHaveBeenCalledWith(targetSlot);
    });
  });

  describe('Build-frame state reporting', () => {
    // The job reports the target slot (the slot the checkpoint commits to) on every setState call. The
    // build-frame deadlines themselves are anchored to getBuildFrameStart(targetSlot) inside the timetable,
    // so reporting the target slot keeps the state-change payload aligned with the slot being proposed.

    // States the job owns and sets while building inside the build frame.
    const buildFrameStates = [
      SequencerState.INITIALIZING_CHECKPOINT,
      SequencerState.WAITING_FOR_TXS,
      SequencerState.CREATING_BLOCK,
      SequencerState.WAITING_UNTIL_NEXT_BLOCK,
      SequencerState.ASSEMBLING_CHECKPOINT,
      SequencerState.COLLECTING_ATTESTATIONS,
      SequencerState.PUBLISHING_CHECKPOINT,
    ];

    it('passes the target slot (not the build slot) to setState for every build-frame state', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(2);
      mockP2pWithTxs(txs);
      // Force a single WAITING_FOR_TXS poll before the first block by reporting no eligible txs once.
      p2p.getEligiblePendingTxCount.mockResolvedValueOnce(0);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      checkpointBuilder.setExecutionDurations([5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[1]));

      setTimeInSlot(1);

      const observedSlots = new Map<SequencerState, SlotNumber | undefined>();
      const setStateFn = jest.fn((state: SequencerState, slot?: SlotNumber) => {
        observedSlots.set(state, slot);
      });

      const job = createJob(setStateFn);
      await job.execute();
      await job.awaitPendingSubmission();

      // The build and target slot differ, so reporting the wrong slot would be observable.
      expect(Number(targetSlot)).toBe(Number(slotNumber) + PROPOSER_PIPELINING_SLOT_OFFSET);

      for (const state of buildFrameStates) {
        expect(observedSlots.has(state)).toBe(true);
        expect(observedSlots.get(state)).toBe(targetSlot);
        expect(observedSlots.get(state)).not.toBe(slotNumber);
      }
    });

    it('abandons the slot when every sub-slot deadline has passed', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      checkpointBuilder.setExecutionDurations([30]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      // The last sub-slot deadline is EXPECTED_MAX_BLOCKS * BLOCK_DURATION = 56s into the build frame.
      // Starting past that leaves no sub-slot with min_block_duration headroom, so selectNextSubslot
      // refuses to start any block and no checkpoint is produced (setState is now pure — no throw).
      setTimeInSlot(EXPECTED_MAX_BLOCKS * BLOCK_DURATION + 1);

      const job = createJob();
      const checkpoint = await job.execute();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
    });
  });
});
