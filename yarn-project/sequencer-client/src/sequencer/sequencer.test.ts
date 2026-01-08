import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { omit, times, timesParallel } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2BlockNew,
  type L2BlockSource,
  type ValidateBlockNegativeResult,
} from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import {
  type SequencerConfig,
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import type { ValidatorClient } from '@aztec/validator-client';

import { expect } from '@jest/globals';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { AttestorPublisherPair, SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { InvalidateBlockRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { MockCheckpointBuilder, MockCheckpointsBuilder } from '../test/utils.js';
import * as TestUtils from '../test/utils.js';
import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { Sequencer } from './sequencer.js';
import { SequencerState } from './utils.js';

describe('sequencer', () => {
  let publisher: MockProxy<SequencerPublisher>;
  let epochCache: MockProxy<EpochCache>;
  let validatorClient: MockProxy<ValidatorClient>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let p2p: MockProxy<P2P>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let checkpointsBuilder: MockCheckpointsBuilder;
  let checkpointBuilder: MockCheckpointBuilder;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let publisherFactory: MockProxy<SequencerPublisherFactory>;

  let rollupContract: MockProxy<RollupContract>;

  let dateProvider: TestDateProvider;

  let lastBlockNumber: BlockNumber;
  let newBlockNumber: BlockNumber;
  let newSlotNumber: number;
  let hash: string;

  let block: L2BlockNew;
  let globalVariables: GlobalVariables;
  let l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

  let sequencer: TestSequencer;

  const slotDuration = 8;
  const ethereumSlotDuration = 4;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const gasFees = GasFees.empty();

  let feeRecipient: AztecAddress;

  const signer = Secp256k1Signer.random();
  const mockedSig = Signature.random();
  const mockedAttestation = new CommitteeAttestation(signer.address, mockedSig);
  const committee = [signer.address];

  const getSignatures = () => [mockedAttestation];

  const getAttestations = () => {
    return [TestUtils.createBlockAttestation(block, mockedSig, committee[0])];
  };

  const createBlockProposal = () => {
    return TestUtils.createBlockProposal(block, mockedSig);
  };

  const makeBlock = async (txs: Tx[]) => {
    block = await TestUtils.makeBlock(txs, globalVariables);
    return block;
  };

  const makeTx = (seed?: number) => {
    return TestUtils.makeTx(seed, chainId);
  };

  /** Creates a single tx, makes a block from it, and mocks it as pending */
  const setupSingleTxBlock = async (seed?: number) => {
    const tx = await makeTx(seed);
    block = await makeBlock([tx]);
    TestUtils.mockPendingTxs(p2p, [tx]);
    return tx;
  };

  const expectPublisherProposeL2Block = () => {
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(getSignatures());
    expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledWith(
      expect.any(Checkpoint),
      attestationsAndSigners,
      getSignatures()[0].signature,
      {
        txTimeoutAt: expect.any(Date),
      },
    );
  };

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    lastBlockNumber = BlockNumber.ZERO;
    newBlockNumber = BlockNumber(lastBlockNumber + 1);
    newSlotNumber = newBlockNumber;
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
    l1Constants = { l1GenesisTime, slotDuration, ethereumSlotDuration };

    epochCache = mockDeep<EpochCache>();
    epochCache.getEpochAndSlotInNextL1Slot.mockImplementation(() => ({
      epoch: EpochNumber(1),
      slot: SlotNumber(1),
      ts: 1000n,
      now: 1000n,
    }));
    epochCache.getCommittee.mockResolvedValue({
      committee,
      seed: 1n,
      epoch: EpochNumber(1),
    });

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.validateBlockHeader.mockResolvedValue();
    publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
    publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
    publisher.enqueueSlashingActions.mockResolvedValue(true);
    publisher.canProposeAtNextEthBlock.mockResolvedValue({
      slot: SlotNumber(newSlotNumber),
      checkpointNumber: CheckpointNumber.fromBlockNumber(newBlockNumber),
      timeOfNextL1Slot: 1000n,
    });

    publisherFactory = mockDeep<SequencerPublisherFactory>();
    publisherFactory.create.mockResolvedValue({
      attestorAddress: publisher.getSenderAddress(),
      publisher,
    } satisfies AttestorPublisherPair);

    rollupContract = mockDeep<RollupContract>();

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);
    globalVariableBuilder.buildCheckpointGlobalVariables.mockResolvedValue(omit(globalVariables, 'blockNumber'));

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({ syncedToL2Block: { number: lastBlockNumber, hash } }),
    });

    worldState = mock<WorldStateSynchronizer>({
      getCommitted: mockFn().mockReturnValue({
        getTreeInfo: mockFn().mockResolvedValue({ root: Fr.random().toBuffer(), size: 99n, depth: 5 }),
      }),
      status: mockFn().mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: lastBlockNumber,
          latestBlockHash: hash,
          finalizedBlockNumber: BlockNumber.ZERO,
          oldestHistoricBlockNumber: BlockNumber.ZERO,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus),
    });

    // Create fake CheckpointsBuilder and CheckpointBuilder
    // Uses blockProvider to return the current `block` variable (set per-test)
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
    checkpointBuilder = checkpointsBuilder.createCheckpointBuilder(
      checkpointConstants,
      CheckpointNumber.fromBlockNumber(newBlockNumber),
    );
    // Use blockProvider so the mock returns whatever `block` is set to at call time
    checkpointBuilder.setBlockProvider(() => block);

    l2BlockSource = mock<L2BlockSource>({
      getL2BlockNew: mockFn().mockResolvedValue(L2BlockNew.empty()),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
      getL1Timestamp: mockFn().mockResolvedValue(1000n),
      isPendingChainInvalid: mockFn().mockResolvedValue(false),
      getPendingChainValidationStatus: mockFn().mockResolvedValue({ valid: true }),
    });

    l1ToL2MessageSource = mock<L1ToL2MessageSource>({
      getL1ToL2Messages: () => Promise.resolve(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO)),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
    });

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve(getAttestations()));
    validatorClient.createBlockProposal.mockImplementation(() => Promise.resolve(createBlockProposal()));
    validatorClient.createCheckpointProposal.mockImplementation(() => Promise.resolve(createBlockProposal()));
    validatorClient.signAttestationsAndSigners.mockImplementation(() => Promise.resolve(getSignatures()[0].signature));

    slasherClient = mock<SlasherClientInterface>();
    slasherClient.getProposerActions.mockResolvedValue([]);

    dateProvider = new TestDateProvider();

    const config: SequencerConfig = { enforceTimeTable: true, maxTxsPerBlock: 4 };
    sequencer = new TestSequencer(
      publisherFactory,
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      slasherClient,
      l2BlockSource,
      l1ToL2MessageSource,
      checkpointsBuilder as unknown as FullNodeCheckpointsBuilder,
      l1Constants,
      dateProvider,
      epochCache,
      rollupContract,
      config,
    );
    sequencer.updateConfig(config);
  });

  describe('block building', () => {
    it('builds a block out of a single tx', async () => {
      await setupSingleTxBlock();
      await sequencer.work();

      expectPublisherProposeL2Block();
    });

    it('does not build a block if it does not have enough time left in the slot', async () => {
      await setupSingleTxBlock();

      // Deadline for initializing proposal is 1s, so we go 2s past it
      expect(sequencer.getTimeTable().initializeDeadline).toEqual(1);
      const l1TsForL2Slot1 = Number(l1Constants.l1GenesisTime) + slotDuration;
      dateProvider.setTime((l1TsForL2Slot1 + 2) * 1000);
      await expect(sequencer.work()).rejects.toThrow(
        expect.objectContaining({
          name: 'SequencerTooSlowError',
          message: expect.stringContaining(`Too far into slot`),
        }),
      );

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.canProposeAtNextEthBlock).not.toHaveBeenCalled();
    });

    it('builds a checkpoint when it is their turn', async () => {
      await setupSingleTxBlock();

      // Not your turn! canProposeAtNextEthBlock returns undefined
      publisher.canProposeAtNextEthBlock.mockResolvedValue(undefined);

      await sequencer.work();
      // When it's not our turn, we should not build the checkpoint
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);

      // Now it's our turn!
      publisher.canProposeAtNextEthBlock.mockResolvedValue({
        slot: block.header.globalVariables.slotNumber,
        checkpointNumber: CheckpointNumber.fromBlockNumber(block.header.globalVariables.blockNumber),
        timeOfNextL1Slot: 1000n,
      });

      await sequencer.work();
      // Now we should build and publish the checkpoint
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expectPublisherProposeL2Block();
    });

    it('does not build a block if not enough txs', async () => {
      const txs: Tx[] = await timesParallel(8, i => makeTx(i * 0x10000));
      sequencer.updateConfig({ minTxsPerBlock: 4 });
      TestUtils.mockPendingTxs(p2p, txs.slice(0, 3));
      block = await makeBlock(txs);

      await sequencer.work();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
    });

    it('builds a block only when enough txs are available', async () => {
      const txs: Tx[] = await timesParallel(4, i => makeTx(i * 0x10000));
      sequencer.updateConfig({ minTxsPerBlock: 4 });
      TestUtils.mockPendingTxs(p2p, txs);
      block = await makeBlock(txs);

      await sequencer.work();

      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expectPublisherProposeL2Block();
    });

    it('builds a block only when synced to previous L1 slot', async () => {
      await setupSingleTxBlock();

      l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration) - 1n);
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();

      l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration));
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    // TODO(palla/mbps): Reinstante the validateBlockHeader call
    it.skip('aborts building a block if the chain moves underneath it', async () => {
      await setupSingleTxBlock();

      // This could practically be for any reason, e.g., could also be that we have entered a new slot.
      publisher.validateBlockHeader.mockRejectedValueOnce(new Error('No block for you'));

      await sequencer.work();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('handles when enqueueProposeCheckpoint throws', async () => {
      await setupSingleTxBlock();

      publisher.enqueueProposeCheckpoint.mockRejectedValueOnce(new Error('Failed to enqueue propose checkpoint'));

      await sequencer.work();

      // We still call sendRequests in case there are votes enqueued
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should proceed with block proposal when there is no proposer yet', async () => {
      // Mock that there is no official proposer yet
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(undefined);
      epochCache.getCommittee.mockResolvedValueOnce({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

      // Mock that we have some pending transactions
      const txs = [await makeTx(1), await makeTx(2)];
      TestUtils.mockPendingTxs(p2p, txs);
      block = await makeBlock(txs);

      await sequencer.work();

      // Verify that the sequencer attempted to create and broadcast a block proposal
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();

      // Verify that the sequencer did not broadcast for attestations since there's no committee
      expect(validatorClient.createBlockProposal).not.toHaveBeenCalled();
      expect(validatorClient.broadcastBlockProposal).not.toHaveBeenCalled();
    });
  });

  describe('multi-eoa publishing', () => {
    it('requests a publisher for each block', async () => {
      // Create multiple publishers for the test
      const publishers = times(2, i => {
        const pub = mockDeep<SequencerPublisher>();
        pub.epochCache = epochCache;
        pub.getSenderAddress.mockImplementation(() => EthAddress.random());
        pub.validateBlockHeader.mockResolvedValue();
        pub.enqueueProposeCheckpoint.mockResolvedValue(undefined);
        pub.enqueueGovernanceCastSignal.mockResolvedValue(true);
        pub.enqueueSlashingActions.mockResolvedValue(true);
        pub.canProposeAtNextEthBlock.mockResolvedValue({
          slot: SlotNumber(newSlotNumber + i),
          checkpointNumber: CheckpointNumber.fromBlockNumber(BlockNumber(newBlockNumber)),
          timeOfNextL1Slot: 1000n,
        });
        return pub;
      });

      // Configure factory to return different publishers on each call
      publisherFactory.create.mockReset();
      publisherFactory.create
        .mockResolvedValueOnce({ attestorAddress: publishers[0].getSenderAddress(), publisher: publishers[0] })
        .mockResolvedValueOnce({ attestorAddress: publishers[1].getSenderAddress(), publisher: publishers[1] });

      // Configure epoch cache to return different slots
      epochCache.getEpochAndSlotInNextL1Slot
        .mockReset()
        .mockReturnValueOnce({ epoch: EpochNumber(1), slot: SlotNumber(1), ts: 1000n, now: 1000n })
        .mockReturnValueOnce({ epoch: EpochNumber(1), slot: SlotNumber(2), ts: 1000n, now: 1000n });

      sequencer.updateConfig({ enforceTimeTable: false, maxTxsPerBlock: 4 });

      // Build and publish 2 blocks, the sequencer should request a new publisher each time
      for (let i = 0; i < 2; i++) {
        const tx = await makeTx();
        block = await makeBlock([tx]);
        TestUtils.mockPendingTxs(p2p, [tx]);
        await sequencer.work();

        const attestationsAndSigners = new CommitteeAttestationsAndSigners(getSignatures());
        expect(publishers[i].enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
        expect(publishers[i].enqueueProposeCheckpoint).toHaveBeenCalledWith(
          expect.any(Checkpoint),
          attestationsAndSigners,
          getSignatures()[0].signature,
          { txTimeoutAt: expect.any(Date) },
        );
      }
    });
  });

  describe('voting when sync fails', () => {
    beforeEach(() => {
      // Mock that sync fails
      const differentHash = Fr.random().toString();
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(lastBlockNumber + 1),
          latestBlockHash: differentHash,
        } as WorldStateSyncStatus,
      });
    });

    const mockSlashActions = [{ type: 'vote-offenses' as const, round: 1n, votes: [], committees: [] }];

    it('should vote on slashing and governance when sync fails and past initialize deadline', async () => {
      // Set time to be past the initializeDeadline (which is 1s based on test config)
      // Build start is: l1GenesisTime + slotNumber * slotDuration - ethereumSlotDuration
      // For slot 1: l1GenesisTime + 1 * 8 - 4 = l1GenesisTime + 4
      expect(sequencer.getTimeTable().initializeDeadline).toEqual(1);
      const buildStartTime = Number(l1Constants.l1GenesisTime) + slotDuration - ethereumSlotDuration;
      dateProvider.setTime((buildStartTime + 2) * 1000); // 2 seconds after build start, past the 1s deadline

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // Mock governance payload
      const governancePayload = EthAddress.random();
      sequencer.updateConfig({ governanceProposerPayload: governancePayload });

      // Mock publisher methods to return true
      publisher.enqueueSlashingActions.mockResolvedValue(true);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);

      await sequencer.work();

      // We're testing the new behavior - that we try to vote even when sync fails
      // when we're past the time we could build a block
      expect(slasherClient.getProposerActions).toHaveBeenCalledWith(SlotNumber(1));
      expect(publisher.enqueueSlashingActions).toHaveBeenCalled();
      expect(publisher.enqueueGovernanceCastSignal).toHaveBeenCalledWith(
        governancePayload,
        SlotNumber(1),
        expect.any(BigInt),
        expect.any(EthAddress),
        expect.any(Function),
      );
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should not vote when sync fails and within time limit', async () => {
      // Set time to be within the max allowed time
      // Build start is: l1GenesisTime + slotNumber * slotDuration - ethereumSlotDuration
      // For slot 1: l1GenesisTime + 1 * 8 - 4 = l1GenesisTime + 4
      // initializeDeadline is 1s, so we need to be less than 1s after the build start
      const buildStartTime = Number(l1Constants.l1GenesisTime) + slotDuration - ethereumSlotDuration;
      dateProvider.setTime((buildStartTime + 0.5) * 1000); // 0.5s after build start, within 1s deadline

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      await sequencer.work();

      // Should not attempt to enqueue slashing actions when within time limit
      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
    });

    it('should not vote when sync fails but not a proposer', async () => {
      // Set time to be past the max allowed time
      const buildStartTime = Number(l1Constants.l1GenesisTime) + slotDuration - ethereumSlotDuration;
      dateProvider.setTime((buildStartTime + 2) * 1000); // 2s after build start, past 1s deadline

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as NOT the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([EthAddress.random()]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address); // Different address

      await sequencer.work();

      // Should not vote when not a proposer
      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
    });

    it('should not attempt to vote twice in the same slot', async () => {
      // Set time to be past the max allowed time
      const buildStartTime = Number(l1Constants.l1GenesisTime) + slotDuration - ethereumSlotDuration;
      dateProvider.setTime((buildStartTime + 2) * 1000); // 2s after build start, past 1s deadline

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // Mock publisher methods
      publisher.enqueueSlashingActions.mockResolvedValue(true);

      // First attempt should succeed
      await sequencer.work();
      expect(publisher.enqueueSlashingActions).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequests).toHaveBeenCalledTimes(1);

      // Reset mocks
      publisher.enqueueSlashingActions.mockClear();
      publisher.sendRequests.mockClear();
      slasherClient.getProposerActions.mockClear();

      // Second attempt in the same slot should be skipped
      await sequencer.work();
      expect(slasherClient.getProposerActions).not.toHaveBeenCalled();
      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
      expect(publisher.sendRequests).not.toHaveBeenCalled();
    });
  });

  describe('consider invalidating block', () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();
    const validator3 = EthAddress.random();

    let invalidValidationResult: ValidateBlockNegativeResult;

    beforeEach(() => {
      invalidValidationResult = {
        valid: false,
        block: {
          blockNumber: lastBlockNumber,
          timestamp: 1000n,
          archive: Fr.random(),
          lastArchive: Fr.random(),
          slotNumber: SlotNumber(newSlotNumber),
          txCount: 0,
        },
        committee: [validator2],
        epoch: EpochNumber(1),
        seed: 123n,
        attestors: [],
        attestations: [],
        reason: 'insufficient-attestations',
      };

      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue(invalidValidationResult);

      // Mock committee to include validator2
      epochCache.getCommittee.mockResolvedValue({
        committee: [validator2],
        seed: 123n,
        epoch: EpochNumber(1),
      });

      // Setup validator client
      validatorClient.getValidatorAddresses.mockReturnValue([validator1, validator2, validator3]);

      // Make sure we're NOT the proposer so considerInvalidatingBlock is called
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(EthAddress.random());

      // Setup publisher factory
      publisherFactory.create.mockImplementation((validatorAddress?: EthAddress) => {
        return Promise.resolve({
          attestorAddress: validatorAddress ?? validator1,
          publisher,
        });
      });

      publisher.simulateInvalidateBlock.mockResolvedValue({
        forcePendingBlockNumber: lastBlockNumber,
      } as InvalidateBlockRequest);
    });

    it('should use committee member when invalidating as committee member', async () => {
      // Set time past the committee member threshold
      const timePastThreshold = 3; // seconds
      dateProvider.setTime(Number(invalidValidationResult.block.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should create publisher with the committee member validator
      expect(publisherFactory.create).toHaveBeenCalledWith(validator2);
      expect(publisher.enqueueInvalidateBlock).toHaveBeenCalled();
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should use first validator when invalidating as non-committee member', async () => {
      // Mock committee without any of our validators
      epochCache.getCommittee.mockResolvedValue({
        committee: [EthAddress.random()],
        seed: 123n,
        epoch: EpochNumber(1),
      });

      // Set time past the non-committee member threshold
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.block.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should create publisher with the first validator
      expect(publisherFactory.create).toHaveBeenCalledWith(validator1);
      expect(publisher.enqueueInvalidateBlock).toHaveBeenCalled();
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should not invalidate when time thresholds not met', async () => {
      // Set time before any threshold
      const timePastThreshold = 1;
      dateProvider.setTime(Number(invalidValidationResult.block.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should not create publisher or invalidate
      expect(publisherFactory.create).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateBlock).not.toHaveBeenCalled();
    });

    it('should not invalidate when pending chain is valid', async () => {
      // Mock valid chain
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });

      // Set time past threshold
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.block.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should not create publisher or invalidate
      expect(publisherFactory.create).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateBlock).not.toHaveBeenCalled();
    });
  });

  describe('modes', () => {
    it('non-enforced mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: false, maxTxsPerBlock: 4 });

      await setupSingleTxBlock();

      await sequencer.work();

      // Verify checkpoint was built and proposed
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('single block mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: true, maxTxsPerBlock: 4 });

      await setupSingleTxBlock();

      await sequencer.work();

      // Verify checkpoint was built and proposed
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(checkpointBuilder.completeCheckpointCalled).toBe(true);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('multi block mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: true, maxTxsPerBlock: 4, blockDurationMs: 500 });

      const txs = await timesParallel(8, i => makeTx(i * 0x10000));
      block = await makeBlock(txs);
      TestUtils.mockPendingTxs(p2p, txs);

      await sequencer.work();

      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(1);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });
  });
});

class TestSequencer extends Sequencer {
  public getTimeTable() {
    return this.timetable;
  }

  public setL1GenesisTime(l1GenesisTime: number) {
    this.l1Constants.l1GenesisTime = BigInt(l1GenesisTime);
  }

  public override work() {
    this.setState(SequencerState.IDLE, undefined, { force: true });
    return super.work();
  }
}
