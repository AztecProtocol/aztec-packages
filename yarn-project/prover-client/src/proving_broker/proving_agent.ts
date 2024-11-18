import {
  ProvingError,
  type ProvingRequestType,
  type ServerCircuitProver,
  type V2ProvingJob,
} from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

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
    /** The prover implementation to defer jobs to */
    private circuitProver: ServerCircuitProver,
    /** Optional list of allowed proof types to build */
    private proofAllowList?: Array<ProvingRequestType>,
    /** How long to wait between jobs */
    private pollIntervalMs = 1000,
    private log = createDebugLogger('aztec:proving-broker:proving-agent'),
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

      if (this.currentJobController?.getStatus() === ProvingJobStatus.PROVING) {
        this.currentJobController?.abort();
      }

      const { job, time } = maybeJob;
      this.currentJobController = new ProvingJobController(job, time, this.circuitProver, (err, result) => {
        if (err) {
          const retry = err.name === ProvingError.NAME ? (err as ProvingError).retry : false;
          return this.jobSource.reportProvingJobError(job.id, err, retry);
        } else if (result) {
          return this.jobSource.reportProvingJobSuccess(job.id, result);
        }
      });
      this.currentJobController.start();
    } catch (err) {
      this.log.error(`Error in ProvingAgent: ${String(err)}`);
    }
  };
}
