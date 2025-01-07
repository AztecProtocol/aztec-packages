import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { ClientCircuitArtifacts, type ClientProtocolArtifact } from './client.js';
import { ServerCircuitArtifacts, type ServerProtocolArtifact } from './server.js';

export * from './client.js';
export * from './server.js';

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;

export const ProtocolCircuitArtifacts: Record<ProtocolArtifact, NoirCompiledCircuit> = {
  ...ClientCircuitArtifacts,
  ...ServerCircuitArtifacts,
};
