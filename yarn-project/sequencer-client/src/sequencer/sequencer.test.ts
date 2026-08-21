import { type EpochCache, type EpochCommitteeInfo, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { NoCommitteeError, type RollupContract } from '@aztec/ethereum/contracts';
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
import { promiseWithResolvers } from '@aztec/foundation/promise';
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
  type MerkleTreeWriteOperations,
  type SequencerConfig,
  type TreeInfo,
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
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
    verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
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
      // Streaming inbox: the checkpoint job passes the parent bucket hint (genesis => 0n).
      0n,
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
    publisher.validateCheckpointHeader.mockResolvedValue();
    publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
    publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
    publisher.enqueueSlashingActions.mockResolvedValue(true);
    publisher.enqueuePruneIfPrunable.mockResolvedValue(false);
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
    globalVariableBuilder.buildCheckpointGlobalVariables.mockResolvedValue(omit(globalVariables, 'blockNumber'));

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({ syncedToL2Block: { number: lastBlockNumber, hash } }),
      getCheckpointAttestationsForSlot: mockFn().mockResolvedValue([]),
      getP2PConnectivity: mockFn().mockResolvedValue({ enabled: true, connectedPeers: 5 }),
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
    // Streaming inbox: the checkpoint job forks world state and resolves the parent Inbox bucket
    // from the fork's L1-to-L2 tree leaf count. Default to an empty tree so it starts at the genesis bucket.
    const mockFork = mock<MerkleTreeWriteOperations>({
      [Symbol.asyncDispose]: jest.fn().mockReturnValue(Promise.resolve()) as () => Promise<void>,
    });
    mockFork.getTreeInfo.mockResolvedValue({ size: 0n } as TreeInfo);
    worldState.fork.mockResolvedValue(mockFork);

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
      getL2Tips: mockFn().mockResolvedValue({
        proposed: { number: lastBlockNumber, hash },
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
    l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue({
      seq: 0n,
      inboxRollingHash: Fr.ZERO,
      totalMsgCount: 0n,
      timestamp: 0n,
      msgCount: 0,
      lastMessageIndex: 0n,
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
      maxTxsPerBlock: 4,
      l1ChainId: signatureContext.chainId,
      // With aztecSlotDuration=8 and ethereumSlotDuration=4 (fast profile), a 2s block duration derives
      // exactly one valid block sub-slot. The production default (3s) would derive zero blocks for this
      // slot duration and make ProposerTimetable throw on construction.
      blockDurationMs: 2000,
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

  describe('perBlockAllocationMultiplier guard', () => {
    it('rejects a multiplier below the network minimum', () => {
      expect(() => sequencer.updateConfig({ perBlockAllocationMultiplier: 1.0 })).toThrow(
        /perBlockAllocationMultiplier/,
      );
    });

    it('accepts a multiplier at or above the network minimum', () => {
      expect(() => sequencer.updateConfig({ perBlockAllocationMultiplier: 1.5 })).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    afterEach(async () => {
      await sequencer.stop();
    });

    it('start is idempotent: a second start does not replace the poll loop', () => {
      sequencer.start();
      const firstLoop = sequencer.getRunningPromise();
      expect(sequencer.isRunning()).toBe(true);

      sequencer.start();

      // The second start must be a no-op reusing the same loop, not a fresh RunningPromise that
      // leaves the first loop running with no handle to stop it.
      expect(sequencer.getRunningPromise()).toBe(firstLoop);
      expect(sequencer.isRunning()).toBe(true);
    });

    it('stop halts the poll loop, moves to STOPPED, and is idempotent', async () => {
      sequencer.start();
      expect(sequencer.isRunning()).toBe(true);

      await sequencer.stop();

      expect(sequencer.isRunning()).toBe(false);
      expect(sequencer.status().state).toBe(SequencerState.STOPPED);

      await expect(sequencer.stop()).resolves.not.toThrow();
      expect(sequencer.status().state).toBe(SequencerState.STOPPED);
    });

    it('can be restarted after a stop and resumes the poll loop', async () => {
      sequencer.start();
      await sequencer.stop();
      expect(sequencer.isRunning()).toBe(false);

      sequencer.start();

      expect(sequencer.isRunning()).toBe(true);
      // The loop is live again (start runs work() immediately, so the exact state may already have
      // advanced past IDLE); the point is it is no longer STOPPED/STOPPING.
      expect([SequencerState.STOPPED, SequencerState.STOPPING]).not.toContain(sequencer.status().state);
    });

    it('refuses to start while stopping, so no fresh poll loop is orphaned mid-stop', async () => {
      sequencer.start();
      const loopBeforeStop = sequencer.getRunningPromise();

      // Park stop() in the STOPPING state by hanging stopAll until we release it.
      const { promise: stopAllHang, resolve: releaseStopAll } = promiseWithResolvers<void>();
      publisherFactory.stopAll.mockReturnValueOnce(stopAllHang);

      const stopPromise = sequencer.stop();
      expect(sequencer.status().state).toBe(SequencerState.STOPPING);

      // A start() landing mid-stop must throw rather than silently allocate a new loop the stop would
      // orphan while leaving the caller believing the sequencer is running.
      expect(() => sequencer.start()).toThrow('Cannot start sequencer while it is stopping');
      expect(sequencer.getRunningPromise()).toBe(loopBeforeStop);

      releaseStopAll();
      await stopPromise;
      expect(sequencer.status().state).toBe(SequencerState.STOPPED);
    });

    it('pause lets the in-flight iteration finish untouched and leaves the sequencer resumable', async () => {
      const checkpointErrors: Error[] = [];
      sequencer.on('checkpoint-error', ({ error }) => checkpointErrors.push(error));

      // Park the in-flight work() at its proposer lookup, so pause finds a live iteration. Once released,
      // we are not the proposer, so the iteration finishes on the cheap non-proposer path.
      const { promise: proposerHang, resolve: releaseProposer } = promiseWithResolvers<EthAddress | undefined>();
      epochCache.getProposerAttesterAddressInSlot.mockReturnValueOnce(proposerHang);
      validatorClient.getValidatorAddresses.mockReturnValue([]);

      sequencer.start();
      const pausePromise = sequencer.pause();
      await new Promise(resolve => setTimeout(resolve, 0));

      // While the iteration is parked, nothing may be interrupted and STOPPING may not be entered: entering
      // it would make the iteration's own setState calls throw SequencerInterruptedError. pause also leaves
      // the publishers running (no stopAll), unlike stop().
      expect(publisherFactory.stopAll).not.toHaveBeenCalled();
      expect(sequencer.status().state).not.toBe(SequencerState.STOPPING);

      releaseProposer(signer.address);
      await pausePromise;

      // A clean pause emits no spurious checkpoint-error and, unlike stop(), leaves the sequencer resumable:
      // the poll loop is halted but the state is neither STOPPED nor STOPPING.
      expect(checkpointErrors).toEqual([]);
      expect(sequencer.isRunning()).toBe(false);
      expect([SequencerState.STOPPED, SequencerState.STOPPING]).not.toContain(sequencer.status().state);

      // And a subsequent start() resumes the poll loop.
      sequencer.start();
      expect(sequencer.isRunning()).toBe(true);
    });

    it('drains an in-flight fallback send on stop, leaving nothing pending across a restart', async () => {
      // Drive the fire-and-forget fallback vote path: past the build-start deadline with a governance
      // payload to vote for, and us as the proposer (mirrors 'votes without building' above).
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);
      sequencer.updateConfig({ governanceProposerPayload: EthAddress.random() });
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);

      // The fallback send resolves only when released, and only after the sequencer interrupts it,
      // mimicking a wrapper publisher sleeping in waitForTargetSlot.
      const { promise: sendHang, resolve: releaseSend } = promiseWithResolvers<undefined>();
      publisher.sendRequestsAt.mockReturnValueOnce(
        sendHang.then(() => {
          if (publisher.interrupt.mock.calls.length === 0) {
            throw new Error('fallback send completed without being interrupted by stop()');
          }
          return undefined;
        }),
      );

      await sequencer.work();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(sequencer.getPendingRequestCount()).toBe(1);

      // stop() must interrupt the fallback wrapper (waking its sleep so it short-circuits without
      // publishing) and await it, so nothing pending survives into a later restart.
      const stopPromise = sequencer.stop();
      releaseSend(undefined);
      await stopPromise;

      expect(publisher.interrupt).toHaveBeenCalled();
      expect(sequencer.getPendingRequestCount()).toBe(0);
      expect(sequencer.status().state).toBe(SequencerState.STOPPED);
    });
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

    it('does not build a block when no peers are connected', async () => {
      await setupSingleTxBlock();
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: true, connectedPeers: 0 });

      await sequencer.work();

      expect(checkpointBuilder.buildBlockCalls).toHaveLength(0);
      expect(publisher.canProposeAt).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      // The slot is marked as attempted so the gate is not re-evaluated within the same slot.
      expect(sequencer.getLastSlotForCheckpointProposalJob()).toEqual(SlotNumber(newSlotNumber));
    });

    it('votes without building when no peers are connected', async () => {
      await setupSingleTxBlock();
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: true, connectedPeers: 0 });

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

    it('builds a block with zero peers when p2p is disabled', async () => {
      await setupSingleTxBlock();
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: false, connectedPeers: 0 });

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      expectPublisherProposeL2Block();
    });

    it('builds a block with zero peers when minPeersToPropose is zero', async () => {
      await setupSingleTxBlock();
      p2p.getP2PConnectivity.mockResolvedValue({ enabled: true, connectedPeers: 0 });
      sequencer.updateConfig({ minPeersToPropose: 0 });

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      expectPublisherProposeL2Block();
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

    // TODO(palla/mbps): Reinstante the validateCheckpointHeader call
    it.skip('aborts building a block if the chain moves underneath it', async () => {
      await setupSingleTxBlock();

      // This could practically be for any reason, e.g., could also be that we have entered a new slot.
      publisher.validateCheckpointHeader.mockRejectedValueOnce(new Error('No block for you'));

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
        pub.validateCheckpointHeader.mockResolvedValue();
        pub.enqueueProposeCheckpoint.mockResolvedValue(undefined);
        pub.enqueueGovernanceCastSignal.mockResolvedValue(true);
        pub.enqueueSlashingActions.mockResolvedValue(true);
        pub.enqueuePruneIfPrunable.mockResolvedValue(false);
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

      sequencer.updateConfig({ maxTxsPerBlock: 4 });

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
          // Streaming inbox: the checkpoint job passes the parent bucket hint (genesis => 0n).
          0n,
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

    it('votes when escape hatch is open even if the sync check would fail', async () => {
      // The escape-hatch vote path now runs before the sync check, so a proposer with the hatch open
      // votes even when the sync check would fail (it no longer has to pass checkSync first).
      epochCache.getCommittee.mockResolvedValue({
        committee,
        seed: 1n,
        epoch: EpochNumber(1),
        isEscapeHatchOpen: true,
      });
      epochCache.isEscapeHatchOpen.mockResolvedValue(true);

      // Make the sync check fail by diverging the world-state tip from the archiver's.
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(lastBlockNumber + 1),
          latestBlockHash: Fr.random().toString(),
        } as WorldStateSyncStatus,
      });

      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);
      publisher.enqueueSlashingActions.mockResolvedValue(true);

      await sequencer.work();

      expect(publisher.enqueueSlashingActions).toHaveBeenCalled();
      expect(publisher.sendRequestsAt).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
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
      // Past start_deadline for the target slot: tryVoteAndPruneWhenCannotBuild should vote instead of waiting
      // to build (sync has failed, so building is impossible anyway).
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

    it('does not run fallback actions when sync fails before the build start deadline', async () => {
      // A transient sync miss with time still left to build must not trigger fallback actions: the
      // work loop should retry on a later tick once sync recovers. In particular it must not send a
      // standalone prune, which would give up the slot prematurely.
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline - 1) * 1000);

      // Mock slashing actions
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      await sequencer.work();

      expect(publisher.enqueueSlashingActions).not.toHaveBeenCalled();
      expect(publisher.enqueuePruneIfPrunable).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).not.toHaveBeenCalled();
      // The slot is left unmarked so a later work-loop tick can retry once sync recovers.
      expect(sequencer.getLastSlotForCheckpointProposalJob()).toBeUndefined();
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

    it('should prune when prunable even if there are no votes to cast', async () => {
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

      // No slashing actions and no governance payload, so all votes are falsy.
      slasherClient.getProposerActions.mockResolvedValue([]);
      publisher.enqueueSlashingActions.mockResolvedValue(false);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(false);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // Rollup is prunable, so the fallback should enqueue a prune and still send.
      publisher.enqueuePruneIfPrunable.mockResolvedValue(true);

      await sequencer.work();

      expect(publisher.enqueuePruneIfPrunable).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
      // A send fires even though only prune (and no votes) was enqueued.
      expect(publisher.sendRequestsAt).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
    });

    it('should not send anything when there are no votes and the rollup is not prunable', async () => {
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

      // No slashing actions and no governance payload, so all votes are falsy.
      slasherClient.getProposerActions.mockResolvedValue([]);
      publisher.enqueueSlashingActions.mockResolvedValue(false);
      publisher.enqueueGovernanceCastSignal.mockResolvedValue(false);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // Rollup is not prunable.
      publisher.enqueuePruneIfPrunable.mockResolvedValue(false);

      await sequencer.work();

      expect(publisher.enqueuePruneIfPrunable).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
      expect(publisher.sendRequestsAt).not.toHaveBeenCalled();
    });

    it('does not enqueue a standalone prune before the build deadline even when the rollup is prunable', async () => {
      // Standalone prune is reserved for when we can no longer build the slot (past the build start
      // deadline). Before the deadline, a transient sync miss must retry rather than prune the pending
      // chain, even if the rollup happens to be prunable at the target slot.
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline - 1) * 1000);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      // The rollup is prunable, but we are still within the build window.
      publisher.enqueuePruneIfPrunable.mockResolvedValue(true);

      await sequencer.work();

      expect(publisher.enqueuePruneIfPrunable).not.toHaveBeenCalled();
      expect(publisher.sendRequestsAt).not.toHaveBeenCalled();
    });

    it('should enqueue prune alongside votes and send a single request', async () => {
      const startDeadline = sequencer.getTimeTable().getBuildStartDeadline(SlotNumber(newSlotNumber));
      dateProvider.setTime((startDeadline + 1) * 1000);

      // Both votes and prune succeed.
      slasherClient.getProposerActions.mockResolvedValue(mockSlashActions);
      publisher.enqueueSlashingActions.mockResolvedValue(true);
      publisher.enqueuePruneIfPrunable.mockResolvedValue(true);

      // Set us as the proposer
      validatorClient.getValidatorAddresses.mockReturnValue([signer.address]);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(signer.address);

      await sequencer.work();

      expect(publisher.enqueueSlashingActions).toHaveBeenCalled();
      expect(publisher.enqueuePruneIfPrunable).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
      expect(publisher.sendRequestsAt).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequestsAt).toHaveBeenCalledWith(SlotNumber(newSlotNumber));
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
        verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
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

    it('invalidates even when the sync check would fail', async () => {
      // The non-proposer invalidation path reads only the archiver's pending-chain validation status,
      // so a failing sync check (e.g. the world-state tip diverging from the archiver's) no longer
      // suppresses invalidation the way it did when invalidation sat behind a fully-successful checkSync.
      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncSummary: {
          latestBlockNumber: BlockNumber(lastBlockNumber + 1),
          latestBlockHash: Fr.random().toString(),
        } as WorldStateSyncStatus,
      });

      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);
      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();

      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalled();
      expect(publisher.sendRequests).toHaveBeenCalled();
    });

    it('only attempts invalidation once per slot', async () => {
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);
      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      await sequencer.work();
      expect(publisher.simulateInvalidateCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequests).toHaveBeenCalledTimes(1);

      publisher.simulateInvalidateCheckpoint.mockClear();
      publisher.enqueueInvalidateCheckpoint.mockClear();
      publisher.sendRequests.mockClear();

      // A second tick in the same slot must not re-simulate or re-submit the invalidation.
      await sequencer.work();
      expect(publisher.simulateInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();
      expect(publisher.sendRequests).not.toHaveBeenCalled();
    });

    it('retries invalidation in the same slot after a transient simulation failure', async () => {
      const timePastThreshold = 5; // seconds
      dateProvider.setTime(Number(invalidValidationResult.checkpoint.timestamp) * 1000 + timePastThreshold * 1000);
      sequencer.updateConfig({
        secondsBeforeInvalidatingBlockAsCommitteeMember: 2,
        secondsBeforeInvalidatingBlockAsNonCommitteeMember: 3,
      });

      // First tick: simulation transiently fails to build a request, so the dedup guard is not set.
      publisher.simulateInvalidateCheckpoint.mockResolvedValueOnce(undefined);

      await sequencer.work();
      expect(publisher.simulateInvalidateCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.enqueueInvalidateCheckpoint).not.toHaveBeenCalled();

      // Second tick in the same slot: simulation succeeds, so we must retry rather than be deduped.
      await sequencer.work();
      expect(publisher.simulateInvalidateCheckpoint).toHaveBeenCalledTimes(2);
      expect(publisher.enqueueInvalidateCheckpoint).toHaveBeenCalledTimes(1);
      expect(publisher.sendRequests).toHaveBeenCalled();
    });
  });

  describe('modes', () => {
    it('builds with the default real timetable', async () => {
      sequencer.updateConfig({ maxTxsPerBlock: 4 });

      await setupSingleTxBlock();

      await sequencer.work();
      await sequencer.awaitLastProposalSubmission();

      // Verify checkpoint was built and proposed
      expect(checkpointBuilder.buildBlockCalls.length).toBeGreaterThan(0);
      expect(validatorClient.createCheckpointProposal).toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    it('single block mode', async () => {
      sequencer.updateConfig({ maxTxsPerBlock: 4 });

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
      sequencer.updateConfig({ maxTxsPerBlock: 4, blockDurationMs: 500 });

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

  describe('config updates', () => {
    it('rejects a config with sub-minimum allocation multipliers without committing it', () => {
      // Move to a 10-block geometry so the per-block allocation actually binds below the per-tx blob ceiling.
      sequencer.updateConfig({ blockDurationMs: 500 });
      const goodMultiplier = sequencer.getPerBlockAllocationMultiplier();
      const goodTimetable = sequencer.getTimeTable();

      // A sub-minimum multiplier must be rejected and must not mutate the live config or timetable. We drop
      // the DA multiplier too so the DA dimension is checked against its (higher) network minimum.
      expect(() =>
        sequencer.updateConfig({ perBlockAllocationMultiplier: 0.5, perBlockDAAllocationMultiplier: 0.5 }),
      ).toThrow(/perBlockDAAllocationMultiplier \(0.5\) is below the network minimum/);
      expect(sequencer.getPerBlockAllocationMultiplier()).toBe(goodMultiplier);
      expect(sequencer.getTimeTable()).toBe(goodTimetable);

      // A subsequent valid update still applies, proving the rejected value never stuck.
      sequencer.updateConfig({ maxTxsPerBlock: 7 });
      expect(sequencer.getPerBlockAllocationMultiplier()).toBe(goodMultiplier);
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
      // The proposed checkpoint has number 1 > checkpointed tip 0, so hasProposedCheckpoint is true.
      const nonGenesisHash = Fr.random().toString();
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
        inboxMsgTotal: 0n,
      });

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
      l2BlockSource.getProposedCheckpointData.mockResolvedValue({ checkpointNumber: CheckpointNumber(2) } as any);

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
        inboxMsgTotal: 0n,
      });

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
    // checkpointed tip sits at `checkpointedCheckpointNumber`. The leading proposed checkpoint (if any)
    // is supplied via `getProposedCheckpointData`.
    const setupSyncedToBlock = (opts: {
      blockNumber: BlockNumber;
      blockSlot: SlotNumber;
      blockCheckpointNumber: CheckpointNumber;
      checkpointedCheckpointNumber: CheckpointNumber;
      proposedCheckpoint: ProposedCheckpointData | undefined;
    }) => {
      const hash = Fr.random().toString();
      const checkpointHash = Fr.random().toString();
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
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(opts.proposedCheckpoint);
    };

    it('returns undefined and logs debug while waiting for a matching proposed checkpoint', async () => {
      // Local tip is a block at checkpoint 3, but the checkpointed tip is still at checkpoint 2 and no
      // proposed checkpoint 3 exists: an orphan block-only tip whose enclosing checkpoint has not
      // materialized into the archiver.
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpoint: undefined,
      });
      const warnSpy = jest.spyOn(sequencer.getLogger(), 'warn');
      const debugSpy = jest.spyOn(sequencer.getLogger(), 'debug');

      const result = await sequencer.checkSyncForTest({ ts: 1000n, slot: SlotNumber(2) });

      expect(result).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        'Waiting for proposed checkpoint to catch up with reexecuted block',
        expect.objectContaining({
          blockCheckpointNumber: CheckpointNumber(3),
          checkpointedCheckpointNumber: CheckpointNumber(2),
          proposedCheckpointTipNumber: undefined,
        }),
      );
    });

    it('proceeds when a matching proposed checkpoint exists for the block', async () => {
      setupSyncedToBlock({
        blockNumber: BlockNumber(3),
        blockSlot: SlotNumber(3),
        blockCheckpointNumber: CheckpointNumber(3),
        checkpointedCheckpointNumber: CheckpointNumber(2),
        proposedCheckpoint: {
          checkpointNumber: CheckpointNumber(3),
          header: CheckpointHeader.empty(),
          archive: AppendOnlyTreeSnapshot.empty(),
          checkpointOutHash: Fr.ZERO,
          startBlock: BlockNumber(3),
          blockCount: 1,
          totalManaUsed: 0n,
          feeAssetPriceModifier: 0n,
          inboxMsgTotal: 0n,
        },
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

  describe('missing committee logging', () => {
    const missingCommitteeL1Constants = {
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      slotDuration,
      epochDuration,
      ethereumSlotDuration,
      proofSubmissionEpochs: 2,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };

    beforeEach(() => {
      epochCache.getL1Constants.mockReturnValue(missingCommitteeL1Constants);
      epochCache.getLagInEpochsForValidatorSet.mockReturnValue(2);
      epochCache.getProposerAttesterAddressInSlot.mockRejectedValue(new NoCommitteeError());
    });

    // The diagnosis itself is unit-tested in missing_committee.test.ts; here we only check that the sequencer
    // wires it in and dedupes per epoch.
    it('only logs once per epoch across repeated slots', async () => {
      rollupContract.getActiveAttesterCount.mockResolvedValue(0);
      l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);
      const infoSpy = jest.spyOn(sequencer.getLogger(), 'info');

      // Slots 0 and 1 share epoch 0 (epochDuration 16); slot 16 is epoch 1.
      await sequencer.checkCanProposeForTest(SlotNumber(0));
      await sequencer.checkCanProposeForTest(SlotNumber(1));
      await sequencer.checkCanProposeForTest(SlotNumber(16));

      const missingCommitteeLogs = infoSpy.mock.calls.filter(([msg]) => String(msg).includes('No committee'));
      expect(missingCommitteeLogs).toHaveLength(2);
    });
  });
});

class TestSequencer extends Sequencer {
  /** When true, work() only runs prepareCheckpointProposal and skips execute(). */
  public skipExecute = false;

  public getTimeTable() {
    return this.timetable;
  }

  public getPerBlockAllocationMultiplier() {
    return this.config.perBlockAllocationMultiplier;
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
    await this.pendingRequests.awaitRequests();
  }

  public getRunningPromise() {
    return this.runningPromise;
  }

  public isRunning() {
    return this.runningPromise?.isRunning() ?? false;
  }

  public getPendingRequestCount() {
    return this.pendingRequests.size;
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
