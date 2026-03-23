import { EpochNumber } from '@aztec/foundation/branded-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BatchQueue } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { openVersionedStoreAt } from '@aztec/kv-store/lmdb-v2';
import {
  type Claim,
  ClaimSchema,
  type ProofUri,
  ProvingJob,
  type ProvingJobId,
  ProvingJobSettledResult,
  type WorkItemId,
  getEpochFromProvingJobId,
} from '@aztec/stdlib/interfaces/server';
import {
  Attributes,
  LmdbMetrics,
  type TelemetryClient,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

import type { ProverBrokerConfig } from '../config.js';
import type { ProvingBrokerDatabase } from '../proving_broker_database.js';

class SingleEpochDatabase {
  public static readonly SCHEMA_VERSION = 1;

  private jobs: AztecAsyncMap<ProvingJobId, string>;
  private jobResults: AztecAsyncMap<ProvingJobId, string>;
  private claims: AztecAsyncMap<WorkItemId, string>;

  constructor(public readonly store: AztecAsyncKVStore) {
    this.jobs = store.openMap('proving_jobs');
    this.jobResults = store.openMap('proving_job_results');
    this.claims = store.openMap('proving_job_claims');
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

  async getProvingJob(id: ProvingJobId): Promise<ProvingJob | undefined> {
    const jobStr = await this.jobs.getAsync(id);
    return jobStr ? jsonParseWithSchema(jobStr, ProvingJob) : undefined;
  }

  async getProvingJobResult(id: ProvingJobId): Promise<ProvingJobSettledResult | undefined> {
    const resultStr = await this.jobResults.getAsync(id);
    return resultStr ? jsonParseWithSchema(resultStr, ProvingJobSettledResult) : undefined;
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

  async addClaim(claim: Claim): Promise<void> {
    await this.claims.set(claim.workItemId, jsonStringify(claim));
  }

  async updateClaimActivity(workItemId: WorkItemId, lastActivity: number): Promise<boolean> {
    const claimStr = await this.claims.getAsync(workItemId);
    if (!claimStr) {
      return false;
    }
    const claim = jsonParseWithSchema(claimStr, ClaimSchema);
    claim.lastActivity = lastActivity;
    await this.claims.set(workItemId, jsonStringify(claim));
    return true;
  }

  async getClaim(workItemId: WorkItemId): Promise<Claim | undefined> {
    const claimStr = await this.claims.getAsync(workItemId);
    if (!claimStr) {
      return undefined;
    }
    return jsonParseWithSchema(claimStr, ClaimSchema);
  }

  async deleteClaim(workItemId: WorkItemId): Promise<void> {
    await this.claims.delete(workItemId);
  }

  async *allClaims(): AsyncIterableIterator<Claim> {
    for await (const claimStr of this.claims.valuesAsync()) {
      yield jsonParseWithSchema(claimStr, ClaimSchema);
    }
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

  public readonly tracer: Tracer;

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

    this.tracer = client.getTracer('KVBrokerDatabase');

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

    const db = await this.getEpochDatabase(EpochNumber(epochNumber));
    await db.batchWrite(jobsToAdd, resultsToAdd);
  }

  private async estimateSize() {
    const sizes = await Promise.all(Array.from(this.epochs.values()).map(x => x.estimateSize()));
    return {
      mappingSize: this.config.dataStoreMapSizeKb,
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
        `Loading broker database for epoch ${epochNumber} from ${fullDirectory} with map size ${config.dataStoreMapSizeKb}KB`,
      );
      const db = await openVersionedStoreAt(
        fullDirectory,
        SingleEpochDatabase.SCHEMA_VERSION,
        config.l1Contracts.rollupAddress,
        config.dataStoreMapSizeKb,
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

  @trackSpan('KVBrokerDatabase.deleteAllProvingJobsOlderThanEpoch', epochNumber => ({
    [Attributes.EPOCH_NUMBER]: epochNumber,
  }))
  async deleteAllProvingJobsOlderThanEpoch(epochNumber: EpochNumber): Promise<void> {
    const oldEpochs = Array.from(this.epochs.keys()).filter(e => e < Number(epochNumber));
    for (const old of oldEpochs) {
      const db = this.epochs.get(old);
      if (!db) {
        continue;
      }
      this.logger.verbose(`Deleting broker database for epoch ${old}`);
      await db.delete();
      this.epochs.delete(old);
    }
  }

  addProvingJob(job: ProvingJob): Promise<void> {
    return this.batchQueue.put(job, job.epochNumber);
  }

  async getProvingJob(id: ProvingJobId): Promise<ProvingJob | undefined> {
    const epochNumber = getEpochFromProvingJobId(id);
    const db = this.epochs.get(epochNumber);
    return db ? await db.getProvingJob(id) : undefined;
  }

  async getProvingJobResult(id: ProvingJobId): Promise<ProvingJobSettledResult | undefined> {
    const epochNumber = getEpochFromProvingJobId(id);
    const db = this.epochs.get(epochNumber);
    return db ? await db.getProvingJobResult(id) : undefined;
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

  async addClaim(claim: Claim): Promise<void> {
    const db = await this.getEpochDatabase(claim.epochNumber);
    await db.addClaim(claim);
  }

  async updateClaimActivity(workItemId: WorkItemId, lastActivity: number): Promise<boolean> {
    for (const db of this.epochs.values()) {
      const found = await db.updateClaimActivity(workItemId, lastActivity);
      if (found) {
        return true;
      }
    }
    return false;
  }

  async getClaim(workItemId: WorkItemId): Promise<Claim | undefined> {
    for (const db of this.epochs.values()) {
      const claim = await db.getClaim(workItemId);
      if (claim) {
        return claim;
      }
    }
    return undefined;
  }

  async deleteClaim(workItemId: WorkItemId): Promise<void> {
    for (const db of this.epochs.values()) {
      await db.deleteClaim(workItemId);
    }
  }

  async deleteClaimsOlderThanEpoch(_epochNumber: EpochNumber): Promise<void> {
    // Claims are stored in epoch-keyed databases, so they are cleaned up
    // automatically when deleteAllProvingJobsOlderThanEpoch removes old epoch DBs.
    // This method is a no-op for the persisted implementation.
  }

  async *allClaims(): AsyncIterableIterator<Claim> {
    for (const db of this.epochs.values()) {
      yield* db.allClaims();
    }
  }

  private async getEpochDatabase(epochNumber: EpochNumber): Promise<SingleEpochDatabase> {
    let epochDb = this.epochs.get(epochNumber);
    if (!epochDb) {
      const newEpochDirectory = join(this.config.dataDirectory!, epochNumber.toString());
      await mkdir(newEpochDirectory, { recursive: true });
      this.logger.info(
        `Creating broker database for epoch ${epochNumber} at ${newEpochDirectory} with map size ${this.config.dataStoreMapSizeKb}`,
      );
      const db = await openVersionedStoreAt(
        newEpochDirectory,
        SingleEpochDatabase.SCHEMA_VERSION,
        this.config.l1Contracts.rollupAddress,
        this.config.dataStoreMapSizeKb,
      );
      epochDb = new SingleEpochDatabase(db);
      this.epochs.set(epochNumber, epochDb);
    }

    return epochDb;
  }
}
