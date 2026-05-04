import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { BlockExecutionInputs } from '@aztec/stdlib/block_execution';
import {
  type ForkMerkleTreeOperations,
  type MerkleTreeWriteOperations,
  type ProofUri,
  type ProvingJobId,
  type ProvingJobProducer,
  makeExecutionResultJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { BlockHeader, type ProcessedTx, type Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { ProofStore } from '../proving_broker/proof_store/index.js';
import { BlockExecutionHandler, type TxFetcher } from './block_execution_handler.js';

describe('BlockExecutionHandler', () => {
  const epochNumber = EpochNumber(7);
  const blockNumber = BlockNumber(42);
  const slotNumber = SlotNumber(123);
  const checkpointIndex = 2;
  const proverId = new Fr(0xabc);

  let dbProvider: jest.Mocked<Pick<ForkMerkleTreeOperations, 'fork'>>;
  let publicProcessorFactory: jest.Mocked<Pick<PublicProcessorFactory, 'create'>>;
  let publicProcessor: jest.Mocked<Pick<PublicProcessor, 'process'>>;
  let txFetcher: jest.MockedFunction<TxFetcher>;
  let proofStore: jest.Mocked<ProofStore>;
  let broker: jest.Mocked<Pick<ProvingJobProducer, 'enqueueProvingJob'>>;
  let fork: jest.Mocked<Pick<MerkleTreeWriteOperations, 'close'>>;

  let handler: BlockExecutionHandler;
  let header: BlockHeader;

  function makeTxStub(): Tx {
    const hash = TxHash.random();
    return {
      getTxHash: () => hash,
    } as unknown as Tx;
  }

  function makeProcessedTxStub(opts: { withAvm: boolean; hash: TxHash }): ProcessedTx {
    return {
      hash: opts.hash,
      avmProvingRequest: opts.withAvm
        ? { type: ProvingRequestType.PUBLIC_VM, inputs: AvmCircuitInputs.empty() }
        : undefined,
    } as unknown as ProcessedTx;
  }

  beforeEach(() => {
    fork = { close: jest.fn(() => Promise.resolve()) };
    dbProvider = { fork: jest.fn(() => Promise.resolve(fork as unknown as MerkleTreeWriteOperations)) };

    publicProcessor = { process: jest.fn() };
    publicProcessorFactory = {
      create: jest.fn(() => publicProcessor as unknown as PublicProcessor),
    };

    txFetcher = jest.fn() as jest.MockedFunction<TxFetcher>;

    proofStore = {
      saveProofInput: jest.fn((id: ProvingJobId) => Promise.resolve(`uri:${id}` as ProofUri)),
      saveProofOutput: jest.fn(() => Promise.resolve('' as ProofUri)),
      getProofInput: jest.fn(),
      getProofOutput: jest.fn(),
    };

    broker = { enqueueProvingJob: jest.fn(() => Promise.resolve({ status: 'in-queue' as const })) };

    handler = new BlockExecutionHandler(
      dbProvider,
      publicProcessorFactory as unknown as PublicProcessorFactory,
      txFetcher,
      proofStore,
      broker,
      proverId,
    );

    header = BlockHeader.random({ blockNumber, slotNumber });
  });

  function buildInputs(numTxs: number): { inputs: BlockExecutionInputs; txs: Tx[] } {
    const txs = Array.from({ length: numTxs }, () => makeTxStub());
    const inputs = new BlockExecutionInputs(
      epochNumber,
      checkpointIndex,
      header,
      txs.map(t => t.getTxHash()),
    );
    return { inputs, txs };
  }

  it('forks at the parent block and closes the fork on success', async () => {
    const { inputs, txs } = buildInputs(0);
    txFetcher.mockResolvedValueOnce([]);
    publicProcessor.process.mockResolvedValueOnce([[], [], [], [], []]);

    const result = await handler.executeBlock(inputs);

    expect(dbProvider.fork).toHaveBeenCalledWith(BlockNumber(Number(blockNumber) - 1));
    expect(fork.close).toHaveBeenCalled();
    expect(result.blockNumber).toEqual(blockNumber);
    expect(txs).toEqual([]); // sanity
  });

  it('enqueues a deterministic AVM job for each public tx and skips private-only txs', async () => {
    const { inputs, txs } = buildInputs(3);
    txFetcher.mockResolvedValueOnce(txs);
    const processed = [
      makeProcessedTxStub({ withAvm: true, hash: txs[0].getTxHash() }),
      makeProcessedTxStub({ withAvm: false, hash: txs[1].getTxHash() }),
      makeProcessedTxStub({ withAvm: true, hash: txs[2].getTxHash() }),
    ];
    publicProcessor.process.mockResolvedValueOnce([processed, [], [], [], []]);

    await handler.executeBlock(inputs);

    expect(broker.enqueueProvingJob).toHaveBeenCalledTimes(2);
    expect(proofStore.saveProofInput).toHaveBeenCalledTimes(2);

    const expectedIdTx0 = makeExecutionResultJobId(
      epochNumber,
      blockNumber,
      slotNumber,
      0,
      ProvingRequestType.PUBLIC_VM,
    );
    const expectedIdTx2 = makeExecutionResultJobId(
      epochNumber,
      blockNumber,
      slotNumber,
      2,
      ProvingRequestType.PUBLIC_VM,
    );

    expect(broker.enqueueProvingJob).toHaveBeenCalledWith({
      id: expectedIdTx0,
      type: ProvingRequestType.PUBLIC_VM,
      inputsUri: `uri:${expectedIdTx0}`,
      epochNumber,
    });
    expect(broker.enqueueProvingJob).toHaveBeenCalledWith({
      id: expectedIdTx2,
      type: ProvingRequestType.PUBLIC_VM,
      inputsUri: `uri:${expectedIdTx2}`,
      epochNumber,
    });
  });

  it('rejects when the public processor reports a failed tx and still closes the fork', async () => {
    const { inputs, txs } = buildInputs(1);
    txFetcher.mockResolvedValueOnce(txs);
    publicProcessor.process.mockResolvedValueOnce([[], [{ tx: txs[0], error: new Error('boom') }], [], [], []]);

    await expect(handler.executeBlock(inputs)).rejects.toThrow(/Public processor failed/);
    expect(fork.close).toHaveBeenCalled();
  });

  it('rejects when the tx fetcher returns a tx with a mismatched hash', async () => {
    const { inputs } = buildInputs(1);
    txFetcher.mockResolvedValueOnce([makeTxStub()]); // different hash
    await expect(handler.executeBlock(inputs)).rejects.toThrow(/mismatched tx/);
    // fork is created lazily after fetching txs, so it should not be opened
    expect(dbProvider.fork).not.toHaveBeenCalled();
  });

  it('produces deterministic job IDs across runs', async () => {
    const { inputs: firstInputs, txs: firstTxs } = buildInputs(1);
    const expectedId = makeExecutionResultJobId(epochNumber, blockNumber, slotNumber, 0, ProvingRequestType.PUBLIC_VM);

    txFetcher.mockResolvedValueOnce(firstTxs);
    publicProcessor.process.mockResolvedValueOnce([
      [makeProcessedTxStub({ withAvm: true, hash: firstTxs[0].getTxHash() })],
      [],
      [],
      [],
      [],
    ]);
    await handler.executeBlock(firstInputs);

    txFetcher.mockResolvedValueOnce(firstTxs);
    publicProcessor.process.mockResolvedValueOnce([
      [makeProcessedTxStub({ withAvm: true, hash: firstTxs[0].getTxHash() })],
      [],
      [],
      [],
      [],
    ]);
    await handler.executeBlock(firstInputs);

    const calls = broker.enqueueProvingJob.mock.calls.map(([job]) => job.id);
    expect(calls).toEqual([expectedId, expectedId]);
  });
});
