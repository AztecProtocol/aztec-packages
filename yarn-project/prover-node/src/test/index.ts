import { type EpochProverManager } from '@aztec/circuit-types';
import { type L1Publisher } from '@aztec/sequencer-client';

import { ProverNode } from '../prover-node.js';

class TestProverNode_ extends ProverNode {
  public override prover!: EpochProverManager;
  public override publisher!: L1Publisher;
}

export type TestProverNode = TestProverNode_;
