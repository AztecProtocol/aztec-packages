import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber, EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { getVkData } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import {
  AvmProvingInputs,
  BlockExecutionInputs,
  BlockExecutionResult,
  BlockExecutionTxData,
} from '@aztec/stdlib/block_execution';
import {
  type ForkMerkleTreeOperations,
  type ProvingJobProducer,
  type ServerCircuitProver,
  makeExecutionResultJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProofData, ProvingRequestType } from '@aztec/stdlib/proofs';
import { PrivateBaseRollupHints, PrivateTxBaseRollupPrivateInputs, PublicBaseRollupHints } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx, Tx, TxHash } from '@aztec/stdlib/tx';

import {
  getChonkProofFromTx,
  getTreeSnapshot,
  insertSideEffectsAndBuildBaseRollupHints,
} from '../orchestrator/block-building-helpers.js';
import type { ProofStore } from '../proving_broker/proof_store/index.js';

/**
 * Fetches the full `Tx` objects for the given hashes, in the same order. The
 * handler treats a missing tx (length mismatch or hash mismatch) as a hard error.
 */
export type TxFetcher = (txHashes: TxHash[], opts?: { signal?: AbortSignal }) => Promise<Tx[]>;

const NOT_SUPPORTED = (method: string) =>
  new Error(`BlockExecutionHandler does not support ${method} — only BLOCK_EXECUTION jobs`);

