import { Body, L2Block } from '@aztec/aztec.js';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestDateProvider, type Timer } from '@aztec/foundation/timer';
import { type P2P, P2PClientState } from '@aztec/p2p';
import type { BlockBuilderFactory } from '@aztec/prover-client/block-builder';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type BlockBuilder,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  WorldStateRunningState,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  type WorldStateSynchronizerStatus,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { BlockAttestation, BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { makeAppendOnlyTreeSnapshot, mockTxForRollup } from '@aztec/stdlib/testing';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import { type Tx, TxHash, makeProcessedTxFromPrivateOnlyTx } from '@aztec/stdlib/tx';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';
import type { ValidatorClient } from '@aztec/validator-client';

import { expect } from '@jest/globals';
import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisher } from '../publisher/sequencer-publisher.js';
import type { SlasherClient } from '../slasher/index.js';
import { Sequencer } from './sequencer.js';
import { SequencerState } from './utils.js';

describe('sequencer', () => {
  let publisher: MockProxy<SequencerPublisher>;
  let validatorClient: MockProxy<ValidatorClient>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let p2p: MockProxy<P2P>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  let blockBuilder: MockProxy<BlockBuilder>;
  let merkleTreeOps: MockProxy<MerkleTreeReadOperations>;
  let publicProcessor: MockProxy<PublicProcessor>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let publicProcessorFactory: MockProxy<PublicProcessorFactory>;

  let initialBlockHeader: BlockHeader;
  let lastBlockNumber: number;
  let newBlockNumber: number;
  let newSlotNumber: number;
  let hash: string;
  let logger: Logger;

  let block: L2Block;
  let globalVariables: GlobalVariables;

  let sequencer: TestSubject;

  const { aztecSlotDuration: slotDuration, ethereumSlotDuration } = DefaultL1ContractsConfig;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  let feeRecipient: AztecAddress;
  const gasFees = GasFees.empty();

  const mockedSig = new Signature(Buffer32.fromField(Fr.random()), Buffer32.fromField(Fr.random()), 27);
  const committee = [EthAddress.random()];

  const getSignatures = () => [mockedSig];

  const getAttestations = () => {
    const attestation = new BlockAttestation(
      block.header.globalVariables.blockNumber,
      ConsensusPayload.fromBlock(block),
      mockedSig,
    );
    (attestation as any).sender = committee[0];
    return [attestation];
  };

  const createBlockProposal = () => {
    return new BlockProposal(block.header.globalVariables.blockNumber, ConsensusPayload.fromBlock(block), mockedSig);
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
    logger = createLogger('sequencer:test');

    globalVariables = new GlobalVariables(
      chainId,
      version,
      new Fr(newBlockNumber),
      new Fr(newSlotNumber),
      Fr.ZERO,
      coinbase,
      feeRecipient,
      gasFees,
    );

    publisher = mock<SequencerPublisher>();
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.getForwarderAddress.mockImplementation(() => EthAddress.random());
    publisher.getCurrentEpochCommittee.mockResolvedValue(committee);
    publisher.validateBlockForSubmission.mockResolvedValue(1n);
    publisher.enqueueProposeL2Block.mockResolvedValue(true);
    publisher.enqueueCastVote.mockResolvedValue(true);
    publisher.canProposeAtNextEthBlock.mockResolvedValue([BigInt(newSlotNumber), BigInt(newBlockNumber)]);

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);

    blockBuilder = mock<BlockBuilder>();
    blockBuilder.setBlockCompleted.mockImplementation(() => Promise.resolve(block));

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

    publicProcessor = mock<PublicProcessor>();
    publicProcessor.process.mockImplementation(async txsIter => {
      const txs = await toArray(txsIter);
      const processed = await processTxs(txs);
      logger.verbose(`Processed ${txs.length} txs`, { txHashes: await Promise.all(txs.map(tx => tx.getTxHash())) });
      return [processed, [], txs, []];
    });

    publicProcessorFactory = mock<PublicProcessorFactory>({
      create: (_a, _b) => publicProcessor,
    });

    l2BlockSource = mock<L2BlockSource>({
      getBlock: mockFn().mockResolvedValue(L2Block.empty()),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
    });

    l1ToL2MessageSource = mock<L1ToL2MessageSource>({
      getL1ToL2Messages: () => Promise.resolve(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO)),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
    });

    // all txs use the same allowed FPC class
    const fpcClassId = Fr.random();
    const contractSource = mock<ContractDataSource>({
      getContractClass: mockFn().mockResolvedValue(fpcClassId),
    });

    const blockBuilderFactory = mock<BlockBuilderFactory>({
      create: () => blockBuilder,
    });

    validatorClient = mock<ValidatorClient>();
    validatorClient.collectAttestations.mockImplementation(() => Promise.resolve(getAttestations()));
    validatorClient.createBlockProposal.mockImplementation(() => Promise.resolve(createBlockProposal()));

    const l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));
    const l1Constants = { l1GenesisTime, slotDuration, ethereumSlotDuration };
    const slasherClient = mock<SlasherClient>();
    const config = { enforceTimeTable: true, maxTxsPerBlock: 4 };
    sequencer = new TestSubject(
      publisher,
      // TODO(md): add the relevant methods to the validator client that will prevent it stalling when waiting for attestations
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      slasherClient,
      blockBuilderFactory,
      l2BlockSource,
      l1ToL2MessageSource,
      publicProcessorFactory,
      contractSource,
      l1Constants,
      new TestDateProvider(),
    );
    await sequencer.updateConfig(config);
  });

  it('builds a block out of a single tx', async () => {
    const tx = await makeTx();
    const txHash = await tx.getTxHash();

    block = await makeBlock([tx]);
    mockPendingTxs([tx]);
    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
      initialBlockHeader,
    );

    expectPublisherProposeL2Block([txHash]);
  });

  it('builds a block for proposal setting limits', async () => {
    const txs = await timesParallel(5, i => makeTx(i * 0x10000));
    await sequencer.buildBlock(txs, globalVariables, { validateOnly: false });

    expect(publicProcessor.process).toHaveBeenCalledWith(
      txs,
      {
        deadline: expect.any(Date),
        maxTransactions: 4,
        maxBlockSize: expect.any(Number),
        maxBlockGas: expect.anything(),
      },
      expect.anything(),
    );
  });

  it('builds a block for validation ignoring limits', async () => {
    const txs = await timesParallel(5, i => makeTx(i * 0x10000));
    await sequencer.buildBlock(txs, globalVariables, { validateOnly: true });

    expect(publicProcessor.process).toHaveBeenCalledWith(txs, { deadline: expect.any(Date) }, expect.anything());
  });

  it('does not build a block if it does not have enough time left in the slot', async () => {
    // Trick the sequencer into thinking that we are just too far into slot 1
    sequencer.setL1GenesisTime(
      Math.floor(Date.now() / 1000) - slotDuration * 1 - (sequencer.getTimeTable().initializeDeadline + 1),
    );

    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    await expect(sequencer.doRealWork()).rejects.toThrow(
      expect.objectContaining({
        name: 'SequencerTooSlowError',
        message: expect.stringContaining(`Too far into slot`),
      }),
    );

    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();
    expect(publisher.enqueueProposeL2Block).not.toHaveBeenCalled();
  });

  it('builds a block when it is their turn', async () => {
    const tx = await makeTx();
    const txHash = await tx.getTxHash();

    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // Not your turn!
    publisher.canProposeAtNextEthBlock.mockReturnValue(Promise.resolve(undefined));
    publisher.validateBlockForSubmission.mockRejectedValue(new Error());

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();

    // Now we can propose, but lets assume that the content is still "bad" (missing sigs etc)
    publisher.canProposeAtNextEthBlock.mockResolvedValue([
      block.header.globalVariables.slotNumber.toBigInt(),
      block.header.globalVariables.blockNumber.toBigInt(),
    ]);

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();

    // Now it is!
    publisher.validateBlockForSubmission.mockClear();
    publisher.validateBlockForSubmission.mockResolvedValue(1n);

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
      initialBlockHeader,
    );
    expectPublisherProposeL2Block([txHash]);
  });

  it('builds a block out of several txs rejecting invalid txs', async () => {
    const txs = await Promise.all([makeTx(0x10000), makeTx(0x20000), makeTx(0x30000)]);
    const validTxs = [txs[0], txs[2]];
    const invalidTx = txs[1];
    const validTxHashes = await Promise.all(validTxs.map(tx => tx.getTxHash()));

    mockPendingTxs(txs);
    block = await makeBlock([txs[0], txs[2]]);
    publicProcessor.process.mockResolvedValue([
      await processTxs(validTxs),
      [{ tx: invalidTx, error: new Error() }],
      validTxs,
      [],
    ]);

    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
      initialBlockHeader,
    );
    expectPublisherProposeL2Block(validTxHashes);
    expect(p2p.deleteTxs).toHaveBeenCalledWith([await invalidTx.getTxHash()]);
  });

  it('builds a block once it reaches the minimum number of transactions', async () => {
    const txs: Tx[] = await timesParallel(8, i => makeTx(i * 0x10000));
    await sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is built with 4 txs
    const neededTxs = txs.slice(0, 4);
    mockPendingTxs(neededTxs);
    block = await makeBlock(neededTxs);

    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      times(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.zero),
      initialBlockHeader,
    );

    expectPublisherProposeL2Block(await Promise.all(neededTxs.map(tx => tx.getTxHash())));
  });

  it('builds a block that contains zero real transactions once flushed', async () => {
    const txs = await timesParallel(8, i => makeTx(i * 0x10000));

    await sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));
    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 0 txs
    mockPendingTxs([]);
    block = await makeBlock([]);

    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      times(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.zero),
      initialBlockHeader,
    );
    expect(blockBuilder.addTxs).toHaveBeenCalledWith([]);
    expectPublisherProposeL2Block([]);
  });

  it('builds a block that contains less than the minimum number of transactions once flushed', async () => {
    const txs = await timesParallel(8, i => makeTx(i * 0x10000));

    await sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    mockPendingTxs([]);
    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    mockPendingTxs(txs.slice(0, 3));
    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 3 txs
    const postFlushTxs = txs.slice(0, 3);
    mockPendingTxs(postFlushTxs);
    block = await makeBlock(postFlushTxs);
    const postFlushTxHashes = await Promise.all(postFlushTxs.map(tx => tx.getTxHash()));

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
      initialBlockHeader,
    );

    expectPublisherProposeL2Block(postFlushTxHashes);
  });

  it('settles on the chain tip before it starts building a block', async () => {
    // this test simulates a synch happening right after the sequencer starts building a bloxk
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
    // even though the chain tip moved, the sequencer should still have tried to build a block against the old archive
    // this should get caught by the rollup
    expect(publisher.canProposeAtNextEthBlock).toHaveBeenCalledWith(currentTip.archive.root.toBuffer());
  });

  it('aborts building a block if the chain moves underneath it', async () => {
    const tx = await makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // This could practically be for any reason, e.g., could also be that we have entered a new slot.
    publisher.validateBlockForSubmission.mockResolvedValueOnce(1n).mockRejectedValueOnce(new Error('No block for you'));

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
});

class TestSubject extends Sequencer {
  public getTimeTable() {
    return this.timetable;
  }

  public setL1GenesisTime(l1GenesisTime: number) {
    this.l1Constants.l1GenesisTime = BigInt(l1GenesisTime);
  }

  public override doRealWork() {
    this.setState(SequencerState.IDLE, 0n, true /** force */);
    return super.doRealWork();
  }

  public override buildBlock(
    pendingTxs: Iterable<Tx> | AsyncIterableIterator<Tx>,
    newGlobalVariables: GlobalVariables,
    opts?: { validateOnly?: boolean | undefined },
  ): Promise<{
    block: L2Block;
    publicGas: Gas;
    publicProcessorDuration: number;
    numMsgs: number;
    numTxs: number;
    numFailedTxs: number;
    blockBuildingTimer: Timer;
    usedTxs: Tx[];
  }> {
    return super.buildBlock(pendingTxs, newGlobalVariables, opts);
  }
}
