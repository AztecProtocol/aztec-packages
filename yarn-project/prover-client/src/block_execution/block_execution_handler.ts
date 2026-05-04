import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AvmProvingInputs, BlockExecutionInputs, BlockExecutionResult } from '@aztec/stdlib/block_execution';
import {
  type ForkMerkleTreeOperations,
  type ProvingJobProducer,
  type ServerCircuitProver,
  makeExecutionResultJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import type { ProofStore } from '../proving_broker/proof_store/index.js';

/**
 * Fetches the full `Tx` objects for the given hashes. Returns them in the same
 * order as the input. The handler treats a missing tx as a hard error.
 */
export type TxFetcher = (txHashes: TxHash[], opts?: { signal?: AbortSignal }) => Promise<Tx[]>;

const NOT_SUPPORTED = (method: string) =>
  new Error(`BlockExecutionHandler does not support ${method} — execution agents only handle BLOCK_EXECUTION jobs`);

/**
 * Implements the `BLOCK_EXECUTION` proving-job behaviour: re-execute every transaction
 * in the requested block on a forked world state, save the per-tx AVM circuit inputs
 * to the shared proof store, and enqueue the AVM proving jobs under deterministic
 * IDs computed from `(epoch, blockNumber, slotNumber, txIndex)`. The orchestrator
 * picks up those proofs out-of-band via the same deterministic IDs.
 *
 * Implements `ServerCircuitProver` so it can be plugged into a regular `ProvingAgent`,
 * but every method other than `executeBlock` rejects — execution agents must be
 * configured with an `allowList` of `[BLOCK_EXECUTION]` so the broker never hands
 * them other work.
 */
export class BlockExecutionHandler implements ServerCircuitProver {
  private readonly log: Logger;

  constructor(
    private readonly dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private readonly publicProcessorFactory: PublicProcessorFactory,
    private readonly txFetcher: TxFetcher,
    private readonly proofStore: ProofStore,
    private readonly broker: Pick<ProvingJobProducer, 'enqueueProvingJob'>,
    private readonly proverId: Fr,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('prover-client:block-execution-handler', bindings);
  }

  public async executeBlock(
    inputs: BlockExecutionInputs,
    signal?: AbortSignal,
    epochNumberOverride?: number,
  ): Promise<BlockExecutionResult> {
    const epochNumber = EpochNumber(epochNumberOverride ?? Number(inputs.epochNumber));
    const blockNumber = inputs.blockHeader.getBlockNumber();
    const slotNumber = inputs.blockHeader.getSlot();
    const numTxs = inputs.txHashes.length;

    this.log.verbose(`Executing block ${blockNumber} (${numTxs} txs) for epoch ${epochNumber}`, {
      epochNumber,
      blockNumber,
      slotNumber,
      checkpointIndex: inputs.checkpointIndex,
      numTxs,
    });

    if (signal?.aborted) {
      throw new Error('Block execution aborted before fetching transactions');
    }

    const txs = await this.fetchTxs(inputs.txHashes, signal);
    if (signal?.aborted) {
      throw new Error('Block execution aborted after fetching transactions');
    }

    const parentBlockNumber = BlockNumber(Number(blockNumber) - 1);
    const fork = await this.dbProvider.fork(parentBlockNumber);
    try {
      if (signal?.aborted) {
        throw new Error('Block execution aborted after forking world state');
      }

      const config = PublicSimulatorConfig.from({
        proverId: this.proverId,
        skipFeeEnforcement: false,
        collectDebugLogs: false,
        collectHints: true,
        collectPublicInputs: true,
        collectStatistics: false,
      });
      const publicProcessor = this.publicProcessorFactory.create(fork, inputs.blockHeader.globalVariables, config);

      const [processedTxs, failedTxs] = await publicProcessor.process(txs);
      if (failedTxs.length > 0) {
        const failedHashes = failedTxs.map(({ tx, error }) => `${tx.getTxHash().toString()} (${error.message})`);
        throw new Error(`Public processor failed for txs: ${failedHashes.join(', ')}`);
      }
      if (processedTxs.length !== txs.length) {
        throw new Error(`Public processor returned ${processedTxs.length} txs, expected ${txs.length}`);
      }

      let enqueuedAvmJobs = 0;
      for (let txIndex = 0; txIndex < processedTxs.length; txIndex++) {
        const ptx = processedTxs[txIndex];
        if (!ptx.avmProvingRequest) {
          // Private-only tx: orchestrator drives base rollup directly, no AVM job.
          continue;
        }

        const jobId = makeExecutionResultJobId(
          epochNumber,
          blockNumber,
          slotNumber,
          txIndex,
          ProvingRequestType.PUBLIC_VM,
        );
        const inputsUri = await this.proofStore.saveProofInput(
          jobId,
          ProvingRequestType.PUBLIC_VM,
          AvmProvingInputs.fromAvmCircuitInputs(ptx.avmProvingRequest.inputs),
        );
        await this.broker.enqueueProvingJob({
          id: jobId,
          type: ProvingRequestType.PUBLIC_VM,
          inputsUri,
          epochNumber,
        });
        enqueuedAvmJobs++;
      }

      this.log.info(`Block ${blockNumber} execution complete, enqueued ${enqueuedAvmJobs} AVM jobs`, {
        epochNumber,
        blockNumber,
        slotNumber,
        numTxs,
        enqueuedAvmJobs,
      });

      return new BlockExecutionResult(blockNumber);
    } finally {
      try {
        await fork.close();
      } catch (err) {
        this.log.error(`Error closing fork for block ${blockNumber}`, err);
      }
    }
  }

  private async fetchTxs(txHashes: TxHash[], signal: AbortSignal | undefined): Promise<Tx[]> {
    const txs = await this.txFetcher(txHashes, { signal });
    if (txs.length !== txHashes.length) {
      throw new Error(`Tx fetcher returned ${txs.length} txs, expected ${txHashes.length}`);
    }
    for (let i = 0; i < txs.length; i++) {
      const expected = txHashes[i];
      const actual = txs[i].getTxHash();
      if (!actual.equals(expected)) {
        throw new Error(`Tx fetcher returned mismatched tx at index ${i}: expected ${expected}, got ${actual}`);
      }
    }
    return txs;
  }

  // --- ServerCircuitProver methods that this handler does not implement ---
  // Execution agents are configured with an allowList of [BLOCK_EXECUTION] so these are unreachable in
  // production. They throw so a misconfigured agent fails fast instead of silently dropping a job.

  public getBaseParityProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBaseParityProof'));
  }
  public getRootParityProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getRootParityProof'));
  }
  public getPublicChonkVerifierProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getPublicChonkVerifierProof'));
  }
  public getPrivateTxBaseRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getPrivateTxBaseRollupProof'));
  }
  public getPublicTxBaseRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getPublicTxBaseRollupProof'));
  }
  public getTxMergeRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getTxMergeRollupProof'));
  }
  public getBlockRootFirstRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockRootFirstRollupProof'));
  }
  public getBlockRootSingleTxFirstRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockRootSingleTxFirstRollupProof'));
  }
  public getBlockRootEmptyTxFirstRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockRootEmptyTxFirstRollupProof'));
  }
  public getBlockRootRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockRootRollupProof'));
  }
  public getBlockRootSingleTxRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockRootSingleTxRollupProof'));
  }
  public getBlockMergeRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getBlockMergeRollupProof'));
  }
  public getCheckpointRootRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getCheckpointRootRollupProof'));
  }
  public getCheckpointRootSingleBlockRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getCheckpointRootSingleBlockRollupProof'));
  }
  public getCheckpointPaddingRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getCheckpointPaddingRollupProof'));
  }
  public getCheckpointMergeRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getCheckpointMergeRollupProof'));
  }
  public getRootRollupProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getRootRollupProof'));
  }
  public getAvmProof(): Promise<never> {
    return Promise.reject(NOT_SUPPORTED('getAvmProof'));
  }
}
