import {
  type ProofUri,
  ProvingJob,
  type ProvingJobId,
  ProvingJobSettledResult,
  getEpochFromProvingJobId,
} from '@aztec/circuit-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';
import { Attributes, LmdbMetrics, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

import { type ProverBrokerConfig } from '../config.js';
import { type ProvingBrokerDatabase } from '../proving_broker_database.js';

class SingleEpochDatabase {
  private jobs: AztecAsyncMap<ProvingJobId, string>;
  private jobResults: AztecAsyncMap<ProvingJobId, string>;

  constructor(public readonly store: AztecAsyncKVStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
  }

  estimateSize() {
    return this.store.estimateSize();
  }

  async addProvingJobs(jobs: ProvingJob[]): Promise<void> {
    await this.store.transactionAsync(async () => {
      for (const job of jobs) {
        await this.jobs.set(job.id, jsonStringify(job));
      }
    });
  }

  async *allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for await (const jobStr of this.jobs.valuesAsync()) {
      const job = await jsonParseWithSchema(jobStr, ProvingJob);
      const resultStr = await this.jobResults.getAsync(job.id);
      const result = resultStr ? await jsonParseWithSchema(resultStr, ProvingJobSettledResult) : undefined;
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

  private async estimateSize() {
    const sizes = await Promise.all(Array.from(this.epochs.values()).map(x => x.estimateSize()));
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
      const db = await AztecLMDBStoreV2.new(fullDirectory, config.dataStoreMapSizeKB);
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

  async addProvingJob(...jobs: ProvingJob[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }

    const epochNumbers = new Set<number>();
    for (const job of jobs) {
      epochNumbers.add(job.epochNumber);
    }

    // all jobs must be from the same epoch
    if (epochNumbers.size !== 1) {
      throw new Error();
    }
    const [epochNumber] = Array.from(epochNumbers);

    let epochDb = this.epochs.get(epochNumber);
    if (!epochDb) {
      const newEpochDirectory = join(this.config.dataDirectory!, epochNumber.toString());
      await mkdir(newEpochDirectory, { recursive: true });
      this.logger.info(
        `Creating broker database for epoch ${epochNumber} at ${newEpochDirectory} with map size ${this.config.dataStoreMapSizeKB}`,
      );
      const db = await AztecLMDBStoreV2.new(newEpochDirectory, this.config.dataStoreMapSizeKB);
      epochDb = new SingleEpochDatabase(db);
      this.epochs.set(epochNumber, epochDb);
    }
    await epochDb.addProvingJobs(jobs);
  }

  async *allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]> {
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
