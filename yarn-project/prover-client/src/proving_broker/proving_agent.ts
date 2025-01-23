import {
  ProvingError,
  type ProvingJob,
  type ProvingJobConsumer,
  type ProvingJobId,
  type ProvingJobInputs,
  type ProvingJobResultsMap,
  ProvingRequestType,
  type ServerCircuitProver,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { truncate } from '@aztec/foundation/string';
import { Timer } from '@aztec/foundation/timer';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { type ProofStore } from './proof_store/index.js';
import { ProvingAgentInstrumentation } from './proving_agent_instrumentation.js';
import { ProvingJobController, ProvingJobControllerStatus } from './proving_job_controller.js';

/**
 * A helper class that encapsulates a circuit prover and connects it to a job source.
 */
export class ProvingAgent implements Traceable {
  private currentJobController?: ProvingJobController;
  private runningPromise: RunningPromise;
  private instrumentation: ProvingAgentInstrumentation;
  private idleTimer: Timer | undefined;

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
    this.idleTimer = new Timer();
    this.runningPromise.start();
  }

  public async stop(): Promise<void> {
    this.currentJobController?.abort();
    await this.runningPromise.stop();
  }

  @trackSpan('ProvingAgent.safeWork')
  private async work() {
    // every tick we need to
    // (1) either do a heartbeat, telling the broker that we're working
    // (2) get a new job
    // If during (1) the broker returns a new job that means we can cancel the current job and start the new one
    let maybeJob: { job: ProvingJob; time: number } | undefined;
    if (this.currentJobController?.getStatus() === ProvingJobControllerStatus.PROVING) {
      maybeJob = await this.broker.reportProvingJobProgress(
        this.currentJobController.getJobId(),
        this.currentJobController.getStartedAt(),
        { allowList: this.proofAllowList },
      );
    } else {
      maybeJob = await this.broker.getProvingJob({ allowList: this.proofAllowList });
    }

    if (!maybeJob) {
      return;
    }

    let abortedProofJobId: string | undefined;
    let abortedProofName: string | undefined;
    if (this.currentJobController?.getStatus() === ProvingJobControllerStatus.PROVING) {
      abortedProofJobId = this.currentJobController.getJobId();
      abortedProofName = this.currentJobController.getProofTypeName();
      this.currentJobController?.abort();
    }

    const { job, time } = maybeJob;
    let inputs: ProvingJobInputs;
    try {
      inputs = await this.proofStore.getProofInput(job.inputsUri);
    } catch (err) {
      await this.broker.reportProvingJobError(job.id, 'Failed to load proof inputs', true);
      return;
    }

    this.currentJobController = new ProvingJobController(
      job.id,
      inputs,
      job.epochNumber,
      time,
      this.circuitProver,
      this.handleJobResult,
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

    if (this.idleTimer) {
      this.instrumentation.recordIdleTime(this.idleTimer);
    }
    this.idleTimer = undefined;

    this.currentJobController.start();
  }

  handleJobResult = async <T extends ProvingRequestType>(
    jobId: ProvingJobId,
    type: T,
    err: Error | undefined,
    result: ProvingJobResultsMap[T] | undefined,
  ) => {
    this.idleTimer = new Timer();
    if (err) {
      const retry = err.name === ProvingError.NAME ? (err as ProvingError).retry : false;
      this.log.error(`Job id=${jobId} type=${ProvingRequestType[type]} failed err=${err.message} retry=${retry}`, err);
      return this.broker.reportProvingJobError(jobId, err.message, retry);
    } else if (result) {
      const outputUri = await this.proofStore.saveProofOutput(jobId, type, result);
      this.log.info(`Job id=${jobId} type=${ProvingRequestType[type]} completed outputUri=${truncate(outputUri)}`);
      return this.broker.reportProvingJobSuccess(jobId, outputUri);
    }
  };
}
