import type { FinalBlobBatchingChallenges } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { BlockNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { assertLength } from '@aztec/foundation/serialize';
import { getLastSiblingPath } from '@aztec/prover-client/helpers';
import type { CheckpointTopTreeData, TopTreeOrchestrator } from '@aztec/prover-client/orchestrator';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { schemaForPublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import {
  type ClaimToken,
  type ForkMerkleTreeOperations,
  type ProofUri,
  type ProvingJobClaimManager,
  type ProvingJobProducer,
  type ReadonlyWorldStateAccess,
  type WorkItemId,
  makeSubTreeCompleteJobId,
  makeTopTreeCompleteJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { EpochProofPayload } from '@aztec/stdlib/proofs/epoch_proof_payload';
import { BlockRollupPublicInputs } from '@aztec/stdlib/rollup';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';

/**
 * Lightweight job that proves the top tree (checkpoint roots through root rollup).
 *
 * Loads block proofs from sub-tree completion markers, gathers checkpoint data
 * from archiver, computes blob/out-hash state, and drives checkpoint-root →
 * root-rollup proving via TopTreeOrchestrator.
 *
 * Does NOT re-process blocks. All block-level work was done by sub-tree jobs.
 */
export class TopTreeJob {
  private state: 'running' | 'completed' | 'failed' = 'running';
  private logger: Logger;

  constructor(
    private epochNumber: EpochNumber,
    private checkpoints: Checkpoint[],
    private previousBlockHeader: BlockHeader,
    private orchestrator: TopTreeOrchestrator,
    private broker: ProvingJobProducer & ProvingJobClaimManager,
    private l2BlockSource: L2BlockSource,
    private worldState: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    private finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    private claimToken: ClaimToken,
    private workItemId: WorkItemId,
    private config: { heartbeatIntervalMs: number },
  ) {
    this.logger = createLogger('prover-node:top-tree-job');
  }

  getState() {
    return this.state;
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
      // Build CheckpointTopTreeData for each checkpoint
      const checkpointData: CheckpointTopTreeData[] = [];
      const previousBlockHeaders = this.gatherPreviousBlockHeaders();

      for (let i = 0; i < this.checkpoints.length; i++) {
        const checkpoint = this.checkpoints[i];

        // Load block proofs from sub-tree completion marker
        const markerId = makeSubTreeCompleteJobId(this.epochNumber, i);
        const status = await this.broker.getProvingJobStatus(markerId);
        if (status.status !== 'fulfilled') {
          throw new Error(`Sub-tree marker for checkpoint ${i} not fulfilled: ${status.status}`);
        }
        const [_prefix, encodedData] = status.value.split(',');
        if (!encodedData) {
          throw new Error(`Invalid sub-tree marker payload for checkpoint ${i}`);
        }
        // Deserialize block proof outputs with proper schema
        const blockProofSchema = schemaForPublicInputsAndRecursiveProof(
          BlockRollupPublicInputs.schema,
          NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
        );
        const rawArray = JSON.parse(decodeURIComponent(encodedData));
        const blockProofOutputs = (rawArray as unknown[]).map(item =>
          jsonParseWithSchema(JSON.stringify(item), blockProofSchema),
        );

        // Get L2-to-L1 messages per block from archiver data
        const l2ToL1MsgsPerBlock = checkpoint.blocks.map(block => block.body.txEffects.map(tx => tx.l2ToL1Msgs));

        // Blob fields from checkpoint
        const blobFields = checkpoint.toBlobFields();

        // Previous block header and archive sibling path.
        // Fork world state at the previous block to get the archive tree state
        // after that block was processed (same as ProvingOrchestrator.startNewCheckpoint).
        const previousHeader = previousBlockHeaders[i];
        const prevBlockNumber = BlockNumber(previousHeader.globalVariables.blockNumber);
        const db = await this.worldState.fork(prevBlockNumber);
        const previousArchiveSiblingPath = assertLength(
          await getLastSiblingPath(MerkleTreeId.ARCHIVE, db),
          ARCHIVE_HEIGHT,
        );
        await db.close();

        checkpointData.push({
          blockProofOutputs,
          l2ToL1MsgsPerBlock,
          blobFields,
          previousBlockHeader: previousHeader,
          previousArchiveSiblingPath,
        });
      }

      this.logger.info(`Loaded data for ${checkpointData.length} checkpoints, starting top-tree proving`);

      // Drive the top-tree orchestrator — no block re-processing
      const result = await this.orchestrator.prove(
        this.epochNumber,
        this.checkpoints.length,
        this.finalBlobBatchingChallenges,
        checkpointData,
      );

      this.logger.info(`Finalized top-tree proof for epoch=${this.epochNumber}`);

      // Serialize the complete epoch proof into the completion marker
      const payload = new EpochProofPayload(result.publicInputs, result.proof, result.batchedBlobInputs);
      const markerJobId = makeTopTreeCompleteJobId(this.epochNumber);
      const payloadUri = `data:,${payload.toString()}` as ProofUri;
      await this.broker.enqueueProvingJob({
        id: markerJobId,
        type: ProvingRequestType.TOP_TREE_COMPLETE,
        epochNumber: this.epochNumber,
        inputsUri: payloadUri,
      });

      this.state = 'completed';
      this.logger.info(`Completed top-tree job for epoch=${this.epochNumber}`);
    } catch (err) {
      this.state = 'failed';
      this.logger.error(`Failed top-tree job for epoch=${this.epochNumber}`, err);
      throw err;
    } finally {
      await heartbeat.stop();
      await this.orchestrator.stop();
    }
  }

  private gatherPreviousBlockHeaders(): BlockHeader[] {
    const lastBlocks = this.checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    return [this.previousBlockHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
  }
}
