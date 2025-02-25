import { type EpochProverManager } from '@aztec/circuits.js/interfaces/server';

import { type ProverNodePublisher } from '../prover-node-publisher.js';
import { ProverNode } from '../prover-node.js';

class TestProverNode_ extends ProverNode {
  public override prover!: EpochProverManager;
  public override publisher!: ProverNodePublisher;
}

export type TestProverNode = TestProverNode_;
