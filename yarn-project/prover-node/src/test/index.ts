import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { ProverNode } from '../prover-node.js';

abstract class TestProverNodeClass extends ProverNode {
  declare public prover: EpochProverManager;
  declare public publisher: ProverNodePublisher;
}

export type TestProverNode = TestProverNodeClass;
