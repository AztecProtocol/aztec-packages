import { NoirCompiledCircuit } from '@aztec/types/noir';

import { ClientCircuitArtifacts } from './client.js';
import { ServerCircuitArtifacts } from './server.js';
import { type ProtocolArtifact } from './types.js';

export * from './client.js';
export * from './client_async.js';
export * from './server.js';
export * from './types.js';

export const ProtocolCircuitArtifacts: Record<ProtocolArtifact, NoirCompiledCircuit> = {
  ...ClientCircuitArtifacts,
  ...ServerCircuitArtifacts,
};
