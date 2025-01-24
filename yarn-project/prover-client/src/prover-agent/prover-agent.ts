import {
  type ProverAgentApi,
  type ProvingJob,
  type ProvingJobInputs,
  type ProvingJobResultsMap,
  type ProvingJobSource,
  ProvingRequestType,
  type ServerCircuitProver,
  makeProvingRequestResult,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { elapsed } from '@aztec/foundation/timer';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { InlineProofStore } from '../proving_broker/proof_store/index.js';

const PRINT_THRESHOLD_NS = 6e10; // 60 seconds

type InFlightPromise = {
  id: string;
  type: ProvingRequestType;
  promise: Promise<any>;
};

/**
 * A helper class that encapsulates a circuit prover and connects it to a job source.
 */
export class ProverAgent implements ProverAgentApi, Traceable {
  private inFlightPromises = new Map<string, InFlightPromise>();
  private runningPromise?: RunningPromise;
  private proofInputsDatabase = new InlineProofStore();

  public readonly tracer: Tracer;

  constructor(
    /** The prover implementation to defer jobs to */
    private circuitProver: ServerCircuitProver,
    /** How many proving jobs this agent can handle in parallel */
    private maxConcurrency = 1,
    /** How long to wait between jobs */
    private pollIntervalMs = 100,
    /** Telemetry client */
    telemetry: TelemetryClient = getTelemetryClient(),
    /** Logger */
    private log = createLogger('prover-client:prover-agent'),
  ) {
    this.tracer = telemetry.getTracer('ProverAgent');
  }

  setMaxConcurrency(maxConcurrency: number): Promise<void> {
    if (maxConcurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }
    this.maxConcurrency = maxConcurrency;
    return Promise.resolve();
  }

  setCircuitProver(circuitProver: ServerCircuitProver): void {
    this.circuitProver = circuitProver;
  }

  isRunning() {
    return Promise.resolve(this.#isRunning());
  }

  #isRunning() {
    return this.runningPromise?.isRunning() ?? false;
  }

  getCurrentJobs(): Promise<{ id: string; type: string }[]> {
    return Promise.resolve(
      Array.from(this.inFlightPromises.values()).map(({ id, type }) => ({ id, type: ProvingRequestType[type] })),
    );
  }

  start(jobSource: ProvingJobSource): void {
    if (this.runningPromise) {
      throw new Error('Agent is already running');
    }

    let lastPrint = process.hrtime.bigint();

    this.runningPromise = new RunningPromise(
      async () => {
        for (const jobId of this.inFlightPromises.keys()) {
          await jobSource.heartbeat(jobId);
        }

        const now = process.hrtime.bigint();

        if (now - lastPrint >= PRINT_THRESHOLD_NS) {
          // only log if we're actually doing work
          if (this.inFlightPromises.size > 0) {
            const jobs = Array.from(this.inFlightPromises.values())
              .map(job => `id=${job.id},type=${ProvingRequestType[job.type]}`)
              .join(' ');
            this.log.info(`Agent is running with ${this.inFlightPromises.size} in-flight jobs: ${jobs}`);
          }
          lastPrint = now;
        }

        while (this.inFlightPromises.size < this.maxConcurrency) {
          try {
            const job = await jobSource.getProvingJob();
            if (!job) {
              // job source is fully drained, sleep for a bit and try again
              return;
            }

            try {
              const promise = this.work(jobSource, job).finally(() => this.inFlightPromises.delete(job.id));
              this.inFlightPromises.set(job.id, {
                id: job.id,
                type: job.type,
                promise,
              });
            } catch (err) {
              this.log.warn(
                `Error processing job! type=${ProvingRequestType[job.type]}: ${err}. ${(err as Error).stack}`,
              );
            }
          } catch (err) {
            this.log.error(`Error fetching job`, err);
          }
        }
      },
      this.log,
      this.pollIntervalMs,
    );

    this.runningPromise.start();
    this.log.info(`Agent started with concurrency=${this.maxConcurrency}`);
  }

  async stop(): Promise<void> {
    if (!this.runningPromise?.isRunning()) {
      return;
    }

    await this.runningPromise.stop();
    this.runningPromise = undefined;

    this.log.info('Agent stopped');
  }

  @trackSpan('ProverAgent.work', (_jobSoure, job) => ({
    [Attributes.PROVING_JOB_ID]: job.id,
    [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[job.type],
  }))
  private async work(jobSource: ProvingJobSource, job: ProvingJob): Promise<void> {
    try {
      this.log.debug(`Picked up proving job ${job.id} ${ProvingRequestType[job.type]}`, {
        jobId: job.id,
        jobType: ProvingRequestType[job.type],
      });
      const type = job.type;
      const inputs = await this.proofInputsDatabase.getProofInput(job.inputsUri);
      const [time, result] = await elapsed(this.getProof(inputs));
      if (this.#isRunning()) {
        this.log.verbose(`Processed proving job id=${job.id} type=${ProvingRequestType[type]} duration=${time}ms`);
        await jobSource.resolveProvingJob(job.id, makeProvingRequestResult(type, result));
      } else {
        this.log.verbose(
          `Dropping proving job id=${job.id} type=${ProvingRequestType[job.type]} duration=${time}ms: agent stopped`,
        );
      }
    } catch (err) {
      const type = ProvingRequestType[job.type];
      if (this.#isRunning()) {
        if (job.type === ProvingRequestType.PUBLIC_VM && !process.env.AVM_PROVING_STRICT) {
          this.log.warn(`Expected error processing VM proving job id=${job.id} type=${type}: ${err}`);
        } else {
          this.log.error(`Error processing proving job id=${job.id} type=${type}: ${err}`, err);
        }
        const reason = (err as any)?.message ?? String(err);
        await jobSource.rejectProvingJob(job.id, reason);
      } else {
        this.log.verbose(`Dropping proving job id=${job.id} type=${type}: agent stopped: ${(err as any).stack || err}`);
      }
    }
  }

  private getProof(request: ProvingJobInputs): Promise<ProvingJobResultsMap[ProvingRequestType]> {
    const { type, inputs } = request;
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        return this.circuitProver.getAvmProof(inputs);
      }

      case ProvingRequestType.PRIVATE_BASE_ROLLUP: {
        return this.circuitProver.getPrivateBaseRollupProof(inputs);
      }

      case ProvingRequestType.PUBLIC_BASE_ROLLUP: {
        return this.circuitProver.getPublicBaseRollupProof(inputs);
      }

      case ProvingRequestType.MERGE_ROLLUP: {
        return this.circuitProver.getMergeRollupProof(inputs);
      }

      case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP: {
        return this.circuitProver.getEmptyBlockRootRollupProof(inputs);
      }

      case ProvingRequestType.BLOCK_ROOT_ROLLUP: {
        return this.circuitProver.getBlockRootRollupProof(inputs);
      }

      case ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP: {
        return this.circuitProver.getSingleTxBlockRootRollupProof(inputs);
      }

      case ProvingRequestType.BLOCK_MERGE_ROLLUP: {
        return this.circuitProver.getBlockMergeRollupProof(inputs);
      }

      case ProvingRequestType.ROOT_ROLLUP: {
        return this.circuitProver.getRootRollupProof(inputs);
      }

      case ProvingRequestType.BASE_PARITY: {
        return this.circuitProver.getBaseParityProof(inputs);
      }

      case ProvingRequestType.ROOT_PARITY: {
        return this.circuitProver.getRootParityProof(inputs);
      }

      case ProvingRequestType.TUBE_PROOF: {
        return this.circuitProver.getTubeProof(inputs);
      }

      default: {
        const _exhaustive: never = type;
        return Promise.reject(new Error(`Invalid proof request type: ${type}`));
      }
    }
  }
}
