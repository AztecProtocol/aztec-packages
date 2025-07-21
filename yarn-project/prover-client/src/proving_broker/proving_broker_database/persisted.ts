import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BatchQueue } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { openVersionedStoreAt } from '@aztec/kv-store/lmdb-v2';
import {
  type ProofUri,
  ProvingJob,
  type ProvingJobId,
  ProvingJobSettledResult,
  getEpochFromProvingJobId,
} from '@aztec/stdlib/interfaces/server';
import { Attributes, LmdbMetrics, type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

import type { ProverBrokerConfig } from '../config.js';
import type { ProvingBrokerDatabase } from '../proving_broker_database.js';

class SingleEpochDatabase {
  public static readonly SCHEMA_VERSION = 1;

  private jobs: AztecAsyncMap<ProvingJobId, string>;
  private jobResults: AztecAsyncMap<ProvingJobId, string>;

  constructor(public readonly store: AztecAsyncKVStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
  }

  estimateSize() {
    return this.store.estimateSize();
  }

  async batchWrite(jobs: ProvingJob[], results: Array<[ProvingJobId, ProvingJobSettledResult]>) {
    await this.store.transactionAsync(async () => {
      for (const job of jobs) {
        await this.jobs.set(job.id, jsonStringify(job));
      }
      for (const [id, result] of results) {
        await this.jobResults.set(id, jsonStringify(result));
      }
    });
  }

  async *allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]> {
    for await (const jobStr of this.jobs.valuesAsync()) {
      const job = jsonParseWithSchema(jobStr, ProvingJob);
      const resultStr = await this.jobResults.getAsync(job.id);
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

  private batchQueue: BatchQueue<ProvingJob | [ProvingJobId, ProvingJobSettledResult], number>;

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

    this.batchQueue = new BatchQueue(
      (items, key) => this.commitWrites(items, key),
      config.proverBrokerBatchSize,
      config.proverBrokerBatchIntervalMs,
      createLogger('proving-client:proving-broker-database:batch-queue'),
    );
  }

  // exposed for testing
  public async commitWrites(items: Array<ProvingJob | [ProvingJobId, ProvingJobSettledResult]>, epochNumber: number) {
    const jobsToAdd = items.filter((item): item is ProvingJob => 'id' in item);
    const resultsToAdd = items.filter((item): item is [ProvingJobId, ProvingJobSettledResult] => Array.isArray(item));

    const db = await this.getEpochDatabase(epochNumber);
    await db.batchWrite(jobsToAdd, resultsToAdd);
  }

  private async estimateSize() {
    const sizes = await Promise.all(Array.from(this.epochs.values()).map(x => x.estimateSize()));
    return {
      mappingSize: this.config.dataStoreMapSizeKB,
      physicalFileSize: sizes.reduce((prev, curr) => prev + curr.physicalFileSize, 0),
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
      const db = await openVersionedStoreAt(
        fullDirectory,
        SingleEpochDatabase.SCHEMA_VERSION,
        config.l1Contracts.rollupAddress,
        config.dataStoreMapSizeKB,
      );
      const epochDb = new SingleEpochDatabase(db);
      epochs.set(epochNumber, epochDb);
    }
    const db = new KVBrokerDatabase(epochs, config, client, logger);
    db.start();
    return db;
  }

  private start(): void {
    this.batchQueue.start();
  }

  async close(): Promise<void> {
    await this.batchQueue.stop();
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

  addProvingJob(job: ProvingJob): Promise<void> {
    return this.batchQueue.put(job, job.epochNumber);
  }

  async *allProvingJobs(): AsyncIterableIterator<[ProvingJob, ProvingJobSettledResult | undefined]> {
    const iterators = Array.from(this.epochs.values()).map(x => x.allProvingJobs());
    for (const it of iterators) {
      yield* it;
    }
  }

  setProvingJobError(id: ProvingJobId, reason: string): Promise<void> {
    return this.batchQueue.put([id, { status: 'rejected', reason }], getEpochFromProvingJobId(id));
  }

  setProvingJobResult(id: ProvingJobId, value: ProofUri): Promise<void> {
    return this.batchQueue.put([id, { status: 'fulfilled', value }], getEpochFromProvingJobId(id));
  }

  private async getEpochDatabase(epochNumber: number): Promise<SingleEpochDatabase> {
    let epochDb = this.epochs.get(epochNumber);
    if (!epochDb) {
      const newEpochDirectory = join(this.config.dataDirectory!, epochNumber.toString());
      await mkdir(newEpochDirectory, { recursive: true });
      this.logger.info(
        `Creating broker database for epoch ${epochNumber} at ${newEpochDirectory} with map size ${this.config.dataStoreMapSizeKB}`,
      );
      const db = await openVersionedStoreAt(
        newEpochDirectory,
        SingleEpochDatabase.SCHEMA_VERSION,
        this.config.l1Contracts.rollupAddress,
        this.config.dataStoreMapSizeKB,
      );
      epochDb = new SingleEpochDatabase(db);
      this.epochs.set(epochNumber, epochDb);
    }

    return epochDb;
  }
}
