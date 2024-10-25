import {
  BlockAttestation,
  type BlockBuilder,
  BlockProposal,
  ConsensusPayload,
  type EpochProofQuote,
  type L1ToL2MessageSource,
  L2Block,
  type L2BlockSource,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  type Tx,
  TxHash,
  type UnencryptedL2Log,
  UnencryptedTxL2Logs,
  WorldStateRunningState,
  type WorldStateSynchronizer,
  makeProcessedTx,
  mockEpochProofQuote,
  mockTxForRollup,
} from '@aztec/circuit-types';
import {
  AZTEC_EPOCH_DURATION,
  AztecAddress,
  type ContractDataSource,
  EthAddress,
  Fr,
  GasFees,
  GlobalVariables,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { type Writeable } from '@aztec/foundation/types';
import { type P2P, P2PClientState } from '@aztec/p2p';
import { type PublicProcessor, type PublicProcessorFactory } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type ValidatorClient } from '@aztec/validator-client';

import { type MockProxy, mock, mockFn } from 'jest-mock-extended';

import { type BlockBuilderFactory } from '../block_builder/index.js';
import { type GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import { type L1Publisher } from '../publisher/l1-publisher.js';
import { TxValidatorFactory } from '../tx_validator/tx_validator_factory.js';
import { Sequencer } from './sequencer.js';

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
  let hash: string;

  let sequencer: TestSubject;

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

  let block: L2Block;
  let mockedGlobalVariables: GlobalVariables;

  beforeEach(() => {
    lastBlockNumber = 0;
    hash = Fr.ZERO.toString();

    block = L2Block.random(lastBlockNumber + 1);

    mockedGlobalVariables = new GlobalVariables(
      chainId,
      version,
      block.header.globalVariables.blockNumber,
      block.header.globalVariables.slotNumber,
      Fr.ZERO,
      coinbase,
      feeRecipient,
      gasFees,
    );

    publisher = mock<L1Publisher>();
    publisher.getSenderAddress.mockImplementation(() => EthAddress.random());
    publisher.getCurrentEpochCommittee.mockResolvedValue(committee);
    publisher.canProposeAtNextEthBlock.mockResolvedValue([
      block.header.globalVariables.slotNumber.toBigInt(),
      block.header.globalVariables.blockNumber.toBigInt(),
    ]);
    publisher.validateBlockForSubmission.mockResolvedValue();

    globalVariableBuilder = mock<GlobalVariableBuilder>();
    merkleTreeOps = mock<MerkleTreeReadOperations>();
    blockBuilder = mock<BlockBuilder>();

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

    publicProcessor = mock<PublicProcessor>({
      process: async txs => [
        await Promise.all(txs.map(tx => makeProcessedTx(tx, tx.data.toKernelCircuitPublicInputs(), []))),
        [],
        [],
      ],
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

    validatorClient = mock<ValidatorClient>({
      collectAttestations: mockFn().mockResolvedValue(getAttestations()),
      createBlockProposal: mockFn().mockResolvedValue(createBlockProposal()),
    });

    sequencer = new TestSubject(
      publisher,
      // TDOO(md): add the relevant methods to the validator client that will prevent it stalling when waiting for attestations
      validatorClient,
      globalVariableBuilder,
      p2p,
      worldState,
      blockBuilderFactory,
      l2BlockSource,
      l1ToL2MessageSource,
      publicProcessorFactory,
      new TxValidatorFactory(merkleTreeOps, contractSource, false),
      new NoopTelemetryClient(),
    );
  });

  it('builds a block out of a single tx', async () => {
    const tx = mockTxForRollup();
    tx.data.constants.txContext.chainId = chainId;
    const txHash = tx.getTxHash();

    p2p.getTxs.mockReturnValueOnce([tx]);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValueOnce(mockedGlobalVariables);

    await sequencer.work();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    // Ok, we have an issue that we never actually call the process L2 block
    expect(publisher.proposeL2Block).toHaveBeenCalledTimes(1);
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
  });

  it('builds a block when it is their turn', async () => {
    const tx = mockTxForRollup();
    tx.data.constants.txContext.chainId = chainId;
    const txHash = tx.getTxHash();

    p2p.getTxs.mockReturnValue([tx]);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(mockedGlobalVariables);

    // Not your turn!
    publisher.canProposeAtNextEthBlock.mockRejectedValue(new Error());
    publisher.validateBlockForSubmission.mockRejectedValue(new Error());

    await sequencer.work();
    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();

    // Now we can propose, but lets assume that the content is still "bad" (missing sigs etc)
    publisher.canProposeAtNextEthBlock.mockResolvedValue([
      block.header.globalVariables.slotNumber.toBigInt(),
      block.header.globalVariables.blockNumber.toBigInt(),
    ]);

    await sequencer.work();
    expect(blockBuilder.startNewBlock).not.toHaveBeenCalled();

    // Now it is!
    publisher.validateBlockForSubmission.mockClear();
    publisher.validateBlockForSubmission.mockResolvedValue();

    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
  });

  it('builds a block out of several txs rejecting double spends', async () => {
    const doubleSpendTxIndex = 1;
    const txs = [mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)];
    txs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
    });
    const validTxHashes = txs.filter((_, i) => i !== doubleSpendTxIndex).map(tx => tx.getTxHash());

    const doubleSpendTx = txs[doubleSpendTxIndex];

    p2p.getTxs.mockReturnValueOnce(txs);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValueOnce(mockedGlobalVariables);

    // We make a nullifier from tx1 a part of the nullifier tree, so it gets rejected as double spend
    const doubleSpendNullifier = doubleSpendTx.data.forRollup!.end.nullifiers[0].toBuffer();
    merkleTreeOps.findLeafIndex.mockImplementation((treeId: MerkleTreeId, value: any) => {
      return Promise.resolve(
        treeId === MerkleTreeId.NULLIFIER_TREE && value.equals(doubleSpendNullifier) ? 1n : undefined,
      );
    });

    await sequencer.work();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), validTxHashes, undefined);
    expect(p2p.deleteTxs).toHaveBeenCalledWith([doubleSpendTx.getTxHash()]);
  });

  it('builds a block out of several txs rejecting incorrect chain ids', async () => {
    const invalidChainTxIndex = 1;
    const txs = [mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)];
    txs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
    });
    const invalidChainTx = txs[invalidChainTxIndex];
    const validTxHashes = txs.filter((_, i) => i !== invalidChainTxIndex).map(tx => tx.getTxHash());

    p2p.getTxs.mockReturnValueOnce(txs);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValueOnce(mockedGlobalVariables);

    // We make the chain id on the invalid tx not equal to the configured chain id
    invalidChainTx.data.constants.txContext.chainId = new Fr(1n + chainId.value);

    await sequencer.work();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), validTxHashes, undefined);
    expect(p2p.deleteTxs).toHaveBeenCalledWith([invalidChainTx.getTxHash()]);
  });

  it('builds a block out of several txs dropping the ones that go over max size', async () => {
    const invalidTransactionIndex = 1;

    const txs = [mockTxForRollup(0x10000), mockTxForRollup(0x20000), mockTxForRollup(0x30000)];
    txs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
    });
    const validTxHashes = txs.filter((_, i) => i !== invalidTransactionIndex).map(tx => tx.getTxHash());

    p2p.getTxs.mockReturnValueOnce(txs);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValueOnce(mockedGlobalVariables);

    // We make txs[1] too big to fit
    (txs[invalidTransactionIndex] as Writeable<Tx>).unencryptedLogs = UnencryptedTxL2Logs.random(2, 4);
    (txs[invalidTransactionIndex].unencryptedLogs.functionLogs[0].logs[0] as Writeable<UnencryptedL2Log>).data =
      randomBytes(1024 * 1022);

    await sequencer.work();

    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), validTxHashes, undefined);
  });

  it('builds a block once it reaches the minimum number of transactions', async () => {
    const txs = times(8, i => {
      const tx = mockTxForRollup(i * 0x10000);
      tx.data.constants.txContext.chainId = chainId;
      return tx;
    });
    const block = L2Block.random(lastBlockNumber + 1);

    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(mockedGlobalVariables);

    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    p2p.getTxs.mockReturnValueOnce([]);
    //p2p.getTxs.mockReturnValueOnce(txs.slice(0, 4));
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    p2p.getTxs.mockReturnValueOnce(txs.slice(0, 3));

    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is built with 4 txs
    p2p.getTxs.mockReturnValueOnce(txs.slice(0, 4));
    const txHashes = txs.slice(0, 4).map(tx => tx.getTxHash());

    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      4,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledTimes(1);
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), txHashes, undefined);
  });

  it('builds a block that contains zero real transactions once flushed', async () => {
    const txs = times(8, i => {
      const tx = mockTxForRollup(i * 0x10000);
      tx.data.constants.txContext.chainId = chainId;
      return tx;
    });
    const block = L2Block.random(lastBlockNumber + 1);

    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(mockedGlobalVariables);

    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    p2p.getTxs.mockReturnValueOnce([]);
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    p2p.getTxs.mockReturnValueOnce(txs.slice(0, 3));
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 0 txs
    p2p.getTxs.mockReturnValueOnce([]);
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      2,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledTimes(1);
    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [], undefined);
  });

  it('builds a block that contains less than the minimum number of transactions once flushed', async () => {
    const txs = times(8, i => {
      const tx = mockTxForRollup(i * 0x10000);
      tx.data.constants.txContext.chainId = chainId;
      return tx;
    });
    const block = L2Block.random(lastBlockNumber + 1);

    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    globalVariableBuilder.buildGlobalVariables.mockResolvedValue(mockedGlobalVariables);

    sequencer.updateConfig({ minTxsPerBlock: 4 });

    // block is not built with 0 txs
    p2p.getTxs.mockReturnValueOnce([]);
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // block is not built with 3 txs
    p2p.getTxs.mockReturnValueOnce(txs.slice(0, 3));
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(0);

    // flush the sequencer and it should build a block
    sequencer.flush();

    // block is built with 3 txs
    const postFlushTxs = txs.slice(0, 3);
    p2p.getTxs.mockReturnValueOnce(postFlushTxs);
    const postFlushTxHashes = postFlushTxs.map(tx => tx.getTxHash());
    await sequencer.work();
    expect(blockBuilder.startNewBlock).toHaveBeenCalledTimes(1);
    expect(blockBuilder.startNewBlock).toHaveBeenCalledWith(
      3,
      mockedGlobalVariables,
      Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n)),
    );
    expect(publisher.proposeL2Block).toHaveBeenCalledTimes(1);

    expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), postFlushTxHashes, undefined);
  });

  it('aborts building a block if the chain moves underneath it', async () => {
    const tx = mockTxForRollup();
    tx.data.constants.txContext.chainId = chainId;

    p2p.getTxs.mockReturnValueOnce([tx]);
    blockBuilder.setBlockCompleted.mockResolvedValue(block);
    publisher.proposeL2Block.mockResolvedValueOnce(true);

    const mockedGlobalVariables = new GlobalVariables(
      chainId,
      version,
      block.header.globalVariables.blockNumber,
      block.header.globalVariables.slotNumber,
      Fr.ZERO,
      coinbase,
      feeRecipient,
      gasFees,
    );

    globalVariableBuilder.buildGlobalVariables.mockResolvedValueOnce(mockedGlobalVariables);

    // This could practically be for any reason, e.g., could also be that we have entered a new slot.
    publisher.validateBlockForSubmission
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error());

    await sequencer.work();

    expect(publisher.proposeL2Block).not.toHaveBeenCalled();
  });

  describe('Handling proof quotes', () => {
    let txHash: TxHash;
    let currentEpoch = 0n;
    const setupForBlockNumber = (blockNumber: number) => {
      currentEpoch = BigInt(blockNumber) / BigInt(AZTEC_EPOCH_DURATION);
      // Create a new block and header
      block = L2Block.random(blockNumber);

      mockedGlobalVariables = new GlobalVariables(
        chainId,
        version,
        block.header.globalVariables.blockNumber,
        block.header.globalVariables.slotNumber,
        Fr.ZERO,
        coinbase,
        feeRecipient,
        gasFees,
      );

      worldState.status.mockResolvedValue({
        state: WorldStateRunningState.IDLE,
        syncedToL2Block: { number: block.header.globalVariables.blockNumber.toNumber() - 1, hash },
      });

      p2p.getStatus.mockResolvedValue({
        syncedToL2Block: { number: block.header.globalVariables.blockNumber.toNumber() - 1, hash },
        state: P2PClientState.IDLE,
      });

      l2BlockSource.getBlockNumber.mockResolvedValue(block.header.globalVariables.blockNumber.toNumber() - 1);

      l1ToL2MessageSource.getBlockNumber.mockResolvedValue(block.header.globalVariables.blockNumber.toNumber() - 1);

      globalVariableBuilder.buildGlobalVariables.mockResolvedValue(mockedGlobalVariables);

      publisher.canProposeAtNextEthBlock.mockResolvedValue([
        block.header.globalVariables.slotNumber.toBigInt(),
        block.header.globalVariables.blockNumber.toBigInt(),
      ]);

      publisher.getEpochForSlotNumber.mockImplementation((slotNumber: bigint) =>
        Promise.resolve(slotNumber / BigInt(AZTEC_EPOCH_DURATION)),
      );

      const tx = mockTxForRollup();
      tx.data.constants.txContext.chainId = chainId;
      txHash = tx.getTxHash();

      p2p.getTxs.mockReturnValue([tx]);
      blockBuilder.setBlockCompleted.mockResolvedValue(block);
    };

    it('submits a valid proof quote with a block', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], proofQuote);
    });

    it('does not claim the epoch previous to the first', async () => {
      const blockNumber = 1;
      setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote(
        0n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(undefined));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
    });

    it('does not submit a quote with an expired slot number', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote(
        currentEpoch - 1n,
        // Slot number expired
        block.header.globalVariables.slotNumber.toBigInt() - 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
    });

    it('does not submit a valid quote if unable to claim epoch', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);
      publisher.validateProofQuote.mockImplementation((x: EpochProofQuote) => Promise.resolve(x));

      publisher.getClaimableEpoch.mockResolvedValue(undefined);

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
    });

    it('does not submit an invalid quote', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      const proofQuote = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      p2p.getEpochProofQuotes.mockResolvedValue([proofQuote]);
      publisher.proposeL2Block.mockResolvedValueOnce(true);

      // Quote is reported as invalid
      publisher.validateProofQuote.mockImplementation(_ => Promise.resolve(undefined));

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], undefined);
    });

    it('only selects valid quotes', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      // Create 1 valid quote and 3 that have a higher fee but are invalid
      const validProofQuote = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      const proofQuoteInvalidSlot = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() - 1n,
        10000n,
        EthAddress.random(),
        2,
      );

      const proofQuoteInvalidEpoch = mockEpochProofQuote(
        currentEpoch,
        block.header.globalVariables.slotNumber.toBigInt() - 1n,
        10000n,
        EthAddress.random(),
        2,
      );

      // This is deemed invalid by the contract, we identify it by a fee of 2
      const proofQuoteInvalid = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        2,
      );

      const allQuotes = [validProofQuote, proofQuoteInvalidSlot, proofQuoteInvalidEpoch, proofQuoteInvalid];

      p2p.getEpochProofQuotes.mockResolvedValue(allQuotes);
      publisher.proposeL2Block.mockResolvedValueOnce(true);

      // Quote is reported as invalid
      publisher.validateProofQuote.mockImplementation(p =>
        Promise.resolve(p.payload.basisPointFee === 2 ? undefined : p),
      );

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], validProofQuote);
    });

    it('selects the lowest cost valid quote', async () => {
      const blockNumber = AZTEC_EPOCH_DURATION + 1;
      setupForBlockNumber(blockNumber);

      // Create 3 valid quotes with different fees.
      // And 3 invalid quotes with lower fees
      // We should select the lowest cost valid quote
      const validQuotes = times(3, (i: number) =>
        mockEpochProofQuote(
          currentEpoch - 1n,
          block.header.globalVariables.slotNumber.toBigInt() + 1n,
          10000n,
          EthAddress.random(),
          10 + i,
        ),
      );

      const proofQuoteInvalidSlot = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() - 1n,
        10000n,
        EthAddress.random(),
        1,
      );

      const proofQuoteInvalidEpoch = mockEpochProofQuote(
        currentEpoch,
        block.header.globalVariables.slotNumber.toBigInt() - 1n,
        10000n,
        EthAddress.random(),
        2,
      );

      // This is deemed invalid by the contract, we identify it by it's fee
      const proofQuoteInvalid = mockEpochProofQuote(
        currentEpoch - 1n,
        block.header.globalVariables.slotNumber.toBigInt() + 1n,
        10000n,
        EthAddress.random(),
        3,
      );

      const allQuotes = [proofQuoteInvalidSlot, proofQuoteInvalidEpoch, ...validQuotes, proofQuoteInvalid];

      p2p.getEpochProofQuotes.mockResolvedValue(allQuotes);
      publisher.proposeL2Block.mockResolvedValueOnce(true);

      // Quote is reported as invalid
      publisher.validateProofQuote.mockImplementation(p =>
        Promise.resolve(p.payload.basisPointFee === 3 ? undefined : p),
      );

      // The previous epoch can be claimed
      publisher.getClaimableEpoch.mockImplementation(() => Promise.resolve(currentEpoch - 1n));

      await sequencer.work();
      expect(publisher.proposeL2Block).toHaveBeenCalledWith(block, getSignatures(), [txHash], validQuotes[0]);
    });
  });
});

class TestSubject extends Sequencer {
  public override work() {
    return super.work();
  }
}
