import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { BlockNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { buildFinalBlobChallenges } from '@aztec/prover-client/helpers';
import type { CheckpointSubTreeOrchestrator } from '@aztec/prover-client/orchestrator';
import type { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { L2Block } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type ForkMerkleTreeOperations,
  type ProofUri,
  type ProvingJobClaimManager,
  type ProvingJobProducer,
  makeSubTreeCompleteJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader, ProcessedTx, Tx } from '@aztec/stdlib/tx';

import { SplitProvingJob } from './split-proving-job.js';

/**
 * Proves a single checkpoint's block sub-tree.
 *
 * Produces BlockRollupPublicInputs (the final block proofs) and serializes them
 * into the completion marker. Needs NO epoch-level context — only the checkpoint's
 * own data. Can start as soon as the checkpoint is posted to L1.
 *
 * Block-level proofs are also cached in the broker via BrokerCircuitProverFacade.
 */
export class CheckpointSubTreeJob extends SplitProvingJob {
  private logger: Logger;

  constructor(
    epochNumber: EpochNumber,
    private checkpointIndex: number,
    private checkpoint: Checkpoint,
    private txsByHash: Map<string, Tx>,
    private l1ToL2Messages: Fr[],
    private previousBlockHeader: BlockHeader,
    private orchestrator: CheckpointSubTreeOrchestrator,
    private broker: ProvingJobProducer & ProvingJobClaimManager,
    private dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private publicProcessorFactory: PublicProcessorFactory,
    claimToken: string,
    workItemId: string,
    private config: { heartbeatIntervalMs: number },
  ) {
    super(epochNumber, workItemId, claimToken, 'checkpoint');
    this.logger = createLogger('prover-node:checkpoint-sub-tree-job');
  }

  override async stop() {
    await super.stop();
    await this.orchestrator.stop();
  }

  async run(): Promise<void> {
    const heartbeat = new RunningPromise(
      async () => {
        await this.broker.heartbeatClaim(this.workItemId, this.claimToken);
      },
      this.logger,
      this.config.heartbeatIntervalMs,
    );
    heartbeat.start();

    try {
      // The sub-tree only needs this checkpoint's blob data for a minimal 1-checkpoint epoch.
      // The blob challenges here are local — the top-tree will use the real epoch-level challenges.
      const blobFields = [this.checkpoint.toBlobFields()];
      const localBlobChallenges = await buildFinalBlobChallenges(blobFields);

      // Create a 1-checkpoint epoch just to drive the orchestrator's block proving flow.
      this.orchestrator.startNewEpoch(this.epochNumber, 1, localBlobChallenges);

      await this.orchestrator.startChonkVerifierCircuits(Array.from(this.txsByHash.values()));

      const { chainId, version } = this.checkpoint.blocks[0].header.globalVariables;
      const checkpointConstants = CheckpointConstantData.from({
        chainId,
        version,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        proverId: this.orchestrator.getProverId().toField(),
        slotNumber: this.checkpoint.header.slotNumber,
        coinbase: this.checkpoint.header.coinbase,
        feeRecipient: this.checkpoint.header.feeRecipient,
        gasFees: this.checkpoint.header.gasFees,
      });

      await this.orchestrator.startNewCheckpoint(
        0, // Index within our local 1-checkpoint epoch
        checkpointConstants,
        this.l1ToL2Messages,
        this.checkpoint.blocks.length,
        this.previousBlockHeader,
      );

      // Get sub-tree result promise (resolves when block proofs complete)
      const subTreeResultPromise = this.orchestrator.getSubTreeResult();

      // Process blocks
      for (let blockIndex = 0; blockIndex < this.checkpoint.blocks.length; blockIndex++) {
        if (this.signal.aborted) {
          return;
        }
        const block = this.checkpoint.blocks[blockIndex];
        const globalVariables = block.header.globalVariables;
        const txs = this.getTxs(block);

        await this.orchestrator.startNewBlock(block.number, globalVariables.timestamp, txs.length);

        const db = await this.createFork(
          BlockNumber(block.number - 1),
          blockIndex === 0 ? this.l1ToL2Messages : undefined,
        );
        const config = PublicSimulatorConfig.from({
          proverId: this.orchestrator.getProverId().toField(),
          skipFeeEnforcement: false,
          collectDebugLogs: false,
          collectHints: true,
          collectPublicInputs: true,
          collectStatistics: false,
        });
        const publicProcessor = this.publicProcessorFactory.create(db, globalVariables, config);
        const processed = await this.processTxs(publicProcessor, txs);
        await this.orchestrator.addTxs(processed);
        await db.close();

        await this.orchestrator.setBlockCompleted(block.number, block.header);
      }

      // Wait for block proofs to complete
      const subTreeResult = await subTreeResultPromise;

      // Serialize block proofs into the completion marker.
      // The top-tree job will deserialize these and use them for checkpoint root rollups.
      const serialized = jsonStringify(subTreeResult.blockProofOutputs);
      const markerJobId = makeSubTreeCompleteJobId(this.epochNumber, this.checkpointIndex);
      const payloadUri = `data:application/json;charset=utf-8,${encodeURIComponent(serialized)}`;
      await this.broker.enqueueProvingJob({
        id: markerJobId,
        type: ProvingRequestType.CHECKPOINT_SUB_TREE_COMPLETE,
        epochNumber: this.epochNumber,
        inputsUri: payloadUri as ProofUri,
      });

      this.complete();
      this.logger.info(`Completed sub-tree proof for epoch=${this.epochNumber} checkpoint=${this.checkpointIndex}`);
    } catch (err) {
      this.fail();
      this.logger.error(`Failed sub-tree proof for epoch=${this.epochNumber} checkpoint=${this.checkpointIndex}`, err);
      throw err;
    } finally {
      await heartbeat.stop();
      await this.orchestrator.stop();
    }
  }

  private getTxs(block: L2Block): Tx[] {
    return block.body.txEffects.map(txEffect => this.txsByHash.get(txEffect.txHash.toString())!);
  }

  private async createFork(blockNumber: BlockNumber, l1ToL2Messages: Fr[] | undefined) {
    const db = await this.dbProvider.fork(blockNumber);
    if (l1ToL2Messages !== undefined) {
      const padded = padArrayEnd<Fr, number>(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
      await db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, padded);
    }
    return db;
  }

  private async processTxs(publicProcessor: PublicProcessor, txs: Tx[]): Promise<ProcessedTx[]> {
    const [processedTxs, failedTxs] = await publicProcessor.process(txs);
    if (failedTxs.length) {
      throw new Error(`Txs failed processing: ${failedTxs.length} failures`);
    }
    return processedTxs;
  }
}
