import { type ProverCoordination, createAztecNodeClient } from '@aztec/circuit-types';

import { type ProverCoordinationConfig } from './config.js';

export function createProverCoordination(config: ProverCoordinationConfig): ProverCoordination {
  if (config.proverCoordinationNodeUrl) {
    return createAztecNodeClient(config.proverCoordinationNodeUrl);
  } else {
    throw new Error(`Aztec Node URL for Tx Provider is not set.`);
  }
}
