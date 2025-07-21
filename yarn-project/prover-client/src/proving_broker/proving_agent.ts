import { AbortError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { truncate } from '@aztec/foundation/string';
import { ProvingError } from '@aztec/stdlib/errors';
import type {
  GetProvingJobResponse,
  ProverAgentStatus,
  ProvingJobConsumer,
  ProvingJobId,
  ProvingJobInputs,
  ProvingJobResultsMap,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import type { ProofStore } from './proof_store/index.js';
import { ProvingAgentInstrumentation } from './proving_agent_instrumentation.js';
import { ProvingJobController, ProvingJobControllerStatus } from './proving_job_controller.js';

/**
 * A helper class that encapsulates a circuit prover and connects it to a job source.
 */
export class ProvingAgent implements Traceable {
  private currentJobController?: ProvingJobController;
  private runningPromise: RunningPromise;
  private instrumentation: ProvingAgentInstrumentation;

  public readonly tracer: Tracer;

  constructor(
    /** The source of proving jobs */
    private broker: ProvingJobConsumer,
    /** Database holding proof inputs and outputs */
    private proofStore: ProofStore,
    /** The prover implementation to defer jobs to */
    private circuitProver: ServerCircuitProver,
    /** Optional list of allowed proof types to build */
    private proofAllowList: Array<ProvingRequestType> = [],
    /** How long to wait between jobs */
    private pollIntervalMs = 1000,
    /** A telemetry client through which to emit metrics */
    client: TelemetryClient = getTelemetryClient(),
    private log = createLogger('prover-client:proving-agent'),
  ) {
    this.tracer = client.getTracer('ProvingAgent');
    this.instrumentation = new ProvingAgentInstrumentation(client);
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.pollIntervalMs);
  }

  public setCircuitProver(circuitProver: ServerCircuitProver): void {
    this.circuitProver = circuitProver;
  }

  public isRunning(): boolean {
    return this.runningPromise?.isRunning() ?? false;
  }

  public start(): void {
    this.runningPromise.start();
  }

  public async stop(): Promise<void> {
    this.currentJobController?.abort();
    await this.runningPromise.stop();
  }

  public getStatus(): ProverAgentStatus {
    if (this.currentJobController) {
      return {
        status: 'proving',
        jobId: this.currentJobController.getJobId(),
        proofType: this.currentJobController.getProofType(),
        startedAtISO: new Date(this.currentJobController.getStartedAt()).toISOString(),
      };
    }

    return this.runningPromise.isRunning() ? { status: 'running' } : { status: 'stopped' };
  }

  @trackSpan('ProvingAgent.safeWork')
  private async work() {
    // every tick we need to take one of the following actions:
    // 1. send a hearbeat to the broker that we're working on some job
    // 2. if the job is complete, send its result to the broker
    // 3. get a job from the broker
    // Any one of these actions could give us a new job to work on. If that happens we abort the current job.
    //
    // This loop gets triggered in one of two ways:
    // - either on a timer (see pollIntervalMs)
    // - or when a proof completes
    let maybeJob: GetProvingJobResponse | undefined;

    if (this.currentJobController) {
      const status = this.currentJobController.getStatus();
      const jobId = this.currentJobController.getJobId();
      const proofType = this.currentJobController.getProofType();
      const startedAt = this.currentJobController.getStartedAt();
      const result = this.currentJobController.getResult();

      if (status === ProvingJobControllerStatus.RUNNING) {
        maybeJob = await this.broker.reportProvingJobProgress(jobId, startedAt, { allowList: this.proofAllowList });
      } else if (status === ProvingJobControllerStatus.DONE) {
        if (result) {
          maybeJob = await this.reportResult(jobId, proofType, result);
        } else {
          this.log.warn(
            `Job controller for job ${this.currentJobController.getJobId()} is done but doesn't have a result`,
            { jobId },
          );
          maybeJob = await this.reportResult(
            jobId,
            proofType,
            new ProvingError('No result found after proving', undefined, /* retry */ true),
          );
        }

        this.currentJobController = undefined;
      } else {
        // IDLE status should not be seen because a job is started as soon as it is created
        this.log.warn(`Idle job controller for job: ${this.currentJobController.getJobId()}. Skipping main loop work`, {
          jobId: this.currentJobController.getJobId(),
        });
        return;
      }
    } else {
      maybeJob = await this.broker.getProvingJob({ allowList: this.proofAllowList });
    }

    if (maybeJob) {
      await this.startJob(maybeJob);
    }
  }

  private async startJob({ job, time: startedAt }: GetProvingJobResponse): Promise<void> {
    let abortedProofJobId: string | undefined;
    let abortedProofName: string | undefined;

    if (this.currentJobController?.getStatus() === ProvingJobControllerStatus.RUNNING) {
      abortedProofJobId = this.currentJobController.getJobId();
      abortedProofName = this.currentJobController.getProofTypeName();
      this.currentJobController?.abort();
    }

    let inputs: ProvingJobInputs;
    try {
      inputs = await this.proofStore.getProofInput(job.inputsUri);
    } catch {
      const maybeJob = await this.broker.reportProvingJobError(job.id, 'Failed to load proof inputs', true, {
        allowList: this.proofAllowList,
      });

      if (maybeJob) {
        return this.startJob(maybeJob);
      }

      return;
    }

    this.currentJobController = new ProvingJobController(
      job.id,
      inputs,
      job.epochNumber,
      startedAt,
      this.circuitProver,
      () => {
        // trigger a run of the main work loop when proving completes
        // no need to await this here. The controller will stay alive (in DONE state) until the result is send to the broker
        void this.runningPromise.trigger();
      },
    );

    if (abortedProofJobId) {
      this.log.info(
        `Aborting job id=${abortedProofJobId} type=${abortedProofName} to start new job id=${this.currentJobController.getJobId()} type=${this.currentJobController.getProofTypeName()} inputsUri=${truncate(
          job.inputsUri,
        )}`,
      );
    } else {
      this.log.info(
        `Starting job id=${this.currentJobController.getJobId()} type=${this.currentJobController.getProofTypeName()} inputsUri=${truncate(
          job.inputsUri,
        )}`,
      );
    }

    this.currentJobController.start();
  }

  private async reportResult<T extends ProvingRequestType>(
    jobId: ProvingJobId,
    type: T,
    result: ProvingJobResultsMap[T] | Error,
  ): Promise<GetProvingJobResponse | undefined> {
    let maybeJob: GetProvingJobResponse | undefined;
    if (result instanceof AbortError) {
      // no-op
      this.log.warn(`Job id=${jobId} was aborted. Not reporting result back to broker`, result);
    } else if (result instanceof Error) {
      const retry = result.name === ProvingError.NAME ? (result as ProvingError).retry : false;
      this.log.error(
        `Job id=${jobId} type=${ProvingRequestType[type]} failed err=${result.message} retry=${retry}`,
        result,
      );
      maybeJob = await this.broker.reportProvingJobError(jobId, result.message, retry, {
        allowList: this.proofAllowList,
      });
    } else {
      const outputUri = await this.proofStore.saveProofOutput(jobId, type, result);
      this.log.info(`Job id=${jobId} type=${ProvingRequestType[type]} completed outputUri=${truncate(outputUri)}`);
      maybeJob = await this.broker.reportProvingJobSuccess(jobId, outputUri, { allowList: this.proofAllowList });
    }

    return maybeJob;
  }
}
