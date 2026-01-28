import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { asyncPool } from '@aztec/foundation/async-pool';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { buildFinalBlobChallenges } from '@aztec/prover-client/helpers';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type EpochProver,
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
} from '@aztec/stdlib/interfaces/server';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { ProcessedTx, Tx } from '@aztec/stdlib/tx';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { type EpochProvingJobData, validateEpochProvingJobData } from './epoch-proving-job-data.js';

export type EpochProvingJobOptions = {
  parallelBlockLimit?: number;
  skipEpochCheck?: boolean;
  skipSubmitProof?: boolean;
};

/**
 * Job that grabs a range of blocks from the unfinalized chain from L1, gets their txs given their hashes,
 * re-executes their public calls, generates a rollup proof, and submits it to L1. This job will update the
 * world state as part of public call execution via the public processor.
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log: Logger;
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private epochCheckPromise: RunningPromise | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  public readonly tracer: Tracer;

  constructor(
    private data: EpochProvingJobData,
    private dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private prover: EpochProver,
    private publicProcessorFactory: PublicProcessorFactory,
    private publisher: Pick<ProverNodePublisher, 'submitEpochProof'>,
    private l2BlockSource: L2BlockSource | undefined,
    private metrics: ProverNodeJobMetrics,
    private deadline: Date | undefined,
    private config: EpochProvingJobOptions,
    bindings?: LoggerBindings,
  ) {
    validateEpochProvingJobData(data);
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-proving-job', {
      ...bindings,
      instanceId: `epoch-${data.epochNumber}`,
    });
    this.tracer = metrics.tracer;
  }

  public getId(): string {
    return this.uuid;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  public getEpochNumber(): EpochNumber {
    return this.data.epochNumber;
  }

  public getDeadline(): Date | undefined {
    return this.deadline;
  }

  public getProvingData(): EpochProvingJobData {
    return this.data;
  }

  private get epochNumber() {
    return this.data.epochNumber;
  }

  private get checkpoints() {
    return this.data.checkpoints;
  }

  private get txs() {
    return this.data.txs;
  }

  private get attestations() {
    return this.data.attestations;
  }

  /**
   * Proves the given epoch and submits the proof to L1.
   */
  @trackSpan('EpochProvingJob.run', function () {
    return { [Attributes.EPOCH_NUMBER]: this.data.epochNumber };
  })
  public async run() {
    this.scheduleDeadlineStop();
    if (!this.config.skipEpochCheck) {
      await this.scheduleEpochCheck();
    }

    const attestations = this.attestations.map(attestation => attestation.toViem());
    const epochNumber = this.epochNumber;
    const epochSizeCheckpoints = this.checkpoints.length;
    const epochSizeBlocks = this.checkpoints.reduce((accum, checkpoint) => accum + checkpoint.blocks.length, 0);
    const epochSizeTxs = this.checkpoints.reduce(
      (accum, checkpoint) =>
        accum + checkpoint.blocks.reduce((accumC, block) => accumC + block.body.txEffects.length, 0),
      0,
    );
    const fromCheckpoint = this.checkpoints[0].number;
    const toCheckpoint = this.checkpoints.at(-1)!.number;
    const fromBlock = this.checkpoints[0].blocks[0].number;
    const toBlock = this.checkpoints.at(-1)!.blocks.at(-1)!.number;
    this.log.info(`Starting epoch ${epochNumber} proving job with checkpoints ${fromCheckpoint} to ${toCheckpoint}`, {
      fromBlock,
      toBlock,
      epochSizeTxs,
      epochNumber,
      uuid: this.uuid,
    });

    this.progressState('processing');
    const timer = new Timer();
    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      const blobFieldsPerCheckpoint = this.checkpoints.map(checkpoint => checkpoint.toBlobFields());
      const finalBlobBatchingChallenges = await buildFinalBlobChallenges(blobFieldsPerCheckpoint);

      this.prover.startNewEpoch(epochNumber, epochSizeCheckpoints, finalBlobBatchingChallenges);
      await this.prover.startChonkVerifierCircuits(Array.from(this.txs.values()));

      // Everything in the epoch should have the same chainId and version.
      const { chainId, version } = this.checkpoints[0].blocks[0].header.globalVariables;

      const previousBlockHeaders = this.gatherPreviousBlockHeaders();

      await asyncPool(this.config.parallelBlockLimit ?? 32, this.checkpoints, async checkpoint => {
        this.checkState();

        const checkpointIndex = checkpoint.number - fromCheckpoint;
        const checkpointConstants = CheckpointConstantData.from({
          chainId,
          version,
          vkTreeRoot: getVKTreeRoot(),
          protocolContractsHash: protocolContractsHash,
          proverId: this.prover.getProverId().toField(),
          slotNumber: checkpoint.header.slotNumber,
          coinbase: checkpoint.header.coinbase,
          feeRecipient: checkpoint.header.feeRecipient,
          gasFees: checkpoint.header.gasFees,
        });
        const previousHeader = previousBlockHeaders[checkpointIndex];
        const l1ToL2Messages = this.getL1ToL2Messages(checkpoint);

        this.log.verbose(`Starting processing checkpoint ${checkpoint.number}`, {
          number: checkpoint.number,
          checkpointHash: checkpoint.hash().toString(),
          lastArchive: checkpoint.header.lastArchiveRoot,
          previousHeader: previousHeader.hash(),
          uuid: this.uuid,
        });

        await this.prover.startNewCheckpoint(
          checkpointIndex,
          checkpointConstants,
          l1ToL2Messages,
          checkpoint.blocks.length,
          previousHeader,
        );

        for (const block of checkpoint.blocks) {
          const globalVariables = block.header.globalVariables;
          const txs = this.getTxs(block);

          this.log.verbose(`Starting processing block ${block.number}`, {
            number: block.number,
            blockHash: (await block.hash()).toString(),
            lastArchive: block.header.lastArchive.root,
            noteHashTreeRoot: block.header.state.partial.noteHashTree.root,
            nullifierTreeRoot: block.header.state.partial.nullifierTree.root,
            publicDataTreeRoot: block.header.state.partial.publicDataTree.root,
            ...globalVariables,
            numTxs: txs.length,
          });

          // Start block proving
          await this.prover.startNewBlock(block.number, globalVariables.timestamp, txs.length);

          // Process public fns
          const db = await this.createFork(BlockNumber(block.number - 1), l1ToL2Messages);
          const config = PublicSimulatorConfig.from({
            proverId: this.prover.getProverId().toField(),
            skipFeeEnforcement: false,
            collectDebugLogs: false,
            collectHints: true,
            collectPublicInputs: true,
            collectStatistics: false,
          });
          const publicProcessor = this.publicProcessorFactory.create(db, globalVariables, config);
          const processed = await this.processTxs(publicProcessor, txs);
          await this.prover.addTxs(processed);
          await db.close();
          this.log.verbose(`Processed all ${txs.length} txs for block ${block.number}`, {
            blockNumber: block.number,
            blockHash: (await block.hash()).toString(),
            uuid: this.uuid,
          });

          // Mark block as completed to pad it
          const expectedBlockHeader = block.header;
          await this.prover.setBlockCompleted(block.number, expectedBlockHeader);
        }
      });

      const executionTime = timer.ms();

      this.progressState('awaiting-prover');
      const { publicInputs, proof, batchedBlobInputs } = await this.prover.finalizeEpoch();
      this.log.info(`Finalized proof for epoch ${epochNumber}`, { epochNumber, uuid: this.uuid, duration: timer.ms() });

      this.progressState('publishing-proof');

      if (this.config.skipSubmitProof) {
        this.log.info(
          `Proof publishing is disabled. Dropping valid proof for epoch ${epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
        );
        this.state = 'completed';
        this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeCheckpoints, epochSizeBlocks, epochSizeTxs);
        return;
      }

      const success = await this.publisher.submitEpochProof({
        fromCheckpoint,
        toCheckpoint,
        epochNumber,
        publicInputs,
        proof,
        batchedBlobInputs,
        attestations,
      });
      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.log.info(`Submitted proof for epoch ${epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`, {
        epochNumber,
        uuid: this.uuid,
      });
      this.state = 'completed';
      this.metrics.recordProvingJob(executionTime, timer.ms(), epochSizeCheckpoints, epochSizeBlocks, epochSizeTxs);
    } catch (err: any) {
      if (err && err.name === 'HaltExecutionError') {
        this.log.warn(`Halted execution of epoch ${epochNumber} prover job`, {
          uuid: this.uuid,
          epochNumber,
          details: err.message,
        });
        return;
      }
      this.log.error(`Error running epoch ${epochNumber} prover job`, err, { uuid: this.uuid, epochNumber });
      if (this.state === 'processing' || this.state === 'awaiting-prover' || this.state === 'publishing-proof') {
        this.state = 'failed';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.epochCheckPromise?.stop();
      await this.prover.stop();
      resolve();
    }
  }

  /**
   * Create a new db fork for tx processing, inserting all L1 to L2.
   * REFACTOR: The prover already spawns a db fork of its own for each block, so we may be able to do away with just one fork.
   */
  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[]) {
    const db = await this.dbProvider.fork(blockNumber);
    const l1ToL2MessagesPadded = padArrayEnd<Fr, number>(
      l1ToL2Messages,
      Fr.ZERO,
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      'Too many L1 to L2 messages',
    );
    this.log.verbose(`Creating fork at ${blockNumber} with ${l1ToL2Messages.length} L1 to L2 messages`, {
      blockNumber,
      l1ToL2Messages: l1ToL2Messages.map(m => m.toString()),
    });
    await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);
    return db;
  }

  private progressState(state: EpochProvingJobState) {
    this.checkState();
    this.state = state;
  }

  private checkState() {
    if (this.state === 'timed-out' || this.state === 'stopped' || this.state === 'failed' || this.state === 'reorg') {
      throw new HaltExecutionError(this.state);
    }
  }

  public async stop(state: EpochProvingJobTerminalState = 'stopped') {
    this.state = state;
    this.prover.cancel();
    if (this.runPromise) {
      await this.runPromise;
    }
  }

  private scheduleDeadlineStop() {
    const deadline = this.deadline;
    if (deadline) {
      const timeout = deadline.getTime() - Date.now();
      if (timeout <= 0) {
        throw new Error('Cannot start job with deadline in the past');
      }

      this.deadlineTimeoutHandler = setTimeout(() => {
        if (EpochProvingJobTerminalState.includes(this.state)) {
          return;
        }
        this.log.warn('Stopping job due to deadline hit', { uuid: this.uuid, epochNumber: this.epochNumber });
        this.stop('timed-out').catch(err => {
          this.log.error('Error stopping job', err, { uuid: this.uuid, epochNumber: this.epochNumber });
        });
      }, timeout);
    }
  }

  /**
   * Kicks off a running promise that queries the archiver for the set of L2 blocks of the current epoch.
   * If those change, stops the proving job with a `rerun` state, so the node re-enqueues it.
   */
  private async scheduleEpochCheck() {
    const l2BlockSource = this.l2BlockSource;
    if (!l2BlockSource) {
      this.log.warn(`No L2 block source available, skipping epoch check`);
      return;
    }

    const intervalMs = Math.ceil((await l2BlockSource.getL1Constants()).ethereumSlotDuration / 2) * 1000;
    this.epochCheckPromise = new RunningPromise(
      async () => {
        const blockHeaders = await l2BlockSource.getCheckpointedBlockHeadersForEpoch(this.epochNumber);
        const blockHashes = await Promise.all(blockHeaders.map(async header => (await header.hash()).toField()));
        const thisBlocks = this.checkpoints.flatMap(checkpoint => checkpoint.blocks);
        const thisBlockHashes = await Promise.all(thisBlocks.map(block => block.hash()));
        if (
          blockHeaders.length !== thisBlocks.length ||
          !blockHashes.every((block, i) => block.equals(thisBlockHashes[i]))
        ) {
          this.log.warn('Epoch blocks changed underfoot', {
            uuid: this.uuid,
            epochNumber: this.epochNumber,
            oldBlockHashes: thisBlockHashes,
            newBlockHashes: blockHashes,
          });
          void this.stop('reorg');
        }
      },
      this.log,
      intervalMs,
    ).start();
    this.log.verbose(`Scheduled epoch check for epoch ${this.epochNumber} every ${intervalMs}ms`);
  }

  /* Returns the last block header in the previous checkpoint for all checkpoints in the epoch */
  private gatherPreviousBlockHeaders() {
    const lastBlocks = this.checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    return [this.data.previousBlockHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
  }

  private getTxs(block: L2Block): Tx[] {
    return block.body.txEffects.map(txEffect => this.txs.get(txEffect.txHash.toString())!);
  }

  private getL1ToL2Messages(checkpoint: Checkpoint) {
    return this.data.l1ToL2Messages[checkpoint.number];
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    const { deadline } = this;
    const [processedTxs, failedTxs] = await publicProcessor.process(txs, { deadline });

    if (failedTxs.length) {
      const failedTxHashes = await Promise.all(failedTxs.map(({ tx }) => tx.getTxHash()));
      throw new Error(
        `Txs failed processing: ${failedTxs
          .map(({ error }, index) => `${failedTxHashes[index]} (${error})`)
          .join(', ')}`,
      );
    }

    if (processedTxs.length !== txs.length) {
      throw new Error(`Failed to process all txs: processed ${processedTxs.length} out of ${txs.length}`);
    }

    return processedTxs;
  }
}

class HaltExecutionError extends Error {
  constructor(public readonly state: EpochProvingJobState) {
    super(`Halted execution due to state ${state}`);
    this.name = 'HaltExecutionError';
  }
}

export { type EpochProvingJobState };
