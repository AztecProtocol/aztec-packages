import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  MerkleTreeWriteOperations,
  ResolvedSequencerConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import type { ValidatorClient } from '@aztec/validator-client';

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
  createBlockAttestation,
  makeBlock,
  makeTx,
  mockPendingTxs,
  mockTxIterator,
  setupTxsAndBlock,
} from '../test/utils.js';
import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
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
    const attestation = createBlockAttestation(block, mockedSig, committee[0]);
    return [attestation];
  };

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    lastBlockNumber = BlockNumber.ZERO;
    newBlockNumber = BlockNumber(lastBlockNumber + 1);
    newSlotNumber = 1;
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
    epochCache.getCommittee.mockResolvedValue({ committee, seed: 1n, epoch: EpochNumber(1) } as EpochCommitteeInfo);

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

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve([]));
    validatorClient.createBlockProposal.mockImplementation((_blockNumber, checkpointHeader, archiveRoot, txs) => {
      // Create a block proposal directly with the checkpoint header instead of using fromBlock
      // which would require a full L2Block with toCheckpointHeader method
      const consensusPayload = new ConsensusPayload(checkpointHeader, archiveRoot);
      return Promise.resolve(
        new BlockProposal(
          consensusPayload,
          mockedSig,
          (txs ?? []).map((tx: any) => tx.txHash),
        ),
      );
    });
    validatorClient.createCheckpointProposal.mockImplementation((checkpointHeader, archiveRoot, txs) => {
      // Create a minimal BlockProposal for the checkpoint
      const consensusPayload = new ConsensusPayload(checkpointHeader, archiveRoot);
      return Promise.resolve(
        new BlockProposal(
          consensusPayload,
          mockedSig,
          (txs ?? []).map(tx => tx.txHash),
        ),
      );
    });
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
  });

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
      checkpointsBuilder as unknown as FullNodeCheckpointsBuilder,
      l1Constants,
      config,
      timetable,
      slasherClient,
      epochCache,
      dateProvider,
      metrics,
      eventEmitter,
      setStateFn,
      createLogger('sequencer:checkpoint-proposal-job'),
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

      // Create enough txs for 2 blocks
      const txs = await Promise.all([makeTx(1, chainId), makeTx(2, chainId), makeTx(3, chainId)]);

      // Always have txs available
      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      // Create 2 blocks
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

      // Seed MockCheckpointBuilder with blocks to return sequentially
      checkpointBuilder.seedBlocks([block1, block2], [txs.slice(0, 2), [txs[2]]]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block2));

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

      const txs = await Promise.all([makeTx(1, chainId), makeTx(2, chainId), makeTx(3, chainId)]);
      const block = await makeBlock(txs, globalVariables);

      p2p.getPendingTxCount.mockResolvedValue(10);
      p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

      // Seed with 3 identical blocks (each with 1 tx)
      checkpointBuilder.seedBlocks([block, block, block], [[txs[0]], [txs[1]], [txs[2]]]);

      validatorClient.collectAttestations.mockResolvedValue(getAttestations(block));

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
        seed: 1n,
        epoch: EpochNumber(1),
      } as EpochCommitteeInfo);

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
}
