import type { EpochProverFactory } from '@aztec/prover-client';
import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

import type { EpochProvingJob } from '../job/epoch-proving-job.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { ProverNode } from '../prover-node.js';

abstract class TestProverNodeClass extends ProverNode {
  declare public prover: EpochProverManager & EpochProverFactory;
  declare public publisher: ProverNodePublisher;
  declare public epochJobs: Map<number, EpochProvingJob>;
}

export type TestProverNode = TestProverNodeClass;
