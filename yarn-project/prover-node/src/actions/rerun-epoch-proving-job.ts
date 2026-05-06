import { createArchiverStore, createContractDataSource } from '@aztec/archiver';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import type { Logger } from '@aztec/foundation/log';
import { type ProverClientConfig, createProverClient } from '@aztec/prover-client';
import { ProverBrokerConfig, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { AvmSimulatorPool, CdbIpcServer, PublicContractsDB, PublicProcessorFactory } from '@aztec/simulator/server';
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

  // Spawn IPC backends for C++ simulation
  const wsdbSocketPath = worldState.getSocketPath();
  const { findAvmBinary } = await import('@aztec/bb.js/platform');
  const avmBinaryPath = findAvmBinary();
  if (!avmBinaryPath) {
    throw new Error('aztec-avm binary not found');
  }

  const contractDataSource = createContractDataSource(archiver);
  const cdbServer = new CdbIpcServer();
  const contractsDB = new PublicContractsDB(contractDataSource);
  cdbServer.registerFork(0, contractsDB, 0n);

  const avmPool = new AvmSimulatorPool({
    avmBinaryPath,
    wsdbSocketPath,
    cdbSocketPath: cdbServer.socketPath,
  });

  const publicProcessorFactory = new PublicProcessorFactory(
    contractDataSource,
    avmPool,
    cdbServer,
    undefined,
    undefined,
    log.getBindings(),
  );

  const publisher = {
    submitEpochProof: () => Promise.resolve(true),
    analyzeEpochProofSubmission: () => Promise.resolve(),
  };
  const l2BlockSourceForReorgDetection = undefined;
  const deadline = undefined;

  const broker = await createAndStartProvingBroker(config, telemetry);
  const prover = await createProverClient(config, worldState, broker, telemetry);

  const provingJob = new EpochProvingJob(
    jobData,
    worldState,
    prover.createEpochProver(),
    publicProcessorFactory,
    publisher,
    l2BlockSourceForReorgDetection,
    metrics,
    deadline,
    { skipEpochCheck: true },
    log.getBindings(),
  );

  log.info(`Rerunning epoch proving job for epoch ${jobData.epochNumber}`);
  try {
    await provingJob.run();
    log.info(`Completed job for epoch ${jobData.epochNumber} with status ${provingJob.getState()}`);
    return provingJob.getState();
  } finally {
    await prover.stop();
    await broker.stop();
    await avmPool.destroy();
    await cdbServer.close();
    await worldState.close();
  }
}
