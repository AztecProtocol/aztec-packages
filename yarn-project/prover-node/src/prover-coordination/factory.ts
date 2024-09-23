import { type ProverCoordination, createAztecNodeClient } from '@aztec/circuit-types';

import { AztecNodeProverCoordination } from './aztec-node-prover-coordination.js';
import { type ProverCoordinationConfig } from './config.js';

export function createProverCoordination(config: ProverCoordinationConfig): ProverCoordination {
  if (config.proverCoordinationNodeUrl) {
    const node = createAztecNodeClient(config.proverCoordinationNodeUrl);
    return new AztecNodeProverCoordination(node);
  } else {
    throw new Error(`Aztec Node URL for Tx Provider is not set.`);
  }
}
