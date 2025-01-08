import {
  type ProofUri,
  type ProverBrokerConfig,
  ProvingJob,
  type ProvingJobId,
  ProvingJobSettledResult,
  getEpochFromProvingJobId,
} from '@aztec/circuit-types';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { Attributes, LmdbMetrics, type TelemetryClient } from '@aztec/telemetry-client';

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';

import { type ProvingBrokerDatabase } from '../proving_broker_database.js';

class SingleEpochDatabase {
  private jobs: AztecMap<ProvingJobId, string>;
  private jobResults: AztecMap<ProvingJobId, string>;

  constructor(public readonly store: AztecKVStore) {
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

  close() {
    return this.store.delete();
  }
}

export class KVBrokerDatabase implements ProvingBrokerDatabase {
  private metrics: LmdbMetrics;

  constructor(
    private epochs: Map<number, SingleEpochDatabase>,
    private config: ProverBrokerConfig,
    client: TelemetryClient,
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
      mappingSize: this.config.proverBrokerDataMapSizeKB,
      numItems: sizes.reduce((prev, curr) => prev + curr.numItems, 0),
      actualSize: sizes.reduce((prev, curr) => prev + curr.actualSize, 0),
    };
  }

  public static async new(config: ProverBrokerConfig, client: TelemetryClient) {
    const epochs: Map<number, SingleEpochDatabase> = new Map<number, SingleEpochDatabase>();
    const files = await readdir(config.proverBrokerDataDirectory!, { recursive: false, withFileTypes: true });
    for (const file of files) {
      if (!file.isDirectory()) {
        continue;
      }
      const epochDirectory = file.name;
      const epochNumber = +epochDirectory;
      const db = AztecLmdbStore.open(epochDirectory, config.proverBrokerDataMapSizeKB);
      const epochDb = new SingleEpochDatabase(db);
      epochs.set(epochNumber, epochDb);
    }
    return new KVBrokerDatabase(epochs, config, client);
  }

  async deleteAllProvingJobsOlderThanEpoch(epochNumber: number): Promise<void> {
    const oldEpochs = Array.from(this.epochs.keys()).filter(e => e < epochNumber);
    for (const old of oldEpochs) {
      const db = this.epochs.get(old);
      if (!db) {
        continue;
      }
      await db.close();
      this.epochs.delete(old);
    }
  }

  async addProvingJob(job: ProvingJob): Promise<void> {
    let epochDb = this.epochs.get(job.epochNumber);
    if (!epochDb) {
      const newEpochDirectory = join(this.config.proverBrokerDataDirectory!, job.epochNumber.toString());
      await mkdir(newEpochDirectory, { recursive: true });
      const db = AztecLmdbStore.open(newEpochDirectory, this.config.proverBrokerDataMapSizeKB);
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
