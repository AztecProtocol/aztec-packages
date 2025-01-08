import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { ClientCircuitArtifactNames, getClientCircuitArtifact } from '../client_artifacts_helper.js';
import { type ClientProtocolArtifact } from './types.js';

export function getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit> {
  return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], false);
}

export function getSimulatedClientCircuitArtifactByName(
  artifact: ClientProtocolArtifact,
): Promise<NoirCompiledCircuit> {
  return getClientCircuitArtifact(ClientCircuitArtifactNames[artifact], true);
}
