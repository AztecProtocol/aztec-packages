import {
  type ProvingJobSource,
  type ProvingRequest,
  type ProvingRequestResult,
  ProvingRequestType,
  type ServerCircuitProver,
  makePublicInputsAndProof,
} from '@aztec/circuit-types';
import { NESTED_RECURSIVE_PROOF_LENGTH, VerificationKeyData, makeEmptyRecursiveProof } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { elapsed } from '@aztec/foundation/timer';

import { ProvingError } from './proving-error.js';

export class ProverAgent {
  private runningPromise?: RunningPromise;

  constructor(
    /** The prover implementation to defer jobs to */
    private prover: ServerCircuitProver,
    /** How long to wait between jobs */
    private intervalMs = 10,
    /** A name for this agent (if there are multiple agents running) */
    name = '',
    private log = createDebugLogger('aztec:prover-client:prover-pool:agent' + (name ? `:${name}` : '')),
  ) {}

  start(queue: ProvingJobSource): void {
    if (this.runningPromise) {
      throw new Error('Agent is already running');
    }

    this.runningPromise = new RunningPromise(async () => {
      const job = await queue.getProvingJob();
      if (!job) {
        return;
      }

      try {
        const [time, result] = await elapsed(() => this.work(job.request));
        await queue.resolveProvingJob(job.id, result);
        this.log.debug(
          `Processed proving job id=${job.id} type=${ProvingRequestType[job.request.type]} duration=${time}ms`,
        );
      } catch (err) {
        this.log.error(
          `Error processing proving job id=${job.id} type=${ProvingRequestType[job.request.type]}: ${err}`,
        );
        await queue.rejectProvingJob(job.id, new ProvingError((err as any)?.message ?? String(err)));
      }
    }, this.intervalMs);

    this.runningPromise.start();
    this.log.info('Agent started');
  }

  async stop(): Promise<void> {
    if (!this.runningPromise?.isRunning()) {
      return;
    }

    await this.runningPromise.stop();
    this.runningPromise = undefined;

    this.log.info('Agent stopped');
  }

  private work(request: ProvingRequest): Promise<ProvingRequestResult<typeof type>> {
    const { type, inputs } = request;
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        return Promise.resolve(
          makePublicInputsAndProof<object>(
            {},
            makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
            VerificationKeyData.makeFake(),
          ),
        );
      }

      case ProvingRequestType.PUBLIC_KERNEL_NON_TAIL: {
        return this.prover.getPublicKernelProof({
          type: request.kernelType,
          inputs,
        });
      }

      case ProvingRequestType.PUBLIC_KERNEL_TAIL: {
        return this.prover.getPublicTailProof({
          type: request.kernelType,
          inputs,
        });
      }

      case ProvingRequestType.BASE_ROLLUP: {
        return this.prover.getBaseRollupProof(inputs);
      }

      case ProvingRequestType.MERGE_ROLLUP: {
        return this.prover.getMergeRollupProof(inputs);
      }

      case ProvingRequestType.ROOT_ROLLUP: {
        return this.prover.getRootRollupProof(inputs);
      }

      case ProvingRequestType.BASE_PARITY: {
        return this.prover.getBaseParityProof(inputs);
      }

      case ProvingRequestType.ROOT_PARITY: {
        return this.prover.getRootParityProof(inputs);
      }

      default: {
        return Promise.reject(new Error(`Invalid proof request type: ${type}`));
      }
    }
  }
}
