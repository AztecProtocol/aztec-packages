import { createArchiverStore } from '@aztec/archiver';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { type ProverClientConfig, createProverClient } from '@aztec/prover-client';
import { ProverBrokerConfig, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { PublicProcessorFactory } from '@aztec/simulator/server';
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
) {
  const jobData = deserializeEpochProvingJobData(readFileSync(localPath));
  log.info(`Loaded proving job data for epoch ${jobData.epochNumber}`);

  const telemetry = getTelemetryClient();
  const metrics = new ProverNodeJobMetrics(telemetry.getMeter('prover-job'), telemetry.getTracer('prover-job'));
  const worldState = await createWorldState(config);
  const archiver = await createArchiverStore(config, { epochDuration: config.aztecEpochDuration });
  const publicProcessorFactory = new PublicProcessorFactory(archiver, undefined, undefined, log.getBindings());

  const publisher = { submitEpochProof: () => Promise.resolve(true) };
  const deadline = undefined;

  // This starts a local proving broker that does not get exposed as a service. This should be good enough for
  // smallish epochs to be proven if we run on a large machine, but as epochs grow larger, we may want to switch
  // this out for a live proving broker with multiple agents that we can connect to.
  const broker = await createAndStartProvingBroker(config, telemetry);
  const prover = await createProverClient(config, worldState, broker, telemetry);

  const provingJob = new EpochProvingJob(
    jobData.epochNumber,
    worldState,
    prover.createEpochProver(),
    publicProcessorFactory,
    publisher,
    metrics,
    deadline,
    {},
    undefined, // submissionGate — not needed for reruns.
    log.getBindings(),
  );

  // Push all checkpoints and mark epoch complete.
  const lastBlocks = jobData.checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
  const previousBlockHeaders = [jobData.previousBlockHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
  for (let i = 0; i < jobData.checkpoints.length; i++) {
    const checkpoint = jobData.checkpoints[i];
    provingJob.addCheckpoint(
      checkpoint,
      jobData.l1ToL2Messages[checkpoint.number] ?? [],
      previousBlockHeaders[i],
      jobData.txs,
    );
  }
  provingJob.setEpochComplete(jobData.attestations);

  log.info(`Rerunning epoch proving job for epoch ${jobData.epochNumber}`);
  await provingJob.run();
  log.info(`Completed job for epoch ${jobData.epochNumber} with status ${provingJob.getState()}`);
  return provingJob.getState();
}
