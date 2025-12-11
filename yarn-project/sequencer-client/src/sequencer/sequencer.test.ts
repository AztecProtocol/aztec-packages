import { Body, L2Block } from '@aztec/aztec.js/block';
import { GENESIS_BLOCK_HEADER_HASH, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { omit, times, timesParallel } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2BlockHeader,
  type L2BlockSource,
  type ValidateBlockNegativeResult,
} from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  type SequencerConfig,
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockAttestation, BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { makeAppendOnlyTreeSnapshot, mockTxForRollup } from '@aztec/stdlib/testing';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, makeProcessedTxFromPrivateOnlyTx } from '@aztec/stdlib/tx';
import type { ValidatorClient } from '@aztec/validator-client';

import { expect, jest } from '@jest/globals';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { AttestorPublisherPair, SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { CheckpointBuilder, FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { Sequencer } from './sequencer.js';
import { SequencerState } from './utils.js';

describe('sequencer', () => {
  let publisher: MockProxy<SequencerPublisher>;
  let epochCache: MockProxy<EpochCache>;
  let validatorClient: MockProxy<ValidatorClient>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let p2p: MockProxy<P2P>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  let checkpointsBuilder: MockProxy<FullNodeCheckpointsBuilder>;
  let checkpointBuilder: MockProxy<CheckpointBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let slasherClient: MockProxy<SlasherClientInterface>;
  let publisherFactory: MockProxy<SequencerPublisherFactory>;

  let rollupContract: MockProxy<RollupContract>;

  let dateProvider: TestDateProvider;

  let initialBlockHeader: BlockHeader;
  let lastBlockNumber: BlockNumber;
  let newBlockNumber: BlockNumber;
  let newSlotNumber: number;
  let hash: string;

  let block: L2Block;
  let globalVariables: GlobalVariables;
  let l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;
  // Note: Removed unused l1Contracts declaration

  let sequencer: TestSubject;

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
    const consensusPayload = ConsensusPayload.fromBlock(block);
    const attestation = new BlockAttestation(consensusPayload, mockedSig, mockedSig);
    (attestation as any).sender = committee[0];
    return [attestation];
  };

  const createBlockProposal = () => {
    const consensusPayload = ConsensusPayload.fromBlock(block);
    const txHashes = block.body.txEffects.map(tx => tx.txHash);
    return new BlockProposal(consensusPayload, mockedSig, txHashes);
  };

  const processTxs = async (txs: Tx[]) => {
    return await Promise.all(
      txs.map(tx =>
        makeProcessedTxFromPrivateOnlyTx(tx, Fr.ZERO, new PublicDataWrite(Fr.random(), Fr.random()), globalVariables),
      ),
    );
  };

  const mockTxIterator = async function* (txs: Promise<Tx[]>): AsyncIterableIterator<Tx> {
    for (const tx of await txs) {
      yield tx;
    }
  };

  const mockPendingTxs = (txs: Tx[]) => {
    p2p.getPendingTxCount.mockResolvedValue(txs.length);
    // make sure a new iterator is created for every invocation of iteratePendingTxs
    // otherwise we risk iterating over the same iterator more than once (yielding no more values)
    p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
  };

  const makeBlock = async (txs: Tx[]) => {
    const processedTxs = await processTxs(txs);
    const body = new Body(processedTxs.map(tx => tx.txEffect));
    const header = L2BlockHeader.empty({ globalVariables: globalVariables });
    const archive = makeAppendOnlyTreeSnapshot(newBlockNumber + 1);

    block = new L2Block(archive, header, body);
    return block;
  };

  const makeTx = async (seed?: number) => {
    const tx = await mockTxForRollup(seed);
    tx.data.constants.txContext.chainId = chainId;
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
    initialBlockHeader = BlockHeader.empty();
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
    epochCache.getCommittee.mockResolvedValue({ committee, seed: 1n, epoch: EpochNumber(1) } as EpochCommitteeInfo);

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

    merkleTreeOps = mock<MerkleTreeReadOperations>();
    merkleTreeOps.findLeafIndices.mockImplementation((_treeId: MerkleTreeId, _value: any[]) => {
      return Promise.resolve([undefined]);
    });
    merkleTreeOps.getTreeInfo.mockImplementation((treeId: MerkleTreeId) => {
      return Promise.resolve({ treeId, root: Fr.random().toBuffer(), size: 99n, depth: 5 });
    });

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({
        state: P2PClientState.IDLE,
        syncedToL2Block: { number: lastBlockNumber, hash },
      }),
    });

    fork = mock<MerkleTreeWriteOperations>({
      getInitialHeader: () => initialBlockHeader,
    });

    worldState = mock<WorldStateSynchronizer>({
      fork: () => Promise.resolve(fork),
      syncImmediate: () => Promise.resolve(lastBlockNumber),
      getCommitted: () => merkleTreeOps,
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

    checkpointBuilder = mock<CheckpointBuilder>();
    checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) =>
      Promise.resolve({
        block: block as any,
        publicGas: Gas.empty(),
        publicProcessorDuration: 0,
        numTxs: block.body.txEffects.length,
        blockBuildingTimer: new Timer(),
        usedTxs: [],
        failedTxs: [],
      }),
    );
    checkpointBuilder.completeCheckpoint.mockImplementation(() => {
      const checkpoint = new Checkpoint(
        makeAppendOnlyTreeSnapshot(newBlockNumber + 1),
        block.header as any,
        [block as any],
        CheckpointNumber(0),
      );
      return Promise.resolve(checkpoint);
    });

    checkpointsBuilder = mock<FullNodeCheckpointsBuilder>();
    checkpointsBuilder.startCheckpoint.mockResolvedValue(checkpointBuilder);

    l2BlockSource = mock<L2BlockSource>({
      getBlock: mockFn().mockResolvedValue(L2Block.empty()),
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
    sequencer = new TestSubject(
      publisherFactory,
      // TODO(md): add the relevant methods to the validator client that will prevent it stalling when waiting for attestations
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      slasherClient,
      l2BlockSource,
      l1ToL2MessageSource,
      checkpointsBuilder,
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
      const tx = await makeTx();

      block = await makeBlock([tx]);
      mockPendingTxs([tx]);
      await sequencer.work();

      expectPublisherProposeL2Block();
    });

    it('does not build a block if it does not have enough time left in the slot', async () => {
      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      // deadline for initializing proposal is 1s, so we go 2s past it
      expect(sequencer.getTimeTable().initializeDeadline).toEqual(1);
      const l1TsForL2Slot1 = Number(l1Constants.l1GenesisTime) + slotDuration;
      dateProvider.setTime((l1TsForL2Slot1 + 2) * 1000);
      await expect(sequencer.work()).rejects.toThrow(
        expect.objectContaining({
          name: 'SequencerTooSlowError',
          message: expect.stringContaining(`Too far into slot`),
        }),
      );

      expect(checkpointBuilder.buildBlock).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
      expect(publisher.canProposeAtNextEthBlock).not.toHaveBeenCalled();
    });

    it('does not build a block if there is not enough time left in the slot', async () => {
      expect(sequencer.getTimeTable().l1PublishingTime).toEqual(ethereumSlotDuration);
      const l1TsForL2Slot1 = Number(l1Constants.l1GenesisTime) + slotDuration;

      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      // Set time very late in the slot (1s before the L1 slot ends)
      // This means there's not enough time to build a block and publish it
      dateProvider.setTime((l1TsForL2Slot1 + ethereumSlotDuration - 1) * 1000);

      // The sequencer should detect it's too late and not attempt to build
      // With enforcement enabled, it will throw SequencerTooSlowError
      await expect(sequencer.work()).rejects.toThrow('Too far into slot');

      // With the new timing checks, we detect insufficient time upfront and don't build
      expect(checkpointBuilder.buildBlock).not.toHaveBeenCalled();
      expect(validatorClient.collectAttestations).not.toHaveBeenCalled();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('builds a checkpoint when it is their turn', async () => {
      const tx = await makeTx();

      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      // Not your turn! canProposeAtNextEthBlock returns undefined
      publisher.canProposeAtNextEthBlock.mockResolvedValue(undefined);

      await sequencer.work();
      // When it's not our turn, we should not build the checkpoint
      expect(checkpointBuilder.buildBlock).not.toHaveBeenCalled();

      // Now it's our turn!
      publisher.canProposeAtNextEthBlock.mockResolvedValue({
        slot: block.header.globalVariables.slotNumber,
        checkpointNumber: CheckpointNumber.fromBlockNumber(block.header.globalVariables.blockNumber),
        timeOfNextL1Slot: 1000n,
      });

      await sequencer.work();
      // Now we should build and publish the checkpoint
      expect(checkpointBuilder.buildBlock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(BigInt),
        expect.anything(),
      );
      expectPublisherProposeL2Block();
    });

    it('does not build a block if not enough txs', async () => {
      const txs: Tx[] = await timesParallel(8, i => makeTx(i * 0x10000));
      sequencer.updateConfig({ minTxsPerBlock: 4 });
      mockPendingTxs(txs.slice(0, 3));
      block = await makeBlock(txs);

      await sequencer.work();
      expect(checkpointBuilder.buildBlock).toHaveBeenCalledTimes(0);
    });

    it('builds a block only when enough txs are available', async () => {
      const txs: Tx[] = await timesParallel(4, i => makeTx(i * 0x10000));
      sequencer.updateConfig({ minTxsPerBlock: 4 });
      mockPendingTxs(txs);
      block = await makeBlock(txs);

      await sequencer.work();

      expect(checkpointBuilder.buildBlock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(BigInt),
        expect.anything(),
      );

      expectPublisherProposeL2Block();
    });

    it('settles on the chain tip before it starts building a block', async () => {
      // this test simulates a synch happening right after the sequencer starts building a block
      // simulate every component being synched
      const firstBlock = await L2Block.random(BlockNumber(1));
      const currentTip = firstBlock;
      const syncedToL2Block = { number: currentTip.number, hash: (await currentTip.hash()).toString() };
      worldState.status.mockImplementation(() =>
        Promise.resolve({
          state: WorldStateRunningState.IDLE,
          syncSummary: {
            latestBlockNumber: syncedToL2Block.number,
            latestBlockHash: syncedToL2Block.hash,
          } as WorldStateSyncStatus,
        }),
      );
      p2p.getStatus.mockImplementation(() => Promise.resolve({ state: P2PClientState.IDLE, syncedToL2Block }));
      l2BlockSource.getL2Tips.mockImplementation(() =>
        Promise.resolve({
          latest: syncedToL2Block,
          proven: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
          finalized: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        }),
      );
      l1ToL2MessageSource.getL2Tips.mockImplementation(() =>
        Promise.resolve({
          latest: syncedToL2Block,
          proven: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
          finalized: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        }),
      );

      // simulate a synch happening right after
      l2BlockSource.getBlockNumber.mockResolvedValueOnce(currentTip.number);
      l2BlockSource.getBlockNumber.mockResolvedValueOnce(BlockNumber(currentTip.number + 1));
      // now the new tip is actually block 2
      l2BlockSource.getBlock.mockImplementation(n =>
        n === -1
          ? L2Block.random(BlockNumber(currentTip.number + 1))
          : n === currentTip.number
            ? Promise.resolve(currentTip)
            : Promise.resolve(undefined),
      );

      publisher.canProposeAtNextEthBlock.mockResolvedValueOnce(undefined);
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('builds a block only when synced to previous L1 slot', async () => {
      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration) - 1n);
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();

      l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration));
      await sequencer.work();
      expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalled();
    });

    // TODO(palla/mbps): Reinstante the validateBlockHeader call
    it.skip('aborts building a block if the chain moves underneath it', async () => {
      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      // This could practically be for any reason, e.g., could also be that we have entered a new slot.
      publisher.validateBlockHeader.mockRejectedValueOnce(new Error('No block for you'));

      await sequencer.work();

      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    // TODO(palla/mbps): Re-enable once checkpoint proposal failure handling is implemented
    it.skip('does not publish a checkpoint if the checkpoint proposal failed', async () => {
      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      // When createCheckpointProposal returns undefined, the checkpoint should not be published
      // Currently the implementation doesn't check for undefined proposal
      validatorClient.createCheckpointProposal.mockResolvedValue(undefined as any);

      await sequencer.work();

      // The checkpoint should not be enqueued for publishing
      expect(publisher.enqueueProposeCheckpoint).not.toHaveBeenCalled();
    });

    it('handles when enqueueProposeCheckpoint throws', async () => {
      const tx = await makeTx();
      mockPendingTxs([tx]);
      block = await makeBlock([tx]);

      publisher.enqueueProposeCheckpoint.mockRejectedValueOnce(new Error('Failed to enqueue propose checkpoint'));

      // The work() call should fail because enqueueProposeCheckpoint throws
      await expect(sequencer.work()).rejects.toThrow('Failed to enqueue propose checkpoint');

      // Since the error is thrown before sendRequests, it should not be called
      expect(publisher.sendRequests).not.toHaveBeenCalled();
    });

    it('should proceed with block proposal when there is no proposer yet', async () => {
      // Mock that there is no official proposer yet
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(undefined);
      epochCache.getCommittee.mockResolvedValueOnce({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

      // Mock that we have some pending transactions
      const txs = [await makeTx(1), await makeTx(2)];
      mockPendingTxs(txs);
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
    let publishers: SequencerPublisher[];
    beforeEach(() => {
      publishers = times(3, i => {
        const publisher = mockDeep<SequencerPublisher>();
        publisher.epochCache = epochCache;
        publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
        publisher.validateBlockHeader.mockResolvedValue();
        publisher.enqueueProposeCheckpoint.mockResolvedValue(undefined);
        publisher.enqueueGovernanceCastSignal.mockResolvedValue(true);
        publisher.enqueueSlashingActions.mockResolvedValue(true);
        publisher.canProposeAtNextEthBlock.mockResolvedValue({
          slot: SlotNumber(newSlotNumber + i),
          checkpointNumber: CheckpointNumber.fromBlockNumber(BlockNumber(newBlockNumber)),
          timeOfNextL1Slot: 1000n,
        });

        return publisher;
      });

      publisherFactory = mockDeep<SequencerPublisherFactory>();
      publisherFactory.create
        .mockResolvedValueOnce({
          attestorAddress: publishers[0].getSenderAddress(),
          publisher: publishers[0],
        })
        .mockResolvedValueOnce({
          attestorAddress: publishers[1].getSenderAddress(),
          publisher: publishers[1],
        });

      const config: SequencerConfig = { enforceTimeTable: false, maxTxsPerBlock: 4 };
      sequencer = new TestSubject(
        publisherFactory,
        validatorClient,
        globalVariableBuilder,
        p2p,
        worldState,
        slasherClient,
        l2BlockSource,
        l1ToL2MessageSource,
        checkpointsBuilder,
        l1Constants,
        dateProvider,
        epochCache,
        rollupContract,
        config,
      );
      sequencer.updateConfig(config);
    });

    it('requests a publisher for each block', async () => {
      epochCache.getEpochAndSlotInNextL1Slot
        .mockReset()
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(1),
          ts: 1000n,
          now: 1000n,
        })
        .mockReturnValueOnce({
          epoch: EpochNumber(1),
          slot: SlotNumber(2),
          ts: 1000n,
          now: 1000n,
        });

      // Build and publish 2 blocks, the sequencer should request a new publisher each time
      for (let i = 0; i < 2; i++) {
        const tx = await makeTx();

        mockPendingTxs([tx]);
        block = await makeBlock([tx]);
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
      } as any);
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

  // TODO(palla/mbps): Review and enable these tests once multi-block checkpoints are supported.
  // For now this is just a massive block of unreviewed Claude generated code.
  describe.skip('multi-block checkpoints', () => {
    describe('single block mode (default)', () => {
      it('should build only one block when blockDurationMs is not set', async () => {
        const tx = await makeTx();
        block = await makeBlock([tx]);
        mockPendingTxs([tx]);

        // Track block-proposed events
        const proposedEvents: any[] = [];
        sequencer.on('block-proposed', evt => proposedEvents.push(evt));

        await sequencer.work();

        // Should build exactly one block
        expect(checkpointBuilder.buildBlock).toHaveBeenCalledTimes(1);
        expect(proposedEvents).toHaveLength(1);
        expect(proposedEvents[0]).toEqual({
          blockNumber: newBlockNumber,
          slot: newSlotNumber,
        });
      });

      it('should collect attestations in single block mode', async () => {
        const tx = await makeTx();
        block = await makeBlock([tx]);
        mockPendingTxs([tx]);

        await sequencer.work();

        expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
        expectPublisherProposeL2Block();
      });
    });

    describe('multi-block mode', () => {
      it('should build multiple blocks when blockDurationMs is set and time permits', async () => {
        // Configure multi-block mode with 12 second block duration
        // Disable time enforcement so the mocked timetable controls timing
        sequencer.updateConfig({ blockDurationMs: 12000, enforceTimeTable: false });

        // Create multiple transactions
        const txs = await Promise.all([makeTx(1), makeTx(2), makeTx(3)]);

        // Mock timetable to allow 3 blocks (must be after updateConfig which recreates timetable)
        const timetableMock = sequencer.getTimeTable();
        let blockCount = 0;
        jest.spyOn(timetableMock, 'canStartNextBlock').mockImplementation(() => {
          blockCount++;
          return {
            canStart: blockCount <= 3,
            deadline: 30,
            isLastBlock: blockCount === 3,
          };
        });

        // Create 3 different blocks for each call
        const blocks = await Promise.all([makeBlock([txs[0]]), makeBlock([txs[1]]), makeBlock([txs[2]])]);

        let buildCallCount = 0;
        checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) => {
          const currentBlock = blocks[buildCallCount++];
          return Promise.resolve({
            block: currentBlock as any,
            publicGas: Gas.empty(),
            publicProcessorDuration: 0,
            numTxs: currentBlock.body.txEffects.length,
            blockBuildingTimer: new Timer(),
            usedTxs: [],
            failedTxs: [],
          });
        });

        // Make sure we always have txs available
        p2p.getPendingTxCount.mockResolvedValue(10);
        p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

        // Mock successful L1 publish
        publisher.sendRequests.mockResolvedValue({
          result: { receipt: {} as any, errorMsg: undefined },
          successfulActions: ['propose'],
          failedActions: [],
          sentActions: ['propose'],
          expiredActions: [],
        });

        // Track events
        const proposedEvents: any[] = [];
        const checkpointEvents: any[] = [];
        sequencer.on('block-proposed', evt => proposedEvents.push(evt));
        sequencer.on('checkpoint-published', evt => checkpointEvents.push(evt));

        await sequencer.work();

        // Should build 3 blocks
        expect(checkpointBuilder.buildBlock).toHaveBeenCalledTimes(3);
        expect(proposedEvents).toHaveLength(3);

        // Should emit one checkpoint-published event
        expect(checkpointEvents).toHaveLength(1);
      });

      it('should only collect attestations on the last block', async () => {
        // Configure multi-block mode
        // Disable time enforcement so the mocked timetable controls timing
        sequencer.updateConfig({ blockDurationMs: 12000, enforceTimeTable: false });

        const txs = await Promise.all([makeTx(1), makeTx(2)]);

        // Mock timetable to allow 2 blocks (must be after updateConfig)
        const timetableMock = sequencer.getTimeTable();
        let blockCount = 0;
        jest.spyOn(timetableMock, 'canStartNextBlock').mockImplementation(() => {
          blockCount++;
          return {
            canStart: blockCount <= 2,
            deadline: 20,
            isLastBlock: blockCount === 2,
          };
        });

        const blocks = await Promise.all([makeBlock([txs[0]]), makeBlock([txs[1]])]);

        let buildCallCount = 0;
        checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) => {
          const currentBlock = blocks[buildCallCount++];
          return Promise.resolve({
            block: currentBlock as any,
            publicGas: Gas.empty(),
            publicProcessorDuration: 0,
            numTxs: currentBlock.body.txEffects.length,
            blockBuildingTimer: new Timer(),
            usedTxs: [],
            failedTxs: [],
          });
        });

        p2p.getPendingTxCount.mockResolvedValue(10);
        p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

        // Mock successful L1 publish
        publisher.sendRequests.mockResolvedValue({
          result: { receipt: {} as any, errorMsg: undefined },
          successfulActions: ['propose'],
          failedActions: [],
          sentActions: ['propose'],
          expiredActions: [],
        });

        await sequencer.work();

        // Attestations should be collected exactly once (on the last block)
        expect(validatorClient.collectAttestations).toHaveBeenCalledTimes(1);
        // Publisher should be called once with the last block
        expect(publisher.enqueueProposeCheckpoint).toHaveBeenCalledTimes(1);
      });

      it('should stop building blocks when timing runs out', async () => {
        // Configure multi-block mode
        // Disable time enforcement so the mocked timetable controls timing
        sequencer.updateConfig({ blockDurationMs: 12000, enforceTimeTable: false });

        const txs = await Promise.all([makeTx(1), makeTx(2), makeTx(3)]);

        // Mock timetable to only allow 2 blocks (must be after updateConfig)
        const timetableMock = sequencer.getTimeTable();
        let blockCount = 0;
        jest.spyOn(timetableMock, 'canStartNextBlock').mockImplementation(() => {
          blockCount++;
          return {
            canStart: blockCount <= 2,
            deadline: 20,
            isLastBlock: blockCount === 2,
          };
        });

        const blocks = await Promise.all([makeBlock([txs[0]]), makeBlock([txs[1]])]);

        let buildCallCount = 0;
        checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) => {
          const currentBlock = blocks[buildCallCount++];
          return Promise.resolve({
            block: currentBlock as any,
            publicGas: Gas.empty(),
            publicProcessorDuration: 0,
            numTxs: currentBlock.body.txEffects.length,
            blockBuildingTimer: new Timer(),
            usedTxs: [],
            failedTxs: [],
          });
        });

        p2p.getPendingTxCount.mockResolvedValue(10);
        p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

        // Mock successful L1 publish
        publisher.sendRequests.mockResolvedValue({
          result: { receipt: {} as any, errorMsg: undefined },
          successfulActions: ['propose'],
          failedActions: [],
          sentActions: ['propose'],
          expiredActions: [],
        });

        const proposedEvents: any[] = [];
        sequencer.on('block-proposed', evt => proposedEvents.push(evt));

        await sequencer.work();

        // Should build exactly 2 blocks, not 3
        expect(checkpointBuilder.buildBlock).toHaveBeenCalledTimes(2);
        expect(proposedEvents).toHaveLength(2);
      });

      it('should handle block building failure gracefully', async () => {
        // Configure multi-block mode
        // Disable time enforcement so the mocked timetable controls timing
        sequencer.updateConfig({ blockDurationMs: 12000, enforceTimeTable: false });

        const tx = await makeTx();

        // Mock timetable to allow 2 blocks (must be after updateConfig)
        const timetableMock = sequencer.getTimeTable();
        let blockCount = 0;
        jest.spyOn(timetableMock, 'canStartNextBlock').mockImplementation(() => {
          blockCount++;
          return {
            canStart: blockCount <= 2,
            deadline: 20,
            isLastBlock: blockCount === 2,
          };
        });

        // First block succeeds, second fails
        block = await makeBlock([tx]);
        let buildCallCount = 0;
        checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) => {
          buildCallCount++;
          if (buildCallCount === 1) {
            return Promise.resolve({
              block: block as any,
              publicGas: Gas.empty(),
              publicProcessorDuration: 0,
              numTxs: block.body.txEffects.length,
              blockBuildingTimer: new Timer(),
              usedTxs: [],
              failedTxs: [],
            });
          }
          throw new Error('Block building failed');
        });

        p2p.getPendingTxCount.mockResolvedValue(10);
        p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve([tx])));

        const proposedEvents: any[] = [];
        const failedEvents: any[] = [];
        sequencer.on('block-proposed', evt => proposedEvents.push(evt));
        sequencer.on('block-build-failed', evt => failedEvents.push(evt));

        await sequencer.work();

        // First block should succeed
        expect(proposedEvents).toHaveLength(1);
        // Should have a failure event (either from build failure or timing)
        expect(failedEvents).toHaveLength(1);
        expect(failedEvents[0].reason).toMatch(/Block building failed|Too far into slot/);
      });

      it('should emit correct events for multi-block checkpoint', async () => {
        // Configure multi-block mode
        // Disable time enforcement so the mocked timetable controls timing
        sequencer.updateConfig({ blockDurationMs: 12000, enforceTimeTable: false });

        const txs = await Promise.all([makeTx(1), makeTx(2)]);

        // Mock timetable to allow 2 blocks (must be after updateConfig)
        const timetableMock = sequencer.getTimeTable();
        let blockCount = 0;
        jest.spyOn(timetableMock, 'canStartNextBlock').mockImplementation(() => {
          blockCount++;
          return {
            canStart: blockCount <= 2,
            deadline: 20,
            isLastBlock: blockCount === 2,
          };
        });

        // Mock buildBlock to return blocks with incrementing block numbers
        let buildCallCount = 0;
        checkpointBuilder.buildBlock.mockImplementation((_pendingTxs, _blockNumber, _timestamp, _opts) => {
          const tx = txs[buildCallCount % txs.length];
          const blockForCallPromise = makeBlock([tx]);
          return blockForCallPromise.then(blockForCall => {
            // Override the block number to match what the sequencer expects
            (blockForCall.header as any).globalVariables = new GlobalVariables(
              chainId,
              version,
              BlockNumber(newBlockNumber + buildCallCount),
              SlotNumber(newSlotNumber),
              /*timestamp=*/ 0n,
              coinbase,
              feeRecipient,
              gasFees,
            );
            buildCallCount++;
            return {
              block: blockForCall as any,
              publicGas: Gas.empty(),
              publicProcessorDuration: 0,
              numTxs: blockForCall.body.txEffects.length,
              blockBuildingTimer: new Timer(),
              usedTxs: [],
              failedTxs: [],
            };
          });
        });

        p2p.getPendingTxCount.mockResolvedValue(10);
        p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));

        const proposedEvents: any[] = [];
        const checkpointEvents: any[] = [];
        sequencer.on('block-proposed', evt => proposedEvents.push(evt));
        sequencer.on('checkpoint-published', evt => checkpointEvents.push(evt));

        // Mock successful L1 publish
        publisher.sendRequests.mockResolvedValue({
          result: { receipt: {} as any, errorMsg: undefined },
          successfulActions: ['propose'],
          failedActions: [],
          sentActions: ['propose'],
          expiredActions: [],
        });

        await sequencer.work();

        // Should emit 2 block-proposed events
        expect(checkpointBuilder.buildBlock).toHaveBeenCalledTimes(2);
        expect(proposedEvents).toHaveLength(2);
        expect(proposedEvents[0].blockNumber).toBe(newBlockNumber);
        expect(proposedEvents[1].blockNumber).toBe(newBlockNumber + 1);

        // Should emit 1 checkpoint-published event for the last block
        expect(checkpointEvents).toHaveLength(1);
        expect(checkpointEvents[0].blockNumber).toBe(newBlockNumber + 1);
        expect(checkpointEvents[0].slot).toBe(newSlotNumber);
      });
    });

    describe('event naming', () => {
      it('should emit block-tx-count-check-failed when not enough txs', async () => {
        const failedEvents: any[] = [];
        sequencer.on('block-tx-count-check-failed', evt => failedEvents.push(evt));

        // No pending txs
        mockPendingTxs([]);

        await sequencer.work();

        expect(failedEvents).toHaveLength(1);
        expect(failedEvents[0]).toEqual({
          minTxs: expect.any(Number),
          availableTxs: 0,
        });
      });

      it('should emit checkpoint-publish-failed when L1 publish fails', async () => {
        const tx = await makeTx();
        block = await makeBlock([tx]);
        mockPendingTxs([tx]);

        const failedEvents: any[] = [];
        sequencer.on('checkpoint-publish-failed', evt => failedEvents.push(evt));

        // Mock failed L1 publish
        publisher.sendRequests.mockResolvedValue({
          result: { receipt: {} as any, errorMsg: 'Test error' },
          successfulActions: [],
          failedActions: ['propose'],
          sentActions: ['propose'],
          expiredActions: [],
        });

        await sequencer.work();

        expect(failedEvents).toHaveLength(1);
      });
    });
  });
});

class TestSubject extends Sequencer {
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
