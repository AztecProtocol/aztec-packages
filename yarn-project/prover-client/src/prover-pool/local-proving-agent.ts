import { PublicKernelType } from '@aztec/circuit-types';
import { makeEmptyProof } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type CircuitProver } from '../prover/interface.js';
import { type ProvingAgent } from './prover-agent.js';
import { type ProvingQueueConsumer } from './proving-queue.js';
import { type ProvingRequest, type ProvingRequestResult, ProvingRequestType } from './proving-request.js';

export class LocalProvingAgent implements ProvingAgent {
  private runningPromise?: RunningPromise;

  constructor(
    /** The prover implementation to defer jobs to */
    private prover: CircuitProver,
    /** How long to wait between jobs */
    private intervalMs = 10,
    /** A name for this agent (if there are multiple agents running) */
    name = '',
    private log = createDebugLogger('aztec:prover-client:prover-pool:agent' + name ? `:${name}` : ''),
  ) {}

  start(queue: ProvingQueueConsumer): void {
    this.runningPromise = new RunningPromise(async () => {
      this.log.debug('Asking for proving jobs');
      const job = await queue.getProvingJob();
      if (!job) {
        return;
      }

      try {
        this.log.debug(`Processing proving job id=${job.id} type=${ProvingRequestType[job.request.type]}`);
        await queue.resolveProvingJob(job.id, await this.work(job.request));
      } catch (err) {
        this.log.error(
          `Error processing proving job id=${job.id} type=${ProvingRequestType[job.request.type]}: ${err}`,
        );
        await queue.rejectProvingJob(job.id, err as Error);
      }
    }, this.intervalMs);

    this.runningPromise.start();
  }

  async stop(): Promise<void> {
    await this.runningPromise?.stop();
    this.runningPromise = undefined;
  }

  private work({ type, inputs }: ProvingRequest): Promise<ProvingRequestResult<typeof type>> {
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        return Promise.resolve([{}, makeEmptyProof()] as const);
      }

      case ProvingRequestType.PUBLIC_KERNEL_SETUP: {
        return this.prover.getPublicKernelProof({
          inputs,
          type: PublicKernelType.SETUP,
        });
      }

      case ProvingRequestType.PUBLIC_KERNEL_APP: {
        return this.prover.getPublicKernelProof({
          inputs,
          type: PublicKernelType.APP_LOGIC,
        });
      }

      case ProvingRequestType.PUBLIC_KERNEL_TEARDOWN: {
        return this.prover.getPublicKernelProof({
          inputs,
          type: PublicKernelType.TEARDOWN,
        });
      }

      case ProvingRequestType.PUBLIC_KERNEL_TAIL: {
        return this.prover.getPublicTailProof({
          inputs,
          type: PublicKernelType.TAIL,
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
