import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { type EpochCache, type EpochCommitteeInfo, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
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
  type BlockData,
  BlockHash,
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2BlockSink,
  type L2BlockSource,
  type ProposedCheckpointSink,
  type ValidateCheckpointNegativeResult,
} from '@aztec/stdlib/block';
import { Checkpoint, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
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
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { ConsensusTimetable, DEFAULT_MIN_BLOCK_DURATION } from '@aztec/stdlib/timetable';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx } from '@aztec/stdlib/tx';
import type { FullNodeCheckpointsBuilder, ValidatorClient } from '@aztec/validator-client';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { AttestorPublisherPair, SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { MockCheckpointBuilder, MockCheckpointsBuilder } from '../test/utils.js';
import * as TestUtils from '../test/utils.js';
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
  let l2BlockSource: MockProxy<L2BlockSource & L2BlockSink & ProposedCheckpointSink>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let publisherFactory: MockProxy<SequencerPublisherFactory>;

  let rollupContract: MockProxy<RollupContract>;

  let dateProvider: TestDateProvider;

  let lastBlockNumber: BlockNumber;
  let newBlockNumber: BlockNumber;
  let newSlotNumber: number;
  let hash: string;
  let signatureContext: { chainId: number; rollupAddress: EthAddress };

  let block: L2Block;
  let globalVariables: GlobalVariables;
  let l1Constants: Pick<
    L1RollupConstants,
    'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration' | 'rollupManaLimit' | 'epochDuration'
  >;

  let sequencer: TestSequencer;

  const slotDuration = 8;
  const ethereumSlotDuration = 4;
  const epochDuration = 16;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const gasFees = GasFees.empty();

  let feeRecipient: AztecAddress;

  const mockedArchiveRoot = Fr.random();

  const signer = Secp256k1Signer.random();
  const mockedSig = Signature.random();
  const mockedAttestation = new CommitteeAttestation(signer.address, mockedSig);
  const committee = [signer.address];

  /** A minimal invalid pending chain status for tests that just need `valid: false`. */
  const invalidPendingChainStatus: ValidateCheckpointNegativeResult = {
    valid: false,
    checkpoint: {
      checkpointNumber: CheckpointNumber(1),
      timestamp: 0n,
      archive: Fr.ZERO,
      lastArchive: Fr.ZERO,
      slotNumber: SlotNumber(1),
    },
    committee: [],
    epoch: EpochNumber(1),
    seed: 0n,
    attestors: [],
    attestations: [],
    reason: 'insufficient-attestations',
  };

  const getSignatures = () => [mockedAttestation];

  const getCheckpointAttestations = () => {
    return [TestUtils.createCheckpointAttestation(block, mockedSig, committee[0])];
  };

  const createBlockProposal = () => {
    return TestUtils.createBlockProposal(block, mockedSig);
  };

  const createCheckpointProposal = () => {
    return TestUtils.createCheckpointProposal(block, mockedSig);
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
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(getSignatures(), signatureContext);
    expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
    expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledWith(
      expect.any(Checkpoint),
      attestationsAndSigners,
      getSignatures()[0].signature,
      expect.objectContaining({
        txTimeoutAt: expect.any(Date),
      }),
    );
  };

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    lastBlockNumber = BlockNumber.ZERO;
    newBlockNumber = BlockNumber(lastBlockNumber + 1);
    // Pipelining is always on: the proposer builds during the wall-clock (build) slot for the
    // target slot one ahead. The mocked next-L1-slot lookup reports build slot 1 (see
    // getEpochAndSlotInNextL1Slot below), so the checkpoint the sequencer builds — and the slot
    // `canProposeAt` must report — is the target slot, build + PROPOSER_PIPELINING_SLOT_OFFSET.
    newSlotNumber = newBlockNumber + PROPOSER_PIPELINING_SLOT_OFFSET;
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
      epochDuration,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };

    epochCache = mockDeep<EpochCache>();
    epochCache.isEscapeHatchOpen.mockResolvedValue(false);
    epochCache.getEpochAndSlotInNextL1Slot.mockImplementation(() => ({
      epoch: EpochNumber(1),
      slot: SlotNumber(1),
      ts: 1000n,
      nowSeconds: 1000n,
    }));
    epochCache.getTargetSlot.mockReturnValue(SlotNumber(newSlotNumber));
    epochCache.getTargetEpoch.mockReturnValue(EpochNumber(1));
    epochCache.getTargetEpochAndSlotInNextL1Slot.mockImplementation(() => ({
      epoch: EpochNumber(1),
      slot: SlotNumber(newSlotNumber),
      ts: 1000n,
      nowSeconds: 1000n,
    }));
    epochCache.getCommittee.mockResolvedValue({
      committee,
      seed: 1n,
      epoch: EpochNumber(1),
      isEscapeHatchOpen: false,
    });
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(undefined);

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.validateBlockHeader.mockResolvedValue();
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
    publisher.canProposeAt.mockResolvedValue({
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
    rollupContract.isEscapeHatchOpen.mockResolvedValue(false);
    // Default rollup reads used by pipelined fee-header derivation.
    rollupContract.getCheckpoint.mockResolvedValue({
      feeHeader: { manaUsed: 0n, excessMana: 0n, ethPerFeeAsset: 1n, congestionCost: 0n, proverCost: 0n },
    } as any);
    rollupContract.getManaTarget.mockResolvedValue(10_000n);

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);
    globalVariableBuilder.buildCheckpointGlobalVariables.mockResolvedValue(omit(globalVariables, 'blockNumber'));

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({ syncedToL2Block: { number: lastBlockNumber, hash } }),
      getCheckpointAttestationsForSlot: mockFn().mockResolvedValue([]),
    });

    worldState = mock<WorldStateSynchronizer>({
      getCommitted: mockFn().mockReturnValue({
        getTreeInfo: mockFn().mockResolvedValue({ root: mockedArchiveRoot.toBuffer(), size: 99n, depth: 5 }),
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

    l2BlockSource = mock<L2BlockSource & L2BlockSink & ProposedCheckpointSink>({
      getBlockData: mockFn().mockResolvedValue({
        header: BlockHeader.empty(),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.ZERO,
        checkpointNumber: CheckpointNumber(0),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } satisfies BlockData),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({
        proposed: { number: lastBlockNumber, hash },
        proposedCheckpoint: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        checkpointed: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        proven: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        finalized: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
      }),
      getL1Timestamp: mockFn().mockResolvedValue(1000n),
      isPendingChainInvalid: mockFn().mockResolvedValue(false),
      getPendingChainValidationStatus: mockFn().mockResolvedValue({ valid: true }),
      getCheckpointsData: mockFn().mockResolvedValue([]),
      getSyncedL2SlotNumber: mockFn().mockResolvedValue(SlotNumber(Number.MAX_SAFE_INTEGER)),
      getProposedCheckpointData: mockFn().mockResolvedValue(undefined),
    });

    l1ToL2MessageSource = mock<L1ToL2MessageSource>({
      getL1ToL2Messages: () => Promise.resolve(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO)),
      getL2Tips: mockFn().mockResolvedValue({
        proposed: { number: lastBlockNumber, hash },
        proposedCheckpoint: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        checkpointed: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        proven: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        finalized: {
          block: { number: lastBlockNumber, hash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
      }),
    });

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve(getCheckpointAttestations()));
    validatorClient.createBlockProposal.mockImplementation(() => Promise.resolve(createBlockProposal()));
    validatorClient.createCheckpointProposal.mockImplementation(() => Promise.resolve(createCheckpointProposal()));
    validatorClient.signAttestationsAndSigners.mockImplementation(() => Promise.resolve(getSignatures()[0].signature));
    validatorClient.getCoinbaseForAttestor.mockReturnValue(coinbase);
    validatorClient.getFeeRecipientForAttestor.mockReturnValue(feeRecipient);

    slasherClient = mock<SlasherClientInterface>();
    slasherClient.getProposerActions.mockResolvedValue([]);

    dateProvider = new TestDateProvider();

    signatureContext = { chainId: chainId.toNumber(), rollupAddress: EthAddress.random() };
    const config: SequencerConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'> = {
      enforceTimeTable: true,
      maxTxsPerBlock: 4,
      l1ChainId: signatureContext.chainId,
      rollupAddress: signatureContext.rollupAddress,
    };
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
      await sequencer.awaitLastProposalSubmission();

      expectPublisherProposeL2Block();
    });

    it('does not build a block when targetSlot is in pauseProposingForSlots', async () => {
      await setupSingleTxBlock();
      const targetSlot = block.header.globalVariables.slotNumber;
      sequencer.updateConfig({ pauseProposingForSlots: [targetSlot] });

      await sequencer.work();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.canProposeAt).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('still builds a block when targetSlot is not in pauseProposingForSlots', async () => {
      await setupSingleTxBlock();
      const targetSlot = block.header.globalVariables.slotNumber;
      const otherSlot = SlotNumber(Number(targetSlot) + 1);
      sequencer.updateConfig({ pauseProposingForSlots: [otherSlot] });

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      expectPublisherProposeL2Block();
    });

    it('does not build a block if it is past the start deadline for the target slot', async () => {
      await setupSingleTxBlock();

      // start_deadline (single-block, S=8 E=4 P=2 prepCp=1 minD=2) = target_slot_start - E - 2P - prepCp
      // - minD = target_slot_start - 11. Set the clock past it so block building is abandoned before the
      // proposer check, without throwing (setState is now pure).
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);
      await expect(sequencer.work()).resolves.not.toThrow();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.canProposeAt).not.toHaveBeenCalled();
    });

    it('votes without building if it is past the start deadline for the target slot', async () => {
      await setupSingleTxBlock();

      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

      const governancePayload = EthAddress.random();
      sequencer.updateConfig({ governanceProposerPayload: governancePayload });
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);

      await sequencer.work();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.enqueueGovernanceCastSignal).toHaveBeenCalledWith(
        governancePayload,
        SlotNumber(newSlotNumber),
        expect.any(EthAddress),
        expect.any(Function),
      );
      expect(publisher.sendRequestsAt).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
    });

    it('does not retry building the same checkpoint after a deadline abort within the same slot', async () => {
      await setupSingleTxBlock();

      // Past the build start deadline: the build-entry gate abandons block building. It must mark the slot
      // as attempted so a subsequent work() tick in the same slot does not re-enter and rebuild it.
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

      await sequencer.work();
      expect(sequencer.getLastSlotForCheckpointProposalJob()).toEqual(SlotNumber(newSlotNumber));

      // A second tick in the same slot is short-circuited by the already-processed guard: no checkpoint is
      // built and no proposer/L1 check is attempted again.
      l2BlockSource.getSyncedL2SlotNumber.mockClear();
      await sequencer.work();

      expect(l2BlockSource.getSyncedL2SlotNumber).not.toHaveBeenCalled();
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.canProposeAt).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('builds a checkpoint when it is their turn', async () => {
      await setupSingleTxBlock();

      // Force L1 check by marking pending chain as not yet validated
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue(invalidPendingChainStatus);

      // Not your turn! canProposeAt returns undefined
      publisher.canProposeAt.mockResolvedValue(undefined);

      await sequencer.work();
      // When it's not our turn, we should not build the checkpoint
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);

      // Now it's our turn!
      publisher.canProposeAt.mockResolvedValue({
        slot: block.header.globalVariables.slotNumber,
        checkpointNumber: CheckpointNumber.fromBlockNumber(block.header.globalVariables.blockNumber),
        timeOfNextL1Slot: 1000n,
      });

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();
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
      await sequencer.awaitLastProposalSubmission();

      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expectPublisherProposeL2Block();
    });

    it('builds a block only when synced to previous L2 slot', async () => {
      await setupSingleTxBlock();

      // Archiver reports it hasn't synced any slot yet, so sequencer should not propose
      l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();

      // Archiver reports synced to the build slot, satisfying both the pre-build sync gate
      // (syncedL2Slot + 1 >= slot) and the pipelined parent-checkpoint wait (synced >= slotNow).
      l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(1));
      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();
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

      // The error is caught in the background attestation/L1 pipeline and does not surface as an unhandled rejection
      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();
    });

    it('should proceed with block proposal when there is no proposer yet', async () => {
      // Mock that there is no official proposer yet
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(undefined);
      epochCache.getCommittee.mockResolvedValueOnce({
        committee: [] as EthAddress[],
        seed: 1n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: false,
      } as EpochCommitteeInfo);

      // Mock that we have some pending transactions
      const txs = [await makeTx(1), await makeTx(2)];
      TestUtils.mockPendingTxs(p2p, txs);
      block = await makeBlock(txs);

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      // Verify that the sequencer attempted to create and broadcast a block proposal
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();

      // Verify that the sequencer did not broadcast the block proposal since there's no committee
      // (block proposal is still created since it's included in the checkpoint)
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
        pub.sendRequestsAt.mockResolvedValue({
          result: { receipt: { status: 'success' } as any },
          successfulActions: ['propose'],
          failedActions: [],
          sentActions: ['propose'],
          expiredActions: [],
        });
        pub.canProposeAt.mockResolvedValue({
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
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(1),
          ts: 1000n,
          nowSeconds: 1000n,
        })
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(2),
          ts: 1000n,
          nowSeconds: 1000n,
        });
      // Target slots are one ahead of the build slots above (build 1 -> target 2, build 2 -> target 3).
      epochCache.getTargetSlot.mockReset().mockReturnValueOnce(SlotNumber(2)).mockReturnValueOnce(SlotNumber(3));
      epochCache.getTargetEpoch.mockReturnValue(EpochNumber(1));
      epochCache.getTargetEpochAndSlotInNextL1Slot
        .mockReset()
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(2),
          ts: 1000n,
          nowSeconds: 1000n,
        })
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(3),
          ts: 1000n,
          nowSeconds: 1000n,
        });

      sequencer.updateConfig({ enforceTimeTable: false, maxTxsPerBlock: 4 });

      // Build and publish 2 blocks, the sequencer should request a new publisher each time
      for (let i = 0; i < 2; i++) {
        const tx = await makeTx();
        block = await makeBlock([tx]);
        TestUtils.mockPendingTxs(p2p, [tx]);
        await sequencer.work();
        await sequencer.awaitLastProposalSubmission();

        const attestationsAndSigners = new CommitteeAttestationsAndSigners(getSignatures(), signatureContext);
        expect(publishers[i].enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
        expect(publishers[i].enqueueProposeCheckpoint).toHaveBeenCalledWith(
          expect.any(Checkpoint),
          attestationsAndSigners,
          getSignatures()[0].signature,
          expect.objectContaining({
            txTimeoutAt: expect.any(Date),
          }),
        );
      }
    });
  });

  describe('voting when escape hatch is open', () => {
    const mockSlashActions = [{ type: 'vote-offenses' as const, round: 1n, votes: [], committees: [] }];

    it('should vote but not propose checkpoint when escape hatch is open', async () => {
      // Escape hatch is open for the epoch/slot
      epochCache.getCommittee.mockResolvedValue({
        committee,
        seed: 1n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: true,
      });
      epochCache.isEscapeHatchOpen.mockResolvedValue(true);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // Mock slashing actions and governance payload
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);
      const governancePayload = EthAddress.random();
      sequencer.updateConfig({ governanceProposerPayload: governancePayload });

      // Ensure enqueues succeed
      publisher.enqueueSlashingActions.mockResolvedValue(true);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);

      await sequencer.work();

      // Vote-only path should run
      expect(slasherClient.getProposerActions).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
      expect(publisher.enqueueSlashingActions).toHaveBeenCalled();
      expect(publisher.enqueueGovernanceCastSignal).toHaveBeenCalled();
      // Submission goes through sendRequestsAt so the bundle simulate's block.timestamp
      // override matches the slot the EIP-712 signatures were generated for.
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(publisher.sendRequests).not.toHaveBeenCalled();

      // But checkpoint proposal must not start
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('should not attempt to vote twice in the same slot when escape hatch is open', async () => {
      epochCache.getCommittee.mockResolvedValue({
        committee,
        seed: 1n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: true,
      });
      epochCache.isEscapeHatchOpen.mockResolvedValue(true);

      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      publisher.enqueueSlashingActions.mockResolvedValue(true);

      await sequencer.work();
      expect(publisher.enqueueSlashingActions).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequestsAt).toHaveBeenCalledTimes(1);

      publisher.enqueueSlashingActions.mockClear();
      publisher.sendRequestsAt.mockClear();
      slasherClient.getProposerActions.mockClear();

      await sequencer.work();
      expect(slasherClient.getProposerActions).not.toHaveBeenCalled();
      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).not.toHaveBeenCalled();
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

    it('should vote on slashing and governance when sync fails and past the start deadline', async () => {
      // Past start_deadline for the target slot: tryVoteWhenCannotBuild should vote instead of waiting to
      // build (sync has failed, so building is impossible anyway).
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

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
      expect(slasherClient.getProposerActions).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
      expect(publisher.enqueueSlashingActions).toHaveBeenCalled();
      expect(publisher.enqueueGovernanceCastSignal).toHaveBeenCalledWith(
        governancePayload,
        SlotNumber(newSlotNumber),
        expect.any(EthAddress),
        expect.any(Function),
      );
      // Votes are submitted via sendRequestsAt (fire-and-forget, scheduled at target slot start).
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
    });

    it('should vote when sync fails even within the build time limit', async () => {
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline - 1) * 1000);

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      await sequencer.work();

      expect(publisher.enqueueSlashingActions).toHaveBeenCalledWith(
        mockSlashActions,
        SlotNumber(newSlotNumber),
        expect.any(EthAddress),
        expect.any(Function),
      );
    });

    it('should not vote when sync fails but not a proposer', async () => {
      // Set time past the start deadline for the target slot.
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

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
      // Set time past the start deadline for the target slot.
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

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
      // Votes are submitted via sendRequestsAt (fire-and-forget, scheduled at target slot start).
      expect(publisher.sendRequestsAt).toHaveBeenCalledTimes(1);

      // Reset mocks
      publisher.enqueueSlashingActions.mockClear();
      publisher.sendRequestsAt.mockClear();
      slasherClient.getProposerActions.mockClear();

      // Second attempt in the same slot should be skipped
      await sequencer.work();
      expect(slasherClient.getProposerActions).not.toHaveBeenCalled();
      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).not.toHaveBeenCalled();
    });
  });

  describe('consider invalidating checkpoint', () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();
    const validator3 = EthAddress.random();

    let invalidValidationResult: ValidateCheckpointNegativeResult;

    beforeEach(() => {
      invalidValidationResult = {
        valid: false,
        checkpoint: {
          checkpointNumber: CheckpointNumber(1),
          timestamp: 1000n,
          archive: Fr.random(),
          lastArchive: Fr.random(),
          slotNumber: SlotNumber(newSlotNumber),
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
        isEscapeHatchOpen: false,
      });

      // Setup validator client
      validatorClient.getValidatorAddresses.mockReturnValue([validator1, validator2, validator3]);

      // Make sure we're NOT the proposer so considerInvalidatingCheckpoint is called
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(EthAddress.random());

      // Setup publisher factory
      publisherFactory.create.mockImplementation((validatorAddress?: EthAddress) => {
        return Promise.resolve({
          attestorAddress: validatorAddress ?? validator1,
          publisher,
        });
      });

      publisher.simulateInvalidateCheckpoint.mockResolvedValue({
        forcePendingCheckpointNumber: CheckpointNumber(1),
      } as InvalidateCheckpointRequest);
    });

    it('should use committee member when invalidating as committee member', async () => {
      // Set time past the committee member threshold
      const timePastThreshold = 3; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should create publisher with the committee member validator
      expect(publisherFactory.create).toHaveBeenCalledWith(validator2);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalled();
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should use first validator when invalidating as non-committee member', async () => {
      // Mock committee without any of our validators
      epochCache.getCommittee.mockResolvedValue({
        committee: [EthAddress.random()],
        seed: 123n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: false,
      });

      // Set time past the non-committee member threshold
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should create publisher with the first validator
      expect(publisherFactory.create).toHaveBeenCalledWith(validator1);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalled();
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('should not invalidate when time thresholds not met', async () => {
      // Set time before any threshold
      const timePastThreshold = 1;
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should not create publisher or invalidate
      expect(publisherFactory.create).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();
    });

    it('should not invalidate when pending chain is valid', async () => {
      // Mock valid chain
      l2BlockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });

      // Set time past threshold
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);

      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      // Should not create publisher or invalidate
      expect(publisherFactory.create).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();
    });
  });

  describe('modes', () => {
    it('non-enforced mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: false, maxTxsPerBlock: 4 });

      await setupSingleTxBlock();

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      // Verify checkpoint was built and proposed
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('single block mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: true, maxTxsPerBlock: 4 });

      await setupSingleTxBlock();

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      // Verify checkpoint was built and proposed
      expect(checkpointBuilder.buildBlockCalls).toHaveLength(1);
      expect(checkpointBuilder.completeCheckpointCalled).toBe(true);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('multi block mode', async () => {
      sequencer.updateConfig({ enforceTimeTable: true, maxTxsPerBlock: 4, blockDurationMs: 500 });

      const txs = await timesParallel(8, i => makeTx(i * 0x10000));
      block = await makeBlock(txs.slice(0, 4));
      TestUtils.mockPendingTxs(p2p, txs);

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(1);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });
  });

  describe('pipelining with proposed checkpoint-based L1 check skip', () => {
    beforeEach(() => {
      // Skip execute() to avoid the pipeline sleep (which would block for 16s in real time).
      // We only need to test prepareCheckpointProposal behavior here.
      sequencer.skipExecute = true;

      // Set up a pipelining scenario: slot.now=1, slot.pipeline=2
      epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(1),
        ts: 1000n,
        nowSeconds: 1000n,
      });
      epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(2),
        ts: 1000n,
        nowSeconds: 1000n,
      });

      // canProposeAt returns slot 2 (pipeline slot)
      publisher.canProposeAt.mockResolvedValue({
        slot: SlotNumber(2),
        checkpointNumber: CheckpointNumber.fromBlockNumber(newBlockNumber),
        timeOfNextL1Slot: 1000n,
      });

      // We are the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
    });

    afterEach(() => {
      sequencer.skipExecute = false;
    });

    it('derives the pipelined target slot from the same next-L1-slot snapshot', async () => {
      await setupSingleTxBlock();

      epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(6),
        ts: 1780066804n,
        nowSeconds: 1780066811n,
      });
      epochCache.getTargetEpochAndSlotInNextL1Slot.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(8),
        ts: 1780066816n,
        nowSeconds: 1780066812n,
      });
      publisher.canProposeAt.mockResolvedValue({
        slot: SlotNumber(7),
        checkpointNumber: CheckpointNumber.fromBlockNumber(newBlockNumber),
        timeOfNextL1Slot: 1780066816n,
      });

      await sequencer.work();

      expect(epochCache.getTargetEpochAndSlotInNextL1Slot).not.toHaveBeenCalled();
      expect(epochCache.getProposerAttesterAddressInSlot).toHaveBeenCalledWith(SlotNumber(7));
      expect(p2p.prepareForSlot).toHaveBeenCalledWith(SlotNumber(7));
    });

    it('skips L1 check when proposed checkpoint exists', async () => {
      await setupSingleTxBlock();

      // Override to non-genesis state so checkSync doesn't take the genesis path.
      // proposedCheckpoint is set with checkpoint number 1 > checkpointed tip 0, so hasProposedCheckpoint is true.
      const nonGenesisHash = Fr.random().toString();
      const proposedCheckpointHash = Fr.random().toString();
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(1),
          latestBlockHash: nonGenesisHash,
          finalizedBlockNumber: BlockNumber.ZERO,
          oldestHistoricBlockNumber: BlockNumber.ZERO,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus);
      const tipsWithBlock1 = {
        proposed: { number: BlockNumber(1), hash: nonGenesisHash },
        proposedCheckpoint: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber(1), hash: proposedCheckpointHash },
        },
        checkpointed: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        proven: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        finalized: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
      };
      l2BlockSource.getL2Tips.mockResolvedValue(tipsWithBlock1);
      l1ToL2MessageSource.getL2Tips.mockResolvedValue(tipsWithBlock1);
      p2p.getStatus.mockResolvedValue({
        syncedToL2Block: { number: BlockNumber(1), hash: nonGenesisHash },
      } as any);
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1) }) }),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.ZERO,
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } satisfies BlockData);
      l2BlockSource.getProposedCheckpointData.mockResolvedValue({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.ZERO,
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      } satisfies ProposedCheckpointData);

      await sequencer.work();

      const simulationOverridesPlan = publisher.canProposeAt.mock.calls.at(-1)?.[2];
      expect(simulationOverridesPlan?.chainTipsOverride?.pending).toEqual(CheckpointNumber(1));
      // The archive root is passed directly as the first arg to canProposeAt (not inside the plan).
    });

    it('skips proposal when checkpoint exceeds pipeline depth', async () => {
      await setupSingleTxBlock();

      // Simulate the bug scenario: proposed tip has advanced through 2 pipelined checkpoints.
      // Confirmed checkpoint is 1, pending is 2, proposed tip is in checkpoint 3.
      // So sequencer would try to build checkpoint 4, which exceeds the 1-deep pipeline limit.
      const nonGenesisHash = Fr.random().toString();
      const proposedCheckpointHash = Fr.random().toString();
      const checkpointedHash = Fr.random().toString();
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(3),
          latestBlockHash: nonGenesisHash,
          finalizedBlockNumber: BlockNumber.ZERO,
          oldestHistoricBlockNumber: BlockNumber.ZERO,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus);
      const tips = {
        proposed: { number: BlockNumber(3), hash: nonGenesisHash },
        proposedCheckpoint: {
          block: { number: BlockNumber(2), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber(2), hash: proposedCheckpointHash },
        },
        checkpointed: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber(1), hash: checkpointedHash },
        },
        proven: {
          block: { number: BlockNumber.ZERO, hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        finalized: {
          block: { number: BlockNumber.ZERO, hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
      };
      l2BlockSource.getL2Tips.mockResolvedValue(tips);
      l1ToL2MessageSource.getL2Tips.mockResolvedValue(tips);
      p2p.getStatus.mockResolvedValue({
        syncedToL2Block: { number: BlockNumber(3), hash: nonGenesisHash },
      } as any);
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(3) }) }),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.ZERO,
        checkpointNumber: CheckpointNumber(3),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } satisfies BlockData);
      l2BlockSource.getProposedCheckpointData.mockResolvedValue({
        checkpointNumber: CheckpointNumber(2),
      } as any);

      await sequencer.work();

      // Should have bailed before reaching the L1 check: checkpoint 4 > min(1+2, 2+1) = 3
      expect(publisher.canProposeAt).not.toHaveBeenCalled();
    });

    it('pins both chain tips to the on-chain pending snapshot when no proposed checkpoint applies', async () => {
      await setupSingleTxBlock();

      await sequencer.work();

      // The default `getL2Tips` mock has checkpointed.checkpoint.number == CheckpointNumber.ZERO.
      const plan = publisher.canProposeAt.mock.calls.at(-1)?.[2];
      expect(plan?.chainTipsOverride?.pending).toEqual(CheckpointNumber.ZERO);
      expect(plan?.chainTipsOverride?.proven).toEqual(CheckpointNumber.ZERO);
      expect(plan?.pendingCheckpointState).toBeUndefined();
    });

    it('mirrors pending onto proven when the caller overrides pending via pipelining', async () => {
      await setupSingleTxBlock();

      // Set up a pipelined parent (pending override = parentCheckpointNumber = 1).
      const nonGenesisHash = Fr.random().toString();
      const proposedCheckpointHash = Fr.random().toString();
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(1),
          latestBlockHash: nonGenesisHash,
          finalizedBlockNumber: BlockNumber.ZERO,
          oldestHistoricBlockNumber: BlockNumber.ZERO,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus);
      const tipsWithBlock1 = {
        proposed: { number: BlockNumber(1), hash: nonGenesisHash },
        proposedCheckpoint: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber(1), hash: proposedCheckpointHash },
        },
        checkpointed: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        proven: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
        finalized: {
          block: { number: BlockNumber(1), hash: nonGenesisHash },
          checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
        },
      };
      l2BlockSource.getL2Tips.mockResolvedValue(tipsWithBlock1);
      l1ToL2MessageSource.getL2Tips.mockResolvedValue(tipsWithBlock1);
      p2p.getStatus.mockResolvedValue({
        syncedToL2Block: { number: BlockNumber(1), hash: nonGenesisHash },
      } as any);
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(1) }) }),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.ZERO,
        checkpointNumber: CheckpointNumber(1),
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } satisfies BlockData);
      l2BlockSource.getProposedCheckpointData.mockResolvedValue({
        checkpointNumber: CheckpointNumber(1),
        header: CheckpointHeader.empty(),
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.ZERO,
        startBlock: BlockNumber(1),
        blockCount: 1,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      } satisfies ProposedCheckpointData);

      await sequencer.work();

      const plan = publisher.canProposeAt.mock.calls.at(-1)?.[2];
      expect(plan?.chainTipsOverride?.pending).toEqual(CheckpointNumber(1));
      expect(plan?.chainTipsOverride?.proven).toEqual(CheckpointNumber(1));
    });

    it('emits preparing-checkpoint with snapshot-pinned tips when no override applies', async () => {
      await setupSingleTxBlock();

      const events: any[] = [];
      sequencer.on('preparing-checkpoint', args => events.push(args));

      await sequencer.work();

      expect(events).toHaveLength(1);
      // With no pipelined or invalidation override, both `pending` and `proven` are pinned to the
      // on-chain pending snapshot (checkpointedCheckpointNumber) so `canPruneAtTime` short-circuits
      // and a live re-read inside `makeChainTipsOverride` can't reintroduce a phantom prune.
      // `provenOverride` mirrors the pinned proven tip whenever a plan was built.
      expect(events[0]).toEqual({
        targetSlot: SlotNumber(2),
        checkpointNumber: expect.anything(),
        hadProposedParent: false,
        provenOverride: CheckpointNumber.ZERO,
        simulatedPending: CheckpointNumber.ZERO,
      });
    });
  });

  describe('checkSync orphan-block guard', () => {
    // Mocks all sync sources so checkSync passes its earlier equality checks and reaches the orphan
    // guard, with the world-state tip at `blockNumber` (in `blockCheckpointNumber`) while the
    // checkpointed and proposed-checkpoint tips sit at the given checkpoint numbers.
    const setupSyncedToBlock = (opts: {
      blockNumber: BlockNumber;
      blockSlot: SlotNumber;
      blockCheckpointNumber: CheckpointNumber;
      checkpointedCheckpointNumber: CheckpointNumber;
      proposedCheckpointTipNumber: CheckpointNumber;
      proposedCheckpointData: ProposedCheckpointData | undefined;
    }) => {
      const hash = Fr.random().toString();
      const checkpointHash = Fr.random().toString();
      const proposedCheckpointHash = Fr.random().toString();
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: opts.blockNumber,
          latestBlockHash: hash,
          finalizedBlockNumber: BlockNumber.ZERO,
          oldestHistoricBlockNumber: BlockNumber.ZERO,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus);
      const tips = {
        proposed: { number: opts.blockNumber, hash },
        proposedCheckpoint: {
          block: { number: opts.blockNumber, hash },
          checkpoint: { number: opts.proposedCheckpointTipNumber, hash: proposedCheckpointHash },
        },
        checkpointed: {
          block: { number: opts.blockNumber, hash },
          checkpoint: { number: opts.checkpointedCheckpointNumber, hash: checkpointHash },
        },
        proven: {
          block: { number: opts.blockNumber, hash },
          checkpoint: { number: opts.checkpointedCheckpointNumber, hash: checkpointHash },
        },
        finalized: {
          block: { number: opts.blockNumber, hash },
          checkpoint: { number: opts.checkpointedCheckpointNumber, hash: checkpointHash },
        },
      };
      l2BlockSource.getL2Tips.mockResolvedValue(tips);
      l1ToL2MessageSource.getL2Tips.mockResolvedValue(tips);
      p2p.getStatus.mockResolvedValue({ syncedToL2Block: { number: opts.blockNumber, hash } } as any);
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber: opts.blockNumber, slotNumber: opts.blockSlot }),
        }),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.ZERO,
        checkpointNumber: opts.blockCheckpointNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      } satisfies BlockData);
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(opts.proposedCheckpointData);
    };

    // The orphan block sits at slot 3. With no explicit orphan grace configured, the sequencer mirrors
    // the archiver default of twice DEFAULT_MIN_BLOCK_DURATION.
    const orphanCheckpointDueSeconds = (graceSeconds = 2 * DEFAULT_MIN_BLOCK_DURATION) =>
      new ConsensusTimetable({ l1Constants, blockDuration: undefined }).getExpectedCheckpointLandTime(
        SlotNumber(3),
        graceSeconds,
      );

    it('returns undefined and warns once the missing proposed checkpoint is overdue', async () => {
      // Local tip is a block at checkpoint 3, but the checkpointed and proposed-checkpoint tips are
      // still at checkpoint 2 and no proposed checkpoint 3 exists: an orphan block-only tip whose
      // enclosing checkpoint should have been proposed by now.
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpointTipNumber: CheckpointNumber(2),
        proposedCheckpointData: undefined,
      });
      dateProvider.setTime((orphanCheckpointDueSeconds() + 1) * 1000);
      const warnSpy = jest.spyOn(sequencer.getLogger(), 'warn');

      const result = await sequencer.checkSyncForTest({ ts: 1000n, slot: SlotNumber(2) });

      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Sequencer sync check failed: proposed block has no matching proposed checkpoint',
        expect.objectContaining({
          blockCheckpointNumber: CheckpointNumber(3),
          checkpointedCheckpointNumber: CheckpointNumber(2),
          proposedCheckpointTipNumber: CheckpointNumber(2),
          proposedCheckpointDataNumber: undefined,
        }),
      );
    });

    it('returns undefined without warning while the proposed checkpoint is not yet overdue', async () => {
      // Same orphan-shaped tip, but we are still within the normal pipelining window: the block proposal
      // for checkpoint 3 has arrived ahead of its checkpoint proposal, which is not yet due. This is the
      // happy-path steady state and must not warn.
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpointTipNumber: CheckpointNumber(2),
        proposedCheckpointData: undefined,
      });
      dateProvider.setTime((orphanCheckpointDueSeconds() - 1) * 1000);
      const warnSpy = jest.spyOn(sequencer.getLogger(), 'warn');

      const result = await sequencer.checkSyncForTest({ ts: 1000n, slot: SlotNumber(2) });

      expect(result).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uses explicit orphan-prune grace config for the overdue warning threshold', async () => {
      const configuredGraceSeconds = 12;
      sequencer.updateConfig({ orphanProposedBlockPruneGraceSeconds: configuredGraceSeconds });
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpointTipNumber: CheckpointNumber(2),
        proposedCheckpointData: undefined,
      });
      dateProvider.setTime((orphanCheckpointDueSeconds(configuredGraceSeconds) - 1) * 1000);
      const warnSpy = jest.spyOn(sequencer.getLogger(), 'warn');

      const result = await sequencer.checkSyncForTest({ ts: 1000n, slot: SlotNumber(2) });

      expect(result).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('proceeds when a matching proposed checkpoint exists for the block', async () => {
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpointTipNumber: CheckpointNumber(3),
        proposedCheckpointData: {
          checkpointNumber: CheckpointNumber(3),
          header: CheckpointHeader.empty(),
          archive: AppendOnlyTreeSnapshot.empty(),
          checkpointOutHash: Fr.ZERO,
          startBlock: BlockNumber(3),
          blockCount: 1,
          totalManaUsed: 0n,
          feeAssetPriceModifier: 0n,
        } satisfies ProposedCheckpointData,
      });

      const result = await sequencer.checkSyncForTest({ ts: 1000n, slot: SlotNumber(2) });

      expect(result).toBeDefined();
      expect(result?.checkpointNumber).toEqual(CheckpointNumber(3));
      expect(result?.checkpointedCheckpointNumber).toEqual(CheckpointNumber(2));
    });
  });

  describe('view-based proposer lookup', () => {
    it('passes target slot to getProposerAttesterAddressInSlot', async () => {
      const proposer = signer.address;
      validatorClient.getValidatorAddresses.mockReturnValue([proposer]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer);

      await sequencer.checkCanProposeForTest(SlotNumber(2));

      expect(epochCache.getProposerAttesterAddressInSlot).toHaveBeenCalledWith(SlotNumber(2));
    });
  });
});

