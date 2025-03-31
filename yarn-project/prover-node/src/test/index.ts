import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { ProverNode } from '../prover-node.js';

class TestProverNode_ extends ProverNode {
  public declare prover: EpochProverManager;
  public declare publisher: ProverNodePublisher;
}

export type TestProverNode = TestProverNode_;
