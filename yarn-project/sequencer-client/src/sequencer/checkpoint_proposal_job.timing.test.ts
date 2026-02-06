import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  MerkleTreeWriteOperations,
  PublicProcessorLimits,
  ResolvedSequencerConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
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
  makeTx,
  mockTxIterator,
} from '../test/utils.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerTimetable } from './timetable.js';
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
    constants: CheckpointGlobalVariables & { timestamp: bigint },
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
    opts: PublicProcessorLimits,
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
 * 1. Advances simulated time instead of actually sleeping in waitUntilTimeInSlot
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
   * Override to advance simulated time instead of actually sleeping.
   * This makes the test run instantly while still simulating time passage.
   */
  protected override async waitUntilTimeInSlot(targetSecondsIntoSlot: number): Promise<void> {
    await Promise.resolve(); // Satisfy async requirement
    const currentSeconds = this.getSecondsIntoSlotFn();
    if (targetSecondsIntoSlot > currentSeconds) {
      const waitTime = targetSecondsIntoSlot - currentSeconds;
      this.testDateProvider.advanceTime(waitTime);
    }
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
  public setTimetable(newTimetable: SequencerTimetable): void {
    this.timetable = newTimetable;
  }

  /** Get timetable for testing */
  public getTimetable(): SequencerTimetable {
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
  const L1_PUBLISHING_TIME = 12; // seconds to publish to L1
  const P2P_PROPAGATION_TIME = 2; // seconds for p2p message propagation

  // Calculated: maxBlocks = 5
  const EXPECTED_MAX_BLOCKS = 5;

  let dateProvider: ManualDateProvider;
  let timetable: SequencerTimetable;
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
  let blockSink: MockProxy<L2BlockSink>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let metrics: MockProxy<SequencerMetrics>;

  let l1Constants: L1RollupConstants;
  let config: ResolvedSequencerConfig;

  // Test state
  let slotNumber: SlotNumber;
  let checkpointNumber: CheckpointNumber;
  let epoch: EpochNumber;
  let globalVariables: GlobalVariables;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const gasFees = GasFees.empty();
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
        slotNumber,
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
    p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
  }

  /** Create attestations for the given block */
  function getAttestations(block: L2Block) {
    return [createCheckpointAttestation(block, mockedSig, committee[0])];
  }

  /** Create a TimingTestCheckpointProposalJob with current mocks */
  function createJob(): TimingTestCheckpointProposalJob {
    const setStateFn = jest.fn();
    const eventEmitter = new EventEmitter() as TypedEventEmitter<SequencerEvents>;

    return new TimingTestCheckpointProposalJob(
      dateProvider,
      getSecondsIntoSlot,
      epoch,
      slotNumber,
      checkpointNumber,
      BlockNumber.ZERO,
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
      config,
      timetable,
      slasherClient,
      epochCache,
      dateProvider,
      metrics,
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
    };

    // Initialize test state
    slotNumber = SlotNumber(1);
    checkpointNumber = CheckpointNumber(1);
    epoch = EpochNumber(0);

    const feeRecipient = await AztecAddress.random();
    globalVariables = new GlobalVariables(
      chainId,
      version,
      BlockNumber(1),
      slotNumber,
      BigInt(getSlotStartTime(slotNumber)),
      coinbase,
      feeRecipient,
      gasFees,
    );

    // Initialize manual date provider at slot start.
    // Time only advances via explicit advanceTime() calls, never from real clock.
    dateProvider = new ManualDateProvider(getSlotStartTime(slotNumber) * 1000);

    // Create timetable with realistic production values
    timetable = new SequencerTimetable(
      {
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        l1PublishingTime: L1_PUBLISHING_TIME,
        p2pPropagationTime: P2P_PROPAGATION_TIME,
        blockDurationMs: BLOCK_DURATION * 1000,
        enforce: true,
      },
      undefined,
      createLogger('test:timetable'),
    );

    // Create timing-aware checkpoint builder
    const checkpointConstants: CheckpointGlobalVariables & { timestamp: bigint } = { ...globalVariables };
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
    publisher.sendRequests.mockResolvedValue({
      result: { receipt: { status: 'success' } as any, errorMsg: undefined },
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

    worldState = mockDeep<WorldStateSynchronizer>();
    const mockFork = mock<MerkleTreeWriteOperations>({ [Symbol.dispose]: jest.fn() });
    worldState.fork.mockResolvedValue(mockFork);

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue(Array(4).fill(Fr.ZERO));

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([]);

    blockSink = mock<L2BlockSink>();
    blockSink.addBlock.mockResolvedValue(undefined);

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockResolvedValue({} as any);
    validatorClient.createCheckpointProposal.mockResolvedValue({} as any);
    validatorClient.signAttestationsAndSigners.mockResolvedValue(mockedSig);
    validatorClient.getCoinbaseForAttestor.mockReturnValue(coinbase);
    validatorClient.getFeeRecipientForAttestor.mockReturnValue(globalVariables.feeRecipient);

    slasherClient = mock<SlasherClientInterface>();
    slasherClient.getProposerActions.mockResolvedValue([]);

    metrics = mockDeep<SequencerMetrics>();

    config = {
      ...DefaultSequencerConfig,
      enforceTimeTable: true,
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
      setTimeInSlot(0.5);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
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

      // Start at 24s - past sub-slots 1, 2, 3
      // Should start at sub-slot 4 (deadline 33s)
      setTimeInSlot(24);

      const job = createJob();
      job.setTimetable(timetable);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      // Starting at 24s with 5s blocks: block 1 (24s->29s) fits sub-slot 4 (deadline 33s),
      // block 2 (29s->34s) fits sub-slot 5 (deadline 41s)
      expect(checkpointBuilder.buildBlockCalls.length).toBe(2);
    });

    it('does not build blocks when starting past all sub-slots', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      checkpointBuilder.setExecutionDurations([5]);

      // Start at 40s - past all block-building sub-slots
      setTimeInSlot(40);

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

      // Second block should have started at 9s (sub-slot 2 start), not at 5s
      // The job should have waited from 5s to 9s
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

      // Verify each block was given the correct deadline at sub-slot boundaries
      // Sub-slot deadlines: 9s, 17s, 25s, 33s, 41s (initOffset + n * blockDuration)
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlines = [9, 17, 25, 33, 41];

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
    // Timeline:
    //   - Last block deadline: initOffset + maxBlocks * blockDuration = 1 + 5*8 = 41s
    //   - Attestation deadline: slotDuration - l1Publishing - 2*propagation = 72 - 12 - 4 = 56s
    //   - Validator re-execution window: 41s to (56s - propagation) = 41s to 54s = 13s
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

      // Verify all 5 blocks were built
      expect(checkpointBuilder.buildBlockCalls.length).toBe(EXPECTED_MAX_BLOCKS);

      // Get the end time of the last block
      const lastBlockBuildTime = checkpointBuilder.recordedBuildTimes[EXPECTED_MAX_BLOCKS - 1];
      expect(lastBlockBuildTime).toBeDefined();

      // Calculate attestation deadline: slotDuration - l1PublishingTime - 2*p2pPropagationTime
      const attestationDeadline = AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME - 2 * P2P_PROPAGATION_TIME;

      // Validator re-execution budget = attestationDeadline - lastBlockEndTime - propagationTime
      // The propagationTime is for the checkpoint proposal to reach validators
      const validatorReexecutionBudget = attestationDeadline - lastBlockBuildTime.endTime - P2P_PROPAGATION_TIME;

      // Must have at least blockDuration for validators to re-execute
      expect(validatorReexecutionBudget).toBeGreaterThanOrEqual(BLOCK_DURATION);
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

      // The last block's deadline should still leave room for validator re-execution
      const attestationDeadline = AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME - 2 * P2P_PROPAGATION_TIME;
      const validatorReexecutionBudget = attestationDeadline - lastBlockBuildTime.endTime - P2P_PROPAGATION_TIME;

      expect(validatorReexecutionBudget).toBeGreaterThanOrEqual(BLOCK_DURATION);
    });
  });

  describe('Block Execution Overflow Handling', () => {
    it('handles block that finishes after its deadline by skipping next sub-slot', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(EXPECTED_MAX_BLOCKS);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // First block takes 10s, exceeding its 8s budget (deadline at 9s, starts at 1s)
      // This should cause subsequent blocks to start in later sub-slots
      // Remaining blocks take 5s each
      checkpointBuilder.setExecutionDurations([10, 5, 5, 5, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[EXPECTED_MAX_BLOCKS - 1]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Block 1: starts 1s, ends 11s (10s duration, past 9s deadline)
      // Block 2: starts 11s, ends 16s (fits sub-slot 2 deadline 17s)
      // Block 3: starts 16s, ends 21s (fits sub-slot 3 deadline 25s)
      // Block 4: starts 21s, ends 26s (fits sub-slot 4 deadline 33s)
      // Block 5: starts 26s, ends 31s (fits sub-slot 5 deadline 41s)
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
      // First block takes 35s - this should consume most of the slot
      // Starting at 1s, ends at 36s, leaving only ~5s before last deadline at 41s
      checkpointBuilder.setExecutionDurations([35, 5]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // First block ends at 36s
      // Checking sub-slots: deadlines at 9, 17, 25, 33, 41
      // At 36s, only sub-slot 5 (deadline 41s) has time remaining: 41-36=5s >= minExecutionTime(2s)
      // So we can still build one more block (the last one)
      const buildTimes = checkpointBuilder.recordedBuildTimes;
      expect(buildTimes.length).toBeLessThanOrEqual(2);
    });

    it('handles block that vastly exceeds deadline', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(1);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(blocks, [[txs[0]]]);
      // Block takes 45s - should consume all available time
      checkpointBuilder.setExecutionDurations([45]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[0]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // Only one block was built
      expect(checkpointBuilder.buildBlockCalls.length).toBe(1);

      // The block ended at 46s, past all sub-slot deadlines (last is 41s)
      const buildTimes = checkpointBuilder.recordedBuildTimes;
      expect(buildTimes[0].endTime).toBeCloseTo(46, 0);
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

      // Verify cascading effect: each block ends later than its deadline
      for (let i = 0; i < buildTimes.length - 1; i++) {
        const expectedDeadline = timetable.initializationOffset + (i + 1) * BLOCK_DURATION;
        // Each block (except possibly the last) exceeds its deadline
        if (i < buildTimes.length - 1) {
          expect(buildTimes[i].endTime).toBeGreaterThan(expectedDeadline);
        }
      }
    });

    it('reduces total blocks built when delays cascade', async () => {
      const { blocks, txs } = await createTestBlocksAndTxs(5);
      mockP2pWithTxs(txs);
      checkpointBuilder.seedBlocks(
        blocks,
        blocks.map((_, i) => [txs[i]]),
      );
      // More aggressive overrun: 10s per block
      checkpointBuilder.setExecutionDurations([10, 10, 10, 10, 10]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(blocks[3]));

      setTimeInSlot(1);

      const job = createJob();
      job.setTimetable(timetable);

      await job.execute();

      // With 10s per block starting at 1s:
      // Block 1: 1s -> 11s
      // Block 2: 11s -> 21s
      // Block 3: 21s -> 31s
      // Block 4: 31s -> 41s (exactly at last deadline)
      // Block 5: would start at 41s but deadline is 41s, so no time left

      // Should build fewer than max blocks due to cascading delays
      expect(checkpointBuilder.buildBlockCalls.length).toBeLessThanOrEqual(4);
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

      // Verify collectAttestations was called
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
      expect(collectAttestationsDeadline).toBeDefined();

      // The attestation deadline uses PUBLISHING_CHECKPOINT state, which is:
      // slotStart + slotDuration - l1PublishingTime = slotStart + 72 - 12 = slotStart + 60
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlineSeconds = slotStart + AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME;
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

      // Deadline should still be absolute (slotStart + 60s), not relative to start time
      // Uses PUBLISHING_CHECKPOINT state: slotDuration - l1PublishingTime = 72 - 12 = 60
      const slotStart = getSlotStartTime(slotNumber);
      const expectedDeadlineSeconds = slotStart + AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME;
      const actualDeadlineSeconds = collectAttestationsDeadline!.getTime() / 1000;

      expect(actualDeadlineSeconds).toBeCloseTo(expectedDeadlineSeconds, 0);
    });
  });
});
