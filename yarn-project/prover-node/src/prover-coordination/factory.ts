import { type ProverCoordination, createAztecNodeClient } from '@aztec/circuit-types';
import { type P2PClient } from '@aztec/p2p';

import { type ProverCoordinationConfig } from './config.js';

export function createProverCoordination(config: ProverCoordinationConfig, p2pClient?: P2PClient): ProverCoordination {
  if (p2pClient) {
    return p2pClient;
  }
  if (config.proverCoordinationNodeUrl) {
    return createAztecNodeClient(config.proverCoordinationNodeUrl);
  } else {
    throw new Error(`Aztec Node URL for Tx Provider is not set.`);
  }
}
