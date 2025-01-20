import {
  type ProofUri,
  ProvingJob,
  type ProvingJobId,
  ProvingJobSettledResult,
  getEpochFromProvingJobId,
} from '@aztec/circuit-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type AztecMap } from '@aztec/kv-store';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { Attributes, LmdbMetrics, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

import { type ProverBrokerConfig } from '../config.js';
import { type ProvingBrokerDatabase } from '../proving_broker_database.js';

class SingleEpochDatabase {
  private jobs: AztecMap<ProvingJobId, string>;
  private jobResults: AztecMap<ProvingJobId, string>;

  constructor(public readonly store: AztecLmdbStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
  }

  estimateSize() {
    return this.store.estimateSize();
  }

  async addProvingJob(job: ProvingJob): Promise<void> {
    await this.jobs.set(job.id, jsonStringify(job));
  }

  *allProvingJobs(): Iterable<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for (const jobStr of this.jobs.values()) {
      const job = jsonParseWithSchema(jobStr, ProvingJob);
      const resultStr = this.jobResults.get(job.id);
      const result = resultStr ? jsonParseWithSchema(resultStr, ProvingJobSettledResult) : undefined;
      yield [job, result];
    }
  }

  async setProvingJobError(id: ProvingJobId, reason: string): Promise<void> {
    const result: ProvingJobSettledResult = { status: 'rejected', reason };
    await this.jobResults.set(id, jsonStringify(result));
  }

  async setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void> {
    const result: ProvingJobSettledResult = { status: 'fulfilled', value };
    await this.jobResults.set(id, jsonStringify(result));
  }

  delete() {
    return this.store.delete();
  }

  close() {
    return this.store.close();
  }
}

export class KVBrokerDatabase implements ProvingBrokerDatabase {
  private metrics: LmdbMetrics;

  private constructor(
    private epochs: Map<number, SingleEpochDatabase>,
    private config: ProverBrokerConfig,
    client: TelemetryClient = getTelemetryClient(),
    private logger: Logger,
  ) {
    this.metrics = new LmdbMetrics(
      client.getMeter('KVBrokerDatabase'),
      {
        [Attributes.DB_DATA_TYPE]: 'prover-broker',
      },
      () => this.estimateSize(),
    );
  }

  private estimateSize() {
    const sizes = Array.from(this.epochs.values()).map(x => x.estimateSize());
    return {
      mappingSize: this.config.dataStoreMapSizeKB,
      numItems: sizes.reduce((prev, curr) => prev + curr.numItems, 0),
      actualSize: sizes.reduce((prev, curr) => prev + curr.actualSize, 0),
    };
  }

  public static async new(
    config: ProverBrokerConfig,
    client: TelemetryClient = getTelemetryClient(),
    logger = createLogger('prover-client:proving-broker-database'),
  ) {
    const epochs: Map<number, SingleEpochDatabase> = new Map<number, SingleEpochDatabase>();
    const files = await readdir(config.dataDirectory!, { recursive: false, withFileTypes: true });
    for (const file of files) {
      if (!file.isDirectory()) {
        continue;
      }
      const fullDirectory = join(config.dataDirectory!, file.name);
      const epochDirectory = file.name;
      const epochNumber = parseInt(epochDirectory, 10);
      if (!Number.isSafeInteger(epochNumber) || epochNumber < 0) {
        logger.warn(`Found invalid epoch directory ${fullDirectory} when loading epoch databases, ignoring`);
        continue;
      }
      logger.info(
        `Loading broker database for epoch ${epochNumber} from ${fullDirectory} with map size ${config.dataStoreMapSizeKB}KB`,
      );
      const db = AztecLmdbStore.open(fullDirectory, config.dataStoreMapSizeKB, false);
      const epochDb = new SingleEpochDatabase(db);
      epochs.set(epochNumber, epochDb);
    }
    return new KVBrokerDatabase(epochs, config, client, logger);
  }

  async close(): Promise<void> {
    for (const [_, v] of this.epochs) {
      await v.close();
    }
  }

  async deleteAllProvingJobsOlderThanEpoch(epochNumber: number): Promise<void> {
    const oldEpochs = Array.from(this.epochs.keys()).filter(e => e < epochNumber);
    for (const old of oldEpochs) {
      const db = this.epochs.get(old);
      if (!db) {
        continue;
      }
      this.logger.info(`Deleting broker database for epoch ${old}`);
      await db.delete();
      this.epochs.delete(old);
    }
  }

  async addProvingJob(job: ProvingJob): Promise<void> {
    let epochDb = this.epochs.get(job.epochNumber);
    if (!epochDb) {
      const newEpochDirectory = join(this.config.dataDirectory!, job.epochNumber.toString());
      await mkdir(newEpochDirectory, { recursive: true });
      this.logger.info(
        `Creating broker database for epoch ${job.epochNumber} at ${newEpochDirectory} with map size ${this.config.dataStoreMapSizeKB}`,
      );
      const db = AztecLmdbStore.open(newEpochDirectory, this.config.dataStoreMapSizeKB, false);
      epochDb = new SingleEpochDatabase(db);
      this.epochs.set(job.epochNumber, epochDb);
    }
    await epochDb.addProvingJob(job);
  }

  *allProvingJobs(): Iterable<[ProvingJob, ProvingJobSettledResult | undefined]> {
    const iterators = Array.from(this.epochs.values()).map(x => x.allProvingJobs());
    for (const it of iterators) {
      yield* it;
    }
  }

  async setProvingJobError(id: ProvingJobId, reason: string): Promise<void> {
    const epochDb = this.epochs.get(getEpochFromProvingJobId(id));
    if (!epochDb) {
      return;
    }
    await epochDb.setProvingJobError(id, reason);
  }

  async setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void> {
    const epochDb = this.epochs.get(getEpochFromProvingJobId(id));
    if (!epochDb) {
      return;
    }
    await epochDb.setProvingJobResult(id, value);
  }
}
