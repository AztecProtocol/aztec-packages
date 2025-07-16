import { Body, L2Block } from '@aztec/aztec.js';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { timesParallel } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { SlasherClient } from '@aztec/slasher';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CommitteeAttestation, type L2BlockSource } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type IFullNodeBlockBuilder,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  type PublicProcessorLimits,
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockAttestation, BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { makeAppendOnlyTreeSnapshot, mockTxForRollup } from '@aztec/stdlib/testing';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, type Tx, TxHash, makeProcessedTxFromPrivateOnlyTx } from '@aztec/stdlib/tx';
import type { ValidatorClient } from '@aztec/validator-client';

import { expect } from '@jest/globals';
import { type MockProxy, mock, mockDeep, mockFn } from 'jest-mock-extended';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
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
  let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let slasherClient: MockProxy<SlasherClient>;

  let dateProvider: TestDateProvider;

  let initialBlockHeader: BlockHeader;
  let lastBlockNumber: number;
  let newBlockNumber: number;
  let newSlotNumber: number;
  let hash: string;

  let block: L2Block;
  let globalVariables: GlobalVariables;
  let l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

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
    const attestation = new BlockAttestation(block.header.globalVariables.blockNumber, consensusPayload, mockedSig);
    (attestation as any).sender = committee[0];
    return [attestation];
  };

  const createBlockProposal = () => {
    const consensusPayload = ConsensusPayload.fromBlock(block);
    const txHashes = block.body.txEffects.map(tx => tx.txHash);
    return new BlockProposal(block.header.globalVariables.blockNumber, consensusPayload, mockedSig, txHashes);
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
    const header = BlockHeader.empty({ globalVariables: globalVariables });
    const archive = makeAppendOnlyTreeSnapshot(newBlockNumber + 1);

    block = new L2Block(archive, header, body);
    return block;
  };

  const makeTx = async (seed?: number) => {
    const tx = await mockTxForRollup(seed);
    tx.data.constants.txContext.chainId = chainId;
    return tx;
  };

  const expectPublisherProposeL2Block = (txHashes: TxHash[]) => {
    expect(publisher.enqueueProposeL2Block).toHaveBeenCalledTimes(1);
    expect(publisher.enqueueProposeL2Block).toHaveBeenCalledWith(block, getSignatures(), txHashes, {
      txTimeoutAt: expect.any(Date),
    });
  };

  beforeEach(async () => {
    feeRecipient = await AztecAddress.random();
    initialBlockHeader = BlockHeader.empty();
    lastBlockNumber = 0;
    newBlockNumber = lastBlockNumber + 1;
    newSlotNumber = newBlockNumber;
    hash = Fr.ZERO.toString();

    globalVariables = new GlobalVariables(
      chainId,
      version,
      newBlockNumber,
      new Fr(newSlotNumber),
      /*timestamp=*/ 0n,
      coinbase,
      feeRecipient,
      gasFees,
    );

    const l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));
    l1Constants = { l1GenesisTime, slotDuration, ethereumSlotDuration };

    epochCache = mockDeep<EpochCache>();
    epochCache.getEpochAndSlotInNextL1Slot.mockImplementation(() => ({ epoch: 1n, slot: 1n, ts: 1000n, now: 1000n }));
    epochCache.getCommittee.mockResolvedValue({ committee } as EpochCommitteeInfo);

    publisher = mockDeep<SequencerPublisher>();
    publisher.epochCache = epochCache;
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.validateBlockHeader.mockResolvedValue();
    publisher.enqueueProposeL2Block.mockResolvedValue(true);
    publisher.enqueueCastVote.mockResolvedValue(true);
    publisher.canProposeAtNextEthBlock.mockResolvedValue({
      slot: BigInt(newSlotNumber),
      blockNumber: BigInt(newBlockNumber),
      timeOfNextL1Slot: 1000n,
    });

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);

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
          finalisedBlockNumber: 0,
          oldestHistoricBlockNumber: 0,
          treesAreSynched: true,
        },
      } satisfies WorldStateSynchronizerStatus),
    });

    blockBuilder = mock<IFullNodeBlockBuilder>();
    blockBuilder.buildBlock.mockImplementation(() =>
      Promise.resolve({
        block,
        publicGas: Gas.empty(),
        publicProcessorDuration: 0,
        numMsgs: 0,
        numTxs: block.body.txEffects.length,
        blockBuildingTimer: new Timer(),
        usedTxs: [],
        failedTxs: [],
      }),
    );

    l2BlockSource = mock<L2BlockSource>({
      getBlock: mockFn().mockResolvedValue(L2Block.empty()),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
      getL1Timestamp: mockFn().mockResolvedValue(1000n),
    });

    l1ToL2MessageSource = mock<L1ToL2MessageSource>({
      getL1ToL2Messages: () => Promise.resolve(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO)),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
    });

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve(getAttestations()));
    validatorClient.createBlockProposal.mockImplementation(() => Promise.resolve(createBlockProposal()));

    slasherClient = mock<SlasherClient>();

    dateProvider = new TestDateProvider();

    const config = { enforceTimeTable: true, maxTxsPerBlock: 4 };
    sequencer = new TestSubject(
      publisher,
      // TODO(md): add the relevant methods to the validator client that will prevent it stalling when waiting for attestations
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      slasherClient,
      l2BlockSource,
      l1ToL2MessageSource,
      blockBuilder,
      l1Constants,
      dateProvider,
    );
    sequencer.updateConfig(config);
  });

  it('builds a block out of a single tx', async () => {
    const tx = await makeTx();
    const txHash = await tx.getTxHash();

    block = await makeBlock([tx]);
    mockPendingTxs([tx]);
    await sequencer.doRealWork();

    expectPublisherProposeL2Block([txHash]);
  });

  it('does not build a block if it does not have enough time left in the slot', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // deadline for initializing proposal is 1s, so we go 2s past it
    expect(sequencer.getTimeTable().initializeDeadline).toEqual(1);
    const l1TsForL2Slot1 = Number(l1Constants.l1GenesisTime) + slotDuration;
    dateProvider.setTime((l1TsForL2Slot1 + 2) * 1000);
    await expect(sequencer.doRealWork()).rejects.toThrow(
      expect.objectContaining({
        name: 'SequencerTooSlowError',
        message: expect.stringContaining(`Too far into slot`),
      }),
    );

    expect(blockBuilder.buildBlock).not.toHaveBeenCalled();
    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('does not publish a block if it does not have enough time left in the slot after collecting attestations', async () => {
    expect(sequencer.getTimeTable().l1PublishingTime).toEqual(ethereumSlotDuration);
    const l1TsForL2Slot1 = Number(l1Constants.l1GenesisTime) + slotDuration;

    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    validatorClient.collectAttestations.mockImplementation(() => {
      // after collecting attestations, "warp" to 1s before the last L1 slot of the L2 slot is mined,
      // meaning that we have lost our chance to get mined given our l1PublishingTime is a full L1 slot
      dateProvider.setTime((l1TsForL2Slot1 + ethereumSlotDuration - 1) * 1000);
      return Promise.resolve(getAttestations());
    });

    // we begin immediately after the last L1 block for the previous slot has been mined
    dateProvider.setTime((l1TsForL2Slot1 - ethereumSlotDuration + 0.1) * 1000);
    await sequencer.doRealWork();

    expect(blockBuilder.buildBlock).toHaveBeenCalled();
    expect(validatorClient.collectAttestations).toHaveBeenCalled();
    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('builds a block when it is their turn', async () => {
    const tx = await makeTx();
    const txHash = await tx.getTxHash();

    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // Not your turn!
    publisher.canProposeAtNextEthBlock.mockReturnValue(Promise.resolve(undefined));
    publisher.validateBlockHeader.mockRejectedValue(new Error());

    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).not.toHaveBeenCalled();

    // Now we can propose, but lets assume that the content is still "bad" (missing sigs etc)
    publisher.canProposeAtNextEthBlock.mockResolvedValue({
      slot: block.header.globalVariables.slotNumber.toBigInt(),
      blockNumber: BigInt(block.header.globalVariables.blockNumber),
      timeOfNextL1Slot: 1000n,
    });

    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).not.toHaveBeenCalled();

    // Now it is!
    publisher.validateBlockHeader.mockClear();
    publisher.validateBlockHeader.mockResolvedValue();

    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      globalVariables,
      expect.anything(),
    );
    expectPublisherProposeL2Block([txHash]);
  });

  it('builds a block once it reaches the minimum number of transactions', async () => {
    const txs: Tx[] = await timesParallel(8, i => makeTx(i * 0x10000));
    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));

    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // block is built with 4 txs
    const neededTxs = txs.slice(0, 4);
    mockPendingTxs(neededTxs);
    block = await makeBlock(neededTxs);

    await sequencer.doRealWork();

    expect(blockBuilder.buildBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      globalVariables,
      expect.anything(),
    );

    expectPublisherProposeL2Block(await Promise.all(neededTxs.map(tx => tx.getTxHash())));
  });

  it('builds a block that contains zero real transactions once flushed', async () => {
    const txs = await timesParallel(8, i => makeTx(i * 0x10000));

    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));
    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 0 txs
    mockPendingTxs([]);
    block = await makeBlock([]);

    await sequencer.doRealWork();

    expect(blockBuilder.buildBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      globalVariables,
      expect.anything(),
    );
    expectPublisherProposeL2Block([]);
  });

  it('builds a block that contains less than the minimum number of transactions once flushed', async () => {
    const txs = await timesParallel(8, i => makeTx(i * 0x10000));

    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));
    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 3 txs
    const postFlushTxs = txs.slice(0, 3);
    mockPendingTxs(postFlushTxs);
    block = await makeBlock(postFlushTxs);
    const postFlushTxHashes = await Promise.all(postFlushTxs.map(tx => tx.getTxHash()));

    await sequencer.doRealWork();
    expect(blockBuilder.buildBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.buildBlock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      globalVariables,
      expect.anything(),
    );

    expectPublisherProposeL2Block(postFlushTxHashes);
  });

  it('settles on the chain tip before it starts building a block', async () => {
    // this test simulates a synch happening right after the sequencer starts building a block
    // simulate every component being synched
    const firstBlock = await L2Block.random(1);
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
        proven: { number: 0, hash: undefined },
        finalized: { number: 0, hash: undefined },
      }),
    );
    l1ToL2MessageSource.getL2Tips.mockImplementation(() =>
      Promise.resolve({
        latest: syncedToL2Block,
        proven: { number: 0, hash: undefined },
        finalized: { number: 0, hash: undefined },
      }),
    );

    // simulate a synch happening right after
    l2BlockSource.getBlockNumber.mockResolvedValueOnce(currentTip.number);
    l2BlockSource.getBlockNumber.mockResolvedValueOnce(currentTip.number + 1);
    // now the new tip is actually block 2
    l2BlockSource.getBlock.mockImplementation(n =>
      n === -1
        ? L2Block.random(currentTip.number + 1)
        : n === currentTip.number
          ? Promise.resolve(currentTip)
          : Promise.resolve(undefined),
    );

    publisher.canProposeAtNextEthBlock.mockResolvedValueOnce(undefined);
    await sequencer.doRealWork();
    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('builds a block only when synced to previous L1 slot', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration) - 1n);
    await sequencer.doRealWork();
    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();

    l2BlockSource.getL1Timestamp.mockResolvedValue(1000n - BigInt(ethereumSlotDuration));
    await sequencer.doRealWork();
    expect(publisher.enqueueProposeL2Block).toHaveBeenCalled();
  });

  it('aborts building a block if the chain moves underneath it', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // This could practically be for any reason, e.g., could also be that we have entered a new slot.
    publisher.validateBlockHeader.mockResolvedValueOnce().mockRejectedValueOnce(new Error('No block for you'));

    await sequencer.doRealWork();

    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('does not publish a block if the block proposal failed', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    validatorClient.createBlockProposal.mockResolvedValue(undefined);

    await sequencer.doRealWork();

    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('handles when enqueueProposeL2Block throws', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    publisher.enqueueProposeL2Block.mockRejectedValueOnce(new Error('Failed to enqueue propose L2 block'));

    await sequencer.doRealWork();
    expectPublisherProposeL2Block([await tx.getTxHash()]);

    // Even though the block publish was not enqueued, we still send any requests
    expect(publisher.sendRequests).toHaveBeenCalledTimes(1);
  });

  it('should proceed with block proposal when there is no proposer yet', async () => {
    // Mock that there is no official proposer yet
    epochCache.getProposerAttesterAddressInNextSlot.mockResolvedValueOnce(undefined);
    epochCache.getCommittee.mockResolvedValueOnce({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    // Mock that we have some pending transactions
    const txs = [await makeTx(1), await makeTx(2)];
    mockPendingTxs(txs);
    block = await makeBlock(txs);

    await sequencer.doRealWork();

    // Verify that the sequencer attempted to create and broadcast a block proposal
    expect(publisher.enqueueProposeL2Block).toHaveBeenCalled();

    // Verify that the sequencer did not broadcast for attestations since there's no committee
    expect(validatorClient.createBlockProposal).not.toHaveBeenCalled();
    expect(validatorClient.broadcastBlockProposal).not.toHaveBeenCalled();
  });
});

class TestSubject extends Sequencer {
  public getTimeTable() {
    return this.timetable;
  }

  public setL1GenesisTime(l1GenesisTime: number) {
    this.l1Constants.l1GenesisTime = BigInt(l1GenesisTime);
  }

  public override doRealWork() {
    this.setState(SequencerState.IDLE, undefined, { force: true });
    return super.doRealWork();
  }

  public override getBlockBuilderOptions(slot: number): PublicProcessorLimits {
    return super.getBlockBuilderOptions(slot);
  }
}