/**
 * Implements the `BLOCK_EXECUTION` proving-job behaviour:
 *
 * - Forks world state at the parent block.
 * - For the first block in a checkpoint, inserts the checkpoint's L1-to-L2
 *   messages into the fork's message tree.
 * - For each transaction in tx-order: re-executes the tx through `PublicProcessor`,
 *   builds the base-rollup hints against the fork's current state, then enqueues
 *   the per-tx proving job under a deterministic ID:
 *     - `PRIVATE_TX_BASE_ROLLUP` for private-only txs (the agent has every input).
 *     - `PUBLIC_VM` for public txs, with `BlockExecutionTxData` (the base-rollup
 *       hints + AVM circuit public inputs) attached as passenger data so the
 *       proving agent passes it through to the result. The orchestrator picks
 *       the data up alongside the AVM proof and uses it to enqueue
 *       `PUBLIC_TX_BASE_ROLLUP` itself.
 *
 * The handler reports the BLOCK_EXECUTION job complete only after every per-tx
 * job is enqueued. Returns the block-end sponge-blob accumulator state so the
 * orchestrator can carry it forward to the next block in the checkpoint.
 *
 * Implements `ServerCircuitProver` so it can be plugged into a regular
 * `ProvingAgent` (typically as the BLOCK_EXECUTION arm of a composite prover).
 * Every method other than `executeBlock` rejects.
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
      isFirstBlockInCheckpoint: inputs.isFirstBlockInCheckpoint,
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
      if (inputs.isFirstBlockInCheckpoint) {
        const padded = padArrayEnd<Fr, number>(
          inputs.l1ToL2Messages,
          Fr.ZERO,
          NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
          'Too many L1 to L2 messages',
        );
        await fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, padded);
      }

      const lastArchive = inputs.blockHeader.lastArchive;
      const newL1ToL2MessageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, fork);
      const config = PublicSimulatorConfig.from({
        proverId: this.proverId,
        skipFeeEnforcement: false,
        collectDebugLogs: false,
        collectHints: true,
        collectPublicInputs: true,
        collectStatistics: false,
      });
      const publicProcessor = this.publicProcessorFactory.create(fork, inputs.blockHeader.globalVariables, config);

      const spongeBlobState = inputs.startSpongeBlob.clone();
      let enqueuedAvmJobs = 0;
      let enqueuedPrivateBaseJobs = 0;

      for (let txIndex = 0; txIndex < txs.length; txIndex++) {
        if (signal?.aborted) {
          throw new Error(`Block execution aborted while processing tx ${txIndex}`);
        }

        const tx = txs[txIndex];
        const startSpongeBlob = spongeBlobState.clone();
        const [processedTxs, failedTxs] = await publicProcessor.process([tx]);
        if (failedTxs.length > 0) {
          const reasons = failedTxs.map(({ tx: t, error }) => `${t.getTxHash().toString()} (${error.message})`);
          throw new Error(`Public processor failed for txs: ${reasons.join(', ')}`);
        }
        if (processedTxs.length !== 1) {
          throw new Error(`Public processor returned ${processedTxs.length} txs for tx ${txIndex}, expected 1`);
        }
        const ptx = processedTxs[0];

        const hints = await insertSideEffectsAndBuildBaseRollupHints(
          ptx,
          lastArchive,
          newL1ToL2MessageTreeSnapshot,
          startSpongeBlob,
          this.proverId,
          fork,
        );
        await spongeBlobState.absorb(ptx.txEffect.toBlobFields());

        if (ptx.avmProvingRequest) {
          await this.enqueuePublicVmJob(
            epochNumber,
            blockNumber,
            slotNumber,
            txIndex,
            ptx,
            hints as PublicBaseRollupHints,
          );
          enqueuedAvmJobs++;
        } else {
          await this.enqueuePrivateBaseRollupJob(
            epochNumber,
            blockNumber,
            slotNumber,
            txIndex,
            tx,
            hints as PrivateBaseRollupHints,
          );
          enqueuedPrivateBaseJobs++;
        }
      }

      this.log.info(`Block ${blockNumber} execution complete`, {
        epochNumber,
        blockNumber,
        slotNumber,
        numTxs,
        enqueuedAvmJobs,
        enqueuedPrivateBaseJobs,
      });

      return new BlockExecutionResult(blockNumber, spongeBlobState);
    } finally {
      try {
        await fork.close();
      } catch (err) {
        this.log.error(`Error closing fork for block ${blockNumber}`, err);
      }
    }
  }

  private async enqueuePublicVmJob(
    epochNumber: EpochNumber,
    blockNumber: BlockNumber,
    slotNumber: SlotNumber,
    txIndex: number,
    ptx: ProcessedTx,
    baseRollupHints: PublicBaseRollupHints,
  ) {
    const avmCircuitInputs = ptx.avmProvingRequest!.inputs;
    const executionTxData = new BlockExecutionTxData(baseRollupHints, avmCircuitInputs.publicInputs);
    const avmInputs = new AvmProvingInputs(avmCircuitInputs, executionTxData);
    const jobId = makeExecutionResultJobId(epochNumber, blockNumber, slotNumber, txIndex, ProvingRequestType.PUBLIC_VM);
    const inputsUri = await this.proofStore.saveProofInput(jobId, ProvingRequestType.PUBLIC_VM, avmInputs);
    await this.broker.enqueueProvingJob({
      id: jobId,
      type: ProvingRequestType.PUBLIC_VM,
      inputsUri,
      epochNumber,
    });
  }

  private async enqueuePrivateBaseRollupJob(
    epochNumber: EpochNumber,
    blockNumber: BlockNumber,
    slotNumber: SlotNumber,
    txIndex: number,
    tx: Tx,
    baseRollupHints: PrivateBaseRollupHints,
  ) {
    const privateTailProofData = new ProofData(
      tx.data.toPrivateToRollupKernelCircuitPublicInputs(),
      getChonkProofFromTx(tx),
      getVkData('HidingKernelToRollup'),
    );
    const privateInputs = new PrivateTxBaseRollupPrivateInputs(privateTailProofData, baseRollupHints);
    const jobId = makeExecutionResultJobId(
      epochNumber,
      blockNumber,
      slotNumber,
      txIndex,
      ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
    );
    const inputsUri = await this.proofStore.saveProofInput(
      jobId,
      ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
      privateInputs,
    );
    await this.broker.enqueueProvingJob({
      id: jobId,
      type: ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
      inputsUri,
      epochNumber,
    });
  }

  // --- ServerCircuitProver methods this handler does not implement ---
  // The composite prover used by execution-capable agents dispatches BLOCK_EXECUTION here
  // and routes everything else to the standard proving prover; these unreachable stubs
  // exist so a misconfigured agent fails fast.

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
}
