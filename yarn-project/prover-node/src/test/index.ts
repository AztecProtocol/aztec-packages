import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

import type { EpochProvingJob } from '../job/epoch-proving-job.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { ProverNode } from '../prover-node.js';

abstract class TestProverNodeClass extends ProverNode {
  public declare prover: EpochProverManager;
  public declare publisher: ProverNodePublisher;

  public abstract override tryUploadEpochFailure(job: EpochProvingJob): Promise<string | undefined>;
}

export type TestProverNode = TestProverNodeClass;
