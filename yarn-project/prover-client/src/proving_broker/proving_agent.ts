import {
  ProvingError,
  ProvingRequestType,
  type ServerCircuitProver,
  type V2ProofOutput,
  type V2ProvingJob,
  type V2ProvingJobId,
} from '@aztec/circuit-types';
import { randomBytes } from '@aztec/foundation/crypto';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type ProofInputOutputDatabase } from './proof_input_output_database.js';
import { type ProvingJobConsumer } from './proving_broker_interface.js';
import { ProvingJobController, ProvingJobStatus } from './proving_job_controller.js';

/**
 * A helper class that encapsulates a circuit prover and connects it to a job source.
 */
export class ProvingAgent {
  private currentJobController?: ProvingJobController;
  private runningPromise: RunningPromise;

  constructor(
    /** The source of proving jobs */
    private jobSource: ProvingJobConsumer,
    /** Database holding proof inputs and outputs */
    private proofInputOutputDatabase: ProofInputOutputDatabase,
    /** The prover implementation to defer jobs to */
    private circuitProver: ServerCircuitProver,
    /** Optional list of allowed proof types to build */
    private proofAllowList?: Array<ProvingRequestType>,
    /** How long to wait between jobs */
    private pollIntervalMs = 1000,
    name = randomBytes(4).toString('hex'),
    private log = createDebugLogger('aztec:prover-client:proving-agent:' + name),
  ) {
    this.runningPromise = new RunningPromise(this.safeWork, this.pollIntervalMs);
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

  private safeWork = async () => {
    try {
      // every tick we need to
      // (1) either do a heartbeat, telling the broker that we're working
      // (2) get a new job
      // If during (1) the broker returns a new job that means we can cancel the current job and start the new one
      let maybeJob: { job: V2ProvingJob; time: number } | undefined;
      if (this.currentJobController?.getStatus() === ProvingJobStatus.PROVING) {
        maybeJob = await this.jobSource.reportProvingJobProgress(
          this.currentJobController.getJobId(),
          this.currentJobController.getStartedAt(),
          { allowList: this.proofAllowList },
        );
      } else {
        maybeJob = await this.jobSource.getProvingJob({ allowList: this.proofAllowList });
      }

      if (!maybeJob) {
        return;
      }

      let abortedProofJobId: string = '';
      let abortedProofName: string = '';
      if (this.currentJobController?.getStatus() === ProvingJobStatus.PROVING) {
        abortedProofJobId = this.currentJobController.getJobId();
        abortedProofName = this.currentJobController.getProofTypeName();
        this.currentJobController?.abort();
      }

      const { job, time } = maybeJob;
      const inputs = await this.proofInputOutputDatabase.getProofInput(job.inputs);

      this.currentJobController = new ProvingJobController(
        job.id,
        inputs,
        time,
        this.circuitProver,
        this.handleJobResult,
      );

      if (abortedProofJobId) {
        this.log.info(
          `Aborting job id=${abortedProofJobId} type=${abortedProofName} to start new job id=${this.currentJobController.getJobId()} type=${this.currentJobController.getProofTypeName()} inputsUri=${truncateString(
            job.inputs,
          )}`,
        );
      } else {
        this.log.info(
          `Starting job id=${this.currentJobController.getJobId()} type=${this.currentJobController.getProofTypeName()} inputsUri=${truncateString(
            job.inputs,
          )}`,
        );
      }

      this.currentJobController.start();
    } catch (err) {
      this.log.error(`Error in ProvingAgent: ${String(err)}`);
    }
  };

  handleJobResult = async (
    jobId: V2ProvingJobId,
    type: ProvingRequestType,
    err: Error | undefined,
    result: V2ProofOutput | undefined,
  ) => {
    if (err) {
      const retry = err.name === ProvingError.NAME ? (err as ProvingError).retry : false;
      this.log.info(`Job id=${jobId} type=${ProvingRequestType[type]} failed err=${err.message} retry=${retry}`);
      return this.jobSource.reportProvingJobError(jobId, err, retry);
    } else if (result) {
      const outputUri = await this.proofInputOutputDatabase.saveProofOutput(jobId, type, result);
      this.log.info(
        `Job id=${jobId} type=${ProvingRequestType[type]} completed outputUri=${truncateString(outputUri)}`,
      );
      return this.jobSource.reportProvingJobSuccess(jobId, outputUri);
    }
  };
}

function truncateString(str: string, length: number = 64): string {
  return str.length > length ? str.slice(0, length) + '...' : str;
}
