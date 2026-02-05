import {
  NUM_BLOCK_END_BLOB_FIELDS,
  NUM_CHECKPOINT_END_MARKER_FIELDS,
  NUM_FIRST_BLOCK_END_BLOB_FIELDS,
} from '@aztec/blob-lib/encoding';
import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
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
import { TestDateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation, L2Block, type L2BlockSink, type L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import {
  type BuildBlockInCheckpointResult,
  type MerkleTreeWriteOperations,
  NoValidTxsError,
  type ResolvedSequencerConfig,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockProposal, CheckpointProposal } from '@aztec/stdlib/p2p';
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
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import {
  MockCheckpointBuilder,
  MockCheckpointsBuilder,
  createCheckpointAttestation,
  makeBlock,
  makeTx,
  mockPendingTxs,
  mockTxIterator,
  setupTxsAndBlock,
} from '../test/utils.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerTimetable } from './timetable.js';

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
  let blockSink: MockProxy<L2BlockSink>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let dateProvider: TestDateProvider;
  let metrics: MockProxy<SequencerMetrics>;
  let job: TestCheckpointProposalJob;

  let timetable: SequencerTimetable;
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
    };

    dateProvider = new TestDateProvider();
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

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockImplementation(() => attestorAddress);
    publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
    publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
    publisher.enqueueSlashingActions.mockResolvedValue(true);
    publisher.sendRequests.mockResolvedValue({
      result: { receipt: { status: 'success' } as TransactionReceipt, errorMsg: undefined },
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

    worldState = mockDeep<WorldStateSynchronizer>();
    const mockFork = mock<MerkleTreeWriteOperations>({ [Symbol.dispose]: jest.fn() });
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
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue(Array(4).fill(Fr.ZERO));

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([]);

    blockSink = mock<L2BlockSink>();
    blockSink.addBlock.mockResolvedValue(undefined);

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockImplementation(
      async (blockHeader, indexWithinCheckpoint, inHash, archiveRoot, txs) => {
        const txHashes = await Promise.all((txs ?? []).map((tx: Tx) => tx.getTxHash()));
        return new BlockProposal(
          blockHeader,
          IndexWithinCheckpoint(indexWithinCheckpoint),
          inHash,
          archiveRoot,
          txHashes,
          mockedSig,
        );
      },
    );
    validatorClient.createCheckpointProposal.mockImplementation(
      async (checkpointHeader, archiveRoot, lastBlockInfo) => {
        if (!lastBlockInfo) {
          return new CheckpointProposal(checkpointHeader, archiveRoot, mockedSig);
        }
        const txHashes = await Promise.all((lastBlockInfo.txs ?? []).map((tx: Tx) => tx.getTxHash()));
        return new CheckpointProposal(checkpointHeader, archiveRoot, mockedSig, {
          blockHeader: lastBlockInfo.blockHeader,
          indexWithinCheckpoint: lastBlockInfo.indexWithinCheckpoint,
          txHashes,
          signature: mockedSig,
          // Note: signedTxs omitted since publishTxsWithProposals is false in tests
        });
      },
    );
    validatorClient.signAttestationsAndSigners.mockImplementation(() => Promise.resolve(getSignatures()[0].signature));
    validatorClient.getCoinbaseForAttestor.mockReturnValue(coinbase);
    validatorClient.getFeeRecipientForAttestor.mockReturnValue(feeRecipient);

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
    };

    timetable = new SequencerTimetable({
      ethereumSlotDuration,
      aztecSlotDuration: slotDuration,
      l1PublishingTime: ethereumSlotDuration,
      enforce: config.enforceTimeTable,
    });

    job = createCheckpointProposalJob();
  });

  describe('single block mode', () => {
    beforeEach(() => {
      // Single block mode: no blockDurationMs set
      job.setTimetable(
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          enforce: config.enforceTimeTable,
        }),
      );
    });

    it('builds one block with sufficient txs', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 2, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('skips building if not enough txs and not forced', async () => {
      const txs = await Promise.all([makeTx(1, chainId)]);
      mockPendingTxs(p2p, txs);

      job.updateConfig({ minTxsPerBlock: 2 });

      const checkpoint = await job.execute();

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

      const checkpoint = await job.execute();

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

      await job.execute();

      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Number),
        expect.any(Date),
      );
    });

    it('passes previous checkpoint out hashes when there are earlier checkpoints in the epoch', async () => {
      // Create two previous checkpoints in the same epoch
      const previousCheckpoints = await timesAsync(2, i => Checkpoint.random(CheckpointNumber(i + 1)));

      // Update job to be for checkpoint 3
      checkpointNumber = CheckpointNumber(3);
      job = createCheckpointProposalJob();
      job.setTimetable(
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          enforce: config.enforceTimeTable,
        }),
      );

      // Mock l2BlockSource to return the previous checkpoints
      l2BlockSource.getCheckpointsForEpoch.mockResolvedValue(previousCheckpoints);

      // Build block successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.execute();

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
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          enforce: config.enforceTimeTable,
        }),
      );

      // Mock l2BlockSource to return all three checkpoints
      l2BlockSource.getCheckpointsForEpoch.mockResolvedValue([previousCheckpoint, currentCheckpoint, futureCheckpoint]);

      // Build block successfully
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      await job.execute();

      // Verify only the checkpoint before the current one is included
      expect(checkpointsBuilder.startCheckpointCalls).toHaveLength(1);
      const call = checkpointsBuilder.startCheckpointCalls[0];

      expect(call.previousCheckpointOutHashes).toHaveLength(1);
      expect(call.previousCheckpointOutHashes[0]).toEqual(previousCheckpoint.getCheckpointOutHash());
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
    p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

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
   * Uses TestCheckpointProposalJob which has waitUntilTimeInSlot as a no-op.
   * Called in beforeEach to create the job, and tests can use job.updateConfig()
   * to modify config after creation.
   */
  function createCheckpointProposalJob(): TestCheckpointProposalJob {
    const setStateFn = jest.fn();
    const eventEmitter = new EventEmitter() as TypedEventEmitter<SequencerEvents>;

    return new TestCheckpointProposalJob(
      epoch,
      SlotNumber(newSlotNumber),
      checkpointNumber,
      lastBlockNumber,
      proposer,
      publisher,
      attestorAddress,
      undefined, // invalidateBlock
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
      getTelemetryClient().getTracer('test'),
      { actor: 'test' }, // bindings
    );
  }

  describe('multiple block mode', () => {
    beforeEach(() => {
      // Multiple block mode: set blockDurationMs to 8 seconds
      job.setTimetable(
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          blockDurationMs: 8000,
          enforce: true,
        }),
      );
    });

    it('builds multiple blocks with sufficient txs', async () => {
      // Mock timetable to allow 2 blocks
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 10, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 18, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Set up test data for 2 blocks
      const { lastBlock } = await setupMultipleBlocks(2, [2, 1]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilTimeInSlot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilTimeInSlot was called between blocks
      // After building the first non-last block, it waits for the next block time
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The wait time is until the next block deadline
      expect(waitSpy.mock.calls[0][0]).toEqual(10);
    });

    it('builds a single empty block when no txs are available and no min txs required', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 2, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 4, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Set up test data for an empty block
      const { lastBlock } = await setupMultipleBlocks(1, [0]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilTimeInSlot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      job.updateConfig({ minTxsPerBlock: 0 });
      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilTimeInSlot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The wait time is until the next block deadline
      expect(waitSpy.mock.calls[0][0]).toEqual(2);
    });

    it('builds a single block when not enough txs are available but we build empty checkpoints', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 2, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 4, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Set up test data for a block with only 2 txs, note that min txs is 5
      const { lastBlock } = await setupMultipleBlocks(1, [2]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      // Install spy on waitUntilTimeInSlot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: true });
      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Verify waitUntilTimeInSlot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The wait time is until the next block deadline
      expect(waitSpy.mock.calls[0][0]).toEqual(2);
    });

    it('does not build anything if not enough txs and we do not build empty checkpoints', async () => {
      // Mock timetable to have two sub-slots
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 2, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 4, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Not enough txs to build a block
      p2p.getPendingTxCount.mockResolvedValue(2);

      // Install spy on waitUntilTimeInSlot to verify it's called with expected deadlines
      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      job.updateConfig({ minTxsPerBlock: 5, buildCheckpointIfEmpty: false });
      const checkpoint = await job.execute();

      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(0);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(0);

      // Verify waitUntilTimeInSlot was called between blocks
      expect(waitSpy).toHaveBeenCalledTimes(1);
      // The wait time is until the next block deadline
      expect(waitSpy.mock.calls[0][0]).toEqual(2);
    });

    it('stops building when canStartNextBlock returns false', async () => {
      // Mock timetable to stop after 1 block (simulating time running out)
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 10, isLastBlock: false })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      const txs = await Promise.all([makeTx(1, chainId), makeTx(2, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      // Install spy on waitUntilTimeInSlot
      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      // Only one block built due to time constraints
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);

      // Since isLastBlock was false but canStart became false after first block,
      // waitUntilTimeInSlot should have been called once (after first block, before checking canStart again)
      expect(waitSpy).toHaveBeenCalledTimes(1);
    });

    it('calls waitUntilTimeInSlot with expected deadline based on block duration', async () => {
      const blockDurationSeconds = 8; // 8000ms / 1000

      // Mock timetable to allow 3 blocks
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 2 + blockDurationSeconds, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 2 + 2 * blockDurationSeconds, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 2 + 3 * blockDurationSeconds, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Set up test data for 3 blocks
      const { lastBlock } = await setupMultipleBlocks(3, 1);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(lastBlock));

      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      await job.execute();

      // With 3 blocks where the 3rd is the last, waitUntilTimeInSlot should be called twice
      // (after block 1 and block 2, but not after block 3 since it's the last)
      expect(waitSpy).toHaveBeenCalledTimes(2);
      expect(waitSpy.mock.calls[0][0]).toEqual(10);
      expect(waitSpy.mock.calls[1][0]).toEqual(18);
    });

    it('does not call waitUntilTimeInSlot when building the last block', async () => {
      // Mock timetable to allow only 1 block (which is the last)
      jest.spyOn(job.getTimetable(), 'canStartNextBlock').mockReturnValue({
        canStart: true,
        deadline: 30,
        isLastBlock: true, // First and only block is the last
      });

      const txs = await Promise.all([makeTx(1, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const waitSpy = jest.spyOn(job, 'waitUntilTimeInSlot');

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);

      // waitUntilTimeInSlot should NOT be called since the only block is the last block
      expect(waitSpy).not.toHaveBeenCalled();
    });

    it('tracks remaining blob field capacity across multiple blocks', async () => {
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 10, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 18, isLastBlock: true })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      const txs = await Promise.all([makeTx(1, chainId), makeTx(2, chainId), makeTx(3, chainId)]);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      // Create 2 blocks - block 1 has 2 txs, block 2 has 1 tx
      const block1 = await makeBlock(txs.slice(0, 2), globalVariables);
      const globalVariables2 = new GlobalVariables(
        chainId,
        version,
        BlockNumber(newBlockNumber + 1),
        SlotNumber(newSlotNumber),
        0n,
        coinbase,
        feeRecipient,
        gasFees,
      );
      const block2 = await makeBlock([txs[2]], globalVariables2);

      checkpointBuilder.seedBlocks([block1, block2], [txs.slice(0, 2), [txs[2]]]);
      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block2));

      await job.execute();

      // Verify blob field limits were correctly calculated
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(2);

      const initialCapacity = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB - NUM_CHECKPOINT_END_MARKER_FIELDS;

      // Block 1 (first in checkpoint): gets initial capacity - first block overhead (7)
      const block1MaxBlobFields = initialCapacity - NUM_FIRST_BLOCK_END_BLOB_FIELDS;
      expect(checkpointBuilder.buildBlockCalls[0].opts.maxBlobFields).toBe(block1MaxBlobFields);

      // Block 2: gets remaining capacity - subsequent block overhead (6)
      const block1BlobFieldsUsed = block1.body.txEffects.reduce((sum, tx) => sum + tx.getNumBlobFields(), 0);
      const remainingAfterBlock1 = block1MaxBlobFields - block1BlobFieldsUsed;
      const block2MaxBlobFields = remainingAfterBlock1 - NUM_BLOCK_END_BLOB_FIELDS;
      expect(checkpointBuilder.buildBlockCalls[1].opts.maxBlobFields).toBe(block2MaxBlobFields);
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
      checkpointBuilder.buildBlock.mockResolvedValue({ failedTxs, numTxs: 1 } as BuildBlockInCheckpointResult);

      const checkpoint = await job.buildSingleBlock(checkpointBuilder, {
        blockNumber: newBlockNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        buildDeadline: undefined,
        blockTimestamp: 0n,
        remainingBlobFields: 1,
        txHashesAlreadyIncluded: new Set<string>(),
      });

      expect(checkpoint).toBeUndefined();
      expect(p2p.deleteTxs).toHaveBeenCalledWith(failedTxs.map(ftx => ftx.tx.txHash));
    });

    it('does not build a block if checkpoint builder fails with invalid txs', async () => {
      job.updateConfig({ minTxsPerBlock: 3 });
      const txs = await timesAsync(3, i => makeTx(i + 1, chainId));
      mockPendingTxs(p2p, txs);

      const checkpointBuilder = mock<CheckpointBuilder>();
      const failedTxs: FailedTx[] = txs.slice(1).map(tx => ({ tx, error: new Error('Invalid tx') }));
      checkpointBuilder.buildBlock.mockRejectedValue(new NoValidTxsError(failedTxs));

      const checkpoint = await job.buildSingleBlock(checkpointBuilder, {
        blockNumber: newBlockNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(1),
        buildDeadline: undefined,
        blockTimestamp: 0n,
        remainingBlobFields: 1,
        txHashesAlreadyIncluded: new Set<string>(),
      });

      expect(checkpoint).toBeUndefined();
      expect(p2p.deleteTxs).toHaveBeenCalledWith(failedTxs.map(ftx => ftx.tx.txHash));
    });
  });

  describe('timing edge cases', () => {
    it('handles insufficient time remaining in slot', async () => {
      // Mock canStartNextBlock to return false (not enough time)
      jest.spyOn(job.getTimetable(), 'canStartNextBlock').mockReturnValue({
        canStart: false,
        deadline: undefined,
        isLastBlock: false,
      });

      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      const checkpoint = await job.execute();

      // Should return undefined when no time available
      expect(checkpoint).toBeUndefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
    });

    it('forces checkpoint build when buildCheckpointIfEmpty is true and time allows', async () => {
      // Mock minimal txs (less than minTxsPerBlock)
      p2p.getPendingTxCount.mockResolvedValue(1);
      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      const block = await makeBlock(txs, globalVariables);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
    });

    it('respects buildDeadline when checking time availability', async () => {
      // Mock canStartNextBlock to indicate we're at the deadline
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 1, isLastBlock: true }) // Very tight deadline
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      const txs = await Promise.all([makeTx(1, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

      const checkpoint = await job.execute();

      // Should still complete if first block succeeds
      expect(checkpoint).toBeDefined();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('handles block build failure gracefully', async () => {
      const txs = await Promise.all([makeTx(1, chainId)]);
      p2p.getPendingTxCount.mockResolvedValue(txs.length);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      // Set up MockCheckpointBuilder to throw on build
      checkpointBuilder.errorOnBuild = new Error('Block build failed');

      // The job catches the error internally and returns undefined
      const checkpoint = await job.execute();
      expect(checkpoint).toBeUndefined();
    });

    it('handles attestation collection timeout', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      // Mock collectAttestations to fail with timeout
      validatorClient.collectAttestations.mockRejectedValue(new AttestationTimeoutError(0, 3, SlotNumber.ZERO));

      const checkpoint = await job.execute();

      expect(checkpoint).toBeUndefined();
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
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

      const checkpoint = await job.execute();

      // Should complete even with empty committee
      expect(checkpoint).toBeDefined();
    });
  });

  describe('attestation collection', () => {
    it('collects attestations in normal flow', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      const attestations = getAttestations(block);
      validatorClient.collectAttestations.mockResolvedValue(attestations);

      const checkpoint = await job.execute();

      expect(checkpoint).toBeDefined();
      expect(validatorClient.collectAttestations).toHaveBeenCalled();
    });

    it('handles attestation collection throwing TimeoutError', async () => {
      const { txs, block } = await setupTxsAndBlock(p2p, globalVariables, 1, chainId);
      checkpointBuilder.seedBlocks([block], [txs]);

      validatorClient.collectAttestations.mockRejectedValue(new TimeoutError('Attestation collection timed out'));

      await job.execute();

      // Should handle timeout gracefully
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
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          blockDurationMs: 8000,
          enforce: true,
        }),
      );

      // Mock timetable to allow multiple blocks
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 4, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 8, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 12, isLastBlock: false })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Mock to throw on first block proposal
      validatorClient.createBlockProposal.mockImplementation(() => {
        throw new DutyAlreadySignedError(SlotNumber(1), DutyType.BLOCK_PROPOSAL, 0, 'node-2');
      });

      const result = await job.execute();

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
        new SequencerTimetable({
          ethereumSlotDuration,
          aztecSlotDuration: slotDuration,
          l1PublishingTime: ethereumSlotDuration,
          blockDurationMs: 8000,
          enforce: true,
        }),
      );

      // Mock timetable to allow multiple blocks
      jest
        .spyOn(job.getTimetable(), 'canStartNextBlock')
        .mockReturnValueOnce({ canStart: true, deadline: 4, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 8, isLastBlock: false })
        .mockReturnValueOnce({ canStart: true, deadline: 12, isLastBlock: false })
        .mockReturnValue({ canStart: false, deadline: undefined, isLastBlock: false });

      // Mock to throw on first block proposal
      validatorClient.createBlockProposal.mockImplementation(() => {
        throw new SlashingProtectionError(SlotNumber(1), DutyType.BLOCK_PROPOSAL, 0, 'hash1', 'hash2', 'node-1');
      });

      const result = await job.execute();

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
  /** Override to be a no-op for testing - allows tests to run without timing delays */
  public override waitUntilTimeInSlot(targetSecondsIntoSlot: number): Promise<void> {
    this.log.warn(`Skipping waitUntilTimeInSlot(${targetSecondsIntoSlot}) in test`);
    return Promise.resolve();
  }

  /** Update config for testing - allows tests to modify config after job creation */
  public updateConfig(partialConfig: Partial<ResolvedSequencerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
  }

  /** Set timetable for testing - allows tests to modify timetable after job creation */
  public setTimetable(newTimetable: SequencerTimetable): void {
    this.timetable = newTimetable;
  }

  /** Get timetable for testing - allows tests to spy on methods */
  public getTimetable(): SequencerTimetable {
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
      remainingBlobFields: number;
    },
  ): Promise<{ block: L2Block; usedTxs: Tx[]; remainingBlobFields: number } | { error: Error } | undefined> {
    return super.buildSingleBlock(checkpointBuilder, opts);
  }
}