class TestSequencer extends Sequencer {
  /** When true, work() only runs prepareCheckpointProposal and skips execute(). */
  public skipExecute = false;

  public getTimeTable() {
    return this.timetable;
  }

  public getLastSlotForCheckpointProposalJob() {
    return this.lastSlotForCheckpointProposalJob;
  }

  public setL1GenesisTime(l1GenesisTime: number) {
    this.l1Constants.l1GenesisTime = BigInt(l1GenesisTime);
  }

  public override async work() {
    this.setState(SequencerState.IDLE, undefined, { force: true });
    if (this.skipExecute) {
      this.setState(SequencerState.SYNCHRONIZING, undefined);
      const { slot, targetSlot, epoch, targetEpoch, ts, nowSeconds } = this.getSlotContextInNextL1Slot();
      await this.prepareCheckpointProposal(slot, targetSlot, epoch, targetEpoch, ts, nowSeconds);
      return;
    }
    return super.work();
  }

  public async awaitLastProposalSubmission() {
    await this.lastCheckpointProposalJob?.awaitPendingSubmission();
  }

  public checkCanProposeForTest(slot: SlotNumber) {
    return this.checkCanPropose(slot);
  }

  public checkSyncForTest(args: { ts: bigint; slot: SlotNumber }) {
    return this.checkSync(args);
  }

  public getLogger() {
    return this.log;
  }
}
