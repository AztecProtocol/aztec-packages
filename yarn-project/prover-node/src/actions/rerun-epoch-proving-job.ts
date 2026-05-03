import { createArchiverStore } from '@aztec/archiver';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import type { Logger } from '@aztec/foundation/log';
import { type ProverClientConfig, createProverClient } from '@aztec/prover-client';
import { ProverBrokerConfig, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldState } from '@aztec/world-state';

import { readFileSync } from 'fs';

import { deserializeEpochProvingJobData } from '../job/epoch-proving-job-data.js';
import { EpochProvingJob } from '../job/epoch-proving-job.js';
import { ProverNodeJobMetrics } from '../metrics.js';

/**
 * Given a local folder where `downloadEpochProvingJob` was called, creates a new archiver and world state
 * using the state snapshots, and creates a new epoch proving job to prove the downloaded proving job.
 * Proving is done with a local proving broker and agents as specified by the config.
 */
export async function rerunEpochProvingJob(
  localPath: string,
  log: Logger,
  config: DataStoreConfig & ProverBrokerConfig & ProverClientConfig & Pick<L1ContractsConfig, 'aztecEpochDuration'>,
  genesis?: GenesisData,
) {
  const jobData = deserializeEpochProvingJobData(readFileSync(localPath));
  log.info(`Loaded proving job data for epoch ${jobData.epochNumber}`);

  const telemetry = getTelemetryClient();
  const metrics = new ProverNodeJobMetrics(telemetry.getMeter('prover-job'), telemetry.getTracer('prover-job'));
  const worldState = await createWorldState(config, genesis);
  const archiver = await createArchiverStore(config);
  const publicProcessorFactory = new PublicProcessorFactory(archiver, undefined, undefined, log.getBindings());

  const publisher = {
    submitEpochProof: () => Promise.resolve(true),
    analyzeEpochProofSubmission: () => Promise.resolve(),
  };
  const deadline = undefined;

  // This starts a local proving broker that does not get exposed as a service. This should be good enough for
  // smallish epochs to be proven if we run on a large machine, but as epochs grow larger, we may want to switch
  // this out for a live proving broker with multiple agents that we can connect to.
  const broker = await createAndStartProvingBroker(config, telemetry);
  const prover = await createProverClient(config, worldState, broker, telemetry);

  const provingJob = new EpochProvingJob(
    jobData.epochNumber,
    worldState,
    prover,
    publicProcessorFactory,
    publisher,
    metrics,
    deadline,
    {},
    log.getBindings(),
  );

  log.info(`Rerunning epoch proving job for epoch ${jobData.epochNumber}`);

  // Add all checkpoints incrementally. Attestations are saved at the epoch level, so
  // attach them to the highest-numbered checkpoint (the one whose attestations the job
  // uses at finalize time); the rest register with empty attestations.
  const lastCheckpointNumber = jobData.checkpoints.at(-1)!.number;
  for (const checkpoint of jobData.checkpoints) {
    const l1ToL2Messages = jobData.l1ToL2Messages[checkpoint.number] ?? [];
    const checkpointIndex = checkpoint.number - jobData.checkpoints[0].number;
    const previousBlockHeader =
      checkpointIndex === 0
        ? jobData.previousBlockHeader
        : jobData.checkpoints[checkpointIndex - 1].blocks.at(-1)!.header;
    const attestations = checkpoint.number === lastCheckpointNumber ? jobData.attestations : [];
    provingJob.registerPendingCheckpoint(checkpoint, checkpointIndex, attestations);
    await provingJob.addCheckpoint(checkpoint, jobData.txs, l1ToL2Messages, previousBlockHeader);
  }

  // Hand the epoch off to the job for finalization. Since all checkpoints have already
  // been added synchronously above (no pending), finalizeAndProve runs immediately.
  provingJob.completeEpoch();
  const finalState = await provingJob.whenComplete();
  log.info(`Completed job for epoch ${jobData.epochNumber} with status ${finalState}`);
  return finalState;
}
