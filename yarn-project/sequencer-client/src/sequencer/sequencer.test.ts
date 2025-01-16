import {
  BlockAttestation,
  type BlockBuilder,
  BlockProposal,
  Body,
  ConsensusPayload,
  type EpochProofQuote,
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  type MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  type Tx,
  TxHash,
  WorldStateRunningState,
  type WorldStateSynchronizer,
  mockEpochProofQuote as baseMockEpochProofQuote,
  makeProcessedTxFromPrivateOnlyTx,
  mockTxForRollup,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  BlockHeader,
  type ContractDataSource,
  EthAddress,
  Fr,
  GasFees,
  GlobalVariables,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/circuits.js';
import { makeAppendOnlyTreeSnapshot } from '@aztec/circuits.js/testing';
import { DefaultL1ContractsConfig } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type P2P, P2PClientState } from '@aztec/p2p';
import { type BlockBuilderFactory } from '@aztec/prover-client/block-builder';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator/server';
import { type ValidatorClient } from '@aztec/validator-client';

import { expect } from '@jest/globals';
import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { type GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import { type L1Publisher } from '../publisher/l1-publisher.js';
import { type SlasherClient } from '../slasher/index.js';
import { Sequencer } from './sequencer.js';
import { SequencerState } from './utils.js';

describe('sequencer', () => {
  let publisher: MockProxy<L1Publisher>;
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

  let lastBlockNumber: number;
  let newBlockNumber: number;
  let newSlotNumber: number;
  let hash: string;
  let logger: Logger;

  let block: L2Block;
  let globalVariables: GlobalVariables;

  let sequencer: TestSubject;

  const {
    aztecEpochDuration: epochDuration,
    aztecSlotDuration: slotDuration,
    ethereumSlotDuration,
  } = DefaultL1ContractsConfig;

  const chainId = new Fr(12345);
  const version = Fr.ZERO;
  const coinbase = EthAddress.random();
  const feeRecipient = AztecAddress.random();
  const gasFees = GasFees.empty();

  const archive = Fr.random();

  const mockedSig = new Signature(Buffer32.fromField(Fr.random()), Buffer32.fromField(Fr.random()), 27);
  const committee = [EthAddress.random()];

  const getSignatures = () => [mockedSig];

  const getAttestations = () => {
    const attestation = new BlockAttestation(new ConsensusPayload(block.header, archive, []), mockedSig);
    (attestation as any).sender = committee[0];
    return [attestation];
  };

  const createBlockProposal = () => {
    return new BlockProposal(new ConsensusPayload(block.header, archive, [TxHash.random()]), mockedSig);
  };

  const processTxs = async (txs: Tx[]) => {
    return await Promise.all(txs.map(tx => makeProcessedTxFromPrivateOnlyTx(tx, Fr.ZERO, undefined, globalVariables)));
  };

  const mockPendingTxs = (txs: Tx[]) => {
    p2p.getPendingTxCount.mockReturnValue(txs.length);
    p2p.iteratePendingTxs.mockReturnValue(txs);
  };

  const makeBlock = async (txs: Tx[]) => {
    const processedTxs = await processTxs(txs);
    const body = new Body(processedTxs.map(tx => tx.txEffect));
    const header = BlockHeader.empty({ globalVariables: globalVariables });
    const archive = makeAppendOnlyTreeSnapshot(newBlockNumber + 1);

    block = new L2Block(archive, header, body);
    return block;
  };

  const makeTx = (seed?: number) => {
    const tx = mockTxForRollup(seed);
    tx.data.constants.txContext.chainId = chainId;
    return tx;
  };

  const expectPublisherProposeL2Block = (txHashes: TxHash[], proofQuote?: EpochProofQuote) => {
    expect(publisher.proposeL2Block).toHaveBeenCalledTimes(1);
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), txHashes, proofQuote, {
      txTimeoutAt: expect.any(Date),
    });
  };

  beforeEach(() => {
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

    publisher = mock<L1Publisher>();
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.getCurrentEpochCommittee.mockResolvedValue(committee);
    publisher.canProposeAtNextEthBlock.mockResolvedValue([BigInt(newSlotNumber), BigInt(newBlockNumber)]);
    publisher.validateBlockForSubmission.mockResolvedValue();
    publisher.proposeL2Block.mockResolvedValue(true);

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);

    blockBuilder = mock<BlockBuilder>();
    blockBuilder.setBlockCompleted.mockImplementation(() => Promise.resolve(block));

    merkleTreeOps = mock<MerkleTreeReadOperations>();
    merkleTreeOps.findLeafIndices.mockImplementation((_treeId: MerkleTreeId, _value: any[]) => {
      return Promise.resolve([undefined]);
    });

    p2p = mock<P2P>({
      getStatus: mockFn().mockResolvedValue({
        state: P2PClientState.IDLE,
        syncedToL2Block: { number: lastBlockNumber, hash },
      }),
    });

    fork = mock<MerkleTreeWriteOperations>();
    worldState = mock<WorldStateSynchronizer>({
      fork: () => Promise.resolve(fork),
      getCommitted: () => merkleTreeOps,
      status: mockFn().mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncedToL2Block: { number: lastBlockNumber, hash },
      }),
    });

    publicProcessor = mock<PublicProcessor>();
    publicProcessor.process.mockImplementation(async txsIter => {
      const txs = Array.from(txsIter);
      const processed = await processTxs(txs);
      logger.verbose(`Processed ${txs.length} txs`, { txHashes: txs.map(tx => tx.getTxHash()) });
      return [processed, [], []];
    });

    publicProcessorFactory = mock<PublicProcessorFactory>({
      create: (_a, _b) => publicProcessor,
    });

    l2BlockSource = mock<L2BlockSource>({
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
      getL2Tips: mockFn().mockResolvedValue({ latest: { number: lastBlockNumber, hash } }),
    });

    l1ToL2MessageSource = mock<L1ToL2MessageSource>({
      getL1ToL2Messages: () => Promise.resolve(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO)),
      getBlockNumber: mockFn().mockResolvedValue(lastBlockNumber),
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
      { enforceTimeTable: true, maxTxsPerBlock: 4 },
    );
  });

  it('builds a block out of a single tx', async () => {
    const tx = makeTx();
    const txHash = tx.getTxHash();

    block = await makeBlock([tx]);
    mockPendingTxs([tx]);

    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );

    expectPublisherProposeL2Block([txHash]);
  });

  it('does not build a block if it does not have enough time left in the slot', async () => {
    // Trick the sequencer into thinking that we are just too far into slot 1
    sequencer.setL1GenesisTime(
      Math.floor(Date.now() / 1000) - slotDuration * 1 - (sequencer.getTimeTable().initialTime + 1),
    );

    const tx = makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    await expect(sequencer.doRealWork()).rejects.toThrow(
      expect.objectContaining({
        name: 'SequencerTooSlowError',
        message: expect.stringContaining(`Too far into slot`),
      }),
    );

    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();
    expect(publisher.proposeL2Block).not.toHaveBeenCalled();
  });

  it('builds a block when it is their turn', async () => {
    const tx = makeTx();
    const txHash = tx.getTxHash();

    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // Not your turn!
    publisher.canProposeAtNextEthBlock.mockRejectedValue(new Error());
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
    publisher.validateBlockForSubmission.mockResolvedValue();

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expectPublisherProposeL2Block([txHash]);
  });

  it('builds a block out of several txs rejecting invalid txs', async () => {
    const txs = [makeTx(0x10000), makeTx(0x20000), makeTx(0x30000)];
    const validTxs = [txs[0], txs[2]];
    const invalidTx = txs[1];
    const validTxHashes = validTxs.map(tx => tx.getTxHash());

    mockPendingTxs(txs);
    block = await makeBlock([txs[0], txs[2]]);
    publicProcessor.process.mockResolvedValue([
      await processTxs(validTxs),
      [{ tx: invalidTx, error: new Error() }],
      [],
    ]);

    await sequencer.doRealWork();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expectPublisherProposeL2Block(validTxHashes);
    expect(p2p.deleteTxs).toHaveBeenCalledWith([invalidTx.getTxHash()]);
  });

  it('builds a block once it reaches the minimum number of transactions', async () => {
    const txs = times(8, i => makeTx(i * 0x10000));
    sequencer.updateConfig({ minTxsPerBlock: 4 });

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
    );

    expectPublisherProposeL2Block(neededTxs.map(tx => tx.getTxHash()));
  });

  it('builds a block that contains zero real transactions once flushed', async () => {
    const txs = times(8, i => makeTx(i * 0x10000));

    sequencer.updateConfig({ minTxsPerBlock: 4 });

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
    );
    expect(blockBuilder.addTxs).toHaveBeenCalledWith([]);
    expectPublisherProposeL2Block([]);
  });

  it('builds a block that contains less than the minimum number of transactions once flushed', async () => {
    const txs = times(8, i => makeTx(i * 0x10000));

    sequencer.updateConfig({ minTxsPerBlock: 4 });

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
    const postFlushTxHashes = postFlushTxs.map(tx => tx.getTxHash());

    await sequencer.doRealWork();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      globalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );

    expectPublisherProposeL2Block(postFlushTxHashes);
  });

  it('aborts building a block if the chain moves underneath it', async () => {
    const tx = makeTx();
    mockPendingTxs([tx]);
    block = await makeBlock([tx]);

    // This could practically be for any reason, e.g., could also be that we have entered a new slot.
    publisher.validateBlockForSubmission.mockResolvedValueOnce().mockRejectedValueOnce(new Error('No block for you'));

    await sequencer.doRealWork();

    expect(publisher.proposeL2Block).not.toHaveBeenCalled();
  });

  describe('proof quotes', () => {
    let tx: Tx;
    let txHash: TxHash;
    let currentEpoch = 0n;

    const setupForBlockNumber = async (blockNumber: number) => {
      newBlockNumber = blockNumber;
      newSlotNumber = blockNumber;
      currentEpoch = BigInt(blockNumber) / BigInt(epochDuration);

      globalVariables = new GlobalVariables(
        chainId,
        version,
        new Fr(blockNumber),
        new Fr(blockNumber),
        Fr.ZERO,
        coinbase,
        feeRecipient,
        gasFees,
      );

      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncedToL2Block: { number: blockNumber - 1, hash },
      });

      p2p.getStatus.mockResolvedValue({
        state: P2PClientState.IDLE,
        syncedToL2Block: { number: blockNumber - 1, hash },
      });

      l2BlockSource.getBlockNumber.mockResolvedValue(blockNumber - 1);

      l1ToL2MessageSource.getBlockNumber.mockResolvedValue(blockNumber - 1);

      globalVariableBuilder.buildGlobalVariables.mockResolvedValue(globalVariables);

      publisher.canProposeAtNextEthBlock.mockResolvedValue([BigInt(newSlotNumber), BigInt(blockNumber)]);
      publisher.claimEpochProofRight.mockResolvedValueOnce(true);
      publisher.getEpochForSlotNumber.mockImplementation((slotNumber: bigint) =>
        Promise.resolve(slotNumber / BigInt(epochDuration)),
      );

      tx = makeTx();
      txHash = tx.getTxHash();

      mockPendingTxs([tx]);
      block = await makeBlock([tx]);
    };

    const mockEpochProofQuote = (opts: { epoch?: bigint; validUntilSlot?: bigint; fee?: number } = {}) =>
      baseMockEpochProofQuote(
        opts.epoch ?? currentEpoch - 1n,
        opts.validUntilSlot ?? block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        opts.fee ?? 1,
      );

    it('submits a valid proof quote with a block', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote();

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash], proofQuote);
    });

    it('submits a valid proof quote even without a block', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      // There are no txs!
      mockPendingTxs([]);

      const proofQuote = mockEpochProofQuote();

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.doRealWork();
      expect(publisher.claimEpochProofRight).toHaveBeenCalledWith(proofQuote);
      expect(publisher.proposeL2Block).not.toHaveBeenCalled();
    });

    it('does not claim the epoch previous to the first', async () => {
      const blockNumber = 1;
      await setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote({ epoch: 0n });

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(undefined));

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash]);
    });

    it('does not submit a quote with an expired slot number', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      const expiredSlotNumber = block.header.globalVariables.slotNumber.toBigInt() - 1n;
      const proofQuote = mockEpochProofQuote({ validUntilSlot: expiredSlotNumber });

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash]);
    });

    it('does not submit a valid quote if unable to claim epoch', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote();

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      publisher.getClaimableEpoch.mockResolvedValue(undefined);

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash]);
    });

    it('does not submit an invalid quote', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote();

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);

      // Quote is reported as invalid
      publisher.validateProofQuote.mockImplementation(_ => Promise.resolve(undefined));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash]);
    });

    it('selects the lowest cost valid quote', async () => {
      const blockNumber = epochDuration + 1;
      await setupForBlockNumber(blockNumber);

      // Create 3 valid quotes with different fees.
      // And 3 invalid quotes with lower fees
      // We should select the lowest cost valid quote
      const validQuotes = times(3, (i: number) => mockEpochProofQuote({ fee: 10 + i }));

      const expiredSlot = block.header.globalVariables.slotNumber.toBigInt() - 1n;
      const proofQuoteInvalidSlot = mockEpochProofQuote({ validUntilSlot: expiredSlot, fee: 1 });
      const proofQuoteInvalidEpoch = mockEpochProofQuote({ epoch: currentEpoch, fee: 2 });

      // This is deemed invalid by the contract, we identify it by its fee
      const proofQuoteInvalid = mockEpochProofQuote({ fee: 3 });

      const allQuotes = [proofQuoteInvalidSlot, proofQuoteInvalidEpoch, ...validQuotes, proofQuoteInvalid];

      p2p.getEpochProofQuotes.mockResolvedValue(allQuotes);
      publisher.proposeL2Block.mockResolvedValueOnce(true);

      // Quote is reported as invalid
      publisher.validateProofQuote.mockImplementation(p =>
        Promise.resolve(p.payload.basisPointFee === 3 ? undefined : p),
      );

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.doRealWork();
      expectPublisherProposeL2Block([txHash], validQuotes[0]);
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

  public override doRealWork() {
    this.setState(SequencerState.IDLE, 0n, true /** force */);
    return super.doRealWork();
  }
}
