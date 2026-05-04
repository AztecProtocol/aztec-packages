import { SpongeBlob } from '@aztec/blob-lib/types';
import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { BlockExecutionInputs } from '@aztec/stdlib/block_execution';
import type {
  ForkMerkleTreeOperations,
  MerkleTreeWriteOperations,
  ProofUri,
  ProvingJobId,
  ProvingJobProducer,
} from '@aztec/stdlib/interfaces/server';
import { BlockHeader, type Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { ProofStore } from '../proving_broker/proof_store/index.js';
import { BlockExecutionHandler, type TxFetcher } from './block_execution_handler.js';

// Lightweight tests covering input validation and lifecycle. End-to-end coverage of
// hint computation, per-tx enqueue, and PRIVATE_TX_BASE_ROLLUP / PUBLIC_VM ID
// generation lives in the orchestrator-side TestContext flow (Phase 4 onwards),
// where the real `PublicProcessor` produces the `ProcessedTx` shape that
// `insertSideEffectsAndBuildBaseRollupHints` reads from.
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
  let fork: jest.Mocked<Pick<MerkleTreeWriteOperations, 'close' | 'appendLeaves' | 'getTreeInfo'>>;

  let handler: BlockExecutionHandler;
  let header: BlockHeader;

  function makeTxStub(): Tx {
    const hash = TxHash.random();
    return {
      getTxHash: () => hash,
    } as unknown as Tx;
  }

  beforeEach(() => {
    fork = {
      close: jest.fn(() => Promise.resolve()),
      appendLeaves: jest.fn(() => Promise.resolve()),
      getTreeInfo: jest.fn(() => Promise.resolve({ root: Buffer.alloc(32), size: 0n, treeId: 0, depth: 0 })),
    };
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

  function buildInputs(numTxs: number, opts: { isFirstBlockInCheckpoint?: boolean } = {}) {
    const txs = Array.from({ length: numTxs }, () => makeTxStub());
    const inputs = new BlockExecutionInputs(
      epochNumber,
      checkpointIndex,
      header,
      txs.map(t => t.getTxHash()),
      opts.isFirstBlockInCheckpoint ?? false,
      [],
      SpongeBlob.empty(),
    );
    return { inputs, txs };
  }

  it('forks at the parent block and closes the fork on success', async () => {
    const { inputs } = buildInputs(0);
    txFetcher.mockResolvedValueOnce([]);

    const result = await handler.executeBlock(inputs);

    expect(dbProvider.fork).toHaveBeenCalledWith(BlockNumber(Number(blockNumber) - 1));
    expect(fork.close).toHaveBeenCalled();
    expect(result.blockNumber).toEqual(blockNumber);
  });

  it('rejects when the tx fetcher returns a tx with a mismatched hash', async () => {
    const { inputs } = buildInputs(1);
    txFetcher.mockResolvedValueOnce([makeTxStub()]); // different hash

    await expect(handler.executeBlock(inputs)).rejects.toThrow(/mismatched tx/);
    // fork is created lazily after fetching txs, so it should not be opened
    expect(dbProvider.fork).not.toHaveBeenCalled();
  });

  it('inserts L1-to-L2 messages only when the block is the first in its checkpoint', async () => {
    const { inputs } = buildInputs(0, { isFirstBlockInCheckpoint: true });
    txFetcher.mockResolvedValueOnce([]);

    await handler.executeBlock(inputs);

    expect(fork.appendLeaves).toHaveBeenCalled();
  });
});
