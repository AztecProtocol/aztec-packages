import type { ViemCommitteeAttestation } from '@aztec/ethereum/contracts';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type ClaimToken,
  type ProvingJobClaimManager,
  type ProvingJobProducer,
  type WorkItemId,
  makeTopTreeCompleteJobId,
} from '@aztec/stdlib/interfaces/server';
import { EpochProofPayload } from '@aztec/stdlib/proofs';

import type { ProverNodePublisher } from '../prover-node-publisher.js';

/**
 * Publishes a completed root rollup proof to L1.
 *
 * Loads the root proof from the top-tree completion marker payload,
 * then submits it via the publisher. Only nodes with publisher eligibility
 * (staked prover with configured signing keys) can run this job.
 */
export class RootRollupPublishJob {
  private state: 'running' | 'completed' | 'failed' = 'running';
  private logger: Logger;

  constructor(
    private epochNumber: EpochNumber,
    private checkpoints: Checkpoint[],
    private attestations: ViemCommitteeAttestation[],
    private publisher: Pick<ProverNodePublisher, 'submitEpochProof'>,
    private broker: ProvingJobProducer & ProvingJobClaimManager,
    private claimToken: ClaimToken,
    private workItemId: WorkItemId,
  ) {
    this.logger = createLogger('prover-node:root-rollup-publish-job');
  }

  getState() {
    return this.state;
  }

  async run(): Promise<void> {
    try {
      // Load the top-tree completion marker to get the root proof
      const markerJobId = makeTopTreeCompleteJobId(this.epochNumber);
      const status = await this.broker.getProvingJobStatus(markerJobId);
      if (status.status !== 'fulfilled') {
        throw new Error(`Top-tree marker for epoch ${this.epochNumber} not fulfilled: ${status.status}`);
      }

      // Deserialize the epoch proof payload from the marker
      const payloadUri = status.value;
      const [_prefix, hexData] = payloadUri.split(',');
      if (!hexData) {
        throw new Error('Invalid top-tree marker payload URI');
      }
      const payload = EpochProofPayload.fromString(hexData);

      const fromCheckpoint = this.checkpoints[0].number;
      const toCheckpoint = this.checkpoints.at(-1)!.number;

      this.logger.info(
        `Publishing proof for epoch ${this.epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
      );

      const success = await this.publisher.submitEpochProof({
        fromCheckpoint,
        toCheckpoint,
        epochNumber: this.epochNumber,
        publicInputs: payload.publicInputs,
        proof: payload.proof,
        batchedBlobInputs: payload.batchedBlobInputs,
        attestations: this.attestations,
      });

      if (!success) {
        throw new Error('Failed to submit epoch proof to L1');
      }

      this.state = 'completed';
      this.logger.info(
        `Published proof for epoch ${this.epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`,
      );
    } catch (err) {
      this.state = 'failed';
      this.logger.error(`Failed to publish proof for epoch=${this.epochNumber}`, err);
      throw err;
    }
  }
}
